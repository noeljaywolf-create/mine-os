import { z } from 'zod';

export const PilotSensorMappingSchema = z.object({
  /** External/source tag id as it appears in telemetry.csv */
  sourceTag: z.string().min(1),
  /** Canonical sensor id used by the model (may equal sourceTag) */
  sensorId: z.string().min(1),
  /** Canonical asset id this sensor observes */
  assetId: z.string().min(1),
  kind: z.enum(['level', 'flow', 'pressure', 'vibration', 'power', 'temperature']),
  unit: z.enum(['m', 'm3/h', 'kPa', 'mm/s', 'kW', 'degC']),
  /** Multiply raw value to reach canonical unit (applied after unit conversion) */
  scale: z.number().finite().default(1),
  deadband: z.number().min(0).default(0),
  minQuality: z.number().min(0).max(1).default(0),
  stalenessThresholdSec: z.number().positive().default(300),
  samplePeriodSec: z.number().positive().default(60),
  accuracyPct: z.number().min(0).max(100).default(2),
  /** 'measured' | 'estimated' | 'synthetic' */
  provenance: z.enum(['measured', 'estimated', 'synthetic']).default('measured'),
});
export type PilotSensorMapping = z.infer<typeof PilotSensorMappingSchema>;

export const PilotSiteConfigSchema = z.object({
  schemaVersion: z.literal(1),
  site: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    location: z.string().default(''),
    description: z.string().default(''),
    timezone: z.string().default('UTC'),
  }),
  /** Provenance/limits banner shown in pilot mode */
  pilot: z.object({
    label: z.string().default('Pilot dataset'),
    readOnly: z.boolean().default(true),
    notes: z.string().default(''),
  }).default({}),
  /** Sensor/tag mappings; must be unique by sourceTag and sensorId */
  sensors: z.array(PilotSensorMappingSchema).default([]),
  /**
   * Pluggable connection profiles (IPs/APIs/protocols/gateway). Config-only;
   * core engine/calculations never change when sensors or sources differ.
   */
  connections: z.array(z.record(z.unknown())).default([]),
  /**
   * Optional: full or partial mine definition override/reference.
   * MVP keeps this open; loader can merge with a base template.
   */
  mine: z.record(z.unknown()).optional(),
  assumptions: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type PilotSiteConfig = z.infer<typeof PilotSiteConfigSchema>;

export const PilotTelemetryRowSchema = z.object({
  timestamp: z.union([z.string(), z.number()]),
  sensor_id: z.string().min(1),
  value: z.coerce.number().finite(),
  quality: z.coerce.number().min(0).max(1).optional(),
  unit: z.string().optional(),
});
export type PilotTelemetryRow = z.infer<typeof PilotTelemetryRowSchema>;

export interface ParsedTelemetrySample {
  epochMs: number;
  sensorId: string; // canonical sensor id
  sourceTag: string;
  value: number;
  quality: number;
  unit?: string;
}

export interface PilotDataset {
  config: PilotSiteConfig;
  samples: ParsedTelemetrySample[];
  sourceFiles: string[];
  loadedAtMs: number;
}
