import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Cable, CircleSlash, Download, Radio, Save, ShieldQuestion, Trash2, Upload } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import {
  Badge,
  Button,
  KeyValue,
  Notice,
  Panel,
  Select,
  TableShell,
  Td,
  Th,
  Toggle,
  cx,
} from '../design-system';
import { useActiveScenario, useCapabilities, useDerived, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { formatDuration, formatTimestamp } from '../domain/units';

type SavedProfile = { id: string; name: string; gatewayUrl: string; createdAtMs: number };
const PROFILES_KEY = 'mineos.connectionProfiles';
function loadProfiles(): SavedProfile[] { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; } }
function saveProfiles(p: SavedProfile[]) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch {} }

const CONNECTORS = [
  { id: 'historian-opcua', name: 'Historian / OPC-UA', direction: 'read', status: 'pluggable', contract: 'Read-only subscription/export mapping to canonical tags (timestamp, quality, unit).', requirement: 'Network path/credentials, tag allow-list, read-only service account.' },
  { id: 'csv-export', name: 'CSV / Historian export', direction: 'read', status: 'available (MVP)', contract: 'Import site.config.json + telemetry.csv for pilot replay/backtest.', requirement: 'Mapped sensor tags, units, and time window export.' },
  { id: 'cmms', name: 'Maintenance (CMMS)', direction: 'read', status: 'not connected', contract: 'Work orders/asset condition keyed by site asset tag. No write-back in pilot mode.', requirement: 'Vendor API credentials and agreed asset-tag mapping.' },
  { id: 'weather', name: 'Surface weather', direction: 'read', status: 'not connected', contract: 'Rainfall/intensity as inflow lead indicator.', requirement: 'Provider subscription and site geolocation.' },
  { id: 'control', name: 'Control / recovery write-back', direction: 'write', status: 'blocked by policy', contract: 'Not implemented. Pilot MVP is read-only; no plant commands.', requirement: 'Separate safety case, approvals, and hardened integration. Out of scope.' },
] as const;

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function Telemetry() {
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const capabilities = useCapabilities();
  const setSensorStale = useMineStore((s) => s.setSensorStale);
  const run = useRun();
  const clock = run.world.clock;
  const scenario = useActiveScenario();
  const pilot = useMineStore((s) => s.pilot);
  const loadPilotBundle = useMineStore((s) => s.loadPilotBundle);
  const unloadPilot = useMineStore((s) => s.unloadPilot);
  const connectGateway = useMineStore((s) => s.connectGateway);
  const disconnectGateway = useMineStore((s) => s.disconnectGateway);
  const probeGateway = useMineStore((s) => s.probeGateway);
  const [gatewayUrl, setGatewayUrl] = useState(() => { try { return localStorage.getItem('mineos.lastGateway') || ''; } catch { return ''; } });
  const [probeResult, setProbeResult] = useState<{ ok: boolean; message: string; details?: any } | null>(null);
  const [probing, setProbing] = useState(false);
  const [profiles, setProfiles] = useState<SavedProfile[]>(() => loadProfiles());
  const [profileName, setProfileName] = useState('');
  useEffect(() => { try { if (gatewayUrl) localStorage.setItem('mineos.lastGateway', gatewayUrl); } catch {} }, [gatewayUrl]);
  const [kind, setKind] = useState<'all' | string>('all');
  const [freshness, setFreshness] = useState<'all' | string>('all');
  const [showContract, setShowContract] = useState(false);
  const [configFile, setConfigFile] = useState<File | null>(null);
  const [telemetryFile, setTelemetryFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const cfgRef = useRef<HTMLInputElement>(null);
  const telRef = useRef<HTMLInputElement>(null);

  const editable = capabilities.can('scenario.edit-assumptions');
  const sensors = mine.sensors.filter((sensor) => {
    const state = derived.sensorStates[sensor.id];
    if (kind !== 'all' && sensor.kind !== kind) return false;
    if (freshness !== 'all' && state?.freshness !== freshness) return false;
    return true;
  });

  const counts = (['live', 'stale', 'expired', 'unavailable'] as const).map((key) => ({
    key,
    count: mine.sensors.filter((sensor) => derived.sensorStates[sensor.id]?.freshness === key).length,
  }));

  const backtest = useMemo(() => {
    const ds = pilot.dataset;
    if (!ds) return null;
    const bySensor: Record<string, typeof ds.samples> = {};
    for (const s of ds.samples) (bySensor[s.sensorId] ??= []).push(s);
    const rows = mine.sensors.map(sensor => {
      const predicted = derived.sensorStates[sensor.id]?.lastValue ?? null;
      const series = bySensor[sensor.id] ?? [];
      const obs = series.length ? series[series.length - 1].value : null;
      const err = predicted != null && obs != null ? predicted - obs : null;
      return { sensorId: sensor.id, name: sensor.name, unit: sensor.unit, predicted, observed: obs, error: err, n: series.length };
    }).filter(r => r.n > 0 || r.predicted != null);
    const withErr = rows.filter(r => r.error != null) as Array<typeof rows[number] & { error: number }>;
    const mae = withErr.length ? withErr.reduce((a, r) => a + Math.abs(r.error), 0) / withErr.length : null;
    return { rows, mae, samples: ds.samples.length, startMs: ds.samples[0]?.epochMs, endMs: ds.samples[ds.samples.length - 1]?.epochMs };
  }, [pilot.dataset, mine.sensors, derived.sensorStates]);

  const contractSample = {
    source: pilot.mode === 'pilot-replay' ? 'mine-os.pilot-adapter' : 'mine-os.adapter',
    version: '0.2.0-mvp',
    emittedAt: new Date(clock.epochMs + clock.elapsedSec * 1000).toISOString(),
    site: mine.id,
    readOnly: true,
    pilotMode: pilot.mode,
    tags: mine.sensors.slice(0, 6).map((sensor) => ({
      tag: sensor.id,
      asset: sensor.assetId,
      unit: sensor.unit,
      quality: derived.sensorStates[sensor.id]?.freshness ?? 'unavailable',
      value: derived.sensorStates[sensor.id]?.lastValue ?? null,
      ageSec: Math.round(derived.sensorStates[sensor.id]?.ageSec ?? 0),
    })),
  };

  const exportEvidence = () => {
    downloadJson(`mine-os-pilot-evidence-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      mode: pilot.mode,
      site: { id: mine.id, name: mine.name },
      scenario: { id: scenario.id, name: scenario.name },
      clock: { epochMs: clock.epochMs, elapsedSec: clock.elapsedSec },
      pilot: pilot.dataset ? { label: pilot.dataset.config.pilot.label, sources: pilot.dataset.sourceFiles, samples: pilot.dataset.samples.length } : null,
      sensors: mine.sensors.map(s => ({ id: s.id, name: s.name, assetId: s.assetId, unit: s.unit, state: derived.sensorStates[s.id] })),
      backtest: backtest ? { mae: backtest.mae, rows: backtest.rows } : null,
      limitations: ['Read-only pilot mode; no plant control.', 'Predicted vs observed comparison is indicative unless model is calibrated to site.', 'Missing/noisy inputs degrade confidence rather than fabricate certainty.'],
    });
  };

  const alertEvents = useMineStore((s) => s.alertEvents);
  const alertRules = useMineStore((s) => s.alertRules);
  const incidents = useMineStore((s) => s.getRun().incidents);
  const decisions = useMineStore((s) => s.decisions);

  const exportHistory = () => {
    let history: any[] = [];
    try { history = JSON.parse(localStorage.getItem('mineos.history') || '[]'); } catch {}
    downloadJson(`mine-os-history-${Date.now()}.json`, { exportedAt: new Date().toISOString(), count: history.length, history });
  };
  const clearHistory = () => { try { localStorage.removeItem('mineos.history'); } catch {} };
  const exportReport = () => {
    let history: any[] = [];
    try { history = JSON.parse(localStorage.getItem('mineos.history') || '[]'); } catch {}
    const report = {
      generatedAt: new Date().toISOString(),
      site: { id: mine.id, name: mine.name },
      mode: pilot.mode,
      gatewayUrl: pilot.gatewayUrl,
      scenario: { id: scenario.id, name: scenario.name },
      clock: { epochMs: clock.epochMs, elapsedSec: clock.elapsedSec },
      kpis: { sensors: mine.sensors.length, live: sensors.filter(s => derived.sensorStates[s.id]?.freshness === 'live').length, stale: sensors.filter(s => ['stale','expired'].includes(derived.sensorStates[s.id]?.freshness ?? '')).length, incidents: incidents.length, alertsActive: alertEvents.filter(a=>!a.acknowledged).length, alertsTotal: alertEvents.length },
      incidents, alertEvents, alertRules, decisions,
      sensors: mine.sensors.map(s => ({ id: s.id, name: s.name, assetId: s.assetId, unit: s.unit, state: derived.sensorStates[s.id] })),
      backtest: backtest ? { mae: backtest.mae, rows: backtest.rows } : null,
      historySummary: { count: history.length, firstAtMs: history[0]?.atMs ?? null, lastAtMs: history[history.length-1]?.atMs ?? null },
      notes: ['Read-only platform report. Core simulation/calculation engine unchanged.', 'Verify measurements, mappings, units, and calibration before operational decisions.'],
    };
    downloadJson(`mine-os-report-${Date.now()}.json`, report);
  };

  const onLoad = async () => {
    if (!configFile || !telemetryFile) return;
    setBusy(true);
    try { await loadPilotBundle({ config: configFile, telemetry: telemetryFile }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.telemetry}
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={exportEvidence}><Download size={11} /> Export evidence</Button>
            <Button size="sm" variant="outline" onClick={() => setShowContract((v) => !v)}><Cable size={11} /> {showContract ? 'Hide' : 'Show'} contract</Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.map((row) => (
            <Badge key={row.key} tone={row.key === 'live' ? 'green' : row.key === 'stale' ? 'amber' : row.key === 'expired' ? 'red' : 'neutral'} dot>
              {row.count} {row.key}
            </Badge>
          ))}
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
            {pilot.mode === 'pilot-replay' ? 'pilot replay (read-only)' : pilot.mode === 'live-gateway' ? 'live gateway (read-only)' : 'synthetic simulation'}
          </span>
        </div>
      </ModuleHeader>
      {(pilot.mode === 'pilot-replay' || pilot.mode === 'live-gateway') && (
        <Notice tone="blue" title={pilot.mode === 'live-gateway' ? `Live gateway: ${pilot.gatewayUrl}` : `Pilot mode: ${pilot.dataset?.config.pilot.label ?? 'replay'}`} icon={<ShieldQuestion size={13} />}>
          Read-only data source (core engine unchanged). No plant control commands. {pilot.dataset?.config.pilot.notes ?? 'Live samples polled via pluggable gateway/adapter contract.'}
        </Notice>
      )}
      <p className="my-2 text-xs"><Link to="/app/engineering?view=investigation" className="text-signal-cyanBright">Open sensor failure, scaling, delayed-sample and contradiction investigation {'->'}</Link></p>

      <div className="grid gap-2 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-2">
          <Panel>
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2">
              <Select value={kind} onChange={(event) => setKind(event.target.value)} className="w-auto">
                <option value="all">all tag types</option>
                {[...new Set(mine.sensors.map((sensor) => sensor.kind))].map((item) => (<option key={item} value={item}>{item}</option>))}
              </Select>
              <Select value={freshness} onChange={(event) => setFreshness(event.target.value)} className="w-auto">
                <option value="all">any freshness</option>
                {['live', 'stale', 'expired', 'unavailable'].map((item) => (<option key={item} value={item}>{item}</option>))}
              </Select>
              <span className="ml-auto font-mono text-[9px] text-ink-500">{sensors.length} tags</span>
              {!editable && <Badge tone="neutral">read-only for this role</Badge>}
            </div>
            <TableShell>
              <thead><tr><Th>Tag</Th><Th>Asset</Th><Th>Kind</Th><Th align="right">Value</Th><Th align="right">Age</Th><Th align="right">Confidence</Th><Th align="right">Forced stale</Th></tr></thead>
              <tbody>
                {sensors.map((sensor) => {
                  const state = derived.sensorStates[sensor.id];
                  const isForced = Boolean(scenario.overrides.sensorOverrides[sensor.id]?.stale);
                  return (
                    <tr key={sensor.id} className="hover:bg-ink-800/50">
                      <Td><div className="text-[11px] text-ink-200">{sensor.name}</div><div className="font-mono text-[9px] text-ink-500">{sensor.id}</div></Td>
                      <Td className="font-mono text-[9.5px] text-ink-400">{sensor.assetId}</Td>
                      <Td className="text-2xs text-ink-400">{sensor.kind}</Td>
                      <Td align="right" className="num">{state?.lastValue == null ? '�?"' : `${state.lastValue.toFixed(2)} ${sensor.unit}`}</Td>
                      <Td align="right" className={cx('num', (state?.ageSec ?? 0) > sensor.stalenessThresholdSec ? 'text-signal-amber' : 'text-ink-300')}>{formatDuration(state?.ageSec ?? 0)}</Td>
                      <Td align="right" className="num">{((state?.confidence ?? 0) * 100).toFixed(0)}%</Td>
                      <Td align="right"><div className="flex justify-end"><Toggle checked={isForced} disabled={!editable} onChange={(next) => setSensorStale(sensor.id, next)} label={`Force ${sensor.name} stale`} /></div></Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </Panel>

          {backtest && (
            <Panel>
              <PanelTitle right={<Badge tone="blue">backtest / evidence</Badge>}>Predicted vs observed (pilot)</PanelTitle>
              <div className="px-3 py-2 text-2xs text-ink-400">
                Window: {backtest.startMs ? formatTimestamp(backtest.startMs) : '�?"'} �+' {backtest.endMs ? formatTimestamp(backtest.endMs) : '�?"'} · Samples: {backtest.samples} · MAE (where comparable): {backtest.mae == null ? 'n/a' : backtest.mae.toFixed(3)}
              </div>
              <TableShell>
                <thead><tr><Th>Sensor</Th><Th align="right">Observed</Th><Th align="right">Model/predicted</Th><Th align="right">Error</Th><Th align="right">N</Th></tr></thead>
                <tbody>
                  {backtest.rows.map(r => (
                    <tr key={r.sensorId}>
                      <Td><div className="text-[11px] text-ink-200">{r.name}</div><div className="font-mono text-[9px] text-ink-500">{r.sensorId}</div></Td>
                      <Td align="right" className="num">{r.observed == null ? '�?"' : `${r.observed.toFixed(2)} ${r.unit}`}</Td>
                      <Td align="right" className="num">{r.predicted == null ? '�?"' : `${r.predicted.toFixed(2)} ${r.unit}`}</Td>
                      <Td align="right" className={cx('num', r.error != null && Math.abs(r.error) > 0 ? 'text-signal-amber' : 'text-ink-400')}>{r.error == null ? '�?"' : r.error.toFixed(3)}</Td>
                      <Td align="right" className="num text-ink-500">{r.n}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <div className="border-t border-[color:var(--hairline)] px-3 py-2 text-2xs text-ink-500">Indicative comparison; calibrate model to site before treating as validated performance.</div>
            </Panel>
          )}
        </div>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Upload size={11} className="text-ink-500" />}>Data sources (pluggable, core unchanged)</PanelTitle>
            <div className="space-y-3 px-3 py-2 text-2xs text-ink-400">
              <div>
                <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">File / CSV replay</div>
                <div className="space-y-1">
                  <label className="block font-mono text-[9px] text-ink-500">site.config.json</label>
                  <input ref={cfgRef} type="file" accept=".json,application/json" onChange={e => setConfigFile(e.target.files?.[0] ?? null)} className="block w-full text-[11px]" />
                  <label className="block font-mono text-[9px] text-ink-500">telemetry.csv</label>
                  <input ref={telRef} type="file" accept=".csv,text/csv" onChange={e => setTelemetryFile(e.target.files?.[0] ?? null)} className="block w-full text-[11px]" />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" disabled={!configFile || !telemetryFile || busy} onClick={onLoad}>{busy ? 'Loading…' : 'Load pilot bundle'}</Button>
                </div>
              </div>
              <div className="border-t border-[color:var(--hairline)] pt-2">
                <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">Quick Connect — Live gateway / API <Badge tone="blue">core unchanged</Badge></div>
                <p className="mb-1">Paste the gateway URL or IP (e.g. <span className="font-mono">http://192.168.1.50:8080</span>). MINE OS probes <span className="font-mono">/health</span>, <span className="font-mono">/catalog</span>, <span className="font-mono">/samples/latest</span>, auto-detects sensors/mappings when available, and connects read-only. Different sensors/protocols/sites require config/gateway only — never engine changes.</p>
                <div className="flex gap-1.5">
                  <input value={gatewayUrl} onChange={e => { setGatewayUrl(e.target.value); setProbeResult(null); }} placeholder="Gateway URL or IP:port (e.g. 10.0.0.50:8443)" className="w-full rounded-[2px] border border-[color:var(--hairline)] bg-ink-950 px-2 py-1.5 font-mono text-[11px] text-ink-200" />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" disabled={!gatewayUrl.trim() || probing} onClick={async () => { setProbing(true); try { setProbeResult(await probeGateway(gatewayUrl.trim())); } finally { setProbing(false); } }}>{probing ? 'Testing…' : 'Test connection'}</Button>
                  <Button size="sm" variant="primary" disabled={!gatewayUrl.trim()} onClick={async () => { const r = await connectGateway({ gatewayUrl: gatewayUrl.trim() }); if (!r.ok) setProbeResult({ ok:false, message: r.message }); }}>Connect</Button>
                  {pilot.mode === 'live-gateway' && <Button size="sm" variant="outline" onClick={() => disconnectGateway()}>Disconnect</Button>}
                </div>
                {probeResult && (
                  <div className={cx('mt-1.5 rounded-[2px] border px-2 py-1.5', probeResult.ok ? 'border-signal-green/30 bg-signal-green/5 text-ink-200' : 'border-signal-red/30 bg-signal-red/5 text-ink-200')}>
                    <div className="font-mono text-[10px]">{probeResult.ok ? '✓' : '✗'} {probeResult.message}</div>
                    {probeResult.details?.hints?.length ? <ul className="mt-1 list-disc pl-4 text-[10px] text-ink-400">{probeResult.details.hints.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul> : null}
                    {probeResult.details?.sensors?.length ? <div className="mt-1 font-mono text-[9px] text-ink-500">Detected: {probeResult.details.sensors.slice(0,8).map((s:any)=>s.sensorId||s.sourceTag).filter(Boolean).join(', ')}{probeResult.details.sensors.length>8?'…':''}</div> : null}
                  </div>
                )}
                <div className="mt-1 font-mono text-[9px] text-ink-500">Need a gateway? Point it at sensors (OPC UA/Modbus/MQTT/REST/PLC/historian) by IP/API and expose the read-only contract — see docs/SENSOR-CONNECTION-ARCHITECTURE.md & docs/CONNECTING.md.</div>
                <div className="mt-2 border-t border-[color:var(--hairline)] pt-2">
                  <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500"><Save size={10} /> Saved connection profiles (local, persisted)</div>
                  <div className="flex gap-1.5">
                    <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Profile name (e.g. Pit A Gateway)" className="w-full rounded-[2px] border border-[color:var(--hairline)] bg-ink-950 px-2 py-1 font-mono text-[10px] text-ink-200" />
                    <Button size="sm" variant="outline" disabled={!gatewayUrl.trim() || !profileName.trim()} onClick={() => { const next = [{ id: `p-${Date.now().toString(36)}`, name: profileName.trim(), gatewayUrl: gatewayUrl.trim(), createdAtMs: Date.now() }, ...profiles].slice(0, 20); setProfiles(next); saveProfiles(next); setProfileName(''); }}>Save</Button>
                  </div>
                  {profiles.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {profiles.map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-2 rounded-[2px] border border-[color:var(--hairline)] px-2 py-1">
                          <div className="min-w-0"><div className="truncate text-[10px] text-ink-200">{p.name}</div><div className="truncate font-mono text-[9px] text-ink-500">{p.gatewayUrl}</div></div>
                          <div className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" onClick={() => setGatewayUrl(p.gatewayUrl)}>Load</Button><Button size="sm" variant="ghost" onClick={async () => { setGatewayUrl(p.gatewayUrl); const r = await connectGateway({ gatewayUrl: p.gatewayUrl }); if (!r.ok) setProbeResult({ ok:false, message: r.message }); }}>Connect</Button><Button size="sm" variant="ghost" onClick={() => { const next = profiles.filter(x => x.id !== p.id); setProfiles(next); saveProfiles(next); }}><Trash2 size={11} /></Button></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--hairline)] pt-2">
                {(pilot.mode === 'pilot-replay' || pilot.mode === 'live-gateway' || pilot.dataset) && <Button size="sm" variant="outline" onClick={() => { unloadPilot(); setConfigFile(null); setTelemetryFile(null); setGatewayUrl(''); if(cfgRef.current) cfgRef.current.value=''; if(telRef.current) telRef.current.value=''; }}>Reset to synthetic</Button>}
              </div>
              {pilot.lastError && <div className="text-signal-red">{pilot.lastError}</div>}
              {pilot.dataset && <div className="font-mono text-[9px] text-ink-500">Loaded: {pilot.dataset.sourceFiles.join(', ')} · {pilot.dataset.samples.length} samples</div>}
              {pilot.gatewayUrl && <div className="font-mono text-[9px] text-ink-500">Gateway: {pilot.gatewayUrl}</div>}
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<Radio size={11} className="text-ink-500" />}>Connectors (pluggable)</PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {CONNECTORS.map((connector) => (
                <div key={connector.id} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-ink-100">{connector.name}</span>
                    <Badge tone={connector.status.includes('available') ? 'green' : connector.status === 'pluggable' ? 'blue' : connector.status.includes('blocked') ? 'red' : 'neutral'}>{connector.status}</Badge>
                    <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-500">{connector.direction}</span>
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-ink-400">{connector.contract}</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{connector.requirement}</p>
                </div>
              ))}
            </div>
          </Panel>

          {showContract && (
            <Panel>
              <PanelTitle>Adapter contract (sample)</PanelTitle>
              <pre className="max-h-[280px] overflow-auto px-3 py-2 font-mono text-[9.5px] leading-relaxed text-ink-300">{JSON.stringify(contractSample, null, 2)}</pre>
            </Panel>
          )}

          <Notice tone="blue" title="Read-only pilot posture" icon={<ShieldQuestion size={13} />}>
            Pilot MVP imports and replays data for analysis; it does not command plant equipment or write to control systems.
          </Notice>

          <Panel>
            <PanelTitle right={<Activity size={11} className="text-ink-500" />}>Connection & device health</PanelTitle>
            <div className="grid grid-cols-2 gap-1.5 px-3 py-2 text-2xs">
              <KeyValue label="Mode" value={pilot.mode} />
              <KeyValue label="Gateway" value={pilot.gatewayUrl ?? '—'} />
              <KeyValue label="Sensors live" value={String(sensors.filter(s => derived.sensorStates[s.id]?.freshness === 'live').length)} />
              <KeyValue label="Stale/expired" value={String(sensors.filter(s => ['stale','expired'].includes(derived.sensorStates[s.id]?.freshness ?? '')).length)} />
              <KeyValue label="Unavailable" value={String(sensors.filter(s => derived.sensorStates[s.id]?.freshness === 'unavailable').length)} />
              <KeyValue label="Low confidence (<70%)" value={String(sensors.filter(s => (derived.sensorStates[s.id]?.confidence ?? 1) < 0.7).length)} />
              <KeyValue label="Active alerts" value={String(alertEvents.filter(a=>!a.acknowledged).length)} />
              <KeyValue label="Open incidents" value={String(incidents.filter(i=>i.state!=='closed'&&i.state!=='resolved').length)} />
            </div>
            {pilot.lastError && <div className="border-t border-[color:var(--hairline)] px-3 py-1.5 font-mono text-[9px] text-signal-red">Last error: {pilot.lastError}</div>}
          </Panel>

          <Panel>
            <PanelTitle right={<Download size={11} className="text-ink-500" />}>Recording, history & reports</PanelTitle>
            <div className="space-y-2 px-3 py-2 text-2xs text-ink-400">
              <p>Durable local recording (capped) for gateway/live observations and one-click pilot reports. Core calculations unchanged.</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={exportHistory}>Export history (JSON)</Button>
                <Button size="sm" variant="outline" onClick={clearHistory}>Clear local history</Button>
                <Button size="sm" variant="primary" onClick={exportReport}>Export report bundle</Button>
              </div>
              <div className="font-mono text-[9px] text-ink-500">History is stored locally in-browser (read-only evidence aid). For durable ops storage, forward gateway samples to a historian/DB.</div>
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<CircleSlash size={11} className="text-ink-500" />}>Deployment / pilot ops</PanelTitle>
            <ul className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <li>• Static build: <span className="font-mono">npm run build</span> / <span className="font-mono">build:pages</span>. Container: serve <span className="font-mono">dist/</span> or <span className="font-mono">docs/</span> behind TLS.</li>
              <li>• Data stays client-side in file-import MVP; for live connectors add a read-only gateway service and auth.</li>
              <li>• Configure site via <span className="font-mono">pilot-data/*/site.config.json</span> (mappings, units, provenance). No code changes per site.</li>
              <li>• Validate inputs (units/ranges/IDs) and treat missing data as reduced confidence.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel className="mt-2">
        <PanelTitle>Sample freshness timeline</PanelTitle>
        <div className="flex flex-wrap gap-2 px-3 py-2">
          {mine.sensors.map((sensor) => {
            const state = derived.sensorStates[sensor.id];
            return (
              <div key={sensor.id} className="flex items-center gap-1 font-mono text-[8.5px] text-ink-500">
                <span className={cx('h-2 w-2 rounded-[1px]', state?.freshness === 'live' ? 'bg-signal-green' : state?.freshness === 'stale' ? 'bg-signal-amber' : state?.freshness === 'expired' ? 'bg-signal-red' : 'bg-ink-600')} />
                {sensor.id}
              </div>
            );
          })}
        </div>
        <div className="border-t border-[color:var(--hairline)] px-3 py-1.5 font-mono text-[8.5px] text-ink-500">
          clock {formatTimestamp(clock.epochMs + clock.elapsedSec * 1000)} · {pilot.mode === 'pilot-replay' ? 'pilot replay' : 'simulated'}
        </div>
      </Panel>
    </div>
  );
}
