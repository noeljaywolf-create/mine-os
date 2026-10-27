import type {
  Scenario,
  ScenarioOverride,
  SumpForecast,
  SumpId,
  WorldState,
} from '../domain/types';
import type { EngineContext, DerivedState } from './engine';
import {
  computeSumpInflowM3h,
  crossingTimeSeconds,
  thresholdEvidence,
  type ForecastPoint,
} from './water';
import { projectWorld } from './projection';
import { effectiveSump } from './waterNetwork';
import { mergeEngineering } from './scenarios';
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
      ...scenario.overrides,
      engineering: mergeEngineering(scenario.overrides.engineering, intervention.engineering),
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

const projectionCache = new WeakMap<WorldState, Map<string, ReturnType<typeof projectWorld>[]>>();

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

  const definition = ctx.mine.sumps.find((s) => s.id === sumpId);
  const sump = definition ? effectiveSump(definition, efScenario.overrides) : undefined;
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

  const outflow = derived.sumpStates[sumpId]?.outflowM3h ?? state.outflowM3h;

  const inflow = computeSumpInflowM3h(
    sump,
    efScenario.overrides,
    ctx.assumptions.rainfallScenarioMultiplier,
    0,
  );

  const horizonHours = options.horizonHours ?? ctx.assumptions.forecastHorizonHours;
  const stepSec = Math.min(300, options.stepSec ?? 300);
  // Only sensors relevant to this sump should widen the uncertainty band:
  // level/pressure sensors on this sump, plus sensors on upstream sumps that transfer into it.
  const relevantSensors = ctx.mine.sensors.filter((sensor) => {
    if (sensor.assetId === sumpId && (sensor.kind === 'level' || sensor.kind === 'pressure')) return true;
    const upstreamSump = ctx.mine.sumps.find(
      (s) => s.id === sensor.assetId && efScenario.overrides.engineering?.pipes?.[s.id]?.destinationSumpId === sumpId,
    );
    return !!upstreamSump;
  });
  const degraded = relevantSensors.some((s) => derived.sensorStates[s.id]?.freshness !== 'live');
  const uncertaintyPct = Math.min(90, (options.uncertaintyPct ?? ctx.assumptions.inflowUncertaintyPct) * (degraded ? 2 : 1));
  const key = JSON.stringify([efScenario.overrides, ctx.assumptions, horizonHours, stepSec, uncertaintyPct, options.inflowMultiplier]);
  let cache = projectionCache.get(world);
  if (!cache) { cache = new Map(); projectionCache.set(world, cache); }
  let trajectories = cache.get(key);
  if (!trajectories) {
    trajectories = [1, 1 - uncertaintyPct / 100, 1 + uncertaintyPct / 100].map(factor => {
      const forecastScenario = { ...efScenario, overrides: { ...efScenario.overrides,
        sumpOverrides: Object.fromEntries(ctx.mine.sumps.map(s => [s.id, { ...efScenario.overrides.sumpOverrides[s.id],
          inflowMultiplier: (efScenario.overrides.sumpOverrides[s.id]?.inflowMultiplier ?? 1) * factor * (options.inflowMultiplier ?? 1) }])) } };
      return projectWorld(ctx, forecastScenario, world, horizonHours, stepSec);
    });
    if (cache.size > 20) cache.clear();
    cache.set(key, trajectories);
  }
  const points = trajectories[0].map((w, i) => ({ tSec: w.clock.elapsedSec - world.clock.elapsedSec,
    volumeM3: w.sumps[sumpId].volumeM3, levelM: w.sumps[sumpId].levelM,
    volumeLowM3: trajectories![1][i].sumps[sumpId].volumeM3,
    volumeHighM3: trajectories![2][i].sumps[sumpId].volumeM3,
    levelLowM: trajectories![1][i].sumps[sumpId].levelM,
    levelHighM: trajectories![2][i].sumps[sumpId].levelM,
    inflowM3h: w.sumps[sumpId].inflowM3h, outflowM3h: w.sumps[sumpId].outflowM3h }));

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
  if (sumpId === 'smp-201' && efScenario.overrides.engineering?.redundantSensor)
    contributingSensors.push({ sensorId: 'independent-level-smp-201', freshness: derived.sensorStates['independent-level-smp-201']?.freshness ?? 'unavailable', weight: 0.7 });
  const totalWeight = contributingSensors.reduce((sum, s) => sum + s.weight, 0);
  const weightedConfidence = contributingSensors.reduce((sum, s) => {
    const sensorState = derived.sensorStates[s.sensorId];
    const freshnessFactor =
      s.freshness === 'live' ? 1 : s.freshness === 'stale' ? 0.45 : s.freshness === 'expired' ? 0.1 : 0;
    return sum + (sensorState?.confidence ?? 0) * freshnessFactor * s.weight;
  }, 0);
  const confidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0;
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
    )} m³/h initially, integrated through the canonical coupled kernel at ${stepSec} s with a ±${uncertaintyPct}% inflow sensitivity envelope. Transfers, availability and scheduled restoration are recomputed. This is not a statistical interval.`,
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

export function storageForecastDivergence(mine: EngineContext['mine'], a: Record<string, SumpForecastResult>, b: Record<string, SumpForecastResult>): number {
  return Math.max(0, ...mine.sumps.map(s => Math.abs((a[s.id]?.points.at(-1)?.volumeM3 ?? 0) -
    (b[s.id]?.points.at(-1)?.volumeM3 ?? 0)) / s.capacityM3 * 100));
}
