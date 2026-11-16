import { proxyActivities, defineQuery, setHandler, condition } from '@temporalio/workflow';
import type * as activities from '../activities/index';

// Deterministic orchestration: checks plan, enforces budgets, schedules work, persists state transitions via activities.
// Planner/LLM and external calls are proxied as activities (recorded), never inside deterministic workflow logic.

const { plannerReview, executeSpecialistTask, evaluatePolicy } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export interface InvestigationInput {
  investigationId: string;
  siteId: string;
  trigger: any;
  snapshot: any;
  /** Optional subset/order of specialist agents; defaults to all six. */
  agentIds?: string[];
  context?: Record<string, unknown>;
}

export const stateQuery = defineQuery<string>('state');

export async function investigationWorkflow(input: InvestigationInput): Promise<any> {
  let state = 'created';
  let approval: any = null;
  setHandler(stateQuery, () => state);

  state = 'planning';
  const review = await plannerReview({ investigation: input, evidence: [], reports: [] });

  state = 'dispatching';
  const agentIds = (input as any).agentIds || ['power', 'deepwater', 'production', 'engineering', 'maintenance', 'safety'];
  const objectives: Record<string, string> = {
    power: 'Assess power supply/runtime implications',
    deepwater: 'Assess pumping/inflow and dewatering risk',
    production: 'Assess production/access and throughput impact',
    engineering: 'Assess equipment/network feasibility and constraints',
    maintenance: 'Assess condition, faults, and telemetry health',
    safety: 'Assess safety-relevant restrictions and hazard escalation indicators (advisory)',
  };
  const tasks = agentIds.map((agentId: string) => ({
    id: `${input.investigationId}-t-${agentId}`,
    investigationId: input.investigationId,
    agentId,
    kind: 'analysis',
    objective: objectives[agentId] || `Assess ${agentId} domain`,
    inputs: { trigger: input.trigger },
    snapshotRefs: input.snapshot?.id ? [input.snapshot.id] : [],
    constraints: ['advisory-only', 'no-industrial-writes', 'deterministic-snapshot-analysis'],
    status: 'dispatched',
    attempt: 0,
    createdAtMs: Date.now(),
  }));

  state = 'awaiting_evidence';
  const results = [] as any[];
  for (const t of tasks) { // sequential in skeleton; parallelizable with bounded concurrency
    results.push(await executeSpecialistTask(t as any, input.snapshot, { siteId: input.siteId, trigger: input.trigger }));
  }

  state = 'validating_evidence';
  const reports = results.map(r => r.report);
  const evidence = results.flatMap(r => r.evidence || []);
  const conflicts = reports.flatMap(r => r.conflicts || []);
  if (conflicts.length) state = 'conflict';

  state = 'scenario_comparison';
  const scenario = { compared: true, note: 'Isolated scenario comparison (simulation) placeholder', options: ['maintain','shed-load'] };

  state = 'awaiting_approval';
  await condition(() => approval !== null, '7 days').catch(() => { /* timeout/paused handling in production */ });
  if (!approval?.approved) { state = 'rejected'; return { state, review, reports, evidence, scenario, approval }; }

  state = 'revalidating';
  const policy = await evaluatePolicy({ investigationId: input.investigationId, approval, reports });
  if (!policy.allow) { state = 'rejected'; return { state, review, reports, evidence, scenario, approval, policy }; }

  state = 'simulated_execution';
  const execution = { mode: 'simulated', executed: true, note: 'No industrial writes (Gate A)' };

  state = 'verifying_outcome';
  const verification = { verified: true, note: 'Outcome verification against simulation snapshot (skeleton)' };

  state = 'completed';
  return { state, investigationId: input.investigationId, review, reports, evidence, scenario, approval, policy, execution, verification };
}
