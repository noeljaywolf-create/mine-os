import type { FeedbackRecord } from '@mine-os/contracts';

/** Deterministic rules/playbooks (Approach D) - vetted knowledge encoded as checks/actions, not opaque ML. */
export interface RuleCondition { feature: string; op: '>' | '>=' | '<' | '<=' | '==' | '!='; value: number | boolean | string }
export interface PlaybookRule {
  id: string;
  version: string;
  agentId?: string;
  title: string;
  description?: string;
  enabled: boolean;
  conditions: RuleCondition[]; // AND
  recommendation: string;
  severity: 'info' | 'warning' | 'critical';
  source?: string; // SOP/manual/feedback ref
  approved: boolean;
  provenance: Record<string, unknown>;
}

function getFeature(features: Record<string, any>, key: string): any { return features[key]; }
function evalCond(features: Record<string, any>, c: RuleCondition): boolean {
  const v = getFeature(features, c.feature);
  switch (c.op) {
    case '>': return Number(v) > Number(c.value);
    case '>=': return Number(v) >= Number(c.value);
    case '<': return Number(v) < Number(c.value);
    case '<=': return Number(v) <= Number(c.value);
    case '==': return v === c.value;
    case '!=': return v !== c.value;
  }
}

export function evaluateRules(rules: PlaybookRule[], features: Record<string, any>): Array<{ rule: PlaybookRule; matched: true }> {
  const out: Array<{ rule: PlaybookRule; matched: true }> = [];
  for (const r of rules) {
    if (!r.enabled || !r.approved) continue;
    if (r.conditions.length === 0) continue;
    if (r.conditions.every(c => evalCond(features, c))) out.push({ rule: r, matched: true });
  }
  return out;
}

export function rulesFromApprovedFeedback(feedback: FeedbackRecord[]): PlaybookRule[] {
  // Convert explicit, approved rule suggestions into candidate rules (require human approval before enabling).
  const out: PlaybookRule[] = [];
  for (const f of feedback) {
    if (!f.approvedForLearning || f.kind !== 'rule_suggestion') continue;
    const d = f.details || {};
    if (!d.conditions || !d.recommendation) continue;
    out.push({
      id: `rule-fb-${f.id}`,
      version: '0.1.0-candidate',
      agentId: f.agentId,
      title: f.summary || 'Feedback-derived rule',
      description: typeof d.description === 'string' ? d.description : undefined,
      enabled: false,
      conditions: Array.isArray(d.conditions) ? d.conditions : [],
      recommendation: String(d.recommendation),
      severity: (d.severity as any) || 'warning',
      source: `feedback:${f.id}`,
      approved: false,
      provenance: { fromFeedback: f.id, actor: f.actor, atMs: f.atMs },
    });
  }
  return out;
}

export const DEFAULT_RULES: PlaybookRule[] = [
  { id: 'rule-power-margin-critical', version: '1.0.0', agentId: 'power', title: 'Negative power margin', description: 'Running demand exceeds available supply', enabled: true, approved: true, conditions: [{ feature: 'power.margin_kw', op: '<', value: 0 }], recommendation: 'Prioritize critical dewatering loads, shed non-critical demand, and restore/switch to verified supply per procedure.', severity: 'critical', source: 'grounding:case-studies', provenance: { basis: 'deterministic' } },
  { id: 'rule-dewater-high-fill', version: '1.0.0', agentId: 'deepwater', title: 'High sump fill', description: 'Max sump fill at/above warning band', enabled: true, approved: true, conditions: [{ feature: 'dewater.max_sump_fill_ratio', op: '>=', value: 0.85 }], recommendation: 'Verify pumping capacity/discharge and inflow sources; prepare response to prevent threshold breach/access loss.', severity: 'warning', source: 'grounding:case-studies', provenance: { basis: 'deterministic' } },
  { id: 'rule-dewater-no-discharge-net-positive', version: '1.0.0', agentId: 'deepwater', title: 'Net inflow with no discharge', enabled: true, approved: true, conditions: [{ feature: 'dewater.total_discharge_m3h', op: '<=', value: 0.01 }, { feature: 'dewater.max_net_inflow_m3h', op: '>', value: 0 }], recommendation: 'Escalate: inflow accumulating with negligible discharge — confirm power, pump availability, and blockages immediately.', severity: 'critical', source: 'grounding:case-studies', provenance: { basis: 'deterministic' } },
  { id: 'rule-safety-flood-flags', version: '1.0.0', agentId: 'safety', title: 'Flood risk flags present', enabled: true, approved: true, conditions: [{ feature: 'safety.critical_flood_flags', op: '>=', value: 1 }], recommendation: 'Apply conservative access/water-management controls and verify conditions per emergency procedures (advisory).', severity: 'critical', source: 'grounding:case-studies', provenance: { basis: 'deterministic' } },
];
