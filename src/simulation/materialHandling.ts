import type { EngineeringOverrides, MaterialFlow, MaterialHandlingModel } from '../domain/engineering';
import type { MineDefinition } from '../domain/mine';

export function materialModel(mine: MineDefinition): MaterialHandlingModel {
  return mine.materialHandling ?? { routes: mine.zones.map(z => ({ id: `material-${z.id}`, name: z.name,
    zoneIds: [z.id], capacityTph: z.designRateTph, defaultAvailable: true, alternative: false })),
    hoistCapacityTph: mine.plant.designRateTph, bufferCapacityTonnes: mine.plant.designRateTph,
    initialBufferTonnes: mine.plant.designRateTph / 2 };
}

/** Deterministic Edmonds–Karp maximum flow. Capacities and flow are consistently t/h. */
export function allocateMaterial(model: MaterialHandlingModel, settings: EngineeringOverrides,
  zonePotentialTph: Record<string, number>, receivingCapacityTph: number): MaterialFlow {
  const zones = Object.keys(zonePotentialTph);
  const names = ['source', ...zones, ...model.routes.map(r => r.id), 'hoist', 'sink'];
  if (new Set(names).size !== names.length) throw new Error('Material network identifiers must be unique.');
  const n = names.length; const index = (id: string) => names.indexOf(id);
  const capacity = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const flow = capacity.map(row => [...row]);
  const edge = (a: string, b: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) throw new Error('Material capacities must be finite nonnegative t/h.');
    capacity[index(a)][index(b)] = value;
  };
  for (const zone of zones) {
    edge('source', zone, zonePotentialTph[zone]);
    for (const route of model.routes) if (route.zoneIds.includes(zone)) edge(zone, route.id, zonePotentialTph[zone]);
  }
  for (const route of model.routes) {
    const override = settings.materialRoutes?.[route.id];
    edge(route.id, 'hoist', (override?.available ?? route.defaultAvailable) ? override?.capacityTph ?? route.capacityTph : 0);
  }
  const hoist = settings.hoistAvailable === false ? 0 : settings.hoistCapacityTph ?? model.hoistCapacityTph;
  edge('hoist', 'sink', Math.min(hoist, receivingCapacityTph));
  const source = index('source'); const sink = index('sink');
  let totalTph = 0;
  for (let iteration = 0; iteration < n ** 3; iteration++) {
    const parent = Array<number>(n).fill(-1); parent[source] = source;
    const queue = [source];
    for (let head = 0; head < queue.length && parent[sink] < 0; head++) {
      const u = queue[head];
      for (let v = 0; v < n; v++) if (parent[v] < 0 && capacity[u][v] - flow[u][v] > 1e-9) { parent[v] = u; queue.push(v); }
    }
    if (parent[sink] < 0) return { totalTph, zonePotentialTph: { ...zonePotentialTph },
      zoneRatesTph: Object.fromEntries(zones.map(z => [z, flow[source][index(z)]])),
      routeFlowsTph: Object.fromEntries(model.routes.map(r => [r.id, flow[index(r.id)][index('hoist')]])) };
    let amount = Infinity;
    for (let v = sink; v !== source; v = parent[v]) amount = Math.min(amount, capacity[parent[v]][v] - flow[parent[v]][v]);
    for (let v = sink; v !== source; v = parent[v]) { flow[parent[v]][v] += amount; flow[v][parent[v]] -= amount; }
    totalTph += amount;
  }
  throw new Error('Material allocation iteration bound exceeded; no allocation reported.');
}

export function materialCapacity(model: MaterialHandlingModel, settings: EngineeringOverrides) {
  return settings.oreBufferCapacityTonnes ?? model.bufferCapacityTonnes;
}

export function stepMaterial(model: MaterialHandlingModel, settings: EngineeringOverrides, initialBufferTonnes: number,
  zonePotentialTph: Record<string, number>, plannedTph: number, processCapacityTph: number, dtSec: number) {
  const capacity = materialCapacity(model, settings);
  if (!Number.isFinite(initialBufferTonnes + capacity + dtSec) || dtSec <= 0 || initialBufferTonnes < 0 || initialBufferTonnes > capacity)
    throw new Error('Material buffer requires bounded inventory, capacity and positive time.');
  const flow = allocateMaterial(model, settings, zonePotentialTph, processCapacityTph + (capacity - initialBufferTonnes) * 3600 / dtSec);
  const producedTonnes = flow.totalTph * dtSec / 3600;
  const processedTonnes = Math.min(plannedTph * dtSec / 3600, processCapacityTph * dtSec / 3600, initialBufferTonnes + producedTonnes);
  const finalBufferTonnes = Math.max(0, Math.min(capacity, initialBufferTonnes + producedTonnes - processedTonnes));
  return { flow, ledger: { initialBufferTonnes, producedTonnes, processedTonnes, finalBufferTonnes,
    capacityTonnes: capacity, deferredProcessingTonnes: Math.max(0, plannedTph * dtSec / 3600 - processedTonnes),
    heldAtFaceTonnes: Math.max(0, Object.values(zonePotentialTph).reduce((sum, q) => sum + q, 0) * dtSec / 3600 - producedTonnes),
    residualTonnes: initialBufferTonnes + producedTonnes - processedTonnes - finalBufferTonnes } };
}
