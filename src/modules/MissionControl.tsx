import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Droplets, Gauge, Play, ShieldAlert, Zap } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { DependencyGraph } from '../components/DependencyGraph';
import { OperationsDesk } from '../components/OperationsDesk';
import {
  Badge,
  Button,
  KeyValue,
  Metric,
  MetricCell,
  MetricGrid,
  Notice,
  Panel,
  Progress,
  SeverityBadge,
  TableShell,
  Td,
  Th,
  cx,
  toneText,
} from '../design-system';
import { useAnalytics, useDerived, useForecasts, useIncidents, useActivity, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { formatDurationHours, formatFlow, formatLevel, formatMoney, formatTonnes } from '../domain/units';

export function MissionControl() {
  const [workspace, setWorkspace] = useState<'overview' | 'controls'>('overview');
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const forecasts = useForecasts();
  const analytics = useAnalytics();
  const incidents = useIncidents();
  const activity = useActivity();
  const run = useRun();
  const runFor = useMineStore((s) => s.runForAsync);
  const selectAsset = useMineStore((s) => s.selectAsset);
  const running = useMineStore((s) => s.running);
  const pilot = useMineStore((s) => s.pilot);
  const operatingMode = useMineStore((s) => s.operatingMode);
  const alertEvents = useMineStore((s) => s.alertEvents);

  const waterRows = analytics.waterBalance;
  const forecastsReady = Boolean(forecasts && mine.sumps.every(s => forecasts[s.id]?.points.length));
  const worst = [...waterRows].sort(
    (a, b) => (a.timeToCriticalHours ?? Number.POSITIVE_INFINITY) - (b.timeToCriticalHours ?? Number.POSITIVE_INFINITY),
  )[0];
  const powerAvailability =
    mine.feeders.reduce((sum, feeder) => sum + (derived.feederStates[feeder.id]?.supplyRatio ?? 0), 0) /
    Math.max(1, mine.feeders.length);
  const designTph = mine.zones.reduce((sum, zone) => sum + zone.designRateTph, 0);
  const activeIncidents = incidents
    .filter((incident) => incident.state !== 'closed' && incident.state !== 'resolved')
    .sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 })[a.severity] - ({ critical: 0, high: 1, medium: 2, low: 3 })[b.severity]);
  const activeAlerts = alertEvents.filter(a => !a.acknowledged);

  const sensorStates = Object.values(derived.sensorStates || {});
  const liveSensors = sensorStates.filter(s => s.freshness === 'live').length;
  const degradedSensors = sensorStates.filter(s => s.freshness === 'stale' || s.freshness === 'expired' || s.freshness === 'unavailable').length;
  const lowConfidence = sensorStates.filter(s => (s.confidence ?? 1) < 0.7).length;
  const confidencePct = sensorStates.length ? Math.round((sensorStates.reduce((a, s) => a + (s.confidence ?? 0), 0) / sensorStates.length) * 100) : 0;
  const dataQuality = degradedSensors === 0 && lowConfidence === 0 ? 'good' : degradedSensors < Math.max(1, sensorStates.length * 0.2) ? 'mixed' : 'degraded';

  const exposureValue = analytics.zones.reduce((sum, zone) => sum + zone.lostValueUSD, 0);
  const foregoneTonnes = analytics.zones.reduce((sum, zone) => sum + zone.lostTonnes, 0);
  const netBalance = analytics.totalInflowM3h - analytics.totalOutflowM3h;

  const actions = useMemo(() => {
    const list: Array<{ label: string; to: string; tone: 'red' | 'amber' | 'blue' | 'green'; why: string }> = [];
    if (worst?.timeToCriticalHours != null && worst.timeToCriticalHours < 6) list.push({ label: 'Review dewatering risk & pump capacity', to: '/app/dewatering', tone: 'red', why: `${worst.sumpName} critical in ~${formatDurationHours(worst.timeToCriticalHours)} (forecast, assumption-dependent).` });
    if (powerAvailability < 0.95) list.push({ label: 'Check power/feeders and constraints', to: '/app/energy', tone: 'amber', why: `Power availability ${(powerAvailability * 100).toFixed(0)}% affecting pumping/operations.` });
    if (activeIncidents.length > 0) list.push({ label: 'Triage active incidents', to: '/app/incidents', tone: activeIncidents.some(i => i.severity === 'critical') ? 'red' : 'amber', why: `${activeIncidents.length} active incident(s) with evidence/hypotheses.` });
    if (activeAlerts.length > 0) list.push({ label: 'Acknowledge/review alerts', to: '/app/alerts', tone: 'amber', why: `${activeAlerts.length} unacknowledged alert event(s).` });
    if (derived.plantRatio < 0.9) list.push({ label: 'Assess production exposure & recovery options', to: '/app/impact', tone: 'amber', why: `Plant at ${(derived.plantRatio * 100).toFixed(0)}% of design; review constrained interventions.` });
    if (pilot.mode !== 'synthetic' && degradedSensors > 0) list.push({ label: 'Inspect data quality/sensor health', to: '/app/telemetry', tone: 'blue', why: `${degradedSensors} sensor(s) stale/expired/unavailable; confidence may be reduced.` });
    if (list.length === 0) list.push({ label: 'Review scenarios and operating envelope', to: '/app/scenarios', tone: 'green', why: 'No immediate critical triggers detected; validate assumptions and readiness.' });
    list.push({ label: 'Open calibration, backtest & evidence', to: '/app/engineering-config', tone: 'blue', why: 'Confirm provenance, expert setpoints, and model-vs-observed alignment before decisions.' });
    return list.slice(0, 5);
  }, [worst, powerAvailability, activeIncidents, activeAlerts.length, derived.plantRatio, pilot.mode, degradedSensors]);

  const provenance = pilot.mode === 'live-gateway' ? `Live gateway${pilot.gatewayUrl ? ` (${pilot.gatewayUrl})` : ''}` : pilot.mode === 'pilot-replay' ? 'Pilot replay (historical)' : 'Synthetic baseline (modelled)';

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID['mission-control']}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => runFor(3600)}>
              <Play size={11} /> Advance 1 h
            </Button>
            <Link
              to="/app/dewatering"
              className="inline-flex items-center gap-1 rounded-[2px] border border-signal-cyan/40 bg-signal-cyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-signal-cyanBright hover:bg-signal-cyan/15"
            >
              <Droplets size={11} /> DeepWater <ArrowRight size={10} />
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={running ? 'green' : 'neutral'} dot>{running ? 'simulation running' : 'simulation paused'}</Badge>
          <Badge tone={operatingMode === 'operational' ? 'amber' : 'green'}>{operatingMode === 'operational' ? 'operational mode' : 'test / read-only'}</Badge>
          <Badge tone={dataQuality === 'good' ? 'green' : dataQuality === 'mixed' ? 'amber' : 'red'}>data: {dataQuality}</Badge>
          <Badge tone={activeIncidents.some((i) => i.severity === 'critical') ? 'red' : 'amber'}>{activeIncidents.length} active incident{activeIncidents.length === 1 ? '' : 's'}</Badge>
          <span className="text-2xs text-ink-500">Single canonical state · provenance & confidence explicit · core calculations unchanged.</span>
        </div>
      </ModuleHeader>

      <div className="my-3 grid gap-2 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelTitle right={<Badge tone={worst?.timeToCriticalHours != null && worst.timeToCriticalHours < 6 ? 'red' : 'green'} dot>{worst?.timeToCriticalHours != null ? `risk horizon ${formatDurationHours(worst.timeToCriticalHours)}` : 'no breach in window'}</Badge>}>Situation brief — what matters now</PanelTitle>
          <div className="grid gap-2 p-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[11px] text-ink-300"><strong className="text-ink-100">Primary risk:</strong> {worst?.timeToCriticalHours != null ? `${worst.sumpName} approaching critical in ~${formatDurationHours(worst.timeToCriticalHours)} (modelled forecast).` : forecastsReady ? 'No sump breach projected within current forecast window.' : 'Forecast unavailable/loading; treat horizon as unknown.'}</div>
              <div className="text-[11px] text-ink-300"><strong className="text-ink-100">Power → water → production:</strong> power {(powerAvailability * 100).toFixed(0)}%, net balance {formatFlow(netBalance)}, plant {(derived.plantRatio * 100).toFixed(0)}% of design.</div>
              <div className="text-[11px] text-ink-300"><strong className="text-ink-100">Exposure (assumption-dependent):</strong> {formatMoney(exposureValue)} value at risk · {formatTonnes(foregoneTonnes)} t foregone · {formatMoney(analytics.energy.costUSD)} pumping energy cost ({analytics.energy.energyKwh.toFixed(0)} kWh).</div>
            </div>
            <div className="space-y-1 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/40 p-2 text-2xs">
              <div className="label-micro mb-1">Trust & provenance</div>
              <KeyValue label="Data source" value={provenance} mono={false} />
              <KeyValue label="Confidence (avg)" value={`${confidencePct}%`} />
              <KeyValue label="Sensors live/degraded" value={`${liveSensors}/${degradedSensors}`} />
              <KeyValue label="Mode" value={operatingMode === 'operational' ? 'Operational (audited intents enabled)' : 'Test/read-only (safe validation)'} mono={false} />
              <KeyValue label="Validation" value={pilot.mode === 'pilot-replay' || pilot.mode === 'live-gateway' ? 'Backtest/calibrate before decisions' : 'Synthetic demo — not field-validated'} mono={false} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelTitle right={<Gauge size={12} className="text-ink-500" />}>Recommended actions (prioritized)</PanelTitle>
          <div className="divide-y divide-[color:var(--hairline)]">
            {actions.map((a, i) => (
              <Link key={i} to={a.to} className="flex items-start gap-2 px-3 py-2 hover:bg-ink-800/60">
                {a.tone === 'red' ? <AlertTriangle size={13} className="mt-0.5 text-signal-red" /> : a.tone === 'green' ? <CheckCircle2 size={13} className="mt-0.5 text-signal-green" /> : a.tone === 'blue' ? <Clock size={13} className="mt-0.5 text-signal-cyanBright" /> : <ShieldAlert size={13} className="mt-0.5 text-signal-amber" />}
                <div className="min-w-0">
                  <div className="text-[11px] text-ink-100">{a.label} <ArrowRight size={10} className="inline text-ink-500" /></div>
                  <div className="text-2xs leading-relaxed text-ink-500">{a.why}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="border-t border-[color:var(--hairline)] px-3 py-1.5 text-[9.5px] text-ink-500">Actions are decision support based on current canonical state and assumptions; verify with site evidence and procedures.</div>
        </Panel>
      </div>

      <Notice tone={pilot.mode === 'synthetic' ? 'blue' : 'amber'} title={pilot.mode === 'synthetic' ? 'Synthetic demonstration' : 'Live/pilot data in use'}>
        {pilot.mode === 'synthetic'
          ? 'Values are computed from a synthetic mine model (deterministic). Use for training/what-if; do not treat as field measurements.'
          : `Source: ${provenance}. Treat outputs as decision support pending calibration, backtesting, and engineering review. ${operatingMode === 'test' ? 'External control dispatch is blocked in Test mode.' : 'Operational mode: control intents may be dispatched if configured and authorized.'}`}
      </Notice>
      <MetricGrid cols={5}>
        <MetricCell>
          <Metric
            label="Water risk horizon"
            value={
              worst?.timeToCriticalHours != null
                ? formatDurationHours(worst.timeToCriticalHours)
                : !forecastsReady ? 'Unavailable' : 'Not reached'
            }
            hint={worst?.timeToCriticalHours != null ? `${worst.sumpName} · estimated` : forecastsReady ? 'Within forecast window only' : 'Forecast loading or unavailable'}
            tone={worst?.timeToCriticalHours != null && worst.timeToCriticalHours < 6 ? 'red' : 'neutral'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Power availability"
            value={`${(powerAvailability * 100).toFixed(0)}%`}
            hint={`${analytics.totalPowerKw.toFixed(0)} kW pumping demand`}
            tone={powerAvailability < 0.95 ? 'amber' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Production rate"
            value={formatTonnes(derived.plantRateTph)}
            unit="t/h"
            hint={`${(derived.plantRatio * 100).toFixed(0)}% of ${designTph} t/h design`}
            tone={derived.plantRatio < 0.9 ? 'amber' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Net water balance"
            value={formatFlow(analytics.totalInflowM3h - analytics.totalOutflowM3h)}
            hint={`in ${analytics.totalInflowM3h.toFixed(0)} / out ${analytics.totalOutflowM3h.toFixed(0)} m³/h`}
            tone={analytics.totalInflowM3h > analytics.totalOutflowM3h ? 'amber' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Pumping energy cost"
            value={formatMoney(analytics.energy.costUSD)}
            hint={`${analytics.energy.energyKwh.toFixed(0)} kWh · ${between(analytics.elapsedHours)}`}
            tone="neutral"
          />
        </MetricCell>
      </MetricGrid>

      <div role="group" aria-label="Mission Control sections" className="mt-5 flex flex-wrap gap-2 border-b border-ink-700 pb-3">
        <button type="button" aria-pressed={workspace === 'overview'} onClick={() => setWorkspace('overview')} className={cx('rounded-md px-4 py-2 text-sm font-medium transition-colors', workspace === 'overview' ? 'bg-signal-cyan/15 text-signal-cyanBright' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50')}>Overview</button>
        <button type="button" aria-pressed={workspace === 'controls'} onClick={() => setWorkspace('controls')} className={cx('rounded-md px-4 py-2 text-sm font-medium transition-colors', workspace === 'controls' ? 'bg-signal-cyan/15 text-signal-cyanBright' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50')}>Pump &amp; generator controls</button>
      </div>
      <div hidden={workspace !== 'controls'}><OperationsDesk /></div>
      <div hidden={workspace !== 'overview'}>
      <div className="mt-2 grid gap-2 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Link to="/app/dewatering" className="text-[10px] text-ink-400 hover:text-ink-100">water balance →</Link>}>
              Water storage &amp; outlook
            </PanelTitle>
            <div className="grid gap-px bg-[color:var(--hairline)] sm:grid-cols-2">
              {waterRows.map((row) => {
                const sump = mine.sumps.find((s) => s.id === row.sumpId)!;
                const forecast = forecasts[row.sumpId];
                const state = run.world.sumps[row.sumpId];
                const severity = state?.breach?.severity;
                return (
                  <button
                    key={row.sumpId}
                    onClick={() => selectAsset({ assetId: row.sumpId, sumpId: row.sumpId })}
                    className="bg-ink-850 px-3 py-2.5 text-left transition-colors hover:bg-ink-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-ink-100">{row.sumpName}</span>
                      <Badge tone={severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : row.trend === 'rising' ? 'amber' : 'green'}>
                        {row.trend}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className={cx('num text-[20px]', severity === 'critical' ? 'text-signal-red' : 'text-ink-50')}>
                        {formatLevel(row.levelM)}
                      </span>
                      <span className="font-mono text-[9px] text-ink-500">
                        {row.fillPct.toFixed(0)}% of {sump.capacityM3.toFixed(0)} m³
                      </span>
                    </div>
                    <Progress
                      value={row.fillPct}
                      tone={severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : 'cyan'}
                      className="my-1.5"
                    />
                    <div className="flex justify-between gap-2 font-mono text-[9.5px] text-ink-400">
                      <span>net {formatFlow(row.netM3h)}</span>
                      <span className={row.timeToCriticalHours != null ? toneText('amber') : 'text-ink-500'}>
                        {forecast?.timeToCriticalHours != null
                          ? `crit in ${formatDurationHours(forecast.timeToCriticalHours)}`
                          : !forecast?.points.length ? 'forecast loading' : 'no breach within forecast'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelTitle
              right={
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">{derived.cascades.length} cascade paths</span>
                  <Link to="/app/digital-twin" className="text-[10px] text-ink-400 hover:text-ink-100">open twin →</Link>
                </div>
              }
            >
              Equipment connections · simulated
            </PanelTitle>
            <div className="p-2">
              <DependencyGraph height={318} onSelect={(assetId) => selectAsset({ assetId })} />
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<Link to="/app/impact" className="text-[10px] text-ink-400 hover:text-ink-100">exposure →</Link>}>
              Production exposure by zone
            </PanelTitle>
            <TableShell>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Operating</Th>
                  <Th align="right">Foregone hours</Th>
                  <Th align="right">Foregone zone t</Th>
                  <Th align="right">Value at risk</Th>
                  <Th>Constraint</Th>
                </tr>
              </thead>
              <tbody>
                {analytics.zones.map((zone) => (
                  <tr key={zone.zoneId} className="hover:bg-ink-800/60">
                    <Td>
                      <button onClick={() => selectAsset({ assetId: zone.zoneId })} className="text-left hover:text-signal-cyanBright">
                        {zone.zoneName}
                      </button>
                    </Td>
                    <Td align="right" className="num">{zone.rateTph.toFixed(0)} t/h</Td>
                    <Td align="right" className="num">
                      <span className={zone.operatingPct < 85 ? 'text-signal-amber' : 'text-signal-green'}>
                        {zone.operatingPct.toFixed(0)}%
                      </span>
                    </Td>
                    <Td align="right" className="num">{zone.lostHours.toFixed(2)}</Td>
                    <Td align="right" className="num">{zone.lostTonnes.toFixed(0)}</Td>
                    <Td align="right" className="num">{formatMoney(zone.lostValueUSD)}</Td>
                    <Td className="max-w-[220px] truncate text-2xs text-ink-400">{zone.constraint}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </Panel>
        </div>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Link to="/app/incidents" className="text-[10px] text-ink-400 hover:text-ink-100">command →</Link>}>
              Incident queue
            </PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {activeIncidents.length === 0 && (
                <div className="px-3 py-4 text-2xs text-ink-400">No active incidents. The engine raises one only when a modelled threshold is crossed.</div>
              )}
              {activeIncidents.slice(0, 4).map((incident) => (
                <button
                  key={incident.id}
                  onClick={() => selectAsset({ incidentId: incident.id })}
                  className="block w-full px-3 py-2 text-left hover:bg-ink-800/60"
                >
                  <div className="flex items-center gap-1.5">
                    <SeverityBadge severity={incident.severity} />
                    <span className="ml-auto font-mono text-[9px] text-ink-500">{incident.reference}</span>
                  </div>
                  <div className="mt-1 text-[11.5px] leading-snug text-ink-100">{incident.title}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={incident.state === 'resolved' || incident.state === 'closed' ? 'green' : incident.state === 'mitigating' || incident.state === 'investigating' ? 'amber' : 'neutral'}>{incident.state}</Badge>
                    <span className="truncate text-[9.5px] text-ink-500">{incident.evidence.length} evidence refs</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Cascade in progress</PanelTitle>
            <div className="space-y-1.5 px-2.5 py-2">
              {derived.cascades.length === 0 && (
                <p className="px-1 py-2 text-2xs leading-relaxed text-ink-400">
                  No active cascade. Fail a feeder or a pump in the inspector and the effect propagates through the same
                  graph used by every module.
                </p>
              )}
              {derived.cascades.slice(0, 4).map((cascade) => (
                <button
                  key={`${cascade.sourceId}-${cascade.targetId}-${cascade.depth}`}
                  onClick={() => selectAsset({ assetId: cascade.targetId })}
                  className="w-full rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2 py-1.5 text-left hover:border-ink-500"
                >
                  <div className="flex items-center gap-1 text-[10px] text-ink-300">
                    <span className="truncate">{cascade.path.join(' → ')}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge tone={cascade.effect === 'blocked' ? 'red' : cascade.effect === 'unmonitored' ? 'amber' : 'neutral'}>
                      {cascade.effect}
                    </Badge>
                    <span className="text-[9px] text-ink-500">{cascade.via}</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<Link to="/app/decisions" className="text-[10px] text-ink-400 hover:text-ink-100">ledger →</Link>}>
              Recent activity
            </PanelTitle>
            <div className="max-h-[280px] overflow-y-auto">
              {activity.length === 0 && <div className="px-3 py-3 text-2xs text-ink-400">No actions yet. Interventions are recorded here with actor and role.</div>}
              {activity.slice(0, 10).map((entry) => (
                <div key={entry.id} className="border-b border-[color:var(--hairline)] px-3 py-1.5 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-500">{entry.kind}</span>
                    <span className="ml-auto font-mono text-[8.5px] text-ink-600">
                      {entry.atMs ? new Date(entry.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-ink-300">{entry.summary}</div>
                  <div className="font-mono text-[8.5px] text-ink-600">{entry.actor} · {entry.role}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Focus areas (integrated view)</PanelTitle>
            <div className="space-y-2 px-3 py-2.5">
              <Link to="/app/dewatering" className="flex items-start gap-2 rounded-[2px] border border-signal-cyan/30 bg-signal-cyan/[0.06] px-2 py-2 hover:border-signal-cyan/60">
                <Droplets size={14} className="mt-0.5 text-signal-cyanBright" />
                <span>
                  <span className="block text-[11.5px] text-ink-100">Water & dewatering risk</span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-ink-400">Levels, inflow/outflow balance, pump capability, forecast horizons.</span>
                </span>
              </Link>
              <Link to="/app/energy" className="flex items-start gap-2 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/40 px-2 py-2 hover:border-ink-500">
                <Zap size={14} className="mt-0.5 text-signal-amber" />
                <span>
                  <span className="block text-[11.5px] text-ink-100">Power & energy constraints</span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-ink-400">Supply availability, demand, and energy/cost context (measured/configured inputs).</span>
                </span>
              </Link>
              <Link to="/app/impact" className="flex items-start gap-2 rounded-[2px] border border-signal-amber/30 bg-signal-amber/[0.06] px-2 py-2 hover:border-signal-amber/60">
                <AlertTriangle size={14} className="mt-0.5 text-signal-amber" />
                <span>
                  <span className="block text-[11.5px] text-ink-100">Production impact & value</span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-ink-400">Tonnes/hours/value exposure from the same causal state and assumptions.</span>
                </span>
              </Link>
            </div>
          </Panel>
        </div>
      </div>
      </div>
    </div>
  );
}

function between(hours: number) {
  return hours < 1 ? `${(hours * 60).toFixed(0)} min elapsed` : `${hours.toFixed(2)} h elapsed`;
}
