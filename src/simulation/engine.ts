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
  integrateWater,
  sumpLevelM,
} from './water';
import { accumulateZoneLoss, evaluateZone, type ZoneEvaluation } from './production';
import { computePropagation, type CascadeLink } from './propagation';
import { computeSensorStates } from './sensors';
import { deriveSeed, DeterministicRandom } from './rng';

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
  const { mine } = ctx;
  const overrides = effectiveOverrides(scenario, ctx.assumptions);

  const feederStates = computeFeederStates(mine, overrides);
  const pumpStates = computePumpStates(mine, overrides, feederStates);
  const sensorStates = computeSensorStates(mine, world, overrides);

  const zoneEvaluations = mine.zones.map((zone) => evaluateZone(mine, zone, world.sumps, overrides));

  const zoneStates: Record<string, ZoneRuntimeState> = {};
  for (const evaluation of zoneEvaluations) {
    const zone = mine.zones.find((z) => z.id === evaluation.zoneId);
    const previous = world.zones[evaluation.zoneId];
    zoneStates[evaluation.zoneId] = {
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

  const plantRateTph = mine.zones.reduce((sum, zone) => sum + (zoneStates[zone.id]?.rateTph ?? 0), 0);
  const plantRatio = mine.plant.designRateTph > 0 ? Math.min(1, plantRateTph / mine.plant.designRateTph) : 0;

  const propagation = computePropagation({
    mine,
    graph: ctx.graph,
    overrides,
    feederStates,
    pumpStates,
    sumpStates: world.sumps,
    zoneStates,
    zoneEvaluations,
    sensorStates,
    plantRatio,
  });

  return {
    feederStates,
    pumpStates,
    sumpStates: world.sumps,
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
  const { mine } = ctx;
  const overrides = effectiveOverrides(scenario, ctx.assumptions);

  const sumps: Record<string, SumpRuntimeState> = {};
  for (const sump of mine.sumps) {
    const initialVolume =
      overrides.sumpOverrides[sump.id]?.volumeM3 ?? sump.capacityM3 * sump.initialFillRatio;
    const outflow = sumpOutflowM3h(mine, computePumpStates(mine, overrides, computeFeederStates(mine, overrides)), sump.id);
    const inflow = computeSumpInflowM3h(
      sump,
      overrides,
      ctx.assumptions.rainfallScenarioMultiplier,
      0,
    );
    sumps[sump.id] = computeSumpState(sump, initialVolume, inflow, outflow);
  }

  const world: WorldState = {
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
  const { mine } = ctx;
  const overrides = effectiveOverrides(scenario, ctx.assumptions);
  const events: EngineEvent[] = [];
  const atMs = world.clock.epochMs + (world.clock.elapsedSec + dtSec) * 1000;

  const elapsedSec = world.clock.elapsedSec + dtSec;
  const stepIndex = world.step + 1;

  const feederStates = computeFeederStates(mine, overrides);
  const pumpStates = computePumpStates(mine, overrides, feederStates);

  // ------------------------------------------------------------ water balance
  const nextSumps: Record<string, SumpRuntimeState> = {};
  for (const sump of mine.sumps) {
    const previous = world.sumps[sump.id];
    const rng = new DeterministicRandom(deriveSeed(scenario.seed, `${sump.id}#${stepIndex}`));
    const noise = rng.signed() * INFLOW_NOISE_AMPLITUDE;
    const inflow = computeSumpInflowM3h(
      sump,
      overrides,
      ctx.assumptions.rainfallScenarioMultiplier,
      noise,
    );
    const outflow = sumpOutflowM3h(mine, pumpStates, sump.id);
    const integrated = integrateWater({
      volumeM3: previous?.volumeM3 ?? sump.capacityM3 * sump.initialFillRatio,
      inflowM3h: inflow,
      outflowM3h: outflow,
      dtSec,
      capacityM3: sump.capacityM3,
    });
    nextSumps[sump.id] = computeSumpState(sump, integrated.volumeM3, inflow, outflow);

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
            )} − ${outflow.toFixed(0)}) × ${dtSec}s, 0, ${sump.capacityM3}) = ${nextSumps[sump.id].volumeM3.toFixed(0)} m³.`,
            refs: [sump.id],
            atMs,
          },
        ],
      });
    }
  }

  const intermediate: WorldState = {
    ...world,
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
      evaluation.ratio,
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
    pumps: derived.pumpStates,
    feeders: derived.feederStates,
    zones: nextZones,
    sensors: derived.sensorStates,
    history: [...world.history, ...events].slice(-500),
  };

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
  const derived = deriveState(ctx, scenario, world);
  return {
    ...world,
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
