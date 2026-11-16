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
}

export const stateQuery = defineQuery<string>('state');

export async function investigationWorkflow(input: InvestigationInput): Promise<any> {
  let state = 'created';
  let approval: any = null;
  setHandler(stateQuery, () => state);

  state = 'planning';
  const review = await plannerReview({ investigation: input, evidence: [], reports: [] });

  state = 'dispatching';
  const tasks = [
    { id: `${input.investigationId}-t-power`, investigationId: input.investigationId, agentId: 'power', kind: 'analysis', objective: 'Assess power supply/runtime implications', inputs: {}, snapshotRefs: input.snapshot?.id ? [input.snapshot.id] : [], constraints: [], status: 'dispatched', attempt: 0, createdAtMs: Date.now() },
    { id: `${input.investigationId}-t-deepwater`, investigationId: input.investigationId, agentId: 'deepwater', kind: 'analysis', objective: 'Assess pumping/inflow implications', inputs: {}, snapshotRefs: input.snapshot?.id ? [input.snapshot.id] : [], constraints: [], status: 'dispatched', attempt: 0, createdAtMs: Date.now() },
  ];

  state = 'awaiting_evidence';
  const results = [] as any[];
  for (const t of tasks) { // sequential in skeleton; parallelizable with bounded concurrency
    results.push(await executeSpecialistTask(t as any, input.snapshot));
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
