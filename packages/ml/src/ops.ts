/** Shadow operations & measurement (Approach 6) - track usefulness/accuracy without claiming ML performance. */
export interface RecommendationOutcome {
  id: string;
  investigationId?: string;
  agentId?: string;
  scenarioId?: string;
  recommendation: string;
  outcome: 'correct' | 'incorrect' | 'partial' | 'unknown';
  falsePositive?: boolean;
  falseNegative?: boolean;
  notes?: string;
  actor?: string;
  atMs: number;
}

export interface OpsMetrics {
  total: number;
  byOutcome: Record<string, number>;
  precisionProxy: number | null; // correct / (correct+incorrect+falsePositive-labeled) over known outcomes
  flagRate: number | null;
  conflictRate: number | null;
  notes: string[];
}

export function computeOpsMetrics(outcomes: RecommendationOutcome[], meta?: { totalInvestigations?: number; investigationsWithConflicts?: number }): OpsMetrics {
  const byOutcome: Record<string, number> = {};
  for (const o of outcomes) byOutcome[o.outcome] = (byOutcome[o.outcome] || 0) + 1;
  const known = outcomes.filter(o => o.outcome === 'correct' || o.outcome === 'incorrect' || o.outcome === 'partial');
  const correct = outcomes.filter(o => o.outcome === 'correct').length;
  const incorrect = outcomes.filter(o => o.outcome === 'incorrect' || o.falsePositive).length;
  const denom = correct + incorrect;
  return {
    total: outcomes.length,
    byOutcome,
    precisionProxy: denom > 0 ? +(correct / denom).toFixed(4) : null,
    flagRate: meta?.totalInvestigations ? +(outcomes.length / meta.totalInvestigations).toFixed(4) : null,
    conflictRate: meta?.totalInvestigations && meta.investigationsWithConflicts != null ? +(meta.investigationsWithConflicts / meta.totalInvestigations).toFixed(4) : null,
    notes: ['Metrics are over recorded/known outcomes only; unknown outcomes excluded from precision proxy.'],
  };
}

export function shadowRunSummary(args: { investigationId: string; agentReports: any[]; qualityScore?: number; calibrationRefs?: string[] }) {
  const conflicts = args.agentReports.flatMap(r => r?.conflicts || []).length;
  const uncertainties = args.agentReports.flatMap(r => r?.uncertainties || []).length;
  const recs = args.agentReports.flatMap(r => r?.recommendations || []).length;
  const evidence = args.agentReports.reduce((a, r) => a + ((r?.evidenceIds || []).length), 0);
  return {
    investigationId: args.investigationId,
    atMs: Date.now(),
    mode: 'shadow_readonly',
    agents: args.agentReports.length,
    evidenceCount: evidence,
    recommendationCount: recs,
    conflictCount: conflicts,
    uncertaintyCount: uncertainties,
    qualityScore: args.qualityScore,
    calibrationRefs: args.calibrationRefs || [],
    requiresHumanValidation: true,
    advisoryOnly: true,
  };
}
