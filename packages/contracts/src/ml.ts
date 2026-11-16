import { z } from 'zod';

export const MLTaskTypeSchema = z.enum([
  'classification',
  'regression',
  'forecast',
  'anomaly_detection',
  'risk_scoring',
  'calibration',
]);
export type MLTaskType = z.infer<typeof MLTaskTypeSchema>;

export const DataSourceKindSchema = z.enum([
  'telemetry_snapshot',
  'historian_export',
  'incident_record',
  'maintenance_record',
  'case_study',
  'synthetic_grounded',
  'manual_label',
  'document',
]);
export type DataSourceKind = z.infer<typeof DataSourceKindSchema>;

export const DataSourceSchema = z.object({
  id: z.string(),
  kind: DataSourceKindSchema,
  uri: z.string().optional(),
  description: z.string(),
  license: z.string().optional(),
  provenance: z.record(z.unknown()).default({}),
  collectedAtMs: z.number().optional(),
  quality: z.record(z.unknown()).default({}),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

export const FeatureSpecSchema = z.object({
  name: z.string(),
  dtype: z.enum(['number', 'boolean', 'string', 'category', 'vector']),
  unit: z.string().optional(),
  description: z.string().optional(),
  nullable: z.boolean().default(true),
  source: z.string().optional(),
  transform: z.string().optional(),
});
export type FeatureSpec = z.infer<typeof FeatureSpecSchema>;

export const LabelSpecSchema = z.object({
  name: z.string(),
  dtype: z.enum(['number', 'boolean', 'string', 'category']),
  description: z.string().optional(),
  horizon: z.string().optional(),
  positiveDefinition: z.string().optional(),
});
export type LabelSpec = z.infer<typeof LabelSpecSchema>;

export const DatasetManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sources: z.array(DataSourceSchema).default([]),
  features: z.array(FeatureSpecSchema).default([]),
  labels: z.array(LabelSpecSchema).default([]),
  split: z.object({ train: z.number(), validation: z.number(), test: z.number() }).optional(),
  recordCount: z.number().int().nonnegative().optional(),
  createdAtMs: z.number(),
  provenance: z.record(z.unknown()).default({}),
});
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;

export const ModelMetricsSchema = z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])).default({});
export type ModelMetrics = z.infer<typeof ModelMetricsSchema>;

export const ModelManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  agentId: z.string().optional(),
  taskType: MLTaskTypeSchema,
  target: z.string(),
  description: z.string().optional(),
  featureSchema: z.array(FeatureSpecSchema).default([]),
  labelSchema: z.array(LabelSpecSchema).default([]),
  trainingDatasetIds: z.array(z.string()).default([]),
  algorithm: z.string().optional(),
  hyperparameters: z.record(z.unknown()).default({}),
  metrics: ModelMetricsSchema,
  calibration: z.record(z.unknown()).default({}),
  limitations: z.array(z.string()).default([]),
  provenance: z.record(z.unknown()).default({}),
  createdAtMs: z.number(),
  artifactUri: z.string().optional(),
  status: z.enum(['draft', 'trained', 'validated', 'rejected', 'deployed', 'archived']).default('draft'),
});
export type ModelManifest = z.infer<typeof ModelManifestSchema>;

export const InferenceRequestSchema = z.object({
  requestId: z.string(),
  modelId: z.string(),
  modelVersion: z.string().optional(),
  agentId: z.string().optional(),
  features: z.record(z.unknown()),
  context: z.record(z.unknown()).default({}),
  atMs: z.number(),
});
export type InferenceRequest = z.infer<typeof InferenceRequestSchema>;

export const InferenceResponseSchema = z.object({
  requestId: z.string(),
  modelId: z.string(),
  modelVersion: z.string(),
  prediction: z.unknown(),
  confidence: z.number().min(0).max(1).optional(),
  explanation: z.record(z.unknown()).default({}),
  drift: z.record(z.unknown()).default({}),
  provenance: z.record(z.unknown()).default({}),
  atMs: z.number(),
  advisory: z.literal(true).default(true),
});
export type InferenceResponse = z.infer<typeof InferenceResponseSchema>;

export const TrainingJobSpecSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  agentId: z.string().optional(),
  datasetIds: z.array(z.string()),
  target: z.string(),
  taskType: MLTaskTypeSchema,
  algorithm: z.string(),
  hyperparameters: z.record(z.unknown()).default({}),
  evaluation: z.record(z.unknown()).default({}),
  seed: z.number().int().optional(),
  createdAtMs: z.number(),
});
export type TrainingJobSpec = z.infer<typeof TrainingJobSpecSchema>;

export const EvaluationReportSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  modelVersion: z.string(),
  datasetId: z.string().optional(),
  split: z.enum(['train', 'validation', 'test', 'backtest']).optional(),
  metrics: ModelMetricsSchema,
  baselineComparison: z.array(z.record(z.unknown())).default([]),
  calibration: z.record(z.unknown()).default({}),
  unsupportedClaimChecks: z.array(z.record(z.unknown())).default([]),
  passed: z.boolean().optional(),
  notes: z.array(z.string()).default([]),
  atMs: z.number(),
});
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

export const GroundingDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  sourceType: z.enum(['case_study', 'standard', 'paper', 'regulatory', 'incident_report', 'manual', 'synthesis']),
  summary: z.string(),
  extractedFacts: z.array(z.string()).default([]),
  relevance: z.array(z.string()).default([]),
  provenance: z.record(z.unknown()).default({}),
  retrievedAtMs: z.number(),
});
export type GroundingDocument = z.infer<typeof GroundingDocumentSchema>;
