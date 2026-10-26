import { Link } from 'react-router-dom';
import { MaterialHandlingPanel } from '../components/MaterialHandlingPanel';
import { EngineeringBasis } from '../components/EngineeringBasis';
import { ArrowRight, Factory, Gauge, Timer } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { BarChart } from '../components/charts';
import {
  Badge,
  EmptyState,
  Metric,
  MetricCell,
  MetricGrid,
  Panel,
  Progress,
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useAnalytics, useAssumptions, useDerived, useForecasts } from '../store/hooks';

import { useMineStore as useStore } from '../store/mineStore';
import { formatDurationHours, formatMoney, formatTonnes } from '../domain/units';

export function Production() {
  const mine = useStore((s) => s.mine);
  const derived = useDerived();
  const analytics = useAnalytics();
  const forecasts = useForecasts();
  const assumptions = useAssumptions();
  const selectAsset = useStore((s) => s.selectAsset);

  const totalDesign = analytics.zones.reduce((sum, zone) => sum + zone.designRateTph, 0);
  const totalLostValue = analytics.zones.reduce((sum, zone) => sum + zone.lostValueUSD, 0);
  const constrained = analytics.zones.filter((zone) => zone.hoursToFlood !== null || zone.operatingPct < 98);

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.production}
        actions={
          <>
            <Link to="/app/impact" className="text-[10px] text-ink-400 hover:text-ink-100">impact overview →</Link>
            <Link to="/app/scenarios" className="inline-flex items-center gap-1 rounded-[2px] border border-signal-amber/40 bg-signal-amber/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-signal-amber">
              Test recovery <ArrowRight size={10} />
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={derived.plantRatio < 0.95 ? 'amber' : 'green'} dot>
            {derived.plantRatio < 0.95 ? 'production constrained' : 'production at design'}
          </Badge>
          <Badge tone="neutral">{formatMoney(assumptions.valuePerTonneUSD)} / t realised value</Badge>
          <Badge tone="neutral">{assumptions.restartRampHours} h restart ramp assumption</Badge>
        </div>
      </ModuleHeader>
      <MaterialHandlingPanel />
      <div className="my-3 flex flex-wrap gap-2"><EngineeringBasis assetId="site:production" /><EngineeringBasis assetId="zone-north" /></div>

      <MetricGrid cols={5}>
        <MetricCell>
          <Metric label="Plant throughput" value={formatTonnes(derived.plantRateTph)} unit="t/h" hint={`design ${totalDesign} t/h`} tone={derived.plantRatio < 0.95 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Utilisation" value={`${(derived.plantRatio * 100).toFixed(1)}%`} hint="weighted by zone share" tone={derived.plantRatio < 0.9 ? 'red' : derived.plantRatio < 0.98 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Foregone operating hours" value={analytics.zones.reduce((sum, zone) => sum + zone.lostHours, 0).toFixed(2)} unit="h" hint="accumulated shortfall" tone="neutral" />
        </MetricCell>
        <MetricCell>
          <Metric label="Foregone zone tonnes" value={formatTonnes(analytics.zones.reduce((sum, zone) => sum + zone.lostTonnes, 0))} hint="deferred potential; not permanent loss" tone={totalLostValue > 0 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Illustrative value exposure" value={formatMoney(totalLostValue)} hint="not confirmed revenue loss" tone={totalLostValue > 0 ? 'amber' : 'green'} />
        </MetricCell>
      </MetricGrid>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">current vs design</span>}>
            Zone throughput
          </PanelTitle>
          <div className="p-2">
            <BarChart
              categories={analytics.zones.map((zone) => zone.zoneName)}
              series={[
                { name: 'current t/h', data: analytics.zones.map((zone) => Number(zone.rateTph.toFixed(1))), color: '#4f8ff7' },
                { name: 'design t/h', data: analytics.zones.map((zone) => zone.designRateTph), color: '#2a3a52' },
              ]}
              height={230}
              yName="t/h"
              legend
            />
          </div>
          <div className="border-t border-[color:var(--hairline)] p-2">
            <div className="label-micro mb-1.5">Zone exposure</div>
            <TableShell>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th align="right">Design</Th>
                  <Th align="right">Share</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Foregone zone t</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">Flood margin</Th>
                </tr>
              </thead>
              <tbody>
                {analytics.zones.map((zone) => {
                  const definition = mine.zones.find((item) => item.id === zone.zoneId);
                  return (
                    <tr key={zone.zoneId} className="hover:bg-ink-800/50">
                      <Td>
                        <button onClick={() => selectAsset({ assetId: zone.zoneId })} className="text-left hover:text-signal-cyanBright">
                          {zone.zoneName}
                        </button>
                      </Td>
                      <Td align="right" className="num">{zone.designRateTph}</Td>
                      <Td align="right" className="num">{definition?.productionSharePct ?? 0}%</Td>
                      <Td align="right" className="num">{zone.rateTph.toFixed(0)}</Td>
                      <Td align="right" className="num">{zone.lostTonnes.toFixed(0)} t</Td>
                      <Td align="right" className="num">{formatMoney(zone.lostValueUSD)}</Td>
                      <Td align="right" className="num">
                        {zone.hoursToFlood == null ? <span className="text-ink-500">no exposure</span> : formatDurationHours(zone.hoursToFlood)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{constrained.length} constrained</span>}>
              Recovery outlook
            </PanelTitle>
            {constrained.length === 0 ? (
              <EmptyState
                icon={<Factory size={18} />}
                title="No production constraint"
                detail="Every zone is at or near design throughput. Introduce a pump or feeder failure to see recovery paths."
              />
            ) : (
              <div className="space-y-1.5 p-2">
                {constrained.map((zone) => {
                  const definition = mine.zones.find((item) => item.id === zone.zoneId);
                  const governing = definition?.governedBySumpIds ?? [];
                  const worst = governing
                    .map((sumpId) => ({ sumpId, forecast: forecasts[sumpId] }))
                    .sort((a, b) => (b.forecast?.timeToCriticalHours ?? 0) - (a.forecast?.timeToCriticalHours ?? 0))[0];
                  return (
                    <div key={zone.zoneId} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-ink-100">{zone.zoneName}</span>
                        <span className={cx('ml-auto num text-[11px]', zone.operatingPct < 85 ? 'text-signal-amber' : 'text-signal-green')}>
                          {zone.operatingPct.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={zone.operatingPct} tone={zone.operatingPct < 85 ? 'amber' : 'green'} className="my-1.5" />
                      <div className="grid grid-cols-2 gap-1 font-mono text-[9px] text-ink-400">
                        <span>foregone {zone.lostTonnes.toFixed(0)} t</span>
                        <span className="text-right">{formatMoney(zone.lostValueUSD)}</span>
                        <span className="col-span-2 truncate text-ink-500">
                          {worst?.forecast
                            ? `governing: ${worst.sumpId} · ${worst.forecast.timeToCriticalHours == null ? 'stable' : formatDurationHours(worst.forecast.timeToCriticalHours)}`
                            : zone.constraint}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle>How the shortfall is integrated</PanelTitle>
            <div className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <p><Timer size={10} className="mr-1 inline" /> The engine integrates lost rate over simulated time, so a short trip produces a small number and a long constraint produces a large one.</p>
              <p><Gauge size={10} className="mr-1 inline" /> A zone is constrained while its governing sump is above the flood-control threshold, even if pumping has resumed.</p>
              <p>Restart ramp ({assumptions.restartRampHours} h) is an explicit assumption, not a hidden fudge factor. Change it in Scenario Lab and the recovery estimate moves.</p>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Assumption sensitivity</PanelTitle>
            <div className="space-y-1 px-3 py-2">
              {[
                ['Realised value', `${formatMoney(assumptions.valuePerTonneUSD)}/t`],
                ['Operating cost', `${formatMoney(assumptions.operatingCostPerHourUSD)}/h`],
                ['Fixed overhead', `${formatMoney(assumptions.fixedOverheadPerHourUSD)}/h`],
                ['Restart ramp', `${assumptions.restartRampHours} h`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-[color:var(--hairline)] py-1.5 last:border-0">
                  <span className="text-[10.5px] text-ink-300">{label}</span>
                  <span className="num text-[10.5px] text-ink-100">{value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="mt-2">
        <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">governed by sump level</span>}>
          Zone dependency detail
        </PanelTitle>
        <TableShell>
          <thead>
            <tr>
              <Th>Zone</Th>
              <Th>Level</Th>
              <Th>Governing sumps</Th>
              <Th align="center">Flood control sump</Th>
              <Th align="right">Floor elevation</Th>
              <Th align="right">Design rate</Th>
            </tr>
          </thead>
          <tbody>
            {mine.zones.map((zone) => (
              <tr key={zone.id} className="hover:bg-ink-800/50">
                <Td>
                  <button onClick={() => selectAsset({ assetId: zone.id })} className="text-left hover:text-signal-cyanBright">
                    {zone.name}
                  </button>
                </Td>
                <Td className="font-mono text-[10px] text-ink-400">{zone.levelId}</Td>
                <Td className="font-mono text-[10px] text-ink-400">{zone.governedBySumpIds.join(', ')}</Td>
                <Td align="center" className="font-mono text-[10px] text-ink-400">{zone.floodControlSumpId}</Td>
                <Td align="right" className="num">{zone.floorElevationM} m</Td>
                <Td align="right" className="num">{zone.designRateTph} t/h</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </div>
  );
}
