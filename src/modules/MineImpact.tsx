import { Link } from 'react-router-dom';
import { EngineeringBasis } from '../components/EngineeringBasis';
import { ArrowRight, Factory, Mountain, TrendingDown } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { BarChart } from '../components/charts';
import {
  Badge,
  Metric,
  MetricCell,
  MetricGrid,
  Notice,
  Panel,
  Progress,
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useAnalytics, useAssumptions, useDerived, useForecasts } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import { formatDurationHours, formatFlow, formatMoney, formatTonnes } from '../domain/units';

export function MineImpact() {
  const mine = useMineStore((s) => s.mine);
  const analytics = useAnalytics();
  const forecasts = useForecasts();
  const derived = useDerived();
  const assumptions = useAssumptions();
  const selectAsset = useMineStore((s) => s.selectAsset);

  const totalLostUSD = analytics.zones.reduce((sum, zone) => sum + zone.lostValueUSD, 0);
  const totalLostTonnes = analytics.zones.reduce((sum, zone) => sum + zone.lostTonnes, 0);
  const exposedZones = analytics.zones.filter((zone) => zone.operatingPct < 98);
  const nearest = [...analytics.zones]
    .filter((zone) => zone.hoursToFlood !== null)
    .sort((a, b) => (a.hoursToFlood ?? 0) - (b.hoursToFlood ?? 0))[0];

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.impact}
        actions={
          <>
            <Link to="/app/dewatering" className="text-[10px] text-ink-400 hover:text-ink-100">physical drivers →</Link>
            <Link to="/app/production" className="text-[10px] text-ink-400 hover:text-ink-100">production detail →</Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={exposedZones.length > 0 ? 'amber' : 'green'} dot>
            {exposedZones.length === 0 ? 'no zone constrained' : `${exposedZones.length} zones constrained`}
          </Badge>
          <span className="text-2xs text-ink-500">
            Exposure is derived from pump capability, feeder state and sump level — not entered as a standalone figure.
          </span>
        </div>
      </ModuleHeader>

      <MetricGrid cols={5}>
        <MetricCell>
          <Metric label="Mine production" value={formatTonnes(derived.plantRateTph)} unit="t/h" hint={`${(derived.plantRatio * 100).toFixed(0)}% of design`} tone={derived.plantRatio < 0.9 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Foregone zone tonnes" value={formatTonnes(totalLostTonnes)} hint="deferred potential, not permanent loss" tone={totalLostTonnes > 0 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Value at risk" value={formatMoney(totalLostUSD)} hint="foregone zone t × assumed value/t" tone={totalLostUSD > 0 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Exposed zones" value={`${exposedZones.length} / ${analytics.zones.length}`} hint={exposedZones.map((zone) => zone.zoneName).join(', ') || 'none'} tone={exposedZones.length ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Nearest flood margin" value={nearest ? formatDurationHours(nearest.hoursToFlood ?? 0) : 'No exposure'} hint={nearest?.zoneName ?? 'no zone projected to flood'} tone={nearest && (nearest.hoursToFlood ?? 99) < 6 ? 'red' : 'green'} />
        </MetricCell>
      </MetricGrid>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.35fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">t/h · current vs design</span>}>
            Throughput by zone
          </PanelTitle>
          <div className="p-2">
            <BarChart
              categories={analytics.zones.map((zone) => zone.zoneName.replace('Zone ', ''))}
              series={[
                { name: 'current', data: analytics.zones.map((zone) => Number(zone.rateTph.toFixed(1))), color: '#4f8ff7' },
                { name: 'design', data: analytics.zones.map((zone) => zone.designRateTph), color: '#2a3a52' },
              ]}
              height={220}
              yName="t/h"
              legend
            />
          </div>
          <div className="grid gap-px border-t border-[color:var(--hairline)] bg-[color:var(--hairline)] sm:grid-cols-3">
            {analytics.zones.map((zone) => (
              <div key={zone.zoneId} className="bg-ink-850 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => selectAsset({ assetId: zone.zoneId })} className="truncate text-[11px] text-ink-100 hover:text-signal-cyanBright">
                    {zone.zoneName}
                  </button>
                  <span className={cx('num text-[11px]', zone.operatingPct < 85 ? 'text-signal-amber' : 'text-signal-green')}>
                    {zone.operatingPct.toFixed(0)}%
                  </span>
                </div>
                <Progress value={zone.operatingPct} tone={zone.operatingPct < 85 ? 'amber' : 'green'} className="my-1.5" />
                <div className="font-mono text-[9px] text-ink-500">{zone.constraint}</div>
                <EngineeringBasis assetId={zone.zoneId} />
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle>Causal chain · water to value</PanelTitle>
            <div className="space-y-2 px-3 py-2.5">
              {mine.sumps.slice(0, 4).map((sump) => {
                const state = forecasts[sump.id];
                const pumps = mine.pumps.filter((pump) => pump.sumpId === sump.id);
                const powered = pumps.filter((pump) => derived.pumpStates[pump.id]?.powered).length;
                const affected = analytics.zones.filter((zone) => {
                  const definition = mine.zones.find((item) => item.id === zone.zoneId);
                  return definition?.governedBySumpIds.includes(sump.id);
                });
                if (affected.length === 0) return null;
                return (
                  <div key={sump.id} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/40 px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <Mountain size={11} className="text-ink-500" />
                      <button onClick={() => selectAsset({ assetId: sump.id, sumpId: sump.id })} className="text-[11px] text-ink-100 hover:text-signal-cyanBright">
                        {sump.name}
                      </button>
                      <span className="ml-auto font-mono text-[9px] text-ink-500">
                        {state.timeToCriticalHours == null ? 'stable' : `crit ${formatDurationHours(state.timeToCriticalHours)}`}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[9.5px] text-ink-400">
                      <span>{formatFlow(state.points[0]?.inflowM3h ?? 0)} inflow</span>
                      <ArrowRight size={9} />
                      <span>{powered}/{pumps.length} pumps powered</span>
                      <ArrowRight size={9} />
                      <span className="text-signal-amber">{affected.map((zone) => zone.zoneName).join(', ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Exposure register</PanelTitle>
            <TableShell>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Foregone zone t</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">Flood margin</Th>
                </tr>
              </thead>
              <tbody>
                {analytics.zones.map((zone) => (
                  <tr key={zone.zoneId} className="hover:bg-ink-800/50">
                    <Td>
                      <button onClick={() => selectAsset({ assetId: zone.zoneId })} className="text-left hover:text-signal-cyanBright">
                        {zone.zoneName}
                      </button>
                    </Td>
                    <Td align="right" className="num">{zone.rateTph.toFixed(0)}</Td>
                    <Td align="right" className="num">{zone.lostTonnes.toFixed(0)} t</Td>
                    <Td align="right" className="num">{formatMoney(zone.lostValueUSD)}</Td>
                    <Td align="right" className="num">
                      {zone.hoursToFlood == null ? <span className="text-ink-500">—</span> : formatDurationHours(zone.hoursToFlood)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </Panel>
        </div>
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-3">
        <Panel>
          <PanelTitle>Recovery sensitivity</PanelTitle>
          <div className="px-3 py-2">
            {analytics.sensitivity.map((point) => {
              const worst = [...point.sumps].sort(
                (a, b) => (a.timeToCriticalHours ?? 999) - (b.timeToCriticalHours ?? 999),
              )[0];
              return (
                <div key={point.label} className="flex items-center gap-2 border-b border-[color:var(--hairline)] py-1.5 last:border-0">
                  <span className="w-20 font-mono text-[10px] text-ink-300">{point.label}</span>
                  <Progress
                    value={worst?.timeToCriticalHours == null ? 100 : Math.min(100, (worst.timeToCriticalHours / 24) * 100)}
                    tone={worst?.timeToCriticalHours == null ? 'green' : worst.timeToCriticalHours < 6 ? 'red' : 'amber'}
                    className="flex-1"
                  />
                  <span className="w-20 text-right font-mono text-[9.5px] text-ink-400">
                    {worst?.timeToCriticalHours == null ? 'stable' : formatDurationHours(worst.timeToCriticalHours)}
                  </span>
                </div>
              );
            })}
            <p className="mt-2 text-2xs leading-relaxed text-ink-500">
              Inflow is scaled while pump capability is held constant. This shows where the current dewatering design
              runs out of margin — it is not a weather forecast.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelTitle>Assumptions behind the money</PanelTitle>
          <div className="space-y-1 px-3 py-2">
            {[
              ['Realised value per tonne', formatMoney(assumptions.valuePerTonneUSD)],
              ['Energy tariff', `${formatMoney(assumptions.energyTariffUSDPerKwh)}/kWh`],
              ['Crew callout', formatMoney(assumptions.crewCalloutCostUSD)],
              ['Restart ramp', `${assumptions.restartRampHours.toFixed(1)} h`],
              ['Inflow uncertainty', `±${assumptions.inflowUncertaintyPct.toFixed(0)}%`],
              ['Forecast horizon', `${assumptions.forecastHorizonHours.toFixed(0)} h`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-[color:var(--hairline)] py-1.5 last:border-0">
                <span className="text-[10.5px] text-ink-300">{label}</span>
                <span className="num text-[10.5px] text-ink-100">{value}</span>
              </div>
            ))}
            <Notice tone="neutral">
              Value at risk uses the scenario's realised-value assumption. It is an engineering estimate for
              prioritisation, not a financial statement.
            </Notice>
          </div>
        </Panel>

        <Panel>
          <PanelTitle>What would change the picture</PanelTitle>
          <ul className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
            <li className="flex gap-1.5"><TrendingDown size={11} className="mt-0.5 shrink-0" /> Restore a blocked feeder upstream of a sump and its pumps recover within one model step.</li>
            <li className="flex gap-1.5"><Factory size={11} className="mt-0.5 shrink-0" /> A zone stays constrained until the governing sump falls below its flood-control threshold, not when pumping simply restarts.</li>
            <li className="flex gap-1.5"><Mountain size={11} className="mt-0.5 shrink-0" /> Increasing inflow multiplier in the scenario shows the margin, not a guarantee of a rainfall event.</li>
          </ul>
          <div className="border-t border-[color:var(--hairline)] px-3 py-2">
            <Link to="/app/scenarios" className="text-[10px] text-signal-cyanBright hover:underline">
              Test a different operating posture →
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
