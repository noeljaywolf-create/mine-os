import { z } from 'zod';

export const InvestigationStateSchema = z.enum([
  'created',
  'planning',
  'dispatching',
  'awaiting_evidence',
  'validating_evidence',
  'conflict',
  'scenario_comparison',
  'awaiting_approval',
  'revalidating',
  'simulated_execution',
  'verifying_outcome',
  'completed',
  'rejected',
  'failed',
  'paused',
]);
export type InvestigationState = z.infer<typeof InvestigationStateSchema>;

export const InvestigationSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  owner: z.string().default('site-core'),
  state: InvestigationStateSchema,
  version: z.number().int().nonnegative(),
  trigger: z.object({
    type: z.string(),
    source: z.string(),
    atMs: z.number(),
    summary: z.string(),
    refs: z.array(z.string()).default([]),
  }),
  plan: z.unknown().optional(),
  budgets: z.object({ maxRounds: z.number().int().positive().default(5), maxTasks: z.number().int().positive().default(20) }).default({ maxRounds: 5, maxTasks: 20 }),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  unresolved: z.array(z.string()).default([]),
});
export type Investigation = z.infer<typeof InvestigationSchema>;

export const TaskContractSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  agentId: z.string(),
  kind: z.string(),
  objective: z.string(),
  inputs: z.record(z.unknown()).default({}),
  snapshotRefs: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  status: z.enum(['pending','dispatched','completed','failed','cancelled']).default('pending'),
  attempt: z.number().int().nonnegative().default(0),
  createdAtMs: z.number(),
});
export type TaskContract = z.infer<typeof TaskContractSchema>;