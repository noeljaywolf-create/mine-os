import { PilotSiteConfigSchema, type PilotSiteConfig } from './types';

export function parseSiteConfig(json: unknown): PilotSiteConfig {
  const config = PilotSiteConfigSchema.parse(json);
  const sourceTags = new Set<string>();
  const sensorIds = new Set<string>();
  for (const s of config.sensors) {
    if (sourceTags.has(s.sourceTag)) throw new Error(`Duplicate sourceTag mapping: ${s.sourceTag}`);
    if (sensorIds.has(s.sensorId)) throw new Error(`Duplicate sensorId mapping: ${s.sensorId}`);
    sourceTags.add(s.sourceTag);
    sensorIds.add(s.sensorId);
  }
  return config;
}

export async function loadSiteConfigFromFile(file: File): Promise<PilotSiteConfig> {
  const text = await file.text();
  return parseSiteConfig(JSON.parse(text));
}
