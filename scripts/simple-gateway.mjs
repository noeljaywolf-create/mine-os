#!/usr/bin/env node
/**
 * Simple read-only HTTP gateway for MINE OS (easy on-site integration).
 * Exposes: GET /health, GET /catalog, GET /samples/latest  (+ CORS)
 *
 * Usage:
 *   node scripts/simple-gateway.mjs [port] [configPath]
 * Examples:
 *   node scripts/simple-gateway.mjs
 *   node scripts/simple-gateway.mjs 8080 gateway-simple.json
 *
 * Config (JSON): { "sensors": [ { "sensorId", "sourceTag"?, "assetId"?, "kind", "unit", "value"? } ] }
 * Live values (optional): put a samples.json next to config (or ./samples.json) with:
 *   { "samples": [ { "sensorId"|"sourceTag", "value", "unit"?, "quality"?, "epochMs"? } ] }
 * The server re-reads config/samples on each request so you can edit files without restart.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 8080);
const configArg = process.argv[3] || process.env.GATEWAY_CONFIG || 'gateway-simple.json';
const configPath = path.resolve(process.cwd(), configArg);

const DEFAULT_SENSORS = [
  { sensorId: 'gen_power_kw', sourceTag: 'GEN_POWER_KW', assetId: 'gen-1', kind: 'power', unit: 'kW', value: 320 },
  { sensorId: 'gen_voltage_v', sourceTag: 'GEN_VOLTAGE_V', assetId: 'gen-1', kind: 'power', unit: 'V', value: 400 },
  { sensorId: 'gen_current_a', sourceTag: 'GEN_CURRENT_A', assetId: 'gen-1', kind: 'power', unit: 'A', value: 460 },
  { sensorId: 'gen_freq_hz', sourceTag: 'GEN_FREQ_HZ', assetId: 'gen-1', kind: 'power', unit: 'Hz', value: 50 },
  { sensorId: 'gen_fuel_pct', sourceTag: 'GEN_FUEL_PCT', assetId: 'gen-1', kind: 'level', unit: '%', value: 75 },
  { sensorId: 'gen_running', sourceTag: 'GEN_RUNNING', assetId: 'gen-1', kind: 'status', unit: 'state', value: 1 },
];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function loadConfig() {
  const cfg = readJson(configPath);
  const sensors = Array.isArray(cfg?.sensors) && cfg.sensors.length ? cfg.sensors : DEFAULT_SENSORS;
  const samplesPath = cfg?.samplesFile
    ? path.resolve(path.dirname(configPath), cfg.samplesFile)
    : (fs.existsSync(path.resolve(path.dirname(configPath), 'samples.json')) ? path.resolve(path.dirname(configPath), 'samples.json') : path.resolve(process.cwd(), 'samples.json'));
  return { cfg, sensors, samplesPath };
}

function buildSamples() {
  const { sensors, samplesPath } = loadConfig();
  const live = readJson(samplesPath);
  const liveArr = Array.isArray(live?.samples) ? live.samples : (Array.isArray(live) ? live : null);
  const byId = new Map();
  if (liveArr) {
    for (const s of liveArr) {
      const key = s.sensorId || s.sourceTag || s.id;
      if (key) byId.set(String(key), s);
    }
  }
  const now = Date.now();
  return sensors.map((s) => {
    const o = byId.get(String(s.sensorId)) || byId.get(String(s.sourceTag)) || {};
    const value = Number(o.value ?? s.value ?? 0);
    return {
      sensorId: s.sensorId,
      sourceTag: s.sourceTag || s.sensorId,
      epochMs: Number(o.epochMs ?? now),
      value: Number.isFinite(value) ? value : 0,
      unit: o.unit || s.unit || '',
      quality: Number.isFinite(Number(o.quality)) ? Number(o.quality) : 1,
    };
  });
}

function catalog() {
  const { sensors } = loadConfig();
  return { sensors: sensors.map(s => ({ sensorId: s.sensorId, sourceTag: s.sourceTag || s.sensorId, assetId: s.assetId, kind: s.kind, unit: s.unit })) };
}

function send(res, code, body) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  try {
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      const { sensors, samplesPath } = loadConfig();
      return send(res, 200, { status: 'ok', time: Date.now(), sensors: sensors.length, config: fs.existsSync(configPath) ? configPath : 'defaults', samplesFile: fs.existsSync(samplesPath) ? samplesPath : 'none' });
    }
    if (req.method === 'GET' && url.pathname === '/catalog') return send(res, 200, catalog());
    if (req.method === 'GET' && (url.pathname === '/samples/latest' || url.pathname === '/samples')) {
      const ids = (url.searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(Boolean);
      let samples = buildSamples();
      if (ids.length) samples = samples.filter(s => ids.includes(s.sensorId) || ids.includes(s.sourceTag));
      return send(res, 200, { samples, time: Date.now() });
    }
    return send(res, 404, { error: 'not found', endpoints: ['/health','/catalog','/samples/latest'] });
  } catch (e) {
    return send(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(port, '0.0.0.0', () => {
  const { sensors, samplesPath } = loadConfig();
  console.log(`Simple gateway running: http://localhost:${port}`);
  console.log(`Config: ${fs.existsSync(configPath) ? configPath : '(defaults - generator template)'}`);
  console.log(`Samples file: ${fs.existsSync(samplesPath) ? samplesPath : '(none - using config values/defaults)'}`);
  console.log(`Sensors: ${sensors.length}`);
  console.log('Endpoints: GET /health  /catalog  /samples/latest');
  console.log('In MINE OS: Telemetry & Integrations -> Quick Connect -> paste this URL -> Test connection -> Connect');
});
