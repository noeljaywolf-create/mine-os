export * from './types';
export * from './csv';
export * from './siteConfig';
export * from './adapter';
export * from './mineBuilder';

import type { PilotDataset } from './types';
import { parseSiteConfig } from './siteConfig';
import { parseTelemetryCsv } from './csv';

export async function loadPilotDataset(configFile: File, telemetryFile: File): Promise<PilotDataset> {
  const config = parseSiteConfig(JSON.parse(await configFile.text()));
  const samples = parseTelemetryCsv(await telemetryFile.text(), config);
  return { config, samples, sourceFiles: [configFile.name, telemetryFile.name], loadedAtMs: Date.now() };
}
