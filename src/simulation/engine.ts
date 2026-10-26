import type {
  Assumptions,
  EngineEvent,
  EvidenceRef,
  FeederRuntimeState,
  IncidentSeverity,
  PumpRuntimeState,
  Scenario,
  ScenarioOverride,
  SensorState,
  SumpRuntimeState,
  WorldState,
  ZoneRuntimeState,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { DependencyGraph } from './graph';
import { computeFeederStates, computePumpStates, sumpOutflowM3h } from './plant';
import {
  breachedThreshold,
  computeSumpInflowM3h,
  computeSumpState,
  sumpLevelM,
} from './water';
import { accumulateZoneLoss, evaluateZone, productionIsScheduled, type ZoneEvaluation } from './production';
import { computePropagation, type CascadeLink } from './propagation';
import { computeSensorStates, readSensorValue } from './sensors';
import { deriveSeed, DeterministicRandom } from './rng';
import { effectiveSump, integrateNetwork } from './waterNetwork';
import { validateEngineeringInputs } from './inputValidation';
import { allocateMaterial, materialCapacity, materialModel, stepMaterial } from './materialHandling';
import type { MaterialFlow } from '../domain/engineering';

/**
 * The canonical simulation engine.
 *
 * Everything in MINE OS is derived from one `WorldState` that this module
 * advances. The engine has no knowledge of React, of the router, or of any
 * screen — it is a pure, deterministic function of (mine, scenario, state).
 */

/** Random variation applied to modelled inflow. Deterministic per step. */
const INFLOW_NOISE_AMPLITUDE = 0.03;

export interface EngineContext {
  mine: MineDefinition;
  graph: DependencyGraph;
  assumptions: Assumptions;
}

export interface DerivedState {
  materialFlow: MaterialFlow;
  feederStates: Record<string, FeederRuntimeState>;
  pumpStates: Record<string, PumpRuntimeState>;
  sumpStates: Record<string, SumpRuntimeState>;
  zoneEvaluations: ZoneEvaluation[];
  zoneStates: Record<string, ZoneRuntimeState>;
  sensorStates: Record<string, SensorState>;
  assetStates: Record<string, ReturnType<typeof computePropagation>['assetStates'][string]>;
  cascades: CascadeLink[];
  rootCauseOf: Record<string, string>;
  plantRatio: number;
  plantRateTph: number;
}

export function mergeAssumptions(base: Assumptions, override?: Partial<Assumptions>): Assumptions {
  if (!override) return base;
  return { ...base, ...override };
}

export function effectiveOverrides(scenario: Scenario, assumptions: Assumptions): ScenarioOverride {
  const base: ScenarioOverride = {
    assetOverrides: {},
    pumpOverrides: {},
    feederOverrides: {},
    sumpOverrides: {},
    sensorOverrides: {},
    assumptions: {},
  };
  return {
    assetOverrides: { ...base.assetOverrides, ...scenario.overrides.assetOverrides },
    pumpOverrides: { ...base.pumpOverrides, ...scenario.overrides.pumpOverrides },
    feederOverrides: { ...base.feederOverrides, ...scenario.overrides.feederOverrides },
    sumpOverrides: { ...base.sumpOverrides, ...scenario.overrides.sumpOverrides },
    sensorOverrides: { ...base.sensorOverrides, ...scenario.overrides.sensorOverrides },
    assumptions: mergeAssumptions(assumptions, scenario.overrides.assumptions),
    engineering: scenario.overrides.engineering,
  };
}

/**
 * Compute every derived view of the world from the canonical state plus the
 * scenario overrides. No integration happens here — this is a pure
 * re-evaluation, which is what makes scenario branching cheap and safe.
 */
export function deriveState(
  ctx: EngineContext,
  scenario: Scenario,
  world: WorldState,
): DerivedState {
  validateEngineeringInputs(scenario.overrides);
  ctx = { ...ctx, assumptions: mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions) };
  const { mine } = ctx;
  const overrides = effectiveOverrides(scenario, ctx.assumptions);

  const feederStates = computeFeederStates(mine, overrides, world.clock.elapsedSec);
  const pumpStates = computePumpStates(mine, overrides, feederStates, world.sumps);
  for (const pump of mine.pumps) {
    pumpStates[pump.id].energyKwh = world.pumps[pump.id]?.energyKwh ?? 0;
    pumpStates[pump.id].energyCostUSD = world.pumps[pump.id]?.energyCostUSD ?? 0;
    pumpStates[pump.id].deliveredFlowM3h = world.pumps[pump.id]?.deliveredFlowM3h;
    pumpStates[pump.id].averageInputPowerKw = world.pumps[pump.id]?.averageInputPowerKw;
  }
  const sumpStates = Object.fromEntries(mine.sumps.map(definition => {
    const sump = effectiveSump(definition, overrides);
    const incoming = mine.sumps.reduce((q, s) => q + (overrides.engineering?.pipes?.[s.id]?.destinationSumpId === sump.id
      ? sumpOutflowM3h(mine, pumpStates, s.id) : 0), 0);
    return [sump.id, computeSumpState(sump, Math.min(world.sumps[sump.id].volumeM3, sump.capacityM3),
      computeSumpInflowM3h(sump, overrides, ctx.assumptions.rainfallScenarioMultiplier, 0) + incoming,
      sumpOutflowM3h(mine, pumpStates, sump.id))];
  }));
  const sensorStates = computeSensorStates(mine, { ...world, pumps: pumpStates, feeders: feederStates, sumps: sumpStates }, overrides);

  const rawZoneEvaluations = mine.zones.map((zone) => {
    const evaluation = evaluateZone(mine, zone, sumpStates, overrides, world.clock.elapsedSec);
    const ceiling = world.zones[zone.id]?.recoveryRatio ?? 1;
    if (ctx.assumptions.restartRampHours > 0 && productionIsScheduled(world.clock.elapsedSec, overrides.engineering) && evaluation.ratio > ceiling)
      return { ...evaluation, ratio: ceiling, status: 'degraded' as const,
        reason: `Recovery ramp: ${(ceiling * 100).toFixed(1)}% available against ${(evaluation.ratio * 100).toFixed(1)}% physical/policy target; full-range ramp assumption ${ctx.assumptions.restartRampHours} h.` };
    return evaluation;
  });

  const handling = materialModel(mine);
  const scheduled = productionIsScheduled(world.clock.elapsedSec, overrides.engineering);
  const plantPowerRatio = Math.min(1, (feederStates['fdr-01']?.servicesAllocatedKw ?? 0) / 160);
  const processCapacity = scheduled ? mine.plant.designRateTph * plantPowerRatio : 0;
  const bufferFull = (world.oreBufferTonnes ?? 0) >= materialCapacity(handling, overrides.engineering ?? {}) - 1e-8;
  const materialFlow = allocateMaterial(handling, overrides.engineering ?? {}, Object.fromEntries(rawZoneEvaluations.map(e =>
    [e.zoneId, (mine.zones.find(z => z.id === e.zoneId)?.designRateTph ?? 0) * e.ratio])), bufferFull ? processCapacity : Infinity);
  const zoneEvaluations = rawZoneEvaluations.map(e => {
    const zone = mine.zones.find(z => z.id === e.zoneId)!;
    const ratio = zone.designRateTph > 0 ? materialFlow.zoneRatesTph[zone.id] / zone.designRateTph : 0;
    if (ratio >= e.ratio - 1e-9) return e;
    const failedRoute = handling.routes.find(r => r.zoneIds.includes(zone.id) && !(overrides.engineering?.materialRoutes?.[r.id]?.available ?? r.defaultAvailable) && !r.alternative);
    return { ...e, ratio, status: ratio <= 1e-9 ? 'blocked' as const : 'degraded' as const,
      constrainedBy: failedRoute?.id ?? 'mat-hoist', reason: `Capacity-constrained ore route/hoist/buffer permits ${(ratio * zone.designRateTph).toFixed(1)} t/h against ${(e.ratio * zone.designRateTph).toFixed(1)} t/h available mining; ${bufferFull ? 'finite buffer at receiving limit' : 'inspect primary/alternate route capacities'}.` };
  });

  const zoneStates: Record<string, ZoneRuntimeState> = {};
  for (const evaluation of zoneEvaluations) {
    const zone = mine.zones.find((z) => z.id === evaluation.zoneId);
    const previous = world.zones[evaluation.zoneId];
    zoneStates[evaluation.zoneId] = {
      recoveryRatio: evaluation.ratio,
      rateTph: (zone?.designRateTph ?? 0) * evaluation.ratio,
      operatingRatio: evaluation.ratio,
      status: evaluation.status,
      statusReason: evaluation.reason,
      constrainedBy: evaluation.constrainedBy,
      lostHours: previous?.lostHours ?? 0,
      lostTonnes: previous?.lostTonnes ?? 0,
      lostValueUSD: previous?.lostValueUSD ?? 0,
    };
  }

  const undergroundRate = mine.zones.reduce((sum, zone) => sum + (zoneStates[zone.id]?.rateTph ?? 0), 0);
  const plantRateTph = productionIsScheduled(world.clock.elapsedSec, overrides.engineering) ? Math.min(mine.plant.designRateTph * plantPowerRatio, undergroundRate + ((world.oreBufferTonnes ?? 0) > 0 ? mine.plant.designRateTph - undergroundRate : 0)) : 0;
  const plantRatio = mine.plant.designRateTph > 0 ? Math.min(1, plantRateTph / mine.plant.designRateTph) : 0;

  const propagation = computePropagation({
    mine,
    graph: ctx.graph,
    overrides,
    feederStates,
    pumpStates,
    sumpStates,
    zoneStates,
    zoneEvaluations,
    sensorStates,
    plantRatio,
    plantScheduled: productionIsScheduled(world.clock.elapsedSec, overrides.engineering),
  });

  return {
    materialFlow,
    feederStates,
    pumpStates,
    sumpStates,
    zoneEvaluations,
    zoneStates,
    sensorStates,
    assetStates: propagation.assetStates,
    cascades: propagation.cascades,
    rootCauseOf: propagation.rootCauseOf,
    plantRatio,
    plantRateTph,
  };
}

/** Build the initial world for a scenario. */
export function createWorld(ctx: EngineContext, scenario: Scenario, epochMs: number): WorldState {
  validateEngineeringInputs(scenario.overrides);
  ctx = { ...ctx, assumptions: mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions) };
  const { mine } = ctx;
  const overrides = effectiveOverrides(scenario, ctx.assumptions);

  const sumps: Record<string, SumpRuntimeState> = {};
  for (const sump of mine.sumps) {
    const geometry = effectiveSump(sump, overrides);
    const initialVolume =
      overrides.sumpOverrides[sump.id]?.volumeM3 ?? geometry.capacityM3 * sump.initialFillRatio;
    const outflow = sumpOutflowM3h(mine, computePumpStates(mine, overrides, computeFeederStates(mine, overrides)), sump.id);
    const inflow = computeSumpInflowM3h(
      sump,
      overrides,
      ctx.assumptions.rainfallScenarioMultiplier,
      0,
    );
    sumps[sump.id] = computeSumpState(geometry, initialVolume, inflow, outflow);
  }

  const world: WorldState = {
    scenarioSnapshot: structuredClone(scenario.overrides),
    assumptionsSnapshot: structuredClone(mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions)),
    oreBufferTonnes: Math.min(materialModel(mine).initialBufferTonnes, materialCapacity(materialModel(mine), overrides.engineering ?? {})), plantProcessedTonnes: 0, deferredTonnes: 0, permanentLostTonnes: 0,
    engineeringSnapshot: overrides.engineering,
    mineId: mine.id,
    scenarioId: scenario.id,
    clock: {
      epochMs,
      elapsedSec: 0,
      stepSec: ctx.assumptions.timeStepSeconds,
      rate: 1,
      running: true,
    },
    assets: {},
    sumps,
    pumps: {},
    feeders: {},
    zones: {},
    sensors: {},
    history: [],
    step: 0,
  };

  const derived = deriveState(ctx, scenario, world);
  return {
    ...world,
    sumps: derived.sumpStates,
    materialFlow: derived.materialFlow,
    sensorSampleHistory: Object.fromEntries(mine.sensors.map(s => [s.id, [{ atSec: 0,
      value: readSensorValue(mine, { ...world, pumps: derived.pumpStates, feeders: derived.feederStates, sumps: derived.sumpStates }, s) }]])),
    assets: derived.assetStates,
    pumps: derived.pumpStates,
    feeders: derived.feederStates,
    zones: derived.zoneStates,
    sensors: derived.sensorStates,
  };
}

/**
 * Advance the world by one integration step.
 *
 * The order is deliberate: power state is resolved first, then pumping
 * capability, then the water balance, then production consequences, then the
 * dependency cascade, and finally event detection.
 */
export function stepWorld(
  ctx: EngineContext,
  scenario: Scenario,
  world: WorldState,
  dtSec: number,
): { world: WorldState; events: EngineEvent[] } {
  validateEngineeringInputs(scenario.overrides);
  ctx = { ...ctx, assumptions: mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions) };
  const { mine } = ctx;
  const overrides = effectiveOverrides(scenario, ctx.assumptions);
  const events: EngineEvent[] = [];
  const atMs = world.clock.epochMs + (world.clock.elapsedSec + dtSec) * 1000;

  const elapsedSec = world.clock.elapsedSec + dtSec;
  const stepIndex = world.step + 1;

  if (!Number.isFinite(dtSec) || dtSec <= 0 || dtSec > 300) throw new Error('Engine timestep must be in (0,300] seconds.');
  const feederStates = computeFeederStates(mine, overrides, world.clock.elapsedSec);
  const pumpStates = computePumpStates(mine, overrides, feederStates, world.sumps);

  // ------------------------------------------------------------ water balance
  const externalInflows: Record<string, number> = {};
  for (const sump of mine.sumps) {
    const rng = new DeterministicRandom(deriveSeed(scenario.seed, `${sump.id}#${stepIndex}`));
    const pulse = overrides.engineering?.inflowPulse;
    const pulseOverlap = pulse && pulse.sumpId === sump.id ? Math.max(0,
      Math.min(elapsedSec, pulse.endSec) - Math.max(world.clock.elapsedSec, pulse.startSec)) / dtSec : 0;
    externalInflows[sump.id] = computeSumpInflowM3h(sump, overrides, ctx.assumptions.rainfallScenarioMultiplier,
      rng.signed() * INFLOW_NOISE_AMPLITUDE) + pulseOverlap * (pulse?.flowM3h ?? 0);
  }
  const network = integrateNetwork(mine, overrides, world.sumps, pumpStates, externalInflows, dtSec);
  const nextSumps = network.sumps;
  for (const pump of mine.pumps) {
    const state = pumpStates[pump.id];
    const requested = sumpOutflowM3h(mine, pumpStates, pump.sumpId) * dtSec / 3600;
    const wetFraction = requested > 0 ? network.withdrawals[pump.sumpId] / requested : 0;
    state.deliveredFlowM3h = state.flowM3h * wetFraction;
    state.averageInputPowerKw = state.powerKw * wetFraction;
    state.energyKwh = (world.pumps[pump.id]?.energyKwh ?? 0) + state.powerKw * wetFraction * dtSec / 3600;
    state.energyCostUSD = (world.pumps[pump.id]?.energyCostUSD ?? 0) + state.powerKw * wetFraction * dtSec / 3600 * ctx.assumptions.energyTariffUSDPerKwh;
  }
  for (const sump of mine.sumps) {
    const previous = world.sumps[sump.id];
    const inflow = nextSumps[sump.id].inflowM3h;
    const outflow = nextSumps[sump.id].outflowM3h;

    const previousBreach = previous?.breach ?? null;
    const nextBreach = breachedThreshold(sump, nextSumps[sump.id].levelM);
    if (nextBreach && (!previousBreach || nextBreach.id !== previousBreach.id)) {
      events.push({
        id: `ev-thr-${sump.id}-${nextBreach.id}-${stepIndex}`,
        atSimSec: elapsedSec,
        atMs,
        type: 'threshold-crossed',
        summary: `${sump.name}: ${nextBreach.label} threshold crossed`,
        detail: `Modelled water level reached ${nextSumps[sump.id].levelM.toFixed(
          2,
        )} m against a threshold of ${nextBreach.levelM.toFixed(2)} m. Net flow ${
          (nextSumps[sump.id].inflowM3h - nextSumps[sump.id].outflowM3h).toFixed(0)
        } m³/h.`,
        assetId: sump.id,
        severity: nextBreach.severity === 'critical' ? 'critical' : nextBreach.severity === 'warning' ? 'high' : 'medium',
        evidence: [
          {
            id: `ev-calc-${sump.id}-${stepIndex}`,
            kind: 'calculation',
            label: `${sump.name} water balance`,
            detail: `V_next = clamp(${previous?.volumeM3.toFixed(0) ?? 0} + (${inflow.toFixed(
              0,
             )} − ${outflow.toFixed(0)}) × ${dtSec}/3600 h, 0, ${effectiveSump(sump, overrides).capacityM3}) = ${nextSumps[sump.id].volumeM3.toFixed(0)} m³; overflow is recorded separately.`,
            refs: [sump.id],
            atMs,
          },
        ],
      });
    }
  }

  const recoveryZones = Object.fromEntries(mine.zones.map(zone => {
    const previous = world.zones[zone.id];
    const target = evaluateZone(mine, zone, nextSumps, overrides, elapsedSec).ratio;
    const prior = previous?.recoveryRatio ?? previous?.operatingRatio ?? 1;
    const recoveryRatio = target > prior && previous?.status !== 'standby' && ctx.assumptions.restartRampHours > 0
      ? Math.min(target, prior + dtSec / (ctx.assumptions.restartRampHours * 3600)) : target;
    return [zone.id, { ...previous, recoveryRatio }];
  }));
  const intermediate: WorldState = {
    ...world,
    zones: recoveryZones,
    scenarioSnapshot: structuredClone(scenario.overrides),
    assumptionsSnapshot: structuredClone(mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions)),
    waterLedger: network.ledger,
    engineeringSnapshot: overrides.engineering,
    pumps: pumpStates,
    sumps: nextSumps,
    clock: { ...world.clock, elapsedSec },
    step: stepIndex,
  };

  const derived = deriveState(ctx, scenario, intermediate);

  // --------------------------------------------------- production accounting
  const nextZones: Record<string, ZoneRuntimeState> = {};
  for (const evaluation of derived.zoneEvaluations) {
    const zone = mine.zones.find((z) => z.id === evaluation.zoneId);
    const previous = world.zones[evaluation.zoneId];
    const accumulator = accumulateZoneLoss(
      zone!,
      {
        lostHours: previous?.lostHours ?? 0,
        lostTonnes: previous?.lostTonnes ?? 0,
        lostValueUSD: previous?.lostValueUSD ?? 0,
      },
      productionIsScheduled(world.clock.elapsedSec, overrides.engineering) ? world.zones[evaluation.zoneId]?.operatingRatio ?? evaluation.ratio : 1,
      dtSec,
      ctx.assumptions,
    );
    nextZones[evaluation.zoneId] = {
      ...derived.zoneStates[evaluation.zoneId],
      ...accumulator,
    };
  }

  // ------------------------------------------------ status change detection
  for (const [assetId, previous] of Object.entries(world.assets)) {
    const current = derived.assetStates[assetId];
    if (!current) continue;
    if (current.status !== previous.status) {
      events.push({
        id: `ev-status-${assetId}-${stepIndex}`,
        atSimSec: elapsedSec,
        atMs,
        type: 'asset-status-changed',
        summary: `${assetId}: ${previous.status} → ${current.status}`,
        detail: current.statusReason,
        assetId,
        severity: statusSeverity(current.status),
        evidence: [],
      });
    }
  }

  // ------------------------------------------- instrumentation degradation
  for (const [sensorId, previous] of Object.entries(world.sensors)) {
    const current = derived.sensorStates[sensorId];
    if (!current) continue;
    if (current.freshness !== previous.freshness && current.freshness !== 'live') {
      const sensor = mine.sensors.find((s) => s.id === sensorId);
      events.push({
        id: `ev-sensor-${sensorId}-${stepIndex}`,
        atSimSec: elapsedSec,
        atMs,
        type: 'sensor-stale',
        summary: `${sensor?.name ?? sensorId}: telemetry ${current.freshness}`,
        detail:
          current.note ??
          'Telemetry quality degraded — dependent forecasts lose confidence rather than gaining certainty.',
        assetId: sensor?.assetId,
        severity: current.freshness === 'expired' ? 'high' : 'medium',
        evidence: [],
      });
    }
  }

  const nextWorld: WorldState = {
    ...intermediate,
    assets: derived.assetStates,
    pumps: pumpStates,
    feeders: derived.feederStates,
    zones: nextZones,
    sensors: derived.sensorStates,
    sensorSampleHistory: Object.fromEntries(mine.sensors.map(s => [s.id,
      [...(world.sensorSampleHistory?.[s.id] ?? []), { atSec: elapsedSec,
        value: readSensorValue(mine, { ...intermediate, pumps: pumpStates, feeders: feederStates }, s) }].slice(-120)])),
    history: [...world.history, ...events].slice(-500),
  };

  // Left-endpoint production integration: no whole-step loss before a constraint takes effect.
  const plannedTph = productionIsScheduled(world.clock.elapsedSec, overrides.engineering) ? mine.plant.designRateTph : 0;
  const plantPowerRatio = Math.min(1, (world.feeders['fdr-01']?.servicesAllocatedKw ?? 0) / 160);
  const materialStep = stepMaterial(materialModel(mine), overrides.engineering ?? {}, world.oreBufferTonnes ?? 0,
    Object.fromEntries(mine.zones.map(z => [z.id, world.zones[z.id]?.rateTph ?? 0])), plannedTph, plannedTph * plantPowerRatio, dtSec);
  nextWorld.materialLedger = materialStep.ledger;
  nextWorld.oreBufferTonnes = materialStep.ledger.finalBufferTonnes;
  nextWorld.plantProcessedTonnes = (world.plantProcessedTonnes ?? 0) + materialStep.ledger.processedTonnes;
  nextWorld.deferredTonnes = (world.deferredTonnes ?? 0) + materialStep.ledger.deferredProcessingTonnes;
  for (const zone of mine.zones) {
    const held = Math.max(0, ((world.zones[zone.id]?.rateTph ?? 0) - (materialStep.flow.zoneRatesTph[zone.id] ?? 0)) * dtSec / 3600);
    nextWorld.zones[zone.id].lostTonnes += held;
    nextWorld.zones[zone.id].lostHours += held / Math.max(1, zone.designRateTph);
    nextWorld.zones[zone.id].lostValueUSD += held * ctx.assumptions.valuePerTonneUSD;
  }
  nextWorld.permanentLostTonnes = 0; // No calibrated permanent-loss assumption exists.
  const totals = world.waterTotals ?? { initialM3: network.ledger.initialM3, externalInM3: 0, externalOutM3: 0, overflowM3: 0, residualM3: 0 };
  nextWorld.waterTotals = { initialM3: totals.initialM3,
    externalInM3: totals.externalInM3 + network.ledger.externalInM3,
    externalOutM3: totals.externalOutM3 + network.ledger.externalOutM3,
    overflowM3: totals.overflowM3 + network.ledger.overflowM3, residualM3: 0 };
  const cumulative = nextWorld.waterTotals;
  cumulative.residualM3 = cumulative.initialM3 + cumulative.externalInM3 - cumulative.externalOutM3 - cumulative.overflowM3 - network.ledger.finalM3;

  const materialResolved = deriveState(ctx, scenario, nextWorld);
  nextWorld.materialFlow = materialResolved.materialFlow;
  nextWorld.zones = materialResolved.zoneStates;
  nextWorld.assets = materialResolved.assetStates;

  return { world: nextWorld, events };
}

export function statusSeverity(status: string): IncidentSeverity {
  switch (status) {
    case 'failed':
      return 'critical';
    case 'blocked':
      return 'high';
    case 'exposed':
      return 'high';
    case 'degraded':
      return 'medium';
    case 'offline':
      return 'low';
    default:
      return 'low';
  }
}

/** Re-derive a world after overrides changed, without advancing the clock. */
export function recomputeWorld(
  ctx: EngineContext,
  scenario: Scenario,
  world: WorldState,
): WorldState {
  if ((world.oreBufferTonnes ?? 0) > materialCapacity(materialModel(ctx.mine), scenario.overrides.engineering ?? {}))
    throw new Error('Requested ore-buffer reduction would displace stored ore; process inventory before shrinking capacity.');
  for (const sump of ctx.mine.sumps) if (world.sumps[sump.id].volumeM3 > effectiveSump(sump, scenario.overrides).capacityM3)
    throw new Error(`${sump.id}: requested storage reduction would displace existing water. Drain/route it explicitly before changing geometry.`);
  const derived = deriveState(ctx, scenario, world);
  return {
    ...world,
    scenarioSnapshot: structuredClone(scenario.overrides),
    assumptionsSnapshot: structuredClone(mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions)),
    materialFlow: derived.materialFlow,
    sumps: derived.sumpStates,
    engineeringSnapshot: scenario.overrides.engineering,
    assets: derived.assetStates,
    pumps: derived.pumpStates,
    feeders: derived.feederStates,
    zones: derived.zoneStates,
    sensors: derived.sensorStates,
  };
}

/** Current level of a sump, used by the twin and the panels. */
export function currentLevelM(mine: MineDefinition, world: WorldState, sumpId: string): number {
  const sump = mine.sumps.find((s) => s.id === sumpId);
  if (!sump) return 0;
  return sumpLevelM(sump, world.sumps[sumpId]?.volumeM3 ?? 0);
}

/** Evidence for a state statement, used by the assistant and reports. */
export function stateEvidence(
  label: string,
  detail: string,
  refs: string[],
  atMs: number,
  kind: EvidenceRef['kind'] = 'calculation',
): EvidenceRef {
  return { id: `ev-${kind}-${refs.join('-')}-${Math.round(atMs)}`, kind, label, detail, refs, atMs };
}
