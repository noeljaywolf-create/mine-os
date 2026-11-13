import type { MineDefinition } from '../../domain/mine';
import type { Sensor } from '../../domain/types';
import type { PilotSiteConfig } from './types';

/**
 * Build a MineDefinition for pilot mode.
 * MVP strategy: start from a base template (synthetic demo) and apply config overrides.
 * - `config.mine` can provide partial/full MineDefinition fields (validated by caller/tests).
 * - `config.sensors` mappings ensure canonical sensor entries exist (upsert by id).
 * This keeps the engine pluggable while allowing site-specific configs without code changes.
 */
export function buildMineFromPilotConfig(config: PilotSiteConfig, base: MineDefinition): MineDefinition {
  const mine = structuredClone(base) as MineDefinition & Record<string, unknown>;
  const override = (config.mine ?? {}) as Partial<MineDefinition>;
  // Shallow-merge top-level fields; arrays/objects in override replace when provided.
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined) (mine as Record<string, unknown>)[k] = v as unknown;
  }
  mine.id = config.site.id || mine.id;
  mine.name = config.site.name || mine.name;
  mine.location = config.site.location || mine.location;
  mine.description = config.site.description || mine.description;
  mine.geometryDisclaimer = `${mine.geometryDisclaimer} Pilot config loaded: ${config.pilot.label}.`;

  // Upsert sensors from mappings so telemetry can bind.
  const sensors: Sensor[] = Array.isArray(mine.sensors) ? [...mine.sensors] : [];
  const byId = new Map(sensors.map(s => [s.id, s]));
  for (const m of config.sensors) {
    const existing = byId.get(m.sensorId);
    const upsert: Sensor = {
      id: m.sensorId,
      name: existing?.name ?? m.sourceTag,
      assetId: m.assetId,
      kind: m.kind,
      unit: m.unit,
      stalenessThresholdSec: m.stalenessThresholdSec,
      lastSampleAtMs: 0,
      samplePeriodSec: m.samplePeriodSec,
      linkQuality: existing?.linkQuality ?? 0.99,
      accuracyPct: m.accuracyPct,
      twinPosition: existing?.twinPosition ?? { x: 0, y: 0 },
      commissioned: true,
    };
    byId.set(m.sensorId, upsert);
  }
  if (config.sensors.length > 0) mine.sensors = [...byId.values()];
  return mine as MineDefinition;
}
