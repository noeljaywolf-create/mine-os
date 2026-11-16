import { z } from 'zod';

export const SnapshotKindSchema = z.enum(['telemetry','derived','decision','hypothesis']);
export type SnapshotKind = z.infer<typeof SnapshotKindSchema>;

export const SnapshotSchema = z.object({
  id: z.string(),
  investigationId: z.string().optional(),
  siteId: z.string(),
  kind: SnapshotKindSchema,
  atMs: z.number(),
  stateVersion: z.number().int().optional(),
  inputs: z.record(z.unknown()).default({}),
  data: z.unknown(),
  quality: z.record(z.unknown()).default({}),
  provenance: z.record(z.unknown()).default({}),
  immutable: z.boolean().default(true),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;