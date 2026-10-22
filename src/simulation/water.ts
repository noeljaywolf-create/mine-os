import type {
  EvidenceRef,
  ScenarioOverride,
  Sump,
  SumpId,
  SumpRuntimeState,
  SumpThreshold,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { DeterministicRandom, deriveSeed } from './rng';
import { sumpOutflowM3h } from './plant';

/**
 * Water balance.
 *
 * The core relationship is a first-order discrete integration with hard
 * physical limits:
 *
 *   V_next = clamp(V_current + (Q_in - Q_out) * delta_t, 0, V_capacity)
 *
 * `Q` is always expressed in m3/h and converted to m3/s inside the integrator.
 * There are no percentage-based flooding forecasts anywhere in MINE OS: a
 * forecast is a trajectory of stored volume and a level in metres, and the
 * time-to-threshold is read directly off that trajectory.
 */

/** Water depth above the sump floor for a stored volume, using the modelled plan area. */
export function sumpLevelM(sump: Sump, volumeM3: number): number {
  if (sump.areaM2 <= 0) return 0;
  return Math.max(0, volumeM3) / sump.areaM2;
}

/** Absolute elevation of the water surface, relative to mine datum. */
export function waterSurfaceElevationM(sump: Sump, levelM: number): number {
  return sump.floorElevationM + levelM;
}

export interface WaterStepInput {
  volumeM3: number;
  inflowM3h: number;
  outflowM3h: number;
  dtSec: number;
  capacityM3: number;
}

export interface WaterStepResult {
  volumeM3: number;
  levelM: number;
  netFlowM3h: number;
  /** True when the volume was limited by the capacity ceiling this step. */
  clampedHigh: boolean;
  /** True when the volume was limited by the zero floor this step. */
  clampedLow: boolean;
}

/**
 * Integrate one step of the water balance.
 *
 * Exported so the unit tests can verify mass conservation, clamping and the
 * sign convention independently of the rest of the engine.
 */
export function integrateWater(input: WaterStepInput): WaterStepResult {
  const { volumeM3, inflowM3h, outflowM3h, dtSec, capacityM3 } = input;
  const netM3h = inflowM3h - outflowM3h;
  const deltaM3 = (netM3h / 3600) * dtSec;
  const raw = volumeM3 + deltaM3;
  const clampedHigh = raw > capacityM3;
  const clampedLow = raw < 0;
  const next = Math.min(Math.max(raw, 0), Math.max(0, capacityM3));
  return {
    volumeM3: next,
    levelM: 0,
    netFlowM3h: netM3h,
    clampedHigh,
    clampedLow,
  };
}

/**
 * Total modelled inflow into a sump, in m3/h.
 *
 * The rainfall-sensitive fraction of the baseline inflow is scaled by the
 * scenario's rainfall multiplier, which is how the "heavy rainfall" branch of
 * the scenario laboratory is expressed.
 */
export function computeSumpInflowM3h(
  sump: Sump,
  overrides: ScenarioOverride,
  rainfallMultiplier: number,
  noise: number,
): number {
  const multiplier = overrides.sumpOverrides[sump.id]?.inflowMultiplier ?? 1;
  const baseline = sump.baselineInflowM3h * multiplier;
  const rainfallShare = sump.rainfallSensitiveFraction * Math.max(0, rainfallMultiplier - 1);
  const raw = baseline * (1 + rainfallShare);
  return Math.max(0, raw * (1 + noise));
}

/** Highest threshold that the given level has breached. */
export function breachedThreshold(sump: Sump, levelM: number): SumpThreshold | null {
  let breach: SumpThreshold | null = null;
  for (const threshold of sump.thresholds) {
    if (levelM >= threshold.levelM) {
      if (!breach || threshold.levelM > breach.levelM) breach = threshold;
    }
  }
  return breach;
}

/**
 * Time (seconds) for a sump to reach a level at a constant net flow.
 * Returns null when the level is never reached (net flow <= 0) or is already reached.
 */
export function timeToLevelSeconds(
  sump: Sump,
  currentVolumeM3: number,
  netFlowM3h: number,
  targetLevelM: number,
): number | null {
  const targetVolume = targetLevelM * sump.areaM2;
  if (currentVolumeM3 >= targetVolume) return 0;
  if (netFlowM3h <= 0) return null;
  return ((targetVolume - currentVolumeM3) / netFlowM3h) * 3600;
}

/** Compute the runtime state of a sump from the plant model. */
export function computeSumpState(
  sump: Sump,
  volumeM3: number,
  inflowM3h: number,
  outflowM3h: number,
): SumpRuntimeState {
  const levelM = sumpLevelM(sump, volumeM3);
  const breach = breachedThreshold(sump, levelM);
  const net = inflowM3h - outflowM3h;
  const critical = sump.thresholds.find((t) => t.severity === 'critical');
  const secondsToCritical = critical
    ? timeToLevelSeconds(sump, volumeM3, net, critical.levelM)
    : null;
  return {
    volumeM3,
    levelM,
    inflowM3h,
    outflowM3h,
    fillRatio: sump.capacityM3 > 0 ? volumeM3 / sump.capacityM3 : 0,
    breach,
    secondsToCritical,
  };
}

export interface ForecastPoint {
  tSec: number;
  volumeM3: number;
  volumeLowM3: number;
  volumeHighM3: number;
  levelM: number;
  levelLowM: number;
  levelHighM: number;
  inflowM3h: number;
  outflowM3h: number;
}

/**
 * Deterministic forward projection of a single sump.
 *
 * The band is produced by re-running the same integrator with the inflow
 * scaled by ± the configured uncertainty, using a seeded noise sequence so the
 * result is identical for the same scenario. The band therefore widens with
 * horizon — it is not a decorative confidence ribbon.
 */
export function projectSumpVolume(args: {
  mine: MineDefinition;
  sump: Sump;
  startVolumeM3: number;
  inflowM3h: number;
  outflowM3h: number;
  horizonHours: number;
  stepSec: number;
  uncertaintyPct: number;
  seed: number;
  /** Optional multiplier applied to inflow across the whole horizon. */
  inflowMultiplier?: number;
}): ForecastPoint[] {
  const { sump, startVolumeM3, inflowM3h, outflowM3h, horizonHours, stepSec, uncertaintyPct, seed } = args;
  const multiplier = args.inflowMultiplier ?? 1;
  const steps = Math.max(1, Math.round((horizonHours * 3600) / stepSec));
  const central = new DeterministicRandom(seed);
  const low = new DeterministicRandom(deriveSeed(seed, 'low'));
  const high = new DeterministicRandom(deriveSeed(seed, 'high'));

  const points: ForecastPoint[] = [];
  let vCentral = startVolumeM3;
  let vLow = startVolumeM3;
  let vHigh = startVolumeM3;

  for (let i = 0; i <= steps; i += 1) {
    const tSec = i * stepSec;
    if (i > 0) {
      const noiseCentral = central.signed() * (uncertaintyPct / 100) * 0.35;
      const noiseLow = low.signed() * (uncertaintyPct / 100) * 0.35;
      const noiseHigh = high.signed() * (uncertaintyPct / 100) * 0.35;

      const qCentral = Math.max(0, inflowM3h * multiplier * (1 + noiseCentral));
      const qLow = Math.max(0, inflowM3h * multiplier * (1 - uncertaintyPct / 100) * (1 + noiseLow));
      const qHigh = Math.max(0, inflowM3h * multiplier * (1 + uncertaintyPct / 100) * (1 + noiseHigh));

      vCentral = integrateWater({
        volumeM3: vCentral,
        inflowM3h: qCentral,
        outflowM3h,
        dtSec: stepSec,
        capacityM3: sump.capacityM3,
      }).volumeM3;
      vLow = integrateWater({
        volumeM3: vLow,
        inflowM3h: qLow,
        outflowM3h,
        dtSec: stepSec,
        capacityM3: sump.capacityM3,
      }).volumeM3;
      vHigh = integrateWater({
        volumeM3: vHigh,
        inflowM3h: qHigh,
        outflowM3h,
        dtSec: stepSec,
        capacityM3: sump.capacityM3,
      }).volumeM3;
    }

    points.push({
      tSec,
      volumeM3: vCentral,
      volumeLowM3: vLow,
      volumeHighM3: vHigh,
      levelM: sumpLevelM(sump, vCentral),
      levelLowM: sumpLevelM(sump, vLow),
      levelHighM: sumpLevelM(sump, vHigh),
      inflowM3h: inflowM3h * multiplier,
      outflowM3h,
    });
  }

  return points;
}

/** First time (seconds) the trajectory reaches a level, using linear interpolation. */
export function crossingTimeSeconds(points: ForecastPoint[], targetLevelM: number): number | null {
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.levelM < targetLevelM) continue;
    if (prev.levelM >= targetLevelM) return prev.tSec;
    const span = curr.levelM - prev.levelM;
    const ratio = span > 0 ? (targetLevelM - prev.levelM) / span : 0;
    return prev.tSec + ratio * (curr.tSec - prev.tSec);
  }
  return null;
}

/** Evidence reference builder used by forecast panels. */
export function thresholdEvidence(
  sump: Sump,
  threshold: SumpThreshold,
  atSec: number | null,
  atMs: number,
): EvidenceRef {
  return {
    id: `ev-${sump.id}-${threshold.id}`,
    kind: 'calculation',
    label: `${sump.name}: ${threshold.label}`,
    detail:
      atSec === null
        ? `Not reached within the forecast horizon at the modelled flow.`
        : `Modelled crossing of ${threshold.levelM.toFixed(2)} m at ${(atSec / 3600).toFixed(2)} h from the start of the projection.`,
    refs: [sump.id, threshold.id],
    atMs,
  };
}

export function sumpIdList(mine: MineDefinition): SumpId[] {
  return mine.sumps.map((sump) => sump.id);
}

/** Convenience wrapper used by the engine to get the net flow of a sump. */
export function netFlowM3h(state: SumpRuntimeState): number {
  return state.inflowM3h - state.outflowM3h;
}

export { sumpOutflowM3h };
