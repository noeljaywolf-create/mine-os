import { z } from 'zod';

/** Human/operational feedback for calibration and rule/playbook learning (governed, auditable). */
export const FeedbackKindSchema = z.enum([
  'recommendation_correct',
  'recommendation_incorrect',
  'false_positive',
  'false_negative',
  'threshold_adjustment',
  'label_correction',
  'rule_suggestion',
  'playbook_outcome',
  'safety_override',
]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;

export const FeedbackRecordSchema = z.object({
  id: z.string(),
  investigationId: z.string().optional(),
  agentId: z.string().optional(),
  modelId: z.string().optional(),
  modelVersion: z.string().optional(),
  kind: FeedbackKindSchema,
  actor: z.string(),
  role: z.string().optional(),
  summary: z.string(),
  details: z.record(z.unknown()).default({}),
  target: z.string().optional(),
  outcome: z.record(z.unknown()).default({}),
  approvedForLearning: z.boolean().default(false),
  atMs: z.number(),
  provenance: z.record(z.unknown()).default({}),
});
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;

export const CalibrationProfileSchema = z.object({
  id: z.string(),
  agentId: z.string().optional(),
  target: z.string().optional(),
  siteId: z.string().optional(),
  version: z.string(),
  parameters: z.record(z.unknown()).default({}),
  thresholds: z.record(z.unknown()).default({}),
  derivedFrom: z.array(z.string()).default([]),
  metrics: z.record(z.unknown()).default({}),
  status: z.enum(['draft', 'candidate', 'validated', 'active', 'retired']).default('draft'),
  createdAtMs: z.number(),
  notes: z.array(z.string()).default([]),
});
export type CalibrationProfile = z.infer<typeof CalibrationProfileSchema>;

export const OperationalModeSchema = z.enum(['demo', 'shadow_readonly', 'decision_support', 'operational_gated']);
export type OperationalMode = z.infer<typeof OperationalModeSchema>;

export const DeploymentConfigSchema = z.object({
  mode: OperationalModeSchema.default('shadow_readonly'),
  allowIndustrialWrites: z.boolean().default(false),
  allowControlActions: z.boolean().default(false),
  requirePolicyApproval: z.boolean().default(true),
  requireHumanValidation: z.boolean().default(true),
  mlAdvisoryOnly: z.boolean().default(true),
  deterministicAuthority: z.boolean().default(true),
  approvedSites: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
