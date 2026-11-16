import { z } from 'zod';

export const PolicyDecisionSchema = z.object({
  allow: z.boolean(),
  reasons: z.array(z.string()).default([]),
  obligations: z.array(z.string()).default([]),
  policyVersion: z.string().optional(),
  evaluatedAtMs: z.number(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  decision: z.enum(['approved','rejected']),
  actor: z.string(),
  role: z.string(),
  reasons: z.array(z.string()).default([]),
  atMs: z.number(),
  stateVersion: z.number().int(),
});
export type Approval = z.infer<typeof ApprovalSchema>;