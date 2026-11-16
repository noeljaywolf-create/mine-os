import type { TaskContract } from '@mine-os/contracts';
import { AGENT_MANIFESTS, runSpecialistAgent } from '@mine-os/agents';

// Activities host nondeterministic/external calls and recorded side effects (per Temporal guidance).
// Deterministic workflow logic stays in workflows.

export interface PlannerReviewInput { investigation: any; evidence: any[]; reports: any[]; }
export interface PlannerReviewOutput { plan: any; notes: string; model?: string; deterministic: boolean; }

export async function plannerReview(input: PlannerReviewInput): Promise<PlannerReviewOutput> {
  // Stubbed/deterministic reviewer path (Gate A). Model-provider interface can be invoked here when configured.
  const hasConflict = (input.reports || []).some((r: any) => (r.conflicts || []).length > 0);
  const agents = AGENT_MANIFESTS.map(a => a.id);
  return {
    deterministic: true,
    notes: `Deterministic stub review over ${agents.length} registered agents; conflicts flagged for rework if present.`,
    plan: { next: hasConflict ? 'rework' : 'proceed', rounds: 1, agents },
  };
}

/**
 * Execute a specialist agent over a recorded snapshot. Deterministic analysis runs in-activity;
 * ML inference (when configured) must be recorded/versioned and passed as advisory predictions.
 */
export async function executeSpecialistTask(task: TaskContract, snapshot: any, context?: any): Promise<any> {
  const siteId = snapshot?.siteId || context?.siteId || 'site';
  const mlPredictions = context?.mlPredictionsByAgent?.[task.agentId] || context?.mlPredictions || [];
  return runSpecialistAgent(task, { siteId, snapshot, mine: context?.mine, context, mlPredictions });
}

export async function evaluatePolicy(input: any): Promise<any> {
  // OPA integration hook (early). For Gate A skeleton, allow in simulation with explicit reasons.
  return { allow: true, reasons: ['Gate A simulation policy stub: allowed for simulated execution'], obligations: ['revalidate-before-execution'], policyVersion: 'stub-0.1', evaluatedAtMs: Date.now(), input };
}

export function listRegisteredAgents() {
  return AGENT_MANIFESTS;
}
