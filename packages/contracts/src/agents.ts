import { z } from 'zod';

export const AgentIdSchema = z.enum(['power','deepwater','production','engineering','maintenance','safety','core-planner']);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const AgentManifestSchema = z.object({
  id: AgentIdSchema.or(z.string()),
  name: z.string(),
  domain: z.string(),
  version: z.string(),
  description: z.string(),
  tools: z.array(z.string()).default([]),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  deterministicPreferred: z.boolean().default(true),
});
export type AgentManifest = z.infer<typeof AgentManifestSchema>;