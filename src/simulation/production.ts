import type {
  Assumptions,
  EvidenceRef,
  ProductionZone,
  ScenarioOverride,
  Sump,
  SumpId,
  SumpRuntimeState,
  ZoneId,
  ZoneRuntimeState,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { sumpLevelM } from './water';

/**
 * Production exposure model.
 *
 * A production zone is constrained when the water level of the sump that
 * controls its floor reaches that floor. The relationship is geometric and
 * explicit:
 *
 *   flood level above sump floor = zone floor elevation - sump floor elevation
 *
 * Nothing here is a percentage guess: the constrained fraction of production
 * comes from a documented rule table, and the exposure figures are the
 * integral of the modelled shortfall.
 */

/** Production retained, by the severity of the controlling sump condition. */
const RESTRICTION_RULES: Array<{ threshold: 'critical' | 'warning' | 'advisory'; ratio: number }> = [
  { threshold: 'critical', ratio: 0.5 },
  { threshold: 'warning', ratio: 0.75 },
  { threshold: 'advisory', ratio: 0.9 },
];

/** Level above the sump floor at which the given zone floor is submerged. */
export function zoneFloodLevelM(zone: ProductionZone, sump: Sump): number {
  return zone.floorElevationM - sump.floorElevationM;
}

export interface ZoneEvaluation {
  zoneId: ZoneId;
  ratio: number;
  status: ZoneRuntimeState['status'];
  reason: string;
  constrainedBy: string | null;
  controllingSumpId: SumpId | null;
  floodLevelM: number | null;
  secondsToFlood: number | null;
  /** Threshold crossed most recently, used for alerting. */
  governingSeverity: 'critical' | 'warning' | 'advisory' | null;
}

export function evaluateZone(
  mine: MineDefinition,
  zone: ProductionZone,
  sumpStates: Record<SumpId, SumpRuntimeState>,
  overrides: ScenarioOverride,
): ZoneEvaluation {
  const sump = mine.sumps.find((s) => s.id === zone.floodControlSumpId);
  const sumpState = sump ? sumpStates[sump.id] : undefined;
  if (!sump || !sumpState) {
    return {
      zoneId: zone.id,
      ratio: 1,
      status: 'operational',
      reason: 'No controlling sump modelled — zone treated as unconstrained.',
      constrainedBy: null,
      controllingSumpId: null,
      floodLevelM: null,
      secondsToFlood: null,
      governingSeverity: null,
    };
  }

  const floodLevelM = zoneFloodLevelM(zone, sump);
  const levelM = sumpState.levelM;

  let ratio = 1;
  let status: ZoneRuntimeState['status'] = 'operational';
  let reason = 'Dewatering within limits — full throughput available.';
  let governingSeverity: ZoneEvaluation['governingSeverity'] = null;

  if (levelM >= floodLevelM) {
    ratio = 0;
    status = 'failed';
    reason = `Water surface at ${levelM.toFixed(2)} m has reached the zone floor (${floodLevelM.toFixed(
      2,
    )} m above the ${sump.name} floor).`;
    governingSeverity = 'critical';
  } else {
    for (const rule of RESTRICTION_RULES) {
      const threshold = sump.thresholds.find((t) => t.severity === rule.threshold);
      if (threshold && levelM >= threshold.levelM) {
        ratio = Math.min(ratio, rule.ratio);
        governingSeverity = rule.threshold;
        status = rule.threshold === 'critical' ? 'exposed' : 'degraded';
        reason = `${sump.name} at ${levelM.toFixed(2)} m has breached the ${
          threshold.severity
        } threshold (${threshold.levelM.toFixed(2)} m) — production restricted.`;
        break;
      }
    }
  }

  const net = sumpState.inflowM3h - sumpState.outflowM3h;
  const secondsToFlood =
    levelM >= floodLevelM ? 0 : net > 0 ? ((floodLevelM - levelM) * sump.areaM2 / net) * 3600 : null;

  void overrides;
  return {
    zoneId: zone.id,
    ratio,
    status,
    reason,
    constrainedBy: ratio < 1 ? sump.id : null,
    controllingSumpId: sump.id,
    floodLevelM,
    secondsToFlood,
    governingSeverity,
  };
}

export interface ZoneAccumulator {
  lostHours: number;
  lostTonnes: number;
  lostValueUSD: number;
}

export function newAccumulator(): ZoneAccumulator {
  return { lostHours: 0, lostTonnes: 0, lostValueUSD: 0 };
}

/**
 * Integrate production loss over one simulation step.
 *
 * `lostHours` is equivalent operating hours lost (full hours where production
 * stopped contribute the whole hour, partially restricted hours contribute the
 * proportional shortfall).
 */
export function accumulateZoneLoss(
  zone: ProductionZone,
  accumulator: ZoneAccumulator,
  ratio: number,
  dtSec: number,
  assumptions: Assumptions,
): ZoneAccumulator {
  const shortfall = Math.max(0, Math.min(1, 1 - ratio));
  if (shortfall === 0) return accumulator;
  const lostTonnes = (zone.designRateTph * dtSec * shortfall) / 3600;
  return {
    lostHours: accumulator.lostHours + (dtSec * shortfall) / 3600,
    lostTonnes: accumulator.lostTonnes + lostTonnes,
    lostValueUSD: accumulator.lostValueUSD + lostTonnes * assumptions.valuePerTonneUSD,
  };
}

export interface ExposureSummary {
  /** Equivalent operating hours lost across all zones. */
  downtimeHours: number;
  lostTonnes: number;
  lostProductionValueUSD: number;
  /** Variable cost incurred while production was restricted. */
  idleOperatingCostUSD: number;
  /** Site overhead over the event window — reported separately, not a consequence. */
  eventWindowOverheadUSD: number;
  /** One-off response cost, if a mitigation was executed. */
  responseCostUSD: number;
  /** Illustrative total exposure. */
  totalIllustrativeExposureUSD: number;
  perZone: Array<{
    zoneId: ZoneId;
    zoneName: string;
    lostHours: number;
    lostTonnes: number;
    lostValueUSD: number;
    currentRatio: number;
  }>;
}

export function buildExposureSummary(args: {
  mine: MineDefinition;
  zones: Record<ZoneId, ZoneRuntimeState>;
  assumptions: Assumptions;
  eventWindowHours: number;
  responseCostUSD?: number;
}): ExposureSummary {
  const { mine, zones, assumptions, eventWindowHours } = args;
  const responseCostUSD = args.responseCostUSD ?? 0;

  const perZone = mine.zones.map((zone) => {
    const state = zones[zone.id];
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      lostHours: state?.lostHours ?? 0,
      lostTonnes: state?.lostTonnes ?? 0,
      lostValueUSD: state?.lostValueUSD ?? 0,
      currentRatio: state?.operatingRatio ?? 1,
    };
  });

  const downtimeHours = perZone.reduce((sum, z) => sum + z.lostHours, 0);
  const lostTonnes = perZone.reduce((sum, z) => sum + z.lostTonnes, 0);
  const lostProductionValueUSD = perZone.reduce((sum, z) => sum + z.lostValueUSD, 0);
  const idleOperatingCostUSD = downtimeHours * assumptions.operatingCostPerHourUSD;
  const eventWindowOverheadUSD = eventWindowHours * assumptions.fixedOverheadPerHourUSD;
  const totalIllustrativeExposureUSD =
    lostProductionValueUSD + idleOperatingCostUSD + responseCostUSD;

  return {
    downtimeHours,
    lostTonnes,
    lostProductionValueUSD,
    idleOperatingCostUSD,
    eventWindowOverheadUSD,
    responseCostUSD,
    totalIllustrativeExposureUSD,
    perZone,
  };
}

/** Evidence for a production exposure statement. */
export function zoneExposureEvidence(
  zone: ProductionZone,
  evaluation: ZoneEvaluation,
  atMs: number,
): EvidenceRef {
  return {
    id: `ev-zone-${zone.id}-${Math.round(atMs)}`,
    kind: 'calculation',
    label: `${zone.name}: production constraint`,
    detail: evaluation.reason,
    refs: [zone.id, evaluation.controllingSumpId ?? ''].filter(Boolean),
    atMs,
  };
}

/** Utilised level helper re-exported for screens that show sump utilisation. */
export function sumpUtilisation(sump: Sump, state: SumpRuntimeState): number {
  return sumpLevelM(sump, state.volumeM3) / Math.max(1, sump.capacityM3 / sump.areaM2);
}
