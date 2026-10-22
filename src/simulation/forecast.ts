import type {
  Scenario,
  ScenarioOverride,
  SumpForecast,
  SumpId,
  WorldState,
} from '../domain/types';
import type { EngineContext, DerivedState } from './engine';
import { computeFeederStates, computePumpStates, sumpOutflowM3h } from './plant';
import {
  computeSumpInflowM3h,
  crossingTimeSeconds,
  projectSumpVolume,
  thresholdEvidence,
  type ForecastPoint,
} from './water';
import { deriveSeed } from './rng';
import type { EvidenceRef } from '../domain/types';

/**
 * Forecast assembly.
 *
 * The forecast is a deterministic projection of the same integrator that runs
 * live. Optional interventions are expressed as scenario overrides, so an
 * engineer can ask "what if we start the standby pump" without mutating the
 * active scenario.
 */

export interface ForecastOptions {
  horizonHours?: number;
  stepSec?: number;
  uncertaintyPct?: number;
  /** Overrides applied on top of the scenario for this projection only. */
  intervention?: Partial<ScenarioOverride>;
  /** Inflow multiplier applied to every sump during the projection. */
  inflowMultiplier?: number;
}

function mergeIntervention(scenario: Scenario, intervention?: Partial<ScenarioOverride>): Scenario {
  if (!intervention) return scenario;
  return {
    ...scenario,
    overrides: {
      assetOverrides: { ...scenario.overrides.assetOverrides, ...intervention.assetOverrides },
      pumpOverrides: { ...scenario.overrides.pumpOverrides, ...intervention.pumpOverrides },
      feederOverrides: { ...scenario.overrides.feederOverrides, ...intervention.feederOverrides },
      sumpOverrides: { ...scenario.overrides.sumpOverrides, ...intervention.sumpOverrides },
      sensorOverrides: { ...scenario.overrides.sensorOverrides, ...intervention.sensorOverrides },
      assumptions: { ...scenario.overrides.assumptions, ...intervention.assumptions },
    },
  };
}

export interface SumpForecastResult extends SumpForecast {
  /** Sensor-derived evidence supporting the projection. */
  evidence: EvidenceRef[];
  /** The outflow assumption used for the projection (m3/h). */
  assumedOutflowM3h: number;
  /** True when at least one contributing tag is not live. */
  degradedByInstrumentation: boolean;
}

export function forecastSump(args: {
  ctx: EngineContext;
  scenario: Scenario;
  world: WorldState;
  derived: DerivedState;
  sumpId: SumpId;
  options?: ForecastOptions;
}): SumpForecastResult {
  const { ctx, scenario, world, derived, sumpId } = args;
  const options = args.options ?? {};
  const efScenario = mergeIntervention(scenario, options.intervention);

  const sump = ctx.mine.sumps.find((s) => s.id === sumpId);
  const state = world.sumps[sumpId];
  if (!sump || !state) {
    return {
      sumpId,
      points: [],
      thresholdCrossings: [],
      timeToCriticalHours: null,
      timeToCriticalPessimisticHours: null,
      confidence: 0,
      contributingSensors: [],
      evidence: [],
      assumedOutflowM3h: 0,
      degradedByInstrumentation: true,
    };
  }

  const feederStates = computeFeederStates(ctx.mine, efScenario.overrides);
  const pumpStates = computePumpStates(ctx.mine, efScenario.overrides, feederStates);
  const outflow = sumpOutflowM3h(ctx.mine, pumpStates, sumpId);

  const inflow = computeSumpInflowM3h(
    sump,
    efScenario.overrides,
    ctx.assumptions.rainfallScenarioMultiplier,
    0,
  );

  const horizonHours = options.horizonHours ?? ctx.assumptions.forecastHorizonHours;
  const stepSec = options.stepSec ?? Math.max(60, ctx.assumptions.timeStepSeconds * 5);
  const uncertaintyPct = options.uncertaintyPct ?? ctx.assumptions.inflowUncertaintyPct;
  const seed = deriveSeed(efScenario.seed, `${sumpId}-forecast`);

  const points = projectSumpVolume({
    mine: ctx.mine,
    sump,
    startVolumeM3: state.volumeM3,
    inflowM3h: inflow,
    outflowM3h: outflow,
    horizonHours,
    stepSec,
    uncertaintyPct,
    seed,
    inflowMultiplier: options.inflowMultiplier ?? 1,
  });

  const atMs = world.clock.epochMs + world.clock.elapsedSec * 1000;

  const thresholdCrossings = sump.thresholds.map((threshold) => {
    const atSec = crossingTimeSeconds(points, threshold.levelM);
    const pessimisticAtSec = crossingTimeSeconds(
      points.map((p) => ({ ...p, levelM: p.levelHighM })),
      threshold.levelM,
    );
    return {
      thresholdId: threshold.id,
      label: threshold.label,
      severity: threshold.severity,
      atSec,
      atMs: atSec === null ? null : atMs + atSec * 1000,
      pessimisticAtSec,
      uncertaintyPct,
    };
  });

  const critical = sump.thresholds.find((t) => t.severity === 'critical');
  const criticalCrossing = critical ? thresholdCrossings.find((c) => c.thresholdId === critical.id) : undefined;
  const timeToCriticalHours = criticalCrossing?.atSec != null ? criticalCrossing.atSec / 3600 : null;
  const timeToCriticalPessimisticHours =
    criticalCrossing?.pessimisticAtSec != null ? criticalCrossing.pessimisticAtSec / 3600 : null;

  // Confidence is derived from the sensors that actually feed this forecast.
  const sumpSensors = ctx.mine.sensors.filter(
    (sensor) => sensor.assetId === sumpId && (sensor.kind === 'level' || sensor.kind === 'pressure'),
  );
  const contributingSensors = sumpSensors.map((sensor) => ({
    sensorId: sensor.id,
    freshness: derived.sensorStates[sensor.id]?.freshness ?? 'unavailable',
    weight: sensor.kind === 'level' ? 0.7 : 0.3,
  }));
  const totalWeight = contributingSensors.reduce((sum, s) => sum + s.weight, 0);
  const weightedConfidence = contributingSensors.reduce((sum, s) => {
    const sensorState = derived.sensorStates[s.sensorId];
    const freshnessFactor =
      s.freshness === 'live' ? 1 : s.freshness === 'stale' ? 0.45 : s.freshness === 'expired' ? 0.1 : 0;
    return sum + (sensorState?.confidence ?? 0) * freshnessFactor * s.weight;
  }, 0);
  const confidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0.5;
  const degradedByInstrumentation = contributingSensors.some((s) => s.freshness !== 'live');

  const evidence: EvidenceRef[] = sump.thresholds.map((threshold) =>
    thresholdEvidence(sump, threshold, thresholdCrossings.find((c) => c.thresholdId === threshold.id)?.atSec ?? null, atMs),
  );
  evidence.push({
    id: `ev-forecast-${sumpId}`,
    kind: 'assumption',
    label: `${sump.name}: forecast basis`,
    detail: `Modelled inflow ${inflow.toFixed(0)} m³/h against assumed discharge ${outflow.toFixed(
      0,
    )} m³/h, integrated at ${stepSec} s with a ±${uncertaintyPct}% inflow band. Pumping capability is held at the current modelled state for the whole horizon.`,
    refs: [sumpId, ...contributingSensors.map((s) => s.sensorId)],
    atMs,
  });
  if (degradedByInstrumentation) {
    evidence.push({
      id: `ev-forecast-conf-${sumpId}`,
      kind: 'telemetry',
      label: `${sump.name}: instrumentation confidence`,
      detail: `Forecast confidence reduced to ${(confidence * 100).toFixed(0)}% because ${contributingSensors
        .filter((s) => s.freshness !== 'live')
        .map((s) => s.sensorId)
        .join(', ')} ${contributingSensors.filter((s) => s.freshness !== 'live').length === 1 ? 'is' : 'are'} not live.`,
      refs: contributingSensors.filter((s) => s.freshness !== 'live').map((s) => s.sensorId),
      atMs,
    });
  }

  return {
    sumpId,
    points,
    thresholdCrossings,
    timeToCriticalHours,
    timeToCriticalPessimisticHours,
    confidence,
    contributingSensors,
    evidence,
    assumedOutflowM3h: outflow,
    degradedByInstrumentation,
  };
}

/** Forecast every sump in the mine. */
export function forecastAllSumps(args: {
  ctx: EngineContext;
  scenario: Scenario;
  world: WorldState;
  derived: DerivedState;
  options?: ForecastOptions;
}): Record<SumpId, SumpForecastResult> {
  const result: Record<SumpId, SumpForecastResult> = {};
  for (const sump of args.ctx.mine.sumps) {
    result[sump.id] = forecastSump({ ...args, sumpId: sump.id });
  }
  return result;
}

/** Time until a zone floor is reached, from a sump forecast trajectory. */
export function zoneFloodTimeHours(points: ForecastPoint[], floodLevelM: number): number | null {
  const at = crossingTimeSeconds(points, floodLevelM);
  return at === null ? null : at / 3600;
}

/** Compare two forecast trajectories into a single summary used in the lab. */
export function compareForecasts(
  a: SumpForecastResult,
  b: SumpForecastResult,
): {
  horizonLevelDeltaM: number;
  timeToCriticalDeltaHours: number | null;
  peakLevelM: number;
  peakLevelB: number;
} {
  const lastA = a.points[a.points.length - 1];
  const lastB = b.points[b.points.length - 1];
  const delta =
    a.timeToCriticalHours != null && b.timeToCriticalHours != null
      ? b.timeToCriticalHours - a.timeToCriticalHours
      : null;
  return {
    horizonLevelDeltaM: (lastB?.levelM ?? 0) - (lastA?.levelM ?? 0),
    timeToCriticalDeltaHours: delta,
    peakLevelM: Math.max(...a.points.map((p) => p.levelHighM), 0),
    peakLevelB: Math.max(...b.points.map((p) => p.levelHighM), 0),
  };
}
