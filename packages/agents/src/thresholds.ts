import type { CalibrationProfile } from '@mine-os/contracts';
import { num } from './types';

/** Site/calibration-tunable thresholds (Approach A). Defaults are conservative/general; override via CalibrationProfile. */
export interface AgentThresholds {
  dewater: {
    fillWarning: number;      // 0..1
    fillHigh: number;         // 0..1
    fillCritical: number;     // 0..1
    ttcUrgentSec: number;     // seconds
    ttcWarningSec: number;    // seconds
    netPositiveM3h: number;   // m3/h considered meaningful
  };
  power: {
    marginWarningKw: number;  // below this => warning (can be negative logic handled separately)
    supplyRatioDegraded: number;
  };
  maintenance: {
    conditionConcern: number; // below => concern
    conditionLow: number;     // below => strong concern
  };
  production: {
    constrainedRatio: number; // below 1-eps treated constrained
  };
  safety: {
    fillCritical: number;
    fillWarning: number;
    ttcCriticalSec: number;
    ttcWarningSec: number;
  };
}

export const DEFAULT_THRESHOLDS: AgentThresholds = {
  dewater: { fillWarning: 0.75, fillHigh: 0.85, fillCritical: 0.9, ttcUrgentSec: 4 * 3600, ttcWarningSec: 6 * 3600, netPositiveM3h: 0.01 },
  power: { marginWarningKw: 50, supplyRatioDegraded: 0.999 },
  maintenance: { conditionConcern: 0.75, conditionLow: 0.7 },
  production: { constrainedRatio: 0.999 },
  safety: { fillCritical: 0.95, fillWarning: 0.85, ttcCriticalSec: 2 * 3600, ttcWarningSec: 6 * 3600 },
};

function deepMerge(base: any, over: any): any {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out: any = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export function thresholdsFromCalibration(profile?: CalibrationProfile | null): AgentThresholds {
  if (!profile) return DEFAULT_THRESHOLDS;
  const t = deepMerge(DEFAULT_THRESHOLDS, (profile.thresholds as any)?.agent || profile.thresholds || {});
  // normalize key numeric fields defensively
  t.dewater.fillWarning = num(t.dewater.fillWarning, DEFAULT_THRESHOLDS.dewater.fillWarning);
  t.dewater.fillHigh = num(t.dewater.fillHigh, DEFAULT_THRESHOLDS.dewater.fillHigh);
  t.dewater.fillCritical = num(t.dewater.fillCritical, DEFAULT_THRESHOLDS.dewater.fillCritical);
  t.dewater.ttcUrgentSec = num(t.dewater.ttcUrgentSec, DEFAULT_THRESHOLDS.dewater.ttcUrgentSec);
  t.dewater.ttcWarningSec = num(t.dewater.ttcWarningSec, DEFAULT_THRESHOLDS.dewater.ttcWarningSec);
  t.safety.ttcCriticalSec = num(t.safety.ttcCriticalSec, DEFAULT_THRESHOLDS.safety.ttcCriticalSec);
  t.safety.ttcWarningSec = num(t.safety.ttcWarningSec, DEFAULT_THRESHOLDS.safety.ttcWarningSec);
  return t as AgentThresholds;
}

export function resolveThresholds(context: any): { thresholds: AgentThresholds; calibrationRef?: string } {
  const profile = context?.calibrationProfile || context?.calibration || null;
  return { thresholds: thresholdsFromCalibration(profile), calibrationRef: profile?.id || profile?.version };
}
