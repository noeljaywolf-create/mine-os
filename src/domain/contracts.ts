import { z } from 'zod';
import type {
  AssetId,
  SensorId,
  SensorUnit,
  SensorKind,
  TelemetrySample,
  Pump,
  ElectricalFeeder,
  Sump,
  ProductionZone,
  Asset,
} from './types';

/**
 * Integration contracts.
 *
 * MINE OS never talks to plant directly. It consumes an adapter that implements
 * `TelemetryAdapter`. The demonstration ships `SimulatedTelemetryAdapter`, which
 * fabricates deterministic samples from the canonical model. A future
 * deployment swaps in a real implementation — the engine and every screen are
 * unchanged because they only ever see normalised `TelemetrySample` records.
 */

/** Normalised measurement coming from any source. */
export const TelemetrySampleSchema = z.object({
  sensorId: z.string().min(1),
  epochMs: z.number().int().nonnegative(),
  value: z.number().finite(),
  unit: z.enum(['m', 'm3/h', 'kPa', 'mm/s', 'kW', 'degC']),
  quality: z.number().min(0).max(1),
});
export type ValidatedTelemetrySample = z.infer<typeof TelemetrySampleSchema>;

export const SensorDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  assetId: z.string().min(1),
  kind: z.enum(['level', 'flow', 'pressure', 'vibration', 'power', 'temperature']),
  unit: z.enum(['m', 'm3/h', 'kPa', 'mm/s', 'kW', 'degC']),
  stalenessThresholdSec: z.number().positive(),
  samplePeriodSec: z.number().positive(),
  accuracyPct: z.number().min(0).max(100),
});
export type SensorDefinition = z.infer<typeof SensorDefinitionSchema>;

export interface AssetCatalogueSnapshot {
  assets: Asset[];
  pumps: Pump[];
  feeders: ElectricalFeeder[];
  sumps: Sump[];
  zones: ProductionZone[];
  sensors: SensorDefinition[];
}

/**
 * The single seam between MINE OS and any upstream industrial system.
 */
export interface TelemetryAdapter {
  /** Stable identifier of the adapter implementation. */
  readonly id: string;
  /** True when the adapter fabricates data rather than reading a real system. */
  readonly simulated: boolean;
  /** Human readable description surfaced in the Integration Studio. */
  readonly description: string;

  /** Pull the current asset catalogue. */
  getCatalogue(): Promise<AssetCatalogueSnapshot>;

  /** Pull the newest samples for the requested sensors. */
  getSamples(sensorIds: SensorId[]): Promise<TelemetrySample[]>;

  /** Subscribe to samples (polling under the hood for the simulated adapter). */
  subscribe(
    sensorIds: SensorId[],
    onSample: (sample: TelemetrySample) => void,
    onError?: (error: Error) => void,
  ): () => void;

  /** Health of the adapter itself (used for offline / degraded UI states). */
  getHealth(): Promise<AdapterHealth>;
}

export interface AdapterHealth {
  status: 'online' | 'degraded' | 'offline';
  /** Last successful poll, epoch ms. */
  lastPollMs: number | null;
  message: string;
  /** Percentage of sensors with good quality. */
  goodSensorPct: number;
}

export interface TelemetryNormalisationRule {
  sensorId: SensorId;
  kind: SensorKind;
  canonicalUnit: SensorUnit;
  /** Multiply the raw value by this to reach the canonical unit. */
  scale: number;
  /** Values within this band of the previous sample are treated as no-change. */
  deadband: number;
  /** Minimum acceptable quality. */
  minQuality: number;
}

/**
 * Utility shared by any adapter implementation: converts raw engineering values
 * into the canonical unit system with explicit, auditable scaling.
 */
export function normaliseSample(
  raw: { sensorId: SensorId; value: number; unit: string; epochMs: number; quality?: number },
  rule: TelemetryNormalisationRule,
): TelemetrySample | null {
  if (raw.unit !== rule.canonicalUnit) {
    const converted = convertUnit(raw.value, raw.unit, rule.canonicalUnit);
    if (converted === null) return null;
    raw = { ...raw, value: converted, unit: rule.canonicalUnit };
  }
  const quality = raw.quality ?? 1;
  if (quality < rule.minQuality) return null;
  return {
    sensorId: raw.sensorId,
    epochMs: raw.epochMs,
    value: raw.value * rule.scale,
    unit: rule.canonicalUnit,
    quality,
  };
}

const UNIT_CONVERSIONS: Record<string, Partial<Record<SensorUnit, number | ((v: number) => number)>>> = {
  m: { m: 1 },
  cm: { m: 0.01 },
  mm: { m: 0.001 },
  'm3/h': { 'm3/h': 1 },
  'l/s': { 'm3/h': 3.6 },
  lpm: { 'm3/h': 0.06 },
  kPa: { kPa: 1 },
  bar: { kPa: 100 },
  'mm/s': { 'mm/s': 1 },
  kW: { kW: 1 },
  'degC': { 'degC': 1 },
  F: { degC: (v: number) => ((v - 32) * 5) / 9 },
};

/** Convert between supported engineering units, or return null when unsupported. */
export function convertUnit(value: number, from: string, to: SensorUnit): number | null {
  if (from === to) return value;
  const table = UNIT_CONVERSIONS[from];
  if (!table) return null;
  const factor = table[to];
  if (factor === undefined) return null;
  return typeof factor === 'function' ? factor(value) : value * factor;
}

/** Canonical asset id helper used when adapters report under a different key. */
export function resolveAssetId(sensorId: SensorId, catalogue: AssetCatalogueSnapshot): AssetId | null {
  const sensor = catalogue.sensors.find((s) => s.id === sensorId);
  return sensor?.assetId ?? null;
}
