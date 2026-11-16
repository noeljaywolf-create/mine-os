import type { TaskContract } from '@mine-os/contracts';
import { AGENT_MANIFESTS, runPowerAgent } from '@mine-os/agents';

// Activities host nondeterministic/external calls and recorded side effects (per Temporal guidance).
// Deterministic workflow logic stays in workflows.

export interface PlannerReviewInput { investigation: any; evidence: any[]; reports: any[]; }
export interface PlannerReviewOutput { plan: any; notes: string; model?: string; deterministic: boolean; }

export async function plannerReview(input: PlannerReviewInput): Promise<PlannerReviewOutput> {
  // Stubbed/deterministic reviewer path (Gate A). Model-provider interface can be invoked here when configured.
  const hasConflict = (input.reports || []).some((r: any) => (r.conflicts || []).length > 0);
  return {
    deterministic: true,
    notes: 'Deterministic stub review: plan validated against budgets; conflicts flagged for rework if present.',
    plan: { next: hasConflict ? 'rework' : 'proceed', rounds: 1 },
  };
}

export async function executeSpecialistTask(task: TaskContract, snapshot: any): Promise<any> {
  if (task.agentId === 'power') {
    return runPowerAgent(task, { snapshot, siteId: snapshot?.siteId || 'site' });
  }
  // Other agents registered; stubs return structured placeholder reports (to be implemented)
  const now = Date.now();
  return {
    report: { id: `rep-${task.id}`, investigationId: task.investigationId, taskId: task.id, agentId: task.agentId, agentVersion: '0.1.0', summary: `${task.agentId} analysis pending implementation (registered agent).`, findings: [], evidenceIds: [], assumptions: [], uncertainties: ['Agent logic not yet implemented'], recommendations: [], conflicts: [], atMs: now },
    evidence: []
  };
}

export async function evaluatePolicy(input: any): Promise<any> {
  // OPA integration hook (early). For Gate A skeleton, allow in simulation with explicit reasons.
  return { allow: true, reasons: ['Gate A simulation policy stub: allowed for simulated execution'], obligations: ['revalidate-before-execution'], policyVersion: 'stub-0.1', evaluatedAtMs: Date.now(), input };
}
