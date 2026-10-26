import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, TriangleAlert } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { ForecastChart, Heatmap } from '../components/charts';
import {
  Badge,
  EmptyState,
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
import { useAnalytics, useAssumptions, useForecasts, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import { formatDurationHours, formatLevel } from '../domain/units';
import { EngineeringBasis } from '../components/EngineeringBasis';
import { forecastBasis } from '../simulation/analysisEvidence';

export function Forecast() {
  const mine = useMineStore((s) => s.mine);
  const forecasts = useForecasts();
  const analytics = useAnalytics();
  const assumptions = useAssumptions();
  const run = useRun();
  const selectAsset = useMineStore((s) => s.selectAsset);
  const [sumpId, setSumpId] = useState(mine.sumps[1]?.id ?? mine.sumps[0].id);

  const sump = mine.sumps.find((item) => item.id === sumpId)!;
  const forecast = forecasts[sumpId];
  const degradedCount = Object.values(forecasts).filter((item) => item.degradedByInstrumentation).length;
  const earliest = [...mine.sumps]
    .map((item) => ({ sump: item, forecast: forecasts[item.id] }))
    .filter((row) => row.forecast.timeToCriticalHours != null)
    .sort((a, b) => (a.forecast.timeToCriticalHours ?? 0) - (b.forecast.timeToCriticalHours ?? 0))[0];

  const heatmapData: Array<[number, number, number]> = [];
  analytics.sensitivity.forEach((point, x) => {
    point.sumps.forEach((row, y) => {
      heatmapData.push([x, y, row.timeToCriticalHours == null ? 0 : Math.min(72, row.timeToCriticalHours)]);
    });
  });

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.forecast}
        actions={
          <>
            <EngineeringBasis assetId="analysis:forecast" providedBasis={forecastBasis(forecast)} />
            <Badge tone={degradedCount ? 'amber' : 'green'} dot>
              {degradedCount ? `${degradedCount} sumps with degraded tags` : 'all forecasts fully instrumented'}
            </Badge>
            <Link to="/app/analytics" className="text-[10px] text-ink-400 hover:text-ink-100">model checks →</Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-ink-500">
            Horizon {assumptions.forecastHorizonHours} h · uncertainty ±{assumptions.inflowUncertaintyPct}% on inflow ·
            restart ramp {assumptions.restartRampHours} h
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
            sim t+{(run.world.clock.elapsedSec / 3600).toFixed(2)} h
          </span>
        </div>
      </ModuleHeader>

      <MetricGrid cols={4}>
        <MetricCell>
          <Metric
            label="Earliest critical crossing"
            value={earliest ? formatDurationHours(earliest.forecast.timeToCriticalHours ?? 0) : 'None in horizon'}
            hint={earliest ? `${earliest.sump.name} central estimate` : 'all sumps below threshold'}
            tone={earliest && (earliest.forecast.timeToCriticalHours ?? 99) < 6 ? 'red' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Mean forecast confidence"
            value={`${(Object.values(forecasts).reduce((sum, item) => sum + item.confidence, 0) / mine.sumps.length * 100).toFixed(0)}%`}
            hint="discounted by tag freshness"
            tone={degradedCount ? 'amber' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Widest band at horizon"
            value={`±${Math.max(...mine.sumps.map((item) => forecasts[item.id].thresholdCrossings.at(-1)?.uncertaintyPct ?? 0)).toFixed(0)}%`}
            hint="modelled envelope, not a statistical CI"
            tone="neutral"
          />
        </MetricCell>
        <MetricCell>
          <Metric label="Monitored sumps" value={`${mine.sumps.length}`} hint={`${mine.sensors.filter((s) => s.kind === 'level').length} level tags`} tone="neutral" />
        </MetricCell>
      </MetricGrid>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelTitle
            right={
              <div className="flex flex-wrap gap-1">
                {mine.sumps.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setSumpId(item.id); selectAsset({ assetId: item.id, sumpId: item.id }); }}
                    className={cx(
                      'rounded-[2px] border px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-[0.1em]',
                      item.id === sumpId
                        ? 'border-signal-cyan/50 bg-signal-cyan/10 text-signal-cyanBright'
                        : 'border-[color:var(--hairline)] text-ink-500 hover:text-ink-300',
                    )}
                  >
                    {item.name.replace(' Sump ', ' ')}
                  </button>
                ))}
              </div>
            }
          >
            {sump.name} · {assumptions.forecastHorizonHours} h projection
          </PanelTitle>
          <div className="p-2">
            <ForecastChart points={forecast.points} thresholds={sump.thresholds} height={300} />
          </div>
          <div className="border-t border-[color:var(--hairline)] p-3">
            <div className="label-micro mb-1.5">Crossing detail</div>
            <TableShell>
              <thead>
                <tr>
                  <Th>Threshold</Th>
                  <Th>Severity</Th>
                  <Th align="right">Level</Th>
                  <Th align="right">Central crossing</Th>
                  <Th align="right">Pessimistic</Th>
                  <Th align="right">Band</Th>
                </tr>
              </thead>
              <tbody>
                {sump.thresholds.map((threshold) => {
                  const crossing = forecast.thresholdCrossings.find((item) => item.thresholdId === threshold.id);
                  return (
                    <tr key={threshold.id}>
                      <Td>{threshold.label}</Td>
                      <Td><Badge tone={threshold.severity === 'critical' ? 'red' : threshold.severity === 'warning' ? 'amber' : 'neutral'}>{threshold.severity}</Badge></Td>
                      <Td align="right" className="num">{formatLevel(threshold.levelM)}</Td>
                      <Td align="right" className="num">{crossing?.atSec ? formatDurationHours(crossing.atSec / 3600) : 'not reached'}</Td>
                      <Td align="right" className="num">{crossing?.pessimisticAtSec ? formatDurationHours(crossing.pessimisticAtSec / 3600) : '—'}</Td>
                      <Td align="right" className="num">{crossing ? `±${crossing.uncertaintyPct.toFixed(0)}%` : '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">why confidence is what it is</span>}>
              Input quality
            </PanelTitle>
            <div className="space-y-1.5 px-3 py-2">
              {forecast.contributingSensors.map((contributor) => {
                const sensor = mine.sensors.find((item) => item.id === contributor.sensorId);
                return (
                  <div key={contributor.sensorId} className="flex items-center gap-1.5">
                    <span className="truncate text-[10px] text-ink-300">{sensor?.name ?? contributor.sensorId}</span>
                    <Badge tone={contributor.freshness === 'live' ? 'green' : contributor.freshness === 'stale' ? 'amber' : 'red'}>
                      {contributor.freshness}
                    </Badge>
                    <span className="ml-auto font-mono text-[9px] text-ink-500">{(contributor.weight * 100).toFixed(0)}% weight</span>
                  </div>
                );
              })}
              <p className="pt-1 text-2xs leading-relaxed text-ink-500">
                Confidence is a weighted function of tag freshness, link quality and sensor accuracy. A stale tag lowers
                confidence and widens the band — it does not fabricate a value.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Method &amp; limits</PanelTitle>
            <ul className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <li>· Projection integrates the same water balance used by the live engine, at the configured step.</li>
              <li>· Outflow uses modelled pump capability, including head, health and electrical supply.</li>
              <li>· The band scales with inflow uncertainty and tag degradation; it is deterministic for a given seed.</li>
              <li>· Forecasts describe the model's own behaviour. They require engineering validation before field use.</li>
            </ul>
          </Panel>

          {degradedCount > 0 && (
            <Notice tone="amber" title="Some projections are degraded" icon={<TriangleAlert size={13} />}>
              {degradedCount} sump projection{degradedCount === 1 ? ' is' : 's are'} supported by at least one stale or
              offline tag. Restore instrument health or accept the wider band.
            </Notice>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">hours to critical · capped at 72 h</span>}>
            Inflow sensitivity
          </PanelTitle>
          {heatmapData.length === 0 ? (
            <EmptyState title="No sensitivity computed" detail="The scenario has no sump forecasts to compare." icon={<Activity size={16} />} />
          ) : (
            <div className="p-2">
              <Heatmap
                xLabels={analytics.sensitivity.map((point) => point.label)}
                yLabels={analytics.sensitivity[0].sumps.map((row) => row.sumpName.replace(' Sump ', ' '))}
                data={heatmapData}
                max={72}
                unit="h to critical"
                height={220}
              />
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">illustrative, model-derived</span>}>
            Pump reliability signals
          </PanelTitle>
          <TableShell>
            <thead>
              <tr>
                <Th>Machine</Th>
                <Th align="right">Health</Th>
                <Th align="right">Availability</Th>
                <Th align="right">MTBF</Th>
                <Th>Recommendation</Th>
              </tr>
            </thead>
            <tbody>
              {analytics.reliability.map((row) => (
                <tr key={row.pumpId} className="hover:bg-ink-800/50">
                  <Td>
                    <button onClick={() => selectAsset({ assetId: row.pumpId })} className="text-left hover:text-signal-cyanBright">
                      {row.pumpName}
                    </button>
                  </Td>
                  <Td align="right" className={cx('num', row.healthPct < 80 ? 'text-signal-amber' : 'text-ink-200')}>{row.healthPct.toFixed(0)}%</Td>
                  <Td align="right" className="num">Not calibrated</Td>
                  <Td align="right" className="num">Unsupported</Td>
                  <Td className="max-w-[220px] text-2xs text-ink-400">{row.recommendation}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      </div>
    </div>
  );
}
