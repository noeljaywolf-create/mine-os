import type { CalibrationProfile, FeedbackRecord } from '@mine-os/contracts';

/** Calibration/grounding (Approach A): tune thresholds/parameters from backtests and approved feedback, versioned and auditable. */
export interface CalibrationStore {
  save(profile: CalibrationProfile): Promise<void>;
  get(id: string): Promise<CalibrationProfile | undefined>;
  list(filter?: { agentId?: string; target?: string; siteId?: string; status?: CalibrationProfile['status'] }): Promise<CalibrationProfile[]>;
  active(agentId: string, target?: string, siteId?: string): Promise<CalibrationProfile | undefined>;
}

/** Resolve an active calibration profile for agent context (falls back to global/site default semantics handled by caller). */
export async function resolveActiveCalibration(store: CalibrationStore, agentId: string, siteId?: string, target = 'general'): Promise<CalibrationProfile | undefined> {
  return (await store.active(agentId, target, siteId)) || (await store.active('all', target, siteId)) || (await store.active(agentId, 'general', siteId)) || (await store.active('all', 'general', siteId));
}

export class InMemoryCalibrationStore implements CalibrationStore {
  profiles: CalibrationProfile[] = [];
  async save(profile: CalibrationProfile): Promise<void> {
    const i = this.profiles.findIndex(p => p.id === profile.id);
    if (i >= 0) this.profiles[i] = profile; else this.profiles.push(profile);
  }
  async get(id: string): Promise<CalibrationProfile | undefined> { return this.profiles.find(p => p.id === id); }
  async list(filter?: { agentId?: string; target?: string; siteId?: string; status?: CalibrationProfile['status'] }): Promise<CalibrationProfile[]> {
    return this.profiles.filter(p => (!filter?.agentId || p.agentId === filter.agentId) && (!filter?.target || p.target === filter.target) && (!filter?.siteId || p.siteId === filter.siteId) && (!filter?.status || p.status === filter.status));
  }
  async active(agentId: string, target?: string, siteId?: string): Promise<CalibrationProfile | undefined> {
    const list = (await this.list({ agentId, target, siteId, status: 'active' })).sort((a,b)=>b.createdAtMs-a.createdAtMs);
    return list[0];
  }
}

export function proposeCalibrationFromFeedback(agentId: string, target: string, feedback: FeedbackRecord[], base?: CalibrationProfile): CalibrationProfile {
  const approved = feedback.filter(f => f.approvedForLearning && (f.agentId == null || f.agentId === agentId) && (f.target == null || f.target === target));
  const adjustments = approved.filter(f => f.kind === 'threshold_adjustment' || f.kind === 'label_correction' || f.kind === 'rule_suggestion');
  return {
    id: `cal-${agentId}-${target}-${Date.now()}`,
    agentId, target, siteId: base?.siteId, version: `${(base?.version ?? '0')}.cand.${Date.now()}`,
    parameters: { ...(base?.parameters ?? {}) },
    thresholds: { ...(base?.thresholds ?? {}), proposedAdjustmentCount: adjustments.length },
    derivedFrom: approved.map(f => f.id),
    metrics: { feedbackCount: approved.length, adjustmentCount: adjustments.length },
    status: 'candidate',
    createdAtMs: Date.now(),
    notes: ['Candidate calibration derived from approved feedback; requires backtest/validation before activation.'],
  };
}
