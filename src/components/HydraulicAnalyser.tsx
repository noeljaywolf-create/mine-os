import { useMemo, useState } from 'react';
import { Badge, Button, Field, Notice, Panel, Range, Select, Metric, MetricGrid, MetricCell } from '../design-system';
import { useActiveScenario, useDerived, useDisplayWorld } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { curveSamples, defaultPipe, effectivePipe, type CurvePump } from '../simulation/hydraulics';
import { EChart } from './EChart';
import { EngineeringBasis } from './EngineeringBasis';
import type { EChartsOption } from 'echarts';

export function HydraulicAnalyser() {
  const mine = useMineStore(s => s.mine);
  const selected = useMineStore(s => s.selection.assetId);
  const select = useMineStore(s => s.selectAsset);
  const patch = useMineStore(s => s.applyEngineeringOverrides);
  const branch = useMineStore(s => s.createScenarioBranch);
  const replay = useMineStore(s => s.replayActive);
  const scenario = useActiveScenario();
  const world = useDisplayWorld();
  const derived = useDerived();
  const [message, setMessage] = useState('');
  const pump = mine.pumps.find(p => p.id === selected) ?? mine.pumps.find(p => p.id === 'pmp-201')!;
  const state = derived.pumpStates[pump.id];
  const scenarioInputs = replay ? world.scenarioSnapshot ?? scenario.overrides : scenario.overrides;
  const pipe = { ...defaultPipe(mine.pumps.find(p => p.sumpId === pump.sumpId)!), ...scenarioInputs.engineering?.pipes?.[pump.sumpId] };
  const plotPipe = effectivePipe(mine, scenarioInputs, pump.sumpId, world.sumps);
  const curves = mine.pumps.filter(p => p.sumpId === pump.sumpId && derived.pumpStates[p.id].mode === 'running' && derived.pumpStates[p.id].powered)
    .map(p => ({ ratedFlowM3h: p.ratedFlowM3h, ratedHeadM: p.ratedHeadM,
      efficiency: scenarioInputs.pumpOverrides[p.id]?.efficiency ?? p.efficiency,
      speedRatio: derived.pumpStates[p.id].hydraulic?.effectiveSpeedRatio ?? scenarioInputs.pumpOverrides[p.id]?.speedRatio ?? 1,
      health: scenarioInputs.pumpOverrides[p.id]?.health ?? p.health,
      curveScale: scenarioInputs.pumpOverrides[p.id]?.curveScale ?? 1 } satisfies CurvePump));
  const series = curveSamples(curves, plotPipe, mine.pumps.filter(p => p.sumpId === pump.sumpId).reduce((q, p) => q + p.ratedFlowM3h, 0) * 1.3);
  const stationFlow = mine.pumps.filter(p => p.sumpId === pump.sumpId).reduce((q, p) => q + (derived.pumpStates[p.id].dischargeContributionM3h ?? 0), 0);
  const option = useMemo<EChartsOption>(() => ({ backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' }, legend: { textStyle: { color: '#a5b4c5' } },
    grid: { left: 65, right: 25, top: 40, bottom: 50 },
    xAxis: { type: 'value', name: 'Q m³/h', nameLocation: 'middle', nameGap: 30, axisLabel: { color: '#8291a4' } },
    yAxis: { type: 'value', name: 'Head m', axisLabel: { color: '#8291a4' }, max: Math.max(...series.map(p => p.pumpHeadM), pipe.staticHeadM * 1.5) * 1.2 },
    series: [{ name: 'Combined station pump curve', type: 'line', showSymbol: false, data: series.map(p => [p.flowM3h, p.pumpHeadM]), lineStyle: { color: '#6fd3e6' } },
      { name: 'Shared-main system curve', type: 'line', showSymbol: false, data: series.map(p => [p.flowM3h, p.systemHeadM]), lineStyle: { color: '#df9a38' } },
      { name: 'Calculated station duty', type: 'scatter', symbolSize: 12, data: state.hydraulic?.status === 'solved' ? [[stationFlow, state.hydraulic.headM]] : [], itemStyle: { color: '#48d597' } }] }), [series, stationFlow, state.hydraulic, pipe.staticHeadM]);
  const editable = !scenario.isBaseline && !replay;
  const apply = (p: Parameters<typeof patch>[0]) => setMessage(patch(p).message);
  const changePipe = (p: Partial<typeof pipe>) => apply({ engineering: { pipes: { [pump.sumpId]: { ...pipe, ...p } } } });
  return <Panel className="mt-2 p-3">
    <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="label-micro">Hydraulic engineering laboratory</h2>
      <Badge tone={state.hydraulic?.status === 'solved' ? 'green' : 'amber'}>{state.hydraulic?.status ?? 'unsupported'}</Badge>
      <output data-testid="pump-operating-flow" className="font-mono text-xs text-ink-300">{state.flowM3h.toFixed(3)} m³/h</output>
      <EngineeringBasis assetId={pump.id} />
      {scenario.isBaseline && <Button size="xs" onClick={() => branch({ name: 'Hydraulic engineering branch', description: 'Interactive shared-state engineering evaluation.', hypothesis: 'Pump/system duty changes with resistance and available supply.' })}>Create editable branch</Button>}
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div><Field label="Pump / train"><Select value={pump.id} onChange={e => select({ assetId: e.target.value, sumpId: mine.pumps.find(p => p.id === e.target.value)?.sumpId ?? null })}>{mine.pumps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <EChart option={option} height={300} />
        <MetricGrid cols={4}><MetricCell><Metric label="Selected pump flow" value={state.flowM3h.toFixed(1)} unit="m³/h" /></MetricCell>
          <MetricCell><Metric label="Station head" value={(state.hydraulic?.headM ?? 0).toFixed(1)} unit="m" /></MetricCell>
          <MetricCell><Metric label="Input power" value={state.powered && state.hydraulic?.status !== 'solved' ? 'Not modelled' : state.powerKw.toFixed(1)} unit="kW" /></MetricCell>
          <MetricCell><Metric label="Estimated η" value={((state.hydraulic?.efficiency ?? 0) * 100).toFixed(1)} unit="%" /></MetricCell></MetricGrid>
        <p className="mt-2 text-xs text-ink-400">Hydraulic power {(state.hydraulic?.hydraulicPowerKw ?? 0).toFixed(2)} kW · head residual {state.hydraulic?.residualM?.toExponential(2) ?? 'no solution'} m · effective speed {(state.hydraulic?.effectiveSpeedRatio ?? 0).toFixed(3)}.</p>
        <p className="mt-1 text-xs text-signal-amber">{state.statusReason}</p>
      </div>
      <fieldset disabled={!editable} className="space-y-3 disabled:opacity-60">
        <Range label="Speed / rated" min={0.5} max={1.2} step={0.01} value={scenarioInputs.pumpOverrides[pump.id]?.speedRatio ?? 1} onChange={v => apply({ pumpOverrides: { [pump.id]: { speedRatio: v } } })} />
        <Range label="Characteristic condition" min={0.2} max={1} step={0.01} value={scenarioInputs.pumpOverrides[pump.id]?.health ?? pump.health} onChange={v => apply({ pumpOverrides: { [pump.id]: { health: v } } })} />
        <Range label="Wire-to-water efficiency assumption" min={0.3} max={0.9} step={0.01} value={scenarioInputs.pumpOverrides[pump.id]?.efficiency ?? pump.efficiency} onChange={v => apply({ pumpOverrides: { [pump.id]: { efficiency: v } } })} />
        <Range label="Additional suction loss coefficient K" min={0} max={80} step={1} value={scenarioInputs.pumpOverrides[pump.id]?.suctionK ?? 0} onChange={v => apply({ pumpOverrides: { [pump.id]: { suctionK: v } } })} />
        <Range label="Main diameter (m)" min={0.1} max={0.4} step={0.01} value={pipe.diameterM} onChange={v => changePipe({ diameterM: v })} />
        <Range label="Main length (m)" min={50} max={2000} step={10} value={pipe.lengthM} onChange={v => changePipe({ lengthM: v })} />
        <Range label="Valve opening fraction" min={0} max={1} step={0.05} value={pipe.valveOpen} onChange={v => changePipe({ valveOpen: v })} />
        <Range label="Backpressure (kPa)" min={0} max={500} step={10} value={pipe.backPressureKpa} onChange={v => changePipe({ backPressureKpa: v })} />
        <Field label="Station configuration"><Select value={pipe.configuration} onChange={e => changePipe({ configuration: e.target.value as 'series' | 'parallel' })}><option value="parallel">Parallel shared main</option><option value="series">Series heads (hypothetical repiping)</option></Select></Field>
        <Field label="Controlled discharge routing"><Select value={pipe.destinationSumpId ?? ''} onChange={e => changePipe({ destinationSumpId: e.target.value || null })}><option value="">Intermediate boundary reservoir</option>{mine.sumps.filter(s => s.floorElevationM > mine.sumps.find(s => s.id === pump.sumpId)!.floorElevationM).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <div className="flex gap-1"><Button size="xs" onClick={() => apply({ pumpOverrides: { [pump.id]: { mode: 'running' } } })}>Start</Button><Button size="xs" onClick={() => apply({ pumpOverrides: { [pump.id]: { mode: 'stopped' } } })}>Stop</Button></div>
      </fieldset>
    </div>
    {message && <p role="status" className="mt-2 text-xs text-signal-cyanBright">{message}</p>}
    <Notice tone="amber" title="Engineering model boundaries">Synthetic pump curves and intermediate reservoir lifts; no manufacturer or field validation. Clean-water steady-state Darcy–Weisbach with Haaland (turbulent), 64/Re (laminar); transitional final duty is rejected. VSD speed limiting is assumed. Series repiping, NPSH, transients and physical switch approval require engineering review.</Notice>
  </Panel>;
}
