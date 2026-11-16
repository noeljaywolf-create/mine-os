import { z } from 'zod';

export const EvidenceKindSchema = z.enum(['measurement','derived','document','decision','hypothesis','simulation','verification']);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  kind: EvidenceKindSchema,
  claim: z.string(),
  value: z.unknown().optional(),
  unit: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  refs: z.array(z.string()).default([]),
  snapshotRef: z.string().optional(),
  provenance: z.record(z.unknown()).default({}),
  atMs: z.number(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const AgentReportSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  agentVersion: z.string(),
  summary: z.string(),
  findings: z.array(z.unknown()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  atMs: z.number(),
});
export type AgentReport = z.infer<typeof AgentReportSchema>;