import { Download, ShieldCheck } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { BarChart } from '../components/charts';
import {
  Badge,
  Button,
  Metric,
  MetricCell,
  MetricGrid,
  Notice,
  Panel,
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useAnalytics, useCapabilities } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import {
  formatDurationHours,
  formatEnergy,
  formatFlow,
  formatLevel,
  formatMoney,
  formatPower,
  formatTonnes,
} from '../domain/units';

export function Analytics() {
  const analytics = useAnalytics();
  const capabilities = useCapabilities();
  const mine = useMineStore((s) => s.mine);
  const selectAsset = useMineStore((s) => s.selectAsset);

  const net = analytics.totalInflowM3h - analytics.totalOutflowM3h;
  const okChecks = analytics.modelChecks.filter((check) => check.status === 'ok').length;
  const failures = analytics.modelChecks.filter((check) => check.status === 'fail').length;

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.analytics}
        actions={
          <>
            <Badge tone={failures ? 'red' : okChecks === analytics.modelChecks.length ? 'green' : 'amber'} dot>
              {okChecks}/{analytics.modelChecks.length} model checks ok
            </Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={!capabilities.can('report.export')}
              onClick={() => exportBundle(analytics)}
            >
              <Download size={11} /> Export analytics
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-ink-500">
            All figures derive from the canonical engine at the current step. Nothing here is separately entered.
          </span>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
            {analytics.elapsedHours.toFixed(2)} h simulated
          </span>
        </div>
      </ModuleHeader>

      <MetricGrid cols={4}>
        <MetricCell>
          <Metric label="Total inflow" value={formatFlow(analytics.totalInflowM3h)} hint="all sumps" tone="cyan" />
        </MetricCell>
        <MetricCell>
          <Metric label="Total outflow" value={formatFlow(analytics.totalOutflowM3h)} hint="modelled pumping" tone="teal" />
        </MetricCell>
        <MetricCell>
          <Metric label="Net balance" value={formatFlow(net)} hint={net > 0 ? 'accumulating' : 'drawing down'} tone={net > 0 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Energy cost" value={formatMoney(analytics.energy.costUSD)} hint={`${formatPower(analytics.energy.runningPowerKw)} running`} tone="neutral" />
        </MetricCell>
        <MetricCell>
          <Metric label="Specific energy" value={`${analytics.energy.averageSpecificKwhPerM3.toFixed(3)} kWh/m³`} hint="fleet average" tone="neutral" />
        </MetricCell>
        <MetricCell>
          <Metric label="Plant throughput" value={`${analytics.zones.reduce((sum, zone) => sum + zone.rateTph, 0).toFixed(0)} tph`} hint="sum of available zones" tone="green" />
        </MetricCell>
        <MetricCell>
          <Metric label="Foregone zone production" value={formatTonnes(analytics.zones.reduce((sum, zone) => sum + zone.lostTonnes, 0))} hint="not confirmed permanent loss" tone="amber" />
        </MetricCell>
        <MetricCell>
          <Metric label="Value exposure" value={formatMoney(analytics.zones.reduce((sum, zone) => sum + zone.lostValueUSD, 0))} hint="modelled, scenario assumptions" tone="amber" />
        </MetricCell>
      </MetricGrid>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">mass balance, snapshot</span>}>Water balance</PanelTitle>
          <TableShell>
            <thead>
              <tr>
                <Th>Sump</Th>
                <Th align="right">Level</Th>
                <Th align="right">Fill</Th>
                <Th align="right">Inflow</Th>
                <Th align="right">Outflow</Th>
                <Th align="right">Net</Th>
                <Th align="right">To critical</Th>
                <Th>Trend</Th>
              </tr>
            </thead>
            <tbody>
              {analytics.waterBalance.map((row) => (
                <tr key={row.sumpId} className="cursor-pointer hover:bg-ink-800/60" onClick={() => selectAsset({ assetId: row.sumpId, sumpId: row.sumpId })}>
                  <Td>{row.sumpName}</Td>
                  <Td align="right" className="num">{formatLevel(row.levelM)}</Td>
                  <Td align="right" className="num">{row.fillPct.toFixed(0)}%</Td>
                  <Td align="right" className="num text-signal-cyanBright">{formatFlow(row.inflowM3h)}</Td>
                  <Td align="right" className="num text-signal-tealBright">{formatFlow(row.outflowM3h)}</Td>
                  <Td align="right" className={cx('num', row.netM3h > 0 ? 'text-signal-amber' : 'text-signal-green')}>
                    {row.netM3h >= 0 ? '+' : ''}{row.netM3h.toFixed(0)} m³/h
                  </Td>
                  <Td align="right" className="num">{row.timeToCriticalHours == null ? '—' : formatDurationHours(row.timeToCriticalHours)}</Td>
                  <Td>
                    <Badge tone={row.trend === 'rising' ? 'amber' : row.trend === 'falling' ? 'green' : 'neutral'}>{row.trend}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">self-consistency, not field validation</span>}>
              Model checks
            </PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {analytics.modelChecks.map((check) => (
                <div key={check.id} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={check.status === 'ok' ? 'green' : check.status === 'watch' ? 'amber' : 'red'}>{check.status}</Badge>
                    <span className="text-[10.5px] text-ink-200">{check.label}</span>
                    <span className="ml-auto font-mono text-[9px] text-ink-400">{check.value}</span>
                  </div>
                  <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{check.explanation}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Notice tone="blue" title="What these checks mean" icon={<ShieldCheck size={13} />}>
            These checks test whether the model agrees with itself — mass balance closure, forecast stability and sensor
            agreement. They are not an accuracy claim against a real mine and must not be presented as validation.
          </Notice>
        </div>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-2">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{formatEnergy(analytics.energy.energyKwh)}</span>}>
            Energy by pump
          </PanelTitle>
          <div className="p-2">
            <BarChart
              categories={analytics.energy.byPump.map((row) => row.pumpName.replace(' Pump', ''))}
              series={[{ name: 'Energy', data: analytics.energy.byPump.map((row) => Number(row.energyKwh.toFixed(1))), color: '#5fb7e8' }]}
              yName="kWh"
              horizontal
              height={230}
              legend={false}
            />
          </div>
          <div className="border-t border-[color:var(--hairline)] px-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-2xs text-ink-400 sm:grid-cols-4">
              <div><div className="label-micro">Energy</div><div className="num text-ink-100">{formatEnergy(analytics.energy.energyKwh)}</div></div>
              <div><div className="label-micro">Cost</div><div className="num text-ink-100">{formatMoney(analytics.energy.costUSD)}</div></div>
              <div><div className="label-micro">Average</div><div className="num text-ink-100">{analytics.energy.averageSpecificKwhPerM3.toFixed(3)}</div></div>
              <div><div className="label-micro">Running</div><div className="num text-ink-100">{formatPower(analytics.energy.runningPowerKw)}</div></div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">pump · sump · feeder</span>}>Pump performance</PanelTitle>
          <TableShell>
            <thead>
              <tr>
                <Th>Pump</Th>
                <Th>Sump</Th>
                <Th>Feeder</Th>
                <Th>Mode</Th>
                <Th align="right">Flow</Th>
                <Th align="right">Power</Th>
                <Th align="right">kWh/m³</Th>
              </tr>
            </thead>
            <tbody>
              {analytics.pumpPerformance.map((row) => (
                <tr key={row.pumpId} className="cursor-pointer hover:bg-ink-800/60" onClick={() => selectAsset({ assetId: row.pumpId })}>
                  <Td>{row.pumpName}</Td>
                  <Td className="text-2xs text-ink-400">{row.sumpName}</Td>
                  <Td className="text-2xs text-ink-400">{row.feederName}</Td>
                  <Td><Badge tone={row.powered ? 'green' : 'red'}>{row.mode}</Badge></Td>
                  <Td align="right" className="num">{formatFlow(row.flowM3h)}</Td>
                  <Td align="right" className="num">{formatPower(row.powerKw)}</Td>
                  <Td align="right" className="num">{row.specificEnergyKwhPerM3.toFixed(3)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">design vs realised</span>}>Production exposure</PanelTitle>
          <TableShell>
            <thead>
              <tr>
                <Th>Zone</Th>
                <Th align="right">Design</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Operating</Th>
                <Th align="right">Foregone hours</Th>
                <Th align="right">Foregone zone t</Th>
                <Th align="right">Value</Th>
                <Th>Constraint</Th>
                <Th align="right">To flood</Th>
              </tr>
            </thead>
            <tbody>
              {analytics.zones.map((zone) => (
                <tr key={zone.zoneId} className="hover:bg-ink-800/50">
                  <Td>{zone.zoneName}</Td>
                  <Td align="right" className="num text-ink-400">{zone.designRateTph.toFixed(0)}</Td>
                  <Td align="right" className="num">{zone.rateTph.toFixed(0)}</Td>
                  <Td align="right" className={cx('num', zone.operatingPct < 90 ? 'text-signal-amber' : 'text-ink-200')}>{zone.operatingPct.toFixed(0)}%</Td>
                  <Td align="right" className="num">{zone.lostHours.toFixed(1)}</Td>
                  <Td align="right" className="num">{zone.lostTonnes.toFixed(0)}</Td>
                  <Td align="right" className="num">{formatMoney(zone.lostValueUSD)}</Td>
                  <Td className="max-w-[220px] text-2xs text-ink-400">{zone.constraint}</Td>
                  <Td align="right" className={cx('num', zone.hoursToFlood != null && zone.hoursToFlood < 6 ? 'text-signal-red' : 'text-ink-300')}>
                    {zone.hoursToFlood == null ? '—' : formatDurationHours(zone.hoursToFlood)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">simulated hours</span>}>Incidents by hour</PanelTitle>
            <div className="p-2">
              <BarChart
                categories={analytics.incidents.byHour.map((row) => `h${row.hour}`)}
                series={[{ name: 'Incidents', data: analytics.incidents.byHour.map((row) => row.count), color: '#e0a33e' }]}
                yName="count"
                height={160}
                legend={false}
              />
            </div>
            <div className="border-t border-[color:var(--hairline)] px-3 py-2">
              <div className="grid grid-cols-3 gap-2 text-2xs">
                <div><div className="label-micro">Active</div><div className="num text-[15px] text-ink-50">{analytics.incidents.active}</div></div>
                <div><div className="label-micro">Total</div><div className="num text-[15px] text-ink-50">{analytics.incidents.total}</div></div>
                <div><div className="label-micro">Mean ack</div><div className="num text-[15px] text-ink-50">{analytics.incidents.meanAcknowledgeMinutes == null ? '—' : `${analytics.incidents.meanAcknowledgeMinutes.toFixed(0)} min`}</div></div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Reliability drivers</PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {analytics.reliability.map((row) => (
                <div key={row.pumpId} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] text-ink-200">{row.pumpName}</span>
                    <span className="ml-auto font-mono text-[9px] text-ink-400">MTBF unsupported — no calibrated failure data</span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {row.drivers.map((driver) => (
                      <li key={driver} className="text-2xs leading-relaxed text-ink-500">· {driver}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-2 text-2xs leading-relaxed text-ink-600">
        {mine.name} · synthetic asset base · {mine.geometryDisclaimer}
      </div>
    </div>
  );
}

function exportBundle(bundle: unknown) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kestrel-analytics-bundle.json';
  link.click();
  URL.revokeObjectURL(url);
}
