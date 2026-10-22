import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Droplets, PauseCircle, PlayCircle, TimerReset } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { ForecastChart } from '../components/charts';
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
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useAssumptions, useDerived, useForecasts, useRun, useSimClock } from '../store/hooks';
import { useMineStore as useStore } from '../store/mineStore';
import { formatDurationHours, formatFlow, formatLevel, formatTimestamp, formatVolume } from '../domain/units';
import type { PumpMode } from '../domain/types';

export function Dewatering() {
  const mine = useStore((s) => s.mine);
  const world = useRun().world;
  const derived = useDerived();
  const forecasts = useForecasts();
  const clock = useSimClock();
  const assumptions = useAssumptions();
  const setPumpMode = useStore((s) => s.setPumpMode);
  const selectAsset = useStore((s) => s.selectAsset);
  const selectedSump = useStore((s) => s.selection.sumpId);
  const [sumpId, setSumpId] = useState(selectedSump ?? mine.sumps[0].id);

  useEffect(() => {
    if (selectedSump) setSumpId(selectedSump);
  }, [selectedSump]);

  const sump = mine.sumps.find((item) => item.id === sumpId)!;
  const state = world.sumps[sumpId];
  const forecast = forecasts[sumpId];
  const pumps = mine.pumps.filter((pump) => pump.sumpId === sumpId);
  const sensors = mine.sensors.filter((sensor) => sensor.assetId === sumpId || pumps.some((pump) => pump.id === sensor.assetId));
  const available = pumps.reduce((sum, pump) => sum + (derived.pumpStates[pump.id]?.availableFlowM3h ?? 0), 0);
  const delivering = pumps.reduce((sum, pump) => sum + (derived.pumpStates[pump.id]?.flowM3h ?? 0), 0);
  const standby = pumps.reduce((sum, pump) => {
    const pumpState = derived.pumpStates[pump.id];
    return sum + (pumpState?.mode === 'standby' && !pumpState.unavailable ? pumpState.availableFlowM3h : 0);
  }, 0);

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.dewatering}
        actions={
          <>
            <Link to="/app/energy" className="text-[10px] text-ink-400 hover:text-ink-100">power demand →</Link>
            <Link to="/app/impact" className="text-[10px] text-ink-400 hover:text-ink-100">production impact →</Link>
            <Link
              to="/app/scenarios"
              className="inline-flex items-center gap-1 rounded-[2px] border border-signal-cyan/40 bg-signal-cyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-signal-cyanBright"
            >
              <ArrowUpRight size={10} /> Branch scenario
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1">
          {mine.sumps.map((item) => {
            const itemState = world.sumps[item.id];
            const itemForecast = forecasts[item.id];
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSumpId(item.id);
                  selectAsset({ assetId: item.id, sumpId: item.id });
                }}
                className={cx(
                  'flex items-center gap-1.5 rounded-[2px] border px-2 py-1 text-[10.5px]',
                  item.id === sumpId
                    ? 'border-signal-cyan/50 bg-signal-cyan/10 text-ink-50'
                    : 'border-[color:var(--hairline)] text-ink-400 hover:text-ink-100',
                )}
              >
                <span>{item.name}</span>
                <span className="font-mono text-[9px] text-ink-500">{formatLevel(itemState.levelM)}</span>
                {itemForecast?.timeToCriticalHours != null && (
                  <Badge tone={itemForecast.timeToCriticalHours < 6 ? 'red' : 'amber'}>
                    {formatDurationHours(itemForecast.timeToCriticalHours)}
                  </Badge>
                )}
              </button>
            );
          })}
          <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
            {formatTimestamp(clock.atMs)}
          </span>
        </div>
      </ModuleHeader>

      <MetricGrid cols={5}>
        <MetricCell>
          <Metric
            label="Water level"
            value={formatLevel(state.levelM)}
            hint={`${state.fillRatio * 100 > 100 ? 100 : (state.fillRatio * 100).toFixed(0)}% of ${sump.capacityM3.toFixed(0)} m³`}
            tone={state.breach ? 'red' : 'neutral'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Net accumulation"
            value={formatFlow(state.inflowM3h - state.outflowM3h)}
            hint={`in ${state.inflowM3h.toFixed(0)} · out ${state.outflowM3h.toFixed(0)} m³/h`}
            tone={state.inflowM3h > state.outflowM3h ? 'amber' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Installed capability"
            value={formatFlow(available)}
            hint={`${formatFlow(delivering)} delivering · ${formatFlow(standby)} standby`}
            tone={available < state.inflowM3h ? 'red' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Central critical ETA"
            value={forecast.timeToCriticalHours == null ? 'No crossing' : formatDurationHours(forecast.timeToCriticalHours)}
            hint={`pessimistic ${forecast.timeToCriticalPessimisticHours == null ? '—' : formatDurationHours(forecast.timeToCriticalPessimisticHours)}`}
            tone={forecast.timeToCriticalHours != null && forecast.timeToCriticalHours < 6 ? 'red' : 'green'}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Forecast confidence"
            value={`${(forecast.confidence * 100).toFixed(0)}%`}
            hint={forecast.degradedByInstrumentation ? 'degraded by stale tags' : 'all contributing tags live'}
            tone={forecast.confidence < 0.8 ? 'amber' : 'green'}
          />
        </MetricCell>
      </MetricGrid>

      {forecast.degradedByInstrumentation && (
        <Notice tone="amber" title="Forecast degraded by instrumentation" icon={<TimerReset size={13} />} >
          At least one contributing tag is stale or offline. The uncertainty band widens and confidence is discounted.
          Restore the tag in the inspector before treating this projection as decision-grade.
        </Notice>
      )}

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelTitle
            right={
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-ink-500">{forecast.points.length} points · central + band</span>
              </div>
            }
          >
            {sump.name} · projected water level
          </PanelTitle>
          <div className="p-2">
            <ForecastChart points={forecast.points} thresholds={sump.thresholds} height={280} />
          </div>
          <div className="border-t border-[color:var(--hairline)] px-3 py-2">
            <div className="label-micro mb-1.5">Threshold crossings</div>
            <TableShell>
              <thead>
                <tr>
                  <Th>Threshold</Th>
                  <Th>Severity</Th>
                  <Th align="right">Central</Th>
                  <Th align="right">Pessimistic</Th>
                  <Th align="right">Band at horizon</Th>
                </tr>
              </thead>
              <tbody>
                {forecast.thresholdCrossings.map((crossing) => (
                  <tr key={crossing.thresholdId}>
                    <Td>{crossing.label}</Td>
                    <Td><Badge tone={crossing.severity === 'critical' ? 'red' : crossing.severity === 'warning' ? 'amber' : 'neutral'}>{crossing.severity}</Badge></Td>
                    <Td align="right" className="num">
                      {crossing.atMs ? formatTimestamp(crossing.atMs) : 'not in horizon'}
                    </Td>
                    <Td align="right" className="num">
                      {crossing.pessimisticAtSec ? formatDurationHours(crossing.pessimisticAtSec / 3600) : '—'}
                    </Td>
                    <Td align="right" className="num">±{crossing.uncertaintyPct.toFixed(0)}%</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{pumps.length} machines</span>}>
              Pumping capability
            </PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {pumps.map((pump) => {
                const pumpState = derived.pumpStates[pump.id];
                const assetState = derived.assetStates[pump.id];
                return (
                  <div key={pump.id} className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => selectAsset({ assetId: pump.id })} className="truncate text-[11.5px] text-ink-100 hover:text-signal-cyanBright">
                        {pump.name}
                      </button>
                      <Badge tone={pumpState.powered ? (pumpState.unavailable ? 'amber' : 'green') : 'red'}>
                        {pumpState.powered ? pumpState.mode : 'no supply'}
                      </Badge>
                      <span className="ml-auto font-mono text-[9px] text-ink-500">{pump.id}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[9.5px] text-ink-400">
                      <span>flow {pumpState.flowM3h.toFixed(0)}</span>
                      <span>avail {pumpState.availableFlowM3h.toFixed(0)}</span>
                      <span>{pumpState.powerKw.toFixed(0)} kW</span>
                    </div>
                    <Progress
                      value={(pumpState.flowM3h / Math.max(1, pump.ratedFlowM3h)) * 100}
                      tone={pumpState.flowM3h === 0 ? 'red' : pumpState.flowM3h < pump.ratedFlowM3h * 0.6 ? 'amber' : 'cyan'}
                      className="mt-1"
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[9px] text-ink-500">{assetState?.statusReason}</span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Start pump"
                          onClick={() => setPumpMode(pump.id, 'running')}
                          disabled={pumpState.mode === 'running'}
                        >
                          <PlayCircle size={11} />
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Set standby"
                          onClick={() => setPumpMode(pump.id, 'standby')}
                          disabled={pumpState.mode === 'standby' || !pumpState.powered}
                        >
                          <PauseCircle size={11} />
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Stop pump"
                          onClick={() => setPumpMode(pump.id, 'stopped' as PumpMode)}
                          disabled={pumpState.mode === 'stopped'}
                        >
                          <PauseCircle size={11} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Balance and evidence</PanelTitle>
            <div className="px-3 py-2">
              <KeyValue label="Stored volume" value={formatVolume(state.volumeM3)} />
              <KeyValue label="Capacity" value={formatVolume(sump.capacityM3)} />
              <KeyValue label="Assumed outflow" value={formatFlow(forecast.assumedOutflowM3h)} />
              <KeyValue label="Floor elevation" value={`${sump.floorElevationM} m`} />
              <KeyValue label="Plan area" value={`${sump.areaM2} m²`} />
              <KeyValue label="Forecast horizon" value={`${assumptions.forecastHorizonHours} h`} />
            </div>
            <div className="border-t border-[color:var(--hairline)] px-3 py-2">
              <div className="label-micro mb-1.5">Contributing tags</div>
              <div className="space-y-1">
                {forecast.contributingSensors.map((contributor) => {
                  const sensor = sensors.find((item) => item.id === contributor.sensorId);
                  return (
                    <div key={contributor.sensorId} className="flex items-center gap-1.5 font-mono text-[9.5px]">
                      <span className="truncate text-ink-300">{sensor?.name ?? contributor.sensorId}</span>
                      <Badge tone={contributor.freshness === 'live' ? 'green' : contributor.freshness === 'stale' ? 'amber' : 'red'}>
                        {contributor.freshness}
                      </Badge>
                      <span className="ml-auto text-ink-500">w {contributor.weight.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Why this forecast moves</PanelTitle>
            <ul className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <li>· Level integrates inflow minus outflow every {(100 / 60).toFixed(0)}-second model step, clamped to capacity.</li>
              <li>· Inflow is sensor-derived; the multiple in the scenario override sits on top.</li>
              <li>· Outflow is limited by pump health, head and electrical availability — not by a nameplate number.</li>
              <li>· The band is a modelled envelope, not a statistical confidence interval, and it is not a percentage of the sump.</li>
            </ul>
            <div className="flex items-center gap-2 border-t border-[color:var(--hairline)] px-3 py-2 text-[10px]">
              <Droplets size={12} className="text-signal-cyanBright" />
              <span className="text-ink-400">Cross-check in</span>
              <Link to="/app/forecast" className="text-signal-cyanBright hover:underline">Forecast &amp; Reliability</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
