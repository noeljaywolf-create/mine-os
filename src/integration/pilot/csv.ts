import { PilotTelemetryRowSchema, type ParsedTelemetrySample, type PilotSiteConfig } from './types';

/** Minimal CSV parser (RFC4180-ish) for pilot telemetry files. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim().length > 0));
}

export function parseTimestamp(value: string | number): number {
  if (typeof value === 'number') return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  const n = Number(value);
  if (Number.isFinite(n)) return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${value}`);
  return ms;
}

export function parseTelemetryCsv(text: string, config: PilotSiteConfig): ParsedTelemetrySample[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const ti = idx('timestamp'), si = idx('sensor_id'), vi = idx('value');
  if (ti < 0 || si < 0 || vi < 0) throw new Error('telemetry.csv must include timestamp,sensor_id,value columns');
  const qi = idx('quality'), ui = idx('unit');
  const bySource = new Map(config.sensors.map(m => [m.sourceTag, m]));
  const out: ParsedTelemetrySample[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const raw = {
      timestamp: cells[ti]?.trim() ?? '',
      sensor_id: cells[si]?.trim() ?? '',
      value: cells[vi]?.trim() ?? '',
      quality: qi >= 0 ? cells[qi]?.trim() : undefined,
      unit: ui >= 0 ? cells[ui]?.trim() : undefined,
    };
    if (!raw.timestamp && !raw.sensor_id) continue;
    const parsed = PilotTelemetryRowSchema.parse(raw);
    const mapping = bySource.get(parsed.sensor_id);
    const epochMs = parseTimestamp(parsed.timestamp);
    out.push({
      epochMs,
      sensorId: mapping?.sensorId ?? parsed.sensor_id,
      sourceTag: parsed.sensor_id,
      value: parsed.value,
      quality: parsed.quality ?? 1,
      unit: parsed.unit ?? mapping?.unit,
    });
  }
  out.sort((a, b) => a.epochMs - b.epochMs || a.sensorId.localeCompare(b.sensorId));
  return out;
}
