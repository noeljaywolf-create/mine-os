import type { FeedbackRecord } from '@mine-os/contracts';

/** Feedback capture for calibration and governed rule/playbook learning (Approach A/D). */
export interface FeedbackStore {
  append(record: FeedbackRecord): Promise<void>;
  list(filter?: { agentId?: string; target?: string; investigationId?: string; approvedForLearning?: boolean }): Promise<FeedbackRecord[]>;
}

export class InMemoryFeedbackStore implements FeedbackStore {
  records: FeedbackRecord[] = [];
  async append(record: FeedbackRecord): Promise<void> { this.records.push(record); }
  async list(filter?: { agentId?: string; target?: string; investigationId?: string; approvedForLearning?: boolean }): Promise<FeedbackRecord[]> {
    return this.records.filter(r => (!filter?.agentId || r.agentId === filter.agentId) && (!filter?.target || r.target === filter.target) && (!filter?.investigationId || r.investigationId === filter.investigationId) && (filter?.approvedForLearning == null || r.approvedForLearning === filter.approvedForLearning));
  }
}

export function learningSignals(records: FeedbackRecord[]) {
  const approved = records.filter(r => r.approvedForLearning);
  const byKind = approved.reduce<Record<string, number>>((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc; }, {});
  return { total: records.length, approved: approved.length, byKind };
}
