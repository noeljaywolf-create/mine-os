import { z } from 'zod';

/** Approved knowledge for RAG/grounding. Retrieved content is UNTRUSTED context and must be cited/provenanced. */
export const KnowledgeDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string().optional(),
  uri: z.string().optional(),
  docType: z.enum(['manual', 'sop', 'pid', 'incident_report', 'maintenance_record', 'case_study', 'standard', 'policy', 'other']).default('other'),
  version: z.string().optional(),
  approved: z.boolean().default(false),
  approvedBy: z.string().optional(),
  approvedAtMs: z.number().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdAtMs: z.number(),
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export const KnowledgeChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  text: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  embeddingRef: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

export const RetrievalRequestSchema = z.object({
  query: z.string(),
  topK: z.number().int().positive().max(50).default(5),
  filters: z.record(z.unknown()).default({}),
  requireApproved: z.boolean().default(true),
});
export type RetrievalRequest = z.infer<typeof RetrievalRequestSchema>;

export const RetrievalHitSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  score: z.number(),
  text: z.string(),
  citation: z.object({
    title: z.string().optional(),
    source: z.string().optional(),
    uri: z.string().optional(),
    version: z.string().optional(),
    chunkIndex: z.number().int().nonnegative(),
  }),
  untrusted: z.literal(true).default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type RetrievalHit = z.infer<typeof RetrievalHitSchema>;

export const RetrievalResponseSchema = z.object({
  query: z.string(),
  hits: z.array(RetrievalHitSchema),
  atMs: z.number(),
  provenance: z.record(z.unknown()).default({}),
  note: z.string().default('Retrieved content is untrusted context; verify against approved sources and deterministic evidence.'),
});
export type RetrievalResponse = z.infer<typeof RetrievalResponseSchema>;
