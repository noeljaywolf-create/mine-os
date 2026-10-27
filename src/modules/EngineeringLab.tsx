import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Field, Metric, MetricCell, MetricGrid, Notice, Panel, Range, Select, TableShell, Td, Th } from '../design-system';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader } from '../components/ModuleHeader';
import { HydraulicAnalyser } from '../components/HydraulicAnalyser';
import { EngineeringTwins } from '../components/EngineeringTwins';
import { EngineeringBasis } from '../components/EngineeringBasis';
import { MaterialHandlingPanel } from '../components/MaterialHandlingPanel';
import { ForecastChart } from '../components/charts';
import { useActiveScenario, useContext, useDisplayWorld, useEngineeringAnalysis } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { strategyObjectives, STRESS_CASES } from '../simulation/engineeringStudies';
import { AnalysisLoading } from '../components/AnalysisFeedback';
import { CHALLENGES, CHALLENGE_DIFFICULTIES, challengeDefinition, challengeScore, EMPTY_REASONING, inspectionCost, investigate, MEASUREMENTS, type Measurement, type DiagnosticObservation, type ChallengeReasoning } from '../simulation/investigation';
import { ChallengeReasoningForm } from '../components/ChallengeReasoningForm';
import { challengeBasis, diagnosticBasis, investmentBasis, recoveryBasis } from '../simulation/analysisEvidence';
import { proofCoverage } from '../simulation/proofCoverage';
import { VALIDATION_REGISTER } from '../simulation/validation';
import { MODEL_VERSION, type TelemetryFault } from '../domain/engineering';
import type { ScenarioOverride } from '../domain/types';
import { engineeringRelationships } from '../simulation/dependencyModel';
import { evidenceQualityReport } from '../simulation/sensors';
import { engineeringBasis } from '../simulation/engineeringEvidence';

const TABS = [ ['hydraulics', 'Hydraulic laboratory'], ['resilience', 'Joint failure / stress'], ['investigation', 'Failure investigation'],
  ['comparison', 'Intervention comparison'], ['investment', 'Investment planning'], ['challenge', 'Engineer challenges'], ['validation', 'Model validation'] ];

export function EngineeringLab() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') ?? 'hydraulics';
  const [presentation, setPresentation] = useState<'engineering' | 'executive'>('engineering');
  const world = useDisplayWorld();
  const mine = useMineStore(s => s.mine);
  return <div>
    <ModuleHeader module={MODULE_BY_ID.engineering} actions={<Button size="sm" onClick={() => setPresentation(p => p === 'engineering' ? 'executive' : 'engineering')}>{presentation === 'engineering' ? 'Executive presentation' : 'Senior engineering presentation'}</Button>}>
      <p className="text-xs text-ink-400">{MODEL_VERSION} · coherent power → hydraulics → storage → access → production model. All inputs and observations are synthetic.</p>
    </ModuleHeader>
    <div className="my-2 flex flex-wrap gap-1">{TABS.map(([id, label]) => <Button key={id} size="xs" variant={tab === id ? 'primary' : 'outline'} onClick={() => setParams({ view: id })}>{label}</Button>)}</div>
    {presentation === 'executive' && <Panel className="mb-3 p-3">
      <h2 className="label-micro">Executive causal briefing — same underlying numerical state</h2>
      <p className="mt-2 text-sm text-ink-200">{Object.values(world.feeders).filter(f => f.supplyRatio === 0).length} feeder paths without usable supply; {Object.values(world.pumps).filter(p => !p.powered).length} pumps without allocated power.</p>
      <p className="mt-2 text-xs text-ink-300">{Object.values(world.sumps).filter(s => s.inflowM3h > s.outflowM3h).length} sumps accumulating water. Storage evolves before water-induced access restrictions; stockpiles can delay processing consequences.</p>
      <p className="mt-2 text-xs text-ink-300">Deferred processing {(world.deferredTonnes ?? 0).toFixed(1)} t; buffer {(world.oreBufferTonnes ?? 0).toFixed(1)} t. Permanent losses are not determined. Compare interventions and residual risks below.</p>
      <EngineeringBasis assetId="zone-north" />
    </Panel>}
    {tab === 'hydraulics' && <><HydraulicAnalyser /><EngineeringTwins /></>}
    {tab === 'resilience' && <ResilienceLab />}
    {tab === 'investigation' && <InvestigationWorkbench />}
    {tab === 'comparison' && <Suspense fallback={<AnalysisLoading label="Comparing recovery strategies" />}><ComparisonCentre /></Suspense>}
    {tab === 'investment' && <Suspense fallback={<AnalysisLoading label="Evaluating infrastructure investments" />}><InvestmentLab /></Suspense>}
    {tab === 'challenge' && <ChallengeLab />}
    {tab === 'validation' && <Panel className="p-3"><h2 className="label-micro">Model-validation register</h2>
      <Notice tone="amber" title="Software verification is not field validation">The fixtures exercise the implementation, not a real mine. No field calibration, engineering certification or commissioned system is claimed. Execute npm test for current local test results; this register is not a live CI feed.</Notice>
      <TableShell><thead><tr><Th>Model</Th><Th>Status</Th><Th>Verification basis</Th><Th>Limits</Th></tr></thead><tbody>{VALIDATION_REGISTER.map(v => <tr key={v.model}><Td>{v.model}</Td><Td>{v.status}</Td><Td>{v.basis}</Td><Td>{v.limits}</Td></tr>)}</tbody></TableShell>
      <ProofCoverageDashboard />
      <h3 className="label-micro my-3">Typed industrial relationship register</h3>
      <TableShell><thead><tr><Th>From → to</Th><Th>Relationship</Th><Th>Conditional consequence</Th><Th>Implementation</Th></tr></thead><tbody>{engineeringRelationships(mine).map((r, i) => <tr key={i}><Td>{r.from} → {r.to}</Td><Td>{r.kind}</Td><Td>{r.condition}</Td><Td>{r.evaluator}</Td></tr>)}</tbody></TableShell>
    </Panel>}
  </div>;
}

function ResilienceLab() {
  const store = useMineStore();
  const scenario = useActiveScenario();
  const world = useDisplayWorld();
  const [sumpId, setSump] = useState('smp-201');
  const [message, setMessage] = useState('');
  const editable = !scenario.isBaseline && !store.replayActive && !store.advanceTask;
  const e = scenario.overrides.engineering ?? {};
  const apply = (p: Partial<ScenarioOverride>) => setMessage(store.applyEngineeringOverrides(p).message);
  const initiate = () => {
    if (scenario.isBaseline) store.createScenarioBranch({ name: 'Electrical disruption / dewatering crisis', description: 'Joint failure engineering demonstration.', hypothesis: 'Loss of F-02 causes delayed storage and access consequences.', overrides: { feederOverrides: { 'fdr-02': { status: 'failed' } } } });
    else apply({ feederOverrides: { 'fdr-02': { status: 'failed' } } });
  };
  return <>
    <Panel className="p-3"><h2 className="label-micro">Electrical disruption creates a dewatering crisis</h2>
      <div className="my-3 flex flex-wrap gap-2"><Button disabled={Boolean(store.advanceTask)} onClick={initiate}>Initiate Simulated Feeder Failure</Button><Button disabled={!editable} onClick={() => { void store.runForAsync(3600); }}>Advance simulation 1 h</Button><Button disabled={!editable} onClick={() => apply({ feederOverrides: { 'fdr-02': { status: 'energised' } }, engineering: { restoreAtSec: null } })}>Restore F-02 now</Button></div>
      <fieldset disabled={!editable} className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3"><Field label="Inflow source / storage"><Select value={sumpId} onChange={ev => setSump(ev.target.value)}>{store.mine.sumps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Range label="Groundwater inflow multiplier" min={0.2} max={4} step={0.1} value={scenario.overrides.sumpOverrides[sumpId]?.inflowMultiplier ?? 1} onChange={v => apply({ sumpOverrides: { [sumpId]: { inflowMultiplier: v } } })} />
          <Range label="Rainfall multiplier" min={1} max={4} step={0.1} value={scenario.overrides.assumptions.rainfallScenarioMultiplier ?? store.baseAssumptions.rainfallScenarioMultiplier} onChange={v => apply({ assumptions: { rainfallScenarioMultiplier: v } })} />
        </div>
        <div className="space-y-3"><Button size="xs" onClick={() => apply({ engineering: { utilityAvailable: e.utilityAvailable === false } })}>Utility: {e.utilityAvailable === false ? 'unavailable' : 'available'}</Button>
          <Button size="xs" onClick={() => apply({ engineering: { generatorAvailable: e.generatorAvailable === false } })}>Generator: {e.generatorAvailable === false ? 'unavailable' : 'available'}</Button>
          <Range label="Backup capacity (kW)" min={0} max={1000} step={25} value={e.backupCapacityKw ?? 250} onChange={v => apply({ engineering: { backupCapacityKw: v } })} />
          <Button size="xs" onClick={() => apply({ engineering: { backupConnected: !e.backupConnected, switchingApproved: !e.backupConnected } })}>{e.backupConnected ? 'Disconnect backup' : 'Set reviewed switching prerequisite / connect backup'}</Button>
          <p className="text-xs text-ink-500">A damaged feeder still needs independent distribution. A generator alone does not repair the path.</p>
        </div>
        <div className="space-y-3"><Range label="Production / services fraction" min={0} max={1} step={0.1} value={e.productionLoadScale ?? 1} onChange={v => apply({ engineering: { productionLoadScale: v } })} />
          <Range label="Planned daily shift hours (relative to scenario start)" min={0} max={24} step={1} value={e.plannedShiftHours ?? 24} onChange={v => apply({ engineering: { plannedShiftHours: v } })} />
          <Range label="Required conditional standby reserve" min={0} max={2} step={1} value={e.requiredReservePumps ?? 0} onChange={v => apply({ engineering: { requiredReservePumps: v } })} />
          <Range label="Energy tariff / peak period assumption (USD/kWh)" min={0.05} max={0.5} step={0.01} value={scenario.overrides.assumptions.energyTariffUSDPerKwh ?? store.baseAssumptions.energyTariffUSDPerKwh} onChange={v => apply({ assumptions: { energyTariffUSDPerKwh: v } })} />
          <p className="text-xs text-ink-400">Reserve and motor constraints are re-evaluated when duty changes. This curtailment requires operational permission in a real mine.</p>
          <EngineeringBasis assetId={sumpId} /><EngineeringBasis assetId="zone-north" />
        </div>
      </fieldset>
      <p role="status" className="my-2 text-xs text-signal-cyanBright">{message}</p>
      <output data-testid="north-sump-volume" className="font-mono text-xs text-ink-300">North sump {world.sumps['smp-201'].volumeM3.toFixed(3)} m³</output>
      <h3 className="label-micro">Combined stress presets — create isolated scenario</h3><div className="mt-2 flex flex-wrap gap-1">{STRESS_CASES.map(c => <Button key={c.label} size="xs" onClick={() => store.createScenarioBranch({ name: c.label, description: 'Combined disruption stress test.', hypothesis: c.label, overrides: c.patch })}>{c.label}</Button>)}</div>
      <p className="mt-3 text-xs text-ink-400">Common-cause failure: P-201 and P-202 share F-02. Reserve equipment does not provide electrical diversity. Sump and pipeline bottlenecks are numerical constraints, not risk scores.</p>
      <MetricGrid cols={3}><MetricCell><Metric label="Site mass residual" value={(world.waterLedger?.residualM3 ?? 0).toExponential(2)} unit="m³" /></MetricCell><MetricCell><Metric label="Last-step overflow" value={(world.waterLedger?.overflowM3 ?? 0).toFixed(2)} unit="m³" /></MetricCell><MetricCell><Metric label="Plant buffer" value={(world.oreBufferTonnes ?? 0).toFixed(0)} unit="t" /></MetricCell></MetricGrid>
      <div className="my-3 flex flex-wrap gap-2"><EngineeringBasis assetId="site:water" /><EngineeringBasis assetId="site:power" /><EngineeringBasis assetId="site:production" /></div>
    </Panel>
    <EngineeringTwins /><MaterialHandlingPanel /><Suspense fallback={<AnalysisLoading label="Comparing recovery strategies" />}><ComparisonCentre /></Suspense>
  </>;
}

function ComparisonCentre() {
  const ctx = useContext(); const scenario = useActiveScenario(); const world = useDisplayWorld();
  const apply = useMineStore(s => s.applyEngineeringOverrides);
  const readOnly = useMineStore(s => s.replayActive || Boolean(s.advanceTask));
  const [delay, setDelay] = useState(2); const [message, setMessage] = useState('');
  const [search, setSearch] = useState(false); const [sensitivity, setSensitivity] = useState(false);
  const [focus, setFocus] = useState('none');
  const results = useEngineeringAnalysis('comparison', { delay })!;
  const duty = useEngineeringAnalysis('duty', {}, search) ?? [];
  const selected = results.find(r => r.strategy.id === focus) ?? results[0];
  const { minCost, minExposure, fastest } = strategyObjectives(results);
  const sensitivityResults = useEngineeringAnalysis('strategy-sensitivity', { strategy: selected.strategy }, sensitivity) ?? [];
  const report = () => {
    const blob = new Blob([JSON.stringify({ model: MODEL_VERSION, atSimSec: world.clock.elapsedSec, assumptions: ctx.assumptions,
      scenario, currentWorld: world, results: results.map(({ frames: _frames, ...r }) => r), validation: VALIDATION_REGISTER,
      proofs: proofCoverage(ctx.mine, scenario, world).rows.map(a => engineeringBasis(ctx.mine, scenario, world, a.id)),
      studyProofs: results.map(r => recoveryBasis(r, ctx.assumptions)), coverage: proofCoverage(ctx.mine, scenario, world),
      limitation: 'Planning evidence only; no certified safe strategy or approved intervention.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mine-os-engineering-evidence.json'; a.click(); URL.revokeObjectURL(url);
  };
  return <Panel className="mt-2 p-3"><div className="flex flex-wrap items-center gap-2"><h2 className="label-micro">Constrained intervention comparison · 6 h matched horizon</h2><Button size="xs" onClick={report}>Export engineering evidence report</Button></div>
    <div className="my-3 max-w-sm"><Range label="Engineer-defined recovery delay (hours)" min={0} max={6} step={0.25} value={delay} onChange={setDelay} /></div>
    <p className="my-2 text-xs leading-relaxed text-ink-300">Recovery means at least 95% zone and plant throughput, storage below warning and non-growing per sump, sustained for 15 minutes. Times are sampled; “not confirmed” means no qualifying window within this horizon.</p>
    <TableShell><thead><tr><Th>Strategy / objective</Th><Th>Achieved recovery</Th><Th>Energy / response cost</Th><Th>Deferred processing</Th><Th>Critical exposure</Th><Th>Constraint checks</Th><Th>Evaluate</Th></tr></thead><tbody>{results.map(r => <tr key={r.strategy.id}>
      <Td>{r.strategy.label}<div className="mt-1 flex flex-wrap gap-1">{r.feasible && r.costUSD === minCost && <Badge tone="cyan">Lowest estimated cost</Badge>}{r.feasible && r.exposureHours === minExposure && <Badge tone="green">Lowest threshold exposure</Badge>}{r.strategy.id === fastest && <Badge tone="blue">Fastest achieved recovery</Badge>}</div></Td>
      <Td>{r.recovery.achievedAtHours === null ? 'Not confirmed within 6 h' : `${r.recovery.achievedAtHours.toFixed(2)} h onset · confirmed ${r.recovery.confirmedAtHours!.toFixed(2)} h`}<br />Resolution {r.recovery.resolutionSec} s</Td>
      <Td>${r.costUSD.toFixed(0)} · {r.energyKwh.toFixed(1)} kWh</Td><Td>{r.deferredTonnes.toFixed(1)} t<br />${r.revenueExposureUSD.toFixed(0)} value exposure</Td><Td>{r.exposureHours.toFixed(2)} h</Td>
      <Td><Badge tone={r.feasible ? 'green' : 'amber'}>{r.feasible ? 'Model constraints pass' : 'Rejected / prerequisite unmet'}</Badge>{r.violations.map(v => <p key={v} className="mt-1 text-[10px]">{v}</p>)}</Td>
      <Td><Button size="xs" onClick={() => setFocus(r.strategy.id)}>Inspect</Button><EngineeringBasis assetId="analysis:recovery" providedBasis={recoveryBasis(r, ctx.assumptions)} /><Button size="xs" disabled={scenario.isBaseline || readOnly || !r.feasible || r.strategy.id === 'none' || r.frames[0].clock.elapsedSec !== world.clock.elapsedSec} onClick={() => setMessage(apply(r.strategy.patch).message)}>Apply inputs</Button></Td>
    </tr>)}</tbody></TableShell>
    <p role="status" className="text-xs text-signal-cyanBright">{message}</p>
    <div className="my-3 grid gap-3 md:grid-cols-2"><div><h3 className="label-micro">{selected.strategy.label} · prerequisites / remaining risks</h3>
      {[...selected.strategy.prerequisites, ...selected.strategy.risks].map(s => <p key={s} className="mt-1 text-xs text-ink-300">{s}</p>)}<p className="mt-1 text-xs text-ink-400">Response resource assumption ${selected.strategy.resourceCostUSD}; energy tariff ${ctx.assumptions.energyTariffUSDPerKwh}/kWh. Lost tonnes are deferred, not confirmed permanent losses. Whole-horizon source/storage assumptions apply.</p>
      <Button size="xs" onClick={() => setSensitivity(s => !s)}>Toggle ±20% inflow sensitivity</Button>{sensitivityResults.map((r, i) => <div key={i} className="my-2 text-xs text-ink-300">{i ? '120%' : '80%'} inflow: {r.deferredTonnes.toFixed(1)} deferred t, {r.exposureHours.toFixed(2)} critical h, ${r.costUSD.toFixed(0)} cost. <EngineeringBasis assetId="analysis:recovery" providedBasis={recoveryBasis(r, ctx.assumptions)} /></div>)}
    </div><ForecastChart points={selected.frames.map(w => ({ tSec: w.clock.elapsedSec - world.clock.elapsedSec, volumeM3: w.sumps['smp-201'].volumeM3, volumeLowM3: w.sumps['smp-201'].volumeM3, volumeHighM3: w.sumps['smp-201'].volumeM3,
      levelM: w.sumps['smp-201'].levelM, levelLowM: w.sumps['smp-201'].levelM, levelHighM: w.sumps['smp-201'].levelM, inflowM3h: w.sumps['smp-201'].inflowM3h, outflowM3h: w.sumps['smp-201'].outflowM3h }))} thresholds={ctx.mine.sumps.find(s => s.id === 'smp-201')!.thresholds} height={230} /></div>
    <Button size="xs" onClick={() => setSearch(s => !s)}>Run / hide bounded standby-duty search</Button>
    {search && <TableShell><thead><tr><Th>All enumerated strategies</Th><Th>Switches / reserve</Th><Th>Estimated cost</Th><Th>Constraint result</Th></tr></thead><tbody>{duty.map(r => <tr key={r.strategy.id}><Td>{r.strategy.label}</Td><Td>{r.switches} / {r.remainingReserve}</Td><Td>${r.costUSD.toFixed(0)}</Td><Td>{r.feasible ? 'Passes modeled constraints' : r.violations.join(' ')}</Td></tr>)}</tbody></TableShell>}
    <Notice tone="amber" title="Candidate feasibility is not safe-operation approval">This deterministic bounded comparison does not certify safe dewatering. Rejected candidates are retained. Storage thresholds, crew times, costs, load priorities and reserve requirements need site review. No calibrated permanent-loss, failure probability or certified optimisation model exists.</Notice>
  </Panel>;
}

function InvestigationWorkbench({ requested, onRequest, captured, remainingBudget }: { requested?: Measurement[]; onRequest?: (m: Measurement, observation: DiagnosticObservation) => void; captured?: DiagnosticObservation[]; remainingBudget?: number }) {
  const ctx = useContext(); const scenario = useActiveScenario(); const world = useDisplayWorld();
  const store = useMineStore();
  const [local, setLocal] = useState<Measurement[]>([]); const [message, setMessage] = useState('');
  const [observations, setObservations] = useState<DiagnosticObservation[]>([]);
  const [tag, setTag] = useState('sen-l-201');
  const requests = requested ?? local;
  const selectedIncident = store.getRun().incidents.find(i => i.id === store.selection.incidentId);
  const pumpId = onRequest ? 'pmp-201' : ctx.mine.pumps.some(p => p.id === store.selection.assetId) ? store.selection.assetId! : 'pmp-201';
  const history = store.getRun().frames.map(f => f.world);
  const investigation = investigate(ctx, scenario, world, pumpId, requests, history, captured ?? observations);
  useEffect(() => { setLocal([]); setObservations([]); }, [scenario.id, pumpId]);
  const request = (m: Measurement) => {
    const observation = investigate(ctx, scenario, world, pumpId, [m], history).measurements[0];
    if (onRequest) onRequest(m, observation);
    else { setLocal(s => s.includes(m) ? s : [...s, m]); setObservations(s => [...s, observation]); }
  };
  const fault = scenario.overrides.engineering?.telemetryFaults?.[tag] ?? 'normal';
  return <Panel className="mt-2 p-3"><h2 className="label-micro">Traceable failure investigation / telemetry uncertainty</h2>
    {scenario.isBaseline && !onRequest && <Button size="xs" onClick={() => store.createScenarioBranch({ name: 'Fault investigation study', description: 'Capture independent synthetic observations and compare competing constraints.', hypothesis: 'Distinguish equipment, hydraulic, electrical and instrumentation causes.' })}>Create investigation branch</Button>}
    <div className="my-2 grid gap-3 md:grid-cols-2"><Field label="Incident evidence context"><Select value={store.selection.incidentId ?? ''} onChange={e => store.selectAsset({ incidentId: e.target.value || null })}><option value="">No incident selected — numerical investigation</option>{store.getRun().incidents.map(i => <option key={i.id} value={i.id}>{i.reference}: {i.title}</option>)}</Select></Field>
      <Field label="Investigate pump"><Select disabled={Boolean(onRequest)} value={pumpId} onChange={e => store.selectAsset({ assetId: e.target.value })}>{ctx.mine.pumps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field></div>
    {selectedIncident && <p className="my-2 text-xs text-ink-300">{selectedIncident.summary} · {selectedIncident.evidence.length} retained evidence references.</p>}
    <div className="my-3 flex flex-wrap gap-2">{MEASUREMENTS.map(m => <Button key={m} size="xs" disabled={requests.includes(m) || (remainingBudget !== undefined && inspectionCost(m) > remainingBudget) || Boolean(onRequest && (store.replayActive || store.advanceTask))} onClick={() => request(m)}>Request {m}</Button>)}</div>
    <div className="my-3 flex flex-wrap gap-2"><Button size="xs" disabled={!requests.length || Boolean(onRequest && store.replayActive)} onClick={() => requests.forEach(request)}>Refresh requested evidence at displayed time</Button><EngineeringBasis assetId="analysis:diagnostics" providedBasis={diagnosticBasis(investigation)} /></div>
    <TableShell><thead><tr><Th>Requested evidence / timestamp</Th><Th>Observed synthetic</Th><Th>Expected / comparison</Th><Th>Residual</Th><Th>Provenance / usability</Th></tr></thead><tbody>{investigation.measurements.map(m => <tr key={m.id} data-testid={`observation-${m.id}`}><Td>{m.id} · T+{m.atSimSec}s</Td><Td>{m.observed?.toFixed(3) ?? 'Missing — no substitution'} {m.unit}</Td><Td>{m.expected?.toFixed(3) ?? 'Unsupported'} {m.unit}</Td><Td>{m.residual?.toFixed(3) ?? 'Indeterminate'}</Td><Td>{m.source}<br /><Badge tone={m.usable ? 'cyan' : 'amber'}>{m.usable ? m.quality : 'Missing, unsupported or stale for this snapshot'}</Badge></Td></tr>)}</tbody></TableShell>
    <TableShell><thead><tr><Th>Competing hypothesis</Th><Th>Evidence disposition (not probability)</Th><Th>Supporting / contradicting evidence</Th><Th>Recommended inspection</Th></tr></thead><tbody>{investigation.hypotheses.map(h => <tr key={h.id} data-testid={`hypothesis-${h.id}`}><Td>{h.title}</Td><Td>{h.conclusion}</Td><Td>{h.evidence.map((e, i) => <p key={i} className="mb-2 text-xs">{e.disposition} · {e.measurement}: {e.detail}</p>)}</Td><Td>{h.inspection}</Td></tr>)}</tbody></TableShell>
    <details className="my-3 rounded border border-ink-700 p-3 text-xs"><summary className="cursor-pointer text-ink-200">One-constraint restoration comparisons — same solver, fixed storage</summary>
      <TableShell><thead><tr><Th>Restored constraint</Th><Th>Flow / improvement</Th><Th>Input / change</Th><Th>Solver result</Th></tr></thead><tbody>{investigation.counterfactuals.map(c => <tr key={c.id}><Td>{c.id}</Td><Td>{c.flowM3h.toFixed(2)} / {c.flowGainM3h.toFixed(2)} m³/h</Td><Td>{c.inputPowerKw.toFixed(2)} / {c.powerChangeKw.toFixed(2)} kW</Td><Td>{c.status}</Td></tr>)}</tbody></TableShell>
      <p>Little improvement may mean another fault masks the repaired constraint. These are hypothetical capacity tests, not measured outcomes or approved interventions.</p></details>
    <details className="my-3 text-xs"><summary className="cursor-pointer text-ink-300">Retained inspection log</summary>{(captured ?? observations).map((m, i) => <p key={i}>{m.id} · {m.pumpId} · T+{m.atSimSec}s · {m.observed ?? 'missing'} {m.unit} · {m.quality}</p>)}</details>
    <div className="mt-3 grid gap-2 md:grid-cols-3"><Field label="Telemetry tag under investigation"><Select value={tag} onChange={e => setTag(e.target.value)}>{ctx.mine.sensors.map(s => <option key={s.id} value={s.id}>{s.name} · {s.unit}</option>)}</Select></Field>
      <Field label="Synthetic observation fault"><Select disabled={scenario.isBaseline || store.replayActive || Boolean(onRequest)} value={fault} onChange={e => setMessage(store.applyEngineeringOverrides({ engineering: { telemetryFaults: { [tag]: e.target.value as TelemetryFault } } }).message)}>{['normal', 'frozen', 'delayed', 'scaled', 'missing', 'contradictory'].map(f => <option key={f} value={f}>{f}</option>)}</Select></Field>
      <Field label="Simulated equipment status feedback"><Select disabled={scenario.isBaseline || store.replayActive || Boolean(onRequest)} value={scenario.overrides.engineering?.statusFeedback?.[pumpId] ?? 'unknown'} onChange={e => setMessage(store.applyEngineeringOverrides({ engineering: { statusFeedback: { [pumpId]: e.target.value as 'running' | 'stopped' | 'unknown' } } }).message)}><option value="unknown">Not available</option><option value="running">Running feedback</option><option value="stopped">Stopped feedback</option></Select></Field>
    </div>
    {!onRequest && <details className="my-3 text-xs"><summary className="cursor-pointer text-ink-300">Evidence quality / observed-versus-model residual register</summary><TableShell><thead><tr><Th>Tag</Th><Th>Observed</Th><Th>Expected model</Th><Th>Residual</Th><Th>Evidence disposition</Th></tr></thead><tbody>{evidenceQualityReport(ctx.mine, world, scenario.overrides).map(s => <tr key={s.id}><Td>{s.id}</Td><Td>{s.observed?.toFixed(2) ?? 'Missing'} {s.unit}</Td><Td>{s.expected?.toFixed(2) ?? 'Unsupported'}</Td><Td>{s.residual?.toFixed(2) ?? 'Indeterminate'}</Td><Td>{s.disposition} · {s.inspection}</Td></tr>)}</tbody></TableShell></details>}
    <p className="mt-2 text-xs text-ink-400">Pump current measurements: unavailable — this model has active kW, not a validated current/voltage motor model. A missing current measurement is never replaced with fabricated amperes.</p>
    <p role="status" className="text-xs text-signal-cyanBright">{message}</p><p className="mt-2 text-xs text-ink-400">An unavailable observation remains null. Requested inspections are explicit ideal synthetic measurements, not recovered plant data. Reference flow/head is a healthy characteristic on the current supply path; it is not a diagnosis. Hypotheses can have both support and alternatives. No fault probabilities are calculated.</p>
  </Panel>;
}

function InvestmentLab() {
  const ctx = useContext(); const scenario = useActiveScenario(); const store = useMineStore();
  const results = useEngineeringAnalysis('investments', {})!;
  return <Panel className="p-3"><h2 className="label-micro">Resilience investment planning — same scenario re-run, 6 h</h2>
    {scenario.isBaseline && <Button size="xs" onClick={() => store.createScenarioBranch({ name: 'Infrastructure investment study', description: 'Synthetic capital and infrastructure assumptions.', hypothesis: 'Compare investment alternatives under the same scenario.' })}>Create investment study branch</Button>}
    <div className="my-3 max-w-sm"><Range disabled={scenario.isBaseline} label="Capital estimate sensitivity multiplier" min={0.5} max={2} step={0.1} value={scenario.overrides.engineering?.capitalCostMultiplier ?? 1} onChange={v => store.applyEngineeringOverrides({ engineering: { capitalCostMultiplier: v } })} /></div>
    <TableShell><thead><tr><Th>Hypothetical upgrade</Th><Th>Capital assumption</Th><Th>Deferred t / benefit vs current</Th><Th>Operating energy cost</Th><Th>Residual risks</Th><Th>Scenario / evidence</Th></tr></thead><tbody>{results.map((r, i) => <tr key={r.label}><Td>{r.label}</Td><Td>${r.capitalUSD.toLocaleString()}</Td><Td>{r.result.deferredTonnes.toFixed(1)} t / {(results[0].result.deferredTonnes - r.result.deferredTonnes).toFixed(1)} t deferred avoided</Td><Td>${r.result.costUSD.toFixed(0)}</Td><Td>{r.limitation} {r.result.violations.join(' ')}</Td><Td><EngineeringBasis assetId="analysis:investment" providedBasis={investmentBasis(results[0].result, r.result, r.capitalUSD, ctx.assumptions)} />{i > 0 && <Button size="xs" onClick={() => store.createScenarioBranch({ name: r.label, description: r.limitation, hypothesis: 'Evaluate hypothetical infrastructure changes under the active disruption.', overrides: r.result.strategy.patch })}>Create planning branch</Button>}</Td></tr>)}</tbody></TableShell>
    <Notice tone="amber" title="Planning assumptions, not certified infrastructure design">Capital figures are study assumptions, not supplier quotations or NPV estimates. P-204 is a declared, initially uninstalled canonical planning slot with synthetic curves, a motor budget and a shared pipe. Installation feasibility still requires a real topology/motor/pipe design. Sensor investment changes evidence coverage, not physical water removal.</Notice>
  </Panel>;
}

function ChallengeLab() {
  const ctx = useContext(); const scenario = useActiveScenario(); const world = useDisplayWorld();
  const store = useMineStore(); const [challenge, setChallenge] = useState(CHALLENGES[0].id);
  const [difficulty, setDifficulty] = useState<'beginner' | 'engineer' | 'advanced'>('engineer');
  const [requested, setRequested] = useState<Measurement[]>([]); const [answer, setAnswer] = useState(''); const [graded, setGraded] = useState(false);
  const [captured, setCaptured] = useState<DiagnosticObservation[]>([]);
  const [reasoning, setReasoning] = useState<ChallengeReasoning>(EMPTY_REASONING);
  const [configuration, setConfiguration] = useState('');
  const [startedScenario, setStarted] = useState('');
  const c = challengeDefinition(challenge, difficulty);
  const report = investigate(ctx, scenario, world, 'pmp-201', requested, store.getRun().frames.map(f => f.world), captured);
  const score = challengeScore(challenge, difficulty, requested, answer, reasoning, report);
  const active = startedScenario === store.activeScenarioId;
  const unchanged = configuration === JSON.stringify(scenario.overrides);
  const start = async () => {
    store.switchScenario('scn-baseline');
    const id = store.createScenarioBranch({ name: `Engineering challenge · ${challenge}`, description: 'Diagnose through requested evidence. Fault parameters remain in the ordinary canonical scenario.', hypothesis: 'Investigate the observed consequences before choosing a cause.', overrides: c.patch });
    store.resetActiveScenario(); // Reset only the new challenge child; preserve the reference run.
    store.selectAsset({ assetId: 'pmp-201' }); setStarted(id); setRequested([]); setCaptured([]); setReasoning(EMPTY_REASONING); setAnswer(''); setGraded(false);
    setConfiguration(JSON.stringify(store.getScenario().overrides));
    await store.runForAsync(challenge === 'delayed' ? 5 * 3600 : 600);
  };
  return <><Panel className="p-3"><h2 className="label-micro">Senior engineer challenge laboratory</h2>
    <div className="my-3 grid gap-3 md:grid-cols-2"><Field label="Challenge"><Select value={challenge} onChange={e => { setChallenge(e.target.value); setStarted(''); setGraded(false); }}>{CHALLENGES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
      <Field label="Difficulty / evidence requirements"><Select value={difficulty} onChange={e => { setDifficulty(e.target.value as typeof difficulty); setStarted(''); setGraded(false); }}><option value="beginner">Beginner · guided reasoning</option><option value="engineer">Engineer · independent diagnosis</option><option value="advanced">Advanced engineer · concurrent impairments</option></Select></Field></div>
    <p className="my-3 text-xs leading-relaxed text-ink-300">{CHALLENGE_DIFFICULTIES[difficulty].description} Budget: {c.budget} training effort points. Independent level, mechanical condition and efficiency inspections cost 2; other requests cost 1.</p>
    <Button disabled={Boolean(store.advanceTask)} onClick={() => { void start(); }}>Start deterministic challenge</Button>
    {active && !unchanged && <Notice tone="amber" title="Challenge configuration changed">Restart the challenge to assess the defined scenario. Editing equipment/inputs invalidates this attempt.</Notice>}
    {active && unchanged && <><p className="my-2 text-xs text-ink-300">Fault parameters are not named in the brief. Request independent evidence, inspect the twins and replay, then provide a conclusion. No scoring for repeated clicks. Inspection effort {score.spent}/{score.budget}.</p>
      {difficulty === 'beginner' && <Notice tone="neutral" title="Guided investigation">{c.hint} Test an alternative with an independent inspection; a clean suction inspection can contradict the suction-restriction hypothesis.</Notice>}
      <Field label="Evidence-based conclusion"><Select value={answer} onChange={e => { setAnswer(e.target.value); setGraded(false); }}><option value="">Select after investigation</option><option value="inflow">Inflow exceeds delivered pumping</option><option value="power">Insufficient usable electrical supply</option><option value="instrumentation">Instrumentation disagreement / scaling</option><option value="resistance">System resistance / motor duty constraint</option><option value="wear">Pump underperformance / wear</option><option value="delayed">Delayed storage → access consequence</option></Select></Field>
      <ChallengeReasoningForm value={reasoning} onChange={v => { setReasoning(v); setGraded(false); }} report={report} definition={c} difficulty={difficulty} />
      <Button size="xs" disabled={store.replayActive || Boolean(store.advanceTask)} onClick={() => setGraded(true)}>Review investigative process</Button>{graded && <><p role="status" className="my-2 text-xs text-signal-cyanBright">{score.score}/100 · {score.resolved ? 'Evidence-supported resolution' : 'Further investigation needed'} · {score.explanation} {score.missing.length > 0 && `Missing: ${score.missing.join(', ')}`}</p>
        <TableShell><thead><tr><Th>Reasoning rubric</Th><Th>Earned / available</Th></tr></thead><tbody>{score.rubric.map(r => <tr key={r.criterion}><Td>{r.criterion}</Td><Td>{r.points} / {r.maximum}</Td></tr>)}</tbody></TableShell><EngineeringBasis assetId="analysis:challenge" providedBasis={challengeBasis(score)} /></>}
    </>}
  </Panel>{active && unchanged && <><InvestigationWorkbench requested={requested} captured={captured} remainingBudget={Math.max(0, c.budget - score.spent)} onRequest={(m, observation) => { setRequested(s => s.includes(m) ? s : [...s, m]); setCaptured(s => [...s, observation]); setGraded(false); }} /><EngineeringTwins /></>}</>;
}

function ProofCoverageDashboard() {
  const ctx = useContext(); const scenario = useActiveScenario(); const world = useDisplayWorld();
  const audit = useMemo(() => proofCoverage(ctx.mine, scenario, world), [ctx.mine, scenario, world]);
  return <section className="my-5" data-testid="proof-coverage-audit"><h3 className="mb-2 text-sm font-medium text-ink-100">Engineering-proof coverage audit</h3>
    <p className="mb-3 text-xs leading-relaxed text-ink-300">{audit.scope}</p>
    <p role="status" className="my-2 text-xs text-signal-cyanBright">{audit.gaps} uncovered runtime fields / incomplete snapshot proofs · {audit.rows.length} snapshot proof targets · {audit.analyses.length} context-bound analysis families</p>
    <TableShell><thead><tr><Th>Output / proof target</Th><Th>Provenance status</Th><Th>Inspect</Th></tr></thead><tbody>{audit.rows.map(r => <tr key={r.id}><Td>{r.id} · {r.label}</Td><Td>{r.status}{r.issues.join('; ')}</Td><Td><EngineeringBasis assetId={r.id} /></Td></tr>)}</tbody></TableShell>
    <TableShell><thead><tr><Th>Analysis consequence family</Th><Th>Implementation</Th><Th>Bound UI context</Th></tr></thead><tbody>{audit.analyses.map(r => <tr key={r.id}><Td>{r.label}</Td><Td>{r.source} · {r.status}</Td><Td>{r.screen}</Td></tr>)}</tbody></TableShell>
    {audit.uncoveredNumericFields.map(f => <p key={f} className="text-xs text-signal-amber">Missing numeric-field mapping: {f}</p>)}
    <p className="mt-3 text-xs text-ink-300">Explicitly unsupported: {audit.unsupported.join('; ')}. Study proofs open alongside their actual computed results, rather than substituting a generic asset explanation.</p>
  </section>;
}
