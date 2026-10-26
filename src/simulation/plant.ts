import type {
  AssetId,
  ElectricalFeeder,
  FeederId,
  FeederRuntimeState,
  MineLevel,
  Pump,
  PumpId,
  PumpRuntimeState,
  ScenarioOverride,
  SumpRuntimeState,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { effectivePipe, powerAtDuty, pumpHead, solveStation, stationPumpFlows, type CurvePump } from './hydraulics';

/**
 * Plant model — power availability and pumping capability.
 *
 * The chain is explicit and ordered:
 *
 *   feeder status  ->  supply ratio  ->  pump power  ->  pump flow (m3/h)
 *
 * Every pump therefore depends on the electrical state of the feeder it is
 * connected to. Failing a feeder removes power from every pump on it, which
 * removes dewatering capacity, which raises sump levels. That chain is the
 * backbone of the cross-system behaviour in MINE OS.
 */

/** Nominal power factor used to convert kVA to kW for the overload check. */
const POWER_FACTOR = 0.9;

/** Supply ratio applied to a degraded feeder. */
const DEGRADED_SUPPLY_RATIO = 0.55;
// Memoised pure numerical solutions, not a second simulation state. Clone on read/write.
const dutyCache = new WeakMap<MineDefinition, Map<string, Record<PumpId, PumpRuntimeState>>>();
function copyDuties(states: Record<PumpId, PumpRuntimeState>) {
  return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { ...state,
    hydraulic: state.hydraulic ? { ...state.hydraulic, warnings: [...state.hydraulic.warnings] } : undefined }]));
}

export function feederSupplyRatio(feeder: ElectricalFeeder, status: FeederRuntimeState['status']): number {
  switch (status) {
    case 'energised':
      break;
    case 'degraded':
      return DEGRADED_SUPPLY_RATIO;
    case 'failed':
    case 'isolated':
    case 'maintenance':
      return 0;
  }
  const usableKw = feeder.capacityKva * POWER_FACTOR;
  if (feeder.connectedLoadKw <= 0) return 1;
  if (feeder.connectedLoadKw <= usableKw) return 1;
  return Math.max(0.25, usableKw / feeder.connectedLoadKw);
}

export function computeFeederStates(
  mine: MineDefinition,
  overrides: ScenarioOverride,
  elapsedSec = 0,
): Record<FeederId, FeederRuntimeState> {
  const result: Record<FeederId, FeederRuntimeState> = {};
  const e = overrides.engineering ?? {};
  const restored = e.restoreAtSec != null && elapsedSec >= e.restoreAtSec;
  const utility = restored || e.utilityAvailable !== false;
  let backupRemaining = e.backupCapacityKw ?? 250;
  let sourceRemaining = utility ? 2000 :
    e.backupConnected && e.generatorAvailable !== false && e.switchingApproved ? (e.backupCapacityKw ?? 250) : 0;
  for (const feeder of mine.feeders) {
    const override = overrides.feederOverrides[feeder.id];
    const requestedStatus = override?.status ?? feeder.status;
    const bypass = e.backupConnected && e.generatorAvailable !== false && e.switchingApproved && e.electricalRedundancy;
    const status = (restored && (requestedStatus === 'failed' || requestedStatus === 'degraded')) || (bypass && requestedStatus === 'failed') ? 'energised' : requestedStatus;
    const pathCapacity = (status === 'energised' ? 1 : status === 'degraded' ? DEGRADED_SUPPLY_RATIO : 0) * feeder.capacityKva * POWER_FACTOR;
    const independentBackup = !restored && bypass && requestedStatus === 'failed';
    const availableKw = Math.min(pathCapacity, sourceRemaining, independentBackup ? backupRemaining : Infinity);
    let remaining = availableKw;
    const pumpBudgetKw: Record<string, number> = {};
    const active = mine.pumps.filter(p => p.feederId === feeder.id && (p.installed !== false || e.additionalStandby) && (overrides.pumpOverrides[p.id]?.mode ?? p.mode) === 'running');
    // Critical dewatering loads first, then the illustrative production/services load.
    for (const pump of active) {
      pumpBudgetKw[pump.id] = remaining >= pump.powerRequiredKw ? pump.powerRequiredKw : 0;
      remaining -= pumpBudgetKw[pump.id];
    }
    const servicesDemand = 160 * (e.productionLoadScale ?? 1);
    const servicesAllocated = Math.min(remaining, servicesDemand);
    remaining -= servicesAllocated;
    const connectedLoadKw = active.reduce((s, p) => s + p.powerRequiredKw, 0) + servicesDemand;
    const allocatedKw = availableKw - remaining;
    sourceRemaining -= allocatedKw;
    if (independentBackup) backupRemaining -= allocatedKw;
    const supplyRatio = connectedLoadKw > 0 ? allocatedKw / connectedLoadKw : availableKw > 0 ? 1 : 0;
    result[feeder.id] = {
      servicesAllocatedKw: servicesAllocated,
      pumpBudgetKw, allocatedKw, availableKw,
      status,
      connectedLoadKw,
      capacityKva: feeder.capacityKva,
      supplyRatio,
      statusReason:
        status === 'energised' && availableKw === 0
          ? 'Connected feeder path has no available upstream active-power budget; downstream motors cannot be supplied.'
          : status === 'energised' && allocatedKw < connectedLoadKw
            ? 'Source or path capacity causes explicit priority load shedding; inspect individual motor allocations.'
          : status === 'failed'
          ? 'Simulated feeder unavailable; fault type and protection operation are not inferred.'
          : status === 'isolated'
            ? 'Feeder is isolated for switching or maintenance.'
            : status === 'maintenance'
              ? 'Feeder is out of service for planned work.'
              : status === 'degraded'
                ? 'Feeder energised at reduced capacity (e.g. partial cable fault).'
                : feeder.connectedLoadKw > feeder.capacityKva * POWER_FACTOR
                  ? 'Connected load exceeds usable feeder capacity.'
                  : 'Feeder energised and within capacity.',
    };
  }
  return result;
}

export function computePumpStates(
  mine: MineDefinition,
  overrides: ScenarioOverride,
  feederStates: Record<FeederId, FeederRuntimeState>,
  sumps?: Record<string, SumpRuntimeState>,
): Record<PumpId, PumpRuntimeState> {
  let cache = dutyCache.get(mine);
  if (!cache) { cache = new Map(); dutyCache.set(mine, cache); }
  const key = JSON.stringify([overrides.pumpOverrides, overrides.engineering, feederStates, mine.sumps.map(s => sumps?.[s.id]?.levelM)]);
  const cached = cache.get(key);
  if (cached) return copyDuties(cached);
  const result: Record<PumpId, PumpRuntimeState> = {};

  const curves = (pump: Pump): CurvePump => ({ ratedFlowM3h: pump.ratedFlowM3h,
    ratedHeadM: pump.ratedHeadM, health: overrides.pumpOverrides[pump.id]?.health ?? pump.health,
    efficiency: overrides.pumpOverrides[pump.id]?.efficiency ?? pump.efficiency,
    speedRatio: overrides.pumpOverrides[pump.id]?.speedRatio ?? 1,
    curveScale: overrides.pumpOverrides[pump.id]?.curveScale ?? 1 });
  for (const sump of mine.sumps) {
    const station = mine.pumps.filter(p => p.sumpId === sump.id);
    if (!station.length) continue;
    const pipe = effectivePipe(mine, overrides, sump.id, sumps);
    const active = station.filter(p => (overrides.pumpOverrides[p.id]?.mode ?? p.mode) === 'running' &&
      (p.installed !== false || overrides.engineering?.additionalStandby) &&
      (feederStates[p.feederId]?.pumpBudgetKw?.[p.id] ?? 0) > 0 && curves(p).health > 0);
    const baseCurves = active.map(curves);
    const solve = (scale: number) => solveStation(baseCurves.map(p => ({ ...p, speedRatio: p.speedRatio * scale })), pipe);
    const exceedsMotorBudget = (solution: ReturnType<typeof solve>, scale: number) => {
      const c = baseCurves.map(p => ({ ...p, speedRatio: p.speedRatio * scale }));
      const q = stationPumpFlows(c, pipe, solution);
      return active.some((p, i) => powerAtDuty(q[i], pipe.configuration === 'series' ? pumpHead(q[i], c[i]) : solution.headM, c[i]).electricalPowerKw >
        (feederStates[p.feederId]?.pumpBudgetKw?.[p.id] ?? 0) + 1e-8);
    };
    let speedScale = 1;
    let solved = solve(1);
    const budget = active.reduce((s, p) => s + (feederStates[p.feederId]?.pumpBudgetKw?.[p.id] ?? 0), 0);
    if (solved.electricalPowerKw > budget || exceedsMotorBudget(solved, 1)) {
      let lo = 0; let hi = 1;
      for (let i = 0; i < 35; i++) {
        const mid = (lo + hi) / 2;
        const point = solve(mid);
        if (point.electricalPowerKw > budget || exceedsMotorBudget(point, mid)) hi = mid; else lo = mid;
      }
      speedScale = lo;
      solved = solve(lo);
      solved.warnings.push('Common VSD speed reduced to respect station motor power allocation.');
    }
    const effectiveCurves = baseCurves.map(p => ({ ...p, speedRatio: p.speedRatio * speedScale }));
    if (pipe.configuration === 'series' && active.length !== station.filter(p => p.installed !== false || overrides.engineering?.additionalStandby).length) {
      solved = { ...solved, status: 'unavailable', flowM3h: 0, electricalPowerKw: 0, hydraulicPowerKw: 0,
        warnings: ['Series configuration requires every train unit available and running; no bypass route is modelled.'] };
    }
    const flows = stationPumpFlows(effectiveCurves, pipe, solved);
    station.forEach(pump => {
      const mode = overrides.pumpOverrides[pump.id]?.mode ?? pump.mode;
      const index = active.findIndex(p => p.id === pump.id);
      const feeder = feederStates[pump.feederId];
      const installed = pump.installed !== false || Boolean(overrides.engineering?.additionalStandby);
      const powered = installed && (mode === 'running' ? index >= 0 : (feeder?.availableKw ?? 0) > 0);
      const solo = solveStation([curves(pump)], pipe);
      const flow = index >= 0 ? flows[index] : 0;
      const individualPower = index >= 0 ? powerAtDuty(flow, pipe.configuration === 'series'
        ? pumpHead(flow, effectiveCurves[index]) : solved.headM, effectiveCurves[index]) : null;
      const hydraulic = index >= 0 ? { ...solved, flowM3h: flow,
        unitHeadM: pipe.configuration === 'series' ? pumpHead(flow, effectiveCurves[index]) : solved.headM,
        effectiveSpeedRatio: effectiveCurves[index].speedRatio,
        ...individualPower } : { ...solo, flowM3h: 0, electricalPowerKw: 0, hydraulicPowerKw: 0 };
      const status = !installed || mode === 'maintenance' || mode === 'stopped' ? 'offline' : !powered ? 'blocked'
        : mode === 'standby' ? 'standby' : solved.status !== 'solved' ? 'blocked'
        : (overrides.pumpOverrides[pump.id]?.health ?? pump.health) < 0.65 ? 'degraded' : 'operational';
      result[pump.id] = { mode, flowM3h: flow, dischargeContributionM3h: pipe.configuration === 'series' ? (index === 0 ? flow : 0) : flow,
        condition: overrides.pumpOverrides[pump.id]?.health ?? pump.health,
        availableFlowM3h: powered && mode !== 'maintenance' && mode !== 'stopped' ? (index >= 0 ? flow : solo.flowM3h) : 0,
        powerKw: hydraulic.electricalPowerKw, hydraulic, powered,
        unavailable: !powered || mode === 'maintenance' || mode === 'stopped', status,
        statusReason: !installed ? 'Uninstalled hypothetical planning slot; no physical capacity is available.' : !powered ? 'No allocated motor supply on this electrical path.' : mode === 'standby'
          ? 'Standby hydraulic capability is conditional on a new electrical allocation; not guaranteed reserve.'
          : `${hydraulic.status}: ${hydraulic.warnings.join(' ') || 'Pump/system operating point calculated.'}`,
        dutyFactor: flow / pump.ratedFlowM3h };
    });
  }
  if (cache.size > 100) cache.clear();
  cache.set(key, copyDuties(result));
  return result;
}

/** Total discharge currently being delivered from a sump (m3/h). */
export function sumpOutflowM3h(
  mine: MineDefinition,
  pumpStates: Record<PumpId, PumpRuntimeState>,
  sumpId: string,
): number {
  return mine.pumps
    .filter((pump) => pump.sumpId === sumpId)
    .reduce((sum, pump) => sum + (pumpStates[pump.id]?.dischargeContributionM3h ?? pumpStates[pump.id]?.flowM3h ?? 0), 0);
}
export function pumpingTotals(mine: MineDefinition, states: Record<PumpId, PumpRuntimeState>) {
  return { wetPowerKw: Object.values(states).reduce((sum, p) => sum + p.powerKw, 0),
    stationFlowM3h: mine.sumps.reduce((sum, s) => sum + sumpOutflowM3h(mine, states, s.id), 0) };
}

/** Discharge that a sump *could* deliver if every available standby pump were started (m3/h). */
export function sumpReserveCapabilityM3h(
  mine: MineDefinition,
  pumpStates: Record<PumpId, PumpRuntimeState>,
  sumpId: string,
): number {
  return mine.pumps
    .filter((pump) => pump.sumpId === sumpId)
    .reduce((sum, pump) => sum + (pumpStates[pump.id]?.availableFlowM3h ?? 0), 0);
}

/** Pumps that serve a sump, ordered so the first entry is the lead duty pump. */
export function pumpsForSump(mine: MineDefinition, sumpId: string): Pump[] {
  return mine.pumps.filter((pump) => pump.sumpId === sumpId);
}

/** Convenience: the level a sump belongs to. */
export function levelFor(mine: MineDefinition, levelId: string): MineLevel | undefined {
  return mine.levels.find((level) => level.id === levelId);
}

/** Convenience: asset id of a pump / feeder / sump / zone (used for graph lookups). */
export function assetIdForPump(pump: Pump): AssetId {
  return pump.id;
}
