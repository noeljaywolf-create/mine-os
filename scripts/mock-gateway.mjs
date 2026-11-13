#!/usr/bin/env node
/**
 * Mock read-only gateway for local pilot testing (no OT/control hardware required).
 * Serves: GET /health, GET /catalog, GET /samples/latest, optional POST /control
 * Usage: node scripts/mock-gateway.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] || 8090);
const t0 = Date.now();
const sensors = [
  { sensorId: 'sen-l-201', sourceTag: 'LT_2010_LEVEL', assetId: 'smp-201', kind: 'level', unit: 'm' },
  { sensorId: 'sen-f-201', sourceTag: 'FT_2010_FLOW', assetId: 'pmp-201', kind: 'flow', unit: 'm3/h' },
  { sensorId: 'gen-1-power', sourceTag: 'GEN1_ACTIVE_POWER_KW', assetId: 'gen-1', kind: 'power', unit: 'kW' },
];

function samples() {
  const t = (Date.now() - t0) / 1000;
  return sensors.map((s, i) => ({
    sensorId: s.sensorId,
    sourceTag: s.sourceTag,
    epochMs: Date.now(),
    value: i === 0 ? +(2.5 + Math.sin(t / 30) * 0.4).toFixed(3)
         : i === 1 ? +(120 + Math.sin(t / 20) * 15).toFixed(2)
         : +(320 + Math.sin(t / 25) * 40).toFixed(2),
    unit: s.unit,
    quality: 0.99,
  }));
}

function send(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', details: 'mock gateway', time: Date.now() });
  if (req.method === 'GET' && url.pathname === '/catalog') return send(res, 200, { sensors });
  if (req.method === 'GET' && url.pathname === '/samples/latest') {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
    let out = samples();
    if (ids.length) out = out.filter(s => ids.includes(s.sensorId) || ids.includes(s.sourceTag));
    return send(res, 200, { samples: out });
  }
  if (req.method === 'POST' && url.pathname === '/control') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try { console.log('[control-intent]', JSON.parse(body || '{}')); } catch { console.log('[control-intent]', body); }
    return send(res, 200, { accepted: true, mode: 'mock', note: 'No real hardware. Intent recorded by mock gateway.' });
  }
  return send(res, 404, { error: 'not found', endpoints: ['/health','/catalog','/samples/latest','/control'] });
});

server.listen(port, () => {
  console.log(`Mock gateway listening on http://localhost:${port}`);
  console.log('Endpoints: GET /health /catalog /samples/latest  POST /control (mock)');
});
