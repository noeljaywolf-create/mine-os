import { Link } from 'react-router-dom';
import { ArrowRight, Droplets, Play, Zap } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { DependencyGraph } from '../components/DependencyGraph';
import {
  Badge,
  Button,
  Metric,
  MetricCell,
  MetricGrid,
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

  const waterRows = analytics.waterBalance;
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
          <Badge tone={running ? 'green' : 'neutral'} dot>
            {running ? 'simulation running' : 'simulation paused'}
          </Badge>
          <Badge tone="neutral">step {run.world.clock.stepSec}s</Badge>
          <Badge tone={activeIncidents.some((i) => i.severity === 'critical') ? 'red' : 'amber'}>
            {activeIncidents.length} active incident{activeIncidents.length === 1 ? '' : 's'}
          </Badge>
          <span className="text-2xs text-ink-500">
            Every number below is computed from the same engine state — no module-local mock data.
          </span>
        </div>
      </ModuleHeader>

      <MetricGrid cols={5}>
        <MetricCell>
          <Metric
            label="Water risk horizon"
            value={
              worst?.timeToCriticalHours != null
                ? formatDurationHours(worst.timeToCriticalHours)
                : 'None projected'
            }
            hint={`${worst?.sumpName ?? '—'} · central estimate`}
            tone={worst?.timeToCriticalHours != null && worst.timeToCriticalHours < 6 ? 'red' : 'green'}
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

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Link to="/app/dewatering" className="text-[10px] text-ink-400 hover:text-ink-100">water balance →</Link>}>
              Sump inventory and projected threshold crossings
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
                          : 'no projected breach'}
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
              Dependency graph · live propagation
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
            <PanelTitle>Two products, one engine</PanelTitle>
            <div className="space-y-2 px-3 py-2.5">
              <Link to="/app/dewatering" className="flex items-start gap-2 rounded-[2px] border border-signal-cyan/30 bg-signal-cyan/[0.06] px-2 py-2 hover:border-signal-cyan/60">
                <Droplets size={14} className="mt-0.5 text-signal-cyanBright" />
                <span>
                  <span className="block text-[11.5px] text-ink-100">DeepWater Intelligence</span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-ink-400">
                    Water inventory, forecast bands and pump capability.
                  </span>
                </span>
              </Link>
              <Link to="/app/impact" className="flex items-start gap-2 rounded-[2px] border border-signal-amber/30 bg-signal-amber/[0.06] px-2 py-2 hover:border-signal-amber/60">
                <Zap size={14} className="mt-0.5 text-signal-amber" />
                <span>
                  <span className="block text-[11.5px] text-ink-100">Mine Impact Intelligence</span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-ink-400">
                    Tonnes, hours and value exposed by the same physical state.
                  </span>
                </span>
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function between(hours: number) {
  return hours < 1 ? `${(hours * 60).toFixed(0)} min elapsed` : `${hours.toFixed(2)} h elapsed`;
}
