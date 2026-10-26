import type { Scenario, ScenarioOverride, WorldState } from '../domain/types';
import type { EngineContext } from './engine';
import { defaultPipe, effectivePipe } from './hydraulics';
import { computeFeederStates, computePumpStates } from './plant';
import { patchedScenario } from './engineeringStudies';

export const MEASUREMENTS = ['flow', 'head', 'power', 'speed', 'level', 'independent-level', 'inflow', 'access',
  'condition', 'suction', 'efficiency', 'valve', 'pipe-diameter', 'electrical-path', 'load-margin', 'timeline', 'current'] as const;
export type Measurement = typeof MEASUREMENTS[number];
export type HypothesisId = 'inflow' | 'resistance' | 'wear' | 'suction' | 'efficiency' | 'speed' | 'power' | 'instrumentation' | 'delayed';
export interface DiagnosticObservation {
  id: Measurement; observed: number | null; expected: number | null; residual: number | null;
  unit: string; source: string; atSimSec: number; scenarioId: string; pumpId: string; signature: string;
  quality: 'synthetic-inspection' | 'reported' | 'missing' | 'unsupported'; usable: boolean;
}
export interface HypothesisEvidence { measurement: Measurement; disposition: 'support' | 'contradict' | 'ambiguous'; detail: string; }
export const inspectionCost = (id: Measurement) => ['independent-level', 'condition', 'efficiency'].includes(id) ? 2 : 1;
export function diagnosticSignature(scenario: Scenario, world: WorldState) {
  return JSON.stringify([scenario.id, world.clock.elapsedSec, world.scenarioSnapshot ?? scenario.overrides, world.assumptionsSnapshot]);
}

/** Counterfactuals use the same electrical and hydraulic functions as the time kernel.
 * They hold storage fixed: capacity tests, not forecasts or approved repairs. */
export function investigate(ctx: EngineContext, input: Scenario, world: WorldState, pumpId: string, requests: readonly Measurement[],
  history: readonly WorldState[] = [], captured?: readonly DiagnosticObservation[]) {
  const scenario = { ...input, overrides: world.scenarioSnapshot ?? input.overrides };
  const pump = ctx.mine.pumps.find(p => p.id === pumpId);
  if (!pump || !world.pumps[pumpId]) throw new Error(`Investigation requires a registered pump: ${pumpId}`);
  const actual = world.pumps[pumpId]; const sump = world.sumps[pump.sumpId];
  const base = defaultPipe(pump); const e = scenario.overrides.engineering ?? {};
  const pipe = effectivePipe(ctx.mine, scenario.overrides, pump.sumpId, world.sumps);
  const resistancePatch: Partial<ScenarioOverride> = { engineering: { pipes: { [pump.sumpId]: {
    diameterM: base.diameterM / (e.dischargeScale ?? 1), lengthM: base.lengthM, roughnessM: base.roughnessM,
    minorK: base.minorK, valveOpen: 1,
  } } } };
  const run = (patch: Partial<ScenarioOverride>) => {
    const s = patchedScenario(scenario, patch);
    return computePumpStates(ctx.mine, s.overrides, computeFeederStates(ctx.mine, s.overrides, world.clock.elapsedSec), world.sumps)[pumpId];
  };
  const repairs = {
    resistance: resistancePatch,
    wear: { pumpOverrides: { [pumpId]: { health: 1 } } },
    suction: { pumpOverrides: { [pumpId]: { suctionK: 0 } } },
    efficiency: { pumpOverrides: { [pumpId]: { efficiency: pump.efficiency } } },
    speed: { pumpOverrides: { [pumpId]: { speedRatio: 1 } } },
    power: { feederOverrides: { [pump.feederId]: { status: 'energised' as const } }, engineering: { utilityAvailable: true, restoreAtSec: null } },
  } satisfies Partial<Record<HypothesisId, Partial<ScenarioOverride>>>;
  const counterfactuals = Object.entries(repairs).map(([id, patch]) => {
    const state = run(patch);
    return { id: id as HypothesisId, flowM3h: state.flowM3h, flowGainM3h: state.flowM3h - actual.flowM3h,
      inputPowerKw: state.powerKw, powerChangeKw: state.powerKw - actual.powerKw, status: state.hydraulic?.status ?? 'unavailable',
      patch,
      source: 'Same plant.ts solver; current storage and other faults retained. Hypothetical restoration, not an observation.' };
  });
  const referenceScenario = patchedScenario(patchedScenario(scenario, resistancePatch), {
    pumpOverrides: { [pumpId]: { health: 1, efficiency: pump.efficiency, speedRatio: 1, curveScale: 1, suctionK: 0 } },
  });
  const reference = computePumpStates(ctx.mine, referenceScenario.overrides,
    computeFeederStates(ctx.mine, referenceScenario.overrides, world.clock.elapsedSec), world.sumps)[pumpId];
  const tag = ctx.mine.sensors.find(s => s.assetId === pump.sumpId && s.kind === 'level');
  const sensor = tag ? world.sensors[tag.id] : undefined;
  const retained = history.filter(w => w.clock.elapsedSec <= world.clock.elapsedSec);
  const outage = retained.find(w => (w.feeders[pump.feederId]?.supplyRatio ?? 1) === 0);
  const closure = outage && retained.find(w => w.clock.elapsedSec >= outage.clock.elapsedSec && ctx.mine.zones.some(z =>
    z.governedBySumpIds.includes(pump.sumpId) && w.zones[z.id]?.operatingRatio === 0 &&
    w.sumps[pump.sumpId].levelM >= z.floorElevationM - ctx.mine.sumps.find(s => s.id === pump.sumpId)!.floorElevationM));
  const values: Record<Measurement, { observed: number | null; expected: number | null; unit: string; source: string }> = {
    flow: { observed: actual.flowM3h, expected: reference.flowM3h, unit: 'm³/h', source: 'Requested ideal synthetic discharge test; healthy-reference duty on the same supply path.' },
    head: { observed: actual.powered && actual.mode === 'running' && actual.flowM3h > 0 && actual.hydraulic?.status === 'solved' ? actual.hydraulic.headM : null, expected: reference.powered && reference.mode === 'running' && reference.flowM3h > 0 && reference.hydraulic?.status === 'solved' ? reference.hydraulic.headM : null, unit: 'm', source: 'Synthetic running duty-head comparison; unavailable duty stays null. Different operating points, not a constant-flow pressure test.' },
    power: { observed: actual.powerKw, expected: reference.powerKw, unit: 'kW', source: 'Calculated active input power; not measured amperes.' },
    speed: { observed: actual.hydraulic?.effectiveSpeedRatio ?? null, expected: scenario.overrides.pumpOverrides[pumpId]?.speedRatio ?? 1, unit: 'rated speed fraction', source: 'Effective solver VSD speed versus commanded speed; motor limiting can reduce it.' },
    level: { observed: sensor?.lastValue ?? null, expected: sump.levelM, unit: 'm', source: `Reported ${tag?.id ?? 'missing tag'} (${sensor?.freshness ?? 'unavailable'}); independent inspection needed to test accuracy.` },
    'independent-level': { observed: sump.levelM, expected: sump.levelM, unit: 'm', source: 'Explicit ideal independent synthetic inspection; no silent replacement of the primary tag.' },
    inflow: { observed: sump.inflowM3h, expected: sump.outflowM3h, unit: 'm³/h', source: 'Same-interval station inflow minus actual station withdrawal, including explicit transfers; not just selected-pump flow.' },
    access: { observed: Math.min(1, ...ctx.mine.zones.filter(z => z.governedBySumpIds.includes(pump.sumpId)).map(z => world.zones[z.id].operatingRatio)), expected: 1, unit: 'available fraction', source: 'Current computed access/production policy for zones governed by the selected sump.' },
    condition: { observed: actual.condition ?? pump.health, expected: 1, unit: 'characteristic condition fraction', source: 'Requested ideal mechanical inspection of synthetic head-curve condition; not a reliability probability.' },
    suction: { observed: scenario.overrides.pumpOverrides[pumpId]?.suctionK ?? 0, expected: 0, unit: 'loss coefficient K', source: 'Requested synthetic suction inspection; clean-reference added suction loss is zero.' },
    efficiency: { observed: actual.hydraulic?.status === 'solved' ? actual.hydraulic.efficiency : null, expected: reference.hydraulic?.status === 'solved' ? reference.hydraulic.efficiency : null, unit: 'wire-to-water fraction', source: 'Synthetic efficiency test compared with the healthy-reference duty; no independent motor-loss model.' },
    valve: { observed: pipe.valveOpen, expected: 1, unit: 'open fraction', source: 'Requested ideal valve-position inspection.' },
    'pipe-diameter': { observed: pipe.diameterM, expected: base.diameterM, unit: 'm', source: 'Requested synthetic effective-bore inspection versus declared baseline; a smaller line is a capacity constraint, not proof of blockage.' },
    'electrical-path': { observed: world.feeders[pump.feederId]?.pumpBudgetKw?.[pumpId] ?? 0, expected: pump.powerRequiredKw, unit: 'kW motor reservation', source: 'Canonical feeder motor allocation versus nameplate reservation requirement.' },
    'load-margin': { observed: Object.values(world.feeders).reduce((sum, f) => sum + (f.allocatedKw ?? 0), 0), expected: Object.values(world.feeders).reduce((sum, f) => sum + f.connectedLoadKw, 0), unit: 'kW', source: 'Allocated site power minus requested connected demand; this is a reservation margin, not AC power flow.' },
    timeline: { observed: closure && outage ? (closure.clock.elapsedSec - outage.clock.elapsedSec) / 3600 : null, expected: 0, unit: 'h', source: 'First retained zero-supply frame to first modeled water-induced access closure. Missing history/closure stays indeterminate; arrival is frame-resolution bounded.' },
    current: { observed: null, expected: null, unit: 'A', source: 'Unsupported: no validated voltage/current motor model.' },
  };
  const signature = diagnosticSignature(scenario, world);
  const measurements = [...new Set(requests)].map(id => {
    const recorded = captured ? [...captured].reverse().find(m => m.id === id) : undefined;
    if (captured) return recorded ? { ...recorded, usable: recorded.usable && recorded.signature === signature && recorded.pumpId === pumpId } : {
      ...values[id], id, observed: null, residual: null, atSimSec: world.clock.elapsedSec, scenarioId: scenario.id, pumpId, signature, quality: 'missing' as const, usable: false,
    };
    const value = values[id];
    return { ...value, id, residual: value.observed !== null && value.expected !== null ? value.observed - value.expected : null,
      atSimSec: world.clock.elapsedSec, scenarioId: scenario.id, pumpId, signature,
      quality: id === 'current' ? 'unsupported' as const : value.observed === null ? 'missing' as const : id === 'level' ? 'reported' as const : 'synthetic-inspection' as const,
      usable: value.observed !== null && Number.isFinite(value.observed) && (id !== 'level' || sensor?.freshness === 'live') };
  });
  const get = (id: Measurement) => measurements.find(m => m.id === id && m.usable);
  const evidence = (id: Measurement, support: boolean, detail: string): HypothesisEvidence[] => get(id) ? [{ measurement: id, disposition: support ? 'support' : 'contradict', detail }] : [];
  const defs: Array<{ id: HypothesisId; title: string; inspection: string; evidence: HypothesisEvidence[] }> = [
    { id: 'inflow', title: 'Inflow exceeds actual station discharge', inspection: 'Verify independent inflow and transfer routing; compare all station pumps and the mass ledger.', evidence: [
      ...evidence('inflow', (get('inflow')?.residual ?? 0) > 0.01, 'Station Q in − actual Q out; positive accumulation can occur with a healthy running pump.'),
      ...evidence('flow', (get('inflow')?.residual ?? 0) > 0.01, 'Selected pump delivery is supporting context; station balance, not a single motor, determines accumulation.')].filter(item => item.measurement !== 'flow' || get('inflow')) },
    { id: 'wear', title: 'Impeller / mechanical characteristic degradation', inspection: 'Inspect impeller and clearances; low flow alone cannot distinguish wear from resistance or power constraints.', evidence: evidence('condition', (get('condition')?.observed ?? 1) < 0.95, 'Declared screening assumption: condition below 0.95 supports characteristic degradation, not a failure probability.') },
    { id: 'suction', title: 'Additional suction restriction', inspection: 'Inspect suction inlet/strainer and differential head; this is a lumped K-loss model without NPSH.', evidence: evidence('suction', (get('suction')?.observed ?? 0) > 0.01, 'Positive added suction K is an inspected restriction; cavitation is not diagnosed.') },
    { id: 'efficiency', title: 'Reduced wire-to-water efficiency', inspection: 'Verify duty flow/head and electrical input together; efficiency and motor limiting can interact.', evidence: evidence('efficiency', (get('efficiency')?.residual ?? 0) < -0.03, 'A reduction greater than 0.03 from the healthy-reference duty is a stated screening tolerance, not calibration.') },
    { id: 'speed', title: 'Reduced speed / VSD limitation', inspection: 'Check commanded versus effective speed and the motor power reservation before assigning a mechanical cause.', evidence: evidence('speed', (get('speed')?.observed ?? 1) < 0.95, 'Effective speed below 0.95 rated may be commanded or imposed by motor allocation.') },
    { id: 'resistance', title: 'Discharge restriction / constrained system curve', inspection: 'Verify valve position and effective bore; compare repaired-system duty while retaining other faults.', evidence: [
      ...evidence('valve', (get('valve')?.observed ?? 1) < 0.95, 'An inspected partially closed valve changes system resistance.'),
      ...evidence('pipe-diameter', (get('pipe-diameter')?.observed ?? base.diameterM) < base.diameterM * 0.95, 'An effective bore below 95% of declared baseline supports a restrictive main; no blockage diagnosis from head alone.')] },
    { id: 'power', title: 'Insufficient usable electrical capacity / supply path', inspection: 'Verify source, feeder, switching and individual motor budget; available generators do not bypass failed paths.', evidence: [
      ...evidence('electrical-path', (get('electrical-path')?.residual ?? 0) < -0.01, 'Individual motor reservation is below its required budget.'),
      ...evidence('load-margin', (get('load-margin')?.residual ?? 0) < -0.01, 'Negative site reservation margin means not all requested loads can be supplied.')] },
    { id: 'instrumentation', title: 'Primary level measurement disagreement', inspection: 'Check independent level, calibration, scaling and timestamps. Freshness alone cannot establish accuracy.', evidence: get('independent-level') && get('level') ? [
      ...evidence('level', Math.abs(get('level')!.observed! - get('independent-level')!.observed!) > 0.1, 'Primary versus independent level differs by more than the stated 0.1 m screening tolerance.'),
      ...evidence('independent-level', Math.abs(get('level')!.observed! - get('independent-level')!.observed!) > 0.1, 'Independent inspection distinguishes reported level from modeled storage.')] : [] },
    { id: 'delayed', title: 'Electrical outage → storage growth → delayed access loss', inspection: 'Inspect retained frames and threshold geometry; verify ordering, not merely simultaneous statuses.', evidence: [
      ...evidence('timeline', (get('timeline')?.observed ?? 0) > 0, 'Positive retained-frame delay establishes modeled outage-before-water-closure ordering.'),
      ...evidence('access', (get('access')?.observed ?? 1) < 1, 'Current access is restricted; the timeline is needed to connect it to the earlier outage.')] },
  ];
  // Flow is corroboration, never unique identification of a mechanical fault.
  for (const id of ['wear', 'suction', 'efficiency', 'speed', 'resistance', 'power'] as const) {
    const h = defs.find(item => item.id === id)!;
    if (get('flow') && h.evidence.some(item => item.disposition === 'support')) h.evidence.push({ measurement: 'flow', disposition: 'support', detail: 'Observed delivery corroborates the inspected constraint; multiple faults can coexist.' });
  }
  const hypotheses = defs.map(h => {
    const supporting = h.evidence.filter(v => v.disposition === 'support');
    const contradicting = h.evidence.filter(v => v.disposition === 'contradict');
    const counterfactual = counterfactuals.find(c => c.id === h.id);
    const masked = supporting.length > 0 && !!counterfactual && counterfactual.flowGainM3h <= Math.max(0.01, actual.flowM3h * 0.01);
    const disposition = supporting.length && contradicting.length ? 'mixed' : supporting.length ? 'supported' : contradicting.length ? 'contradicted' : 'unresolved';
    return { ...h, support: supporting.length > 0, contradict: contradicting.length > 0, supporting, contradicting, disposition, masked,
      conclusion: disposition === 'mixed' ? 'Mixed evidence; isolate simultaneous constraints' : disposition === 'supported' ? masked ? 'Inspected impairment; another constraint masks flow recovery' : 'Supporting evidence; not a unique root-cause diagnosis' : disposition === 'contradicted' ? 'Contradicting evidence at this snapshot; hidden faults remain possible' : 'Insufficient independent evidence' };
  });
  return { pumpId, atSimSec: world.clock.elapsedSec, signature, measurements, hypotheses, counterfactuals,
    modelInputs: [
      { name: 'Pipe length', value: pipe.lengthM, unit: 'm', source: 'Effective displayed station model' },
      { name: 'Effective diameter', value: pipe.diameterM, unit: 'm', source: 'Effective displayed station model' },
      { name: 'Absolute roughness', value: pipe.roughnessM, unit: 'm', source: 'Effective displayed station model' },
      { name: 'Minor-loss coefficient', value: pipe.minorK, unit: 'dimensionless K', source: 'Effective station incl. synthetic suction contribution' },
      { name: 'Valve opening', value: pipe.valveOpen, unit: 'fraction', source: 'Displayed scenario pipe settings' },
      { name: 'Static boundary head', value: pipe.staticHeadM, unit: 'm', source: 'Effective pipe and displayed source/receiving storage' },
      { name: 'Backpressure', value: pipe.backPressureKpa, unit: 'kPa', source: 'Configured receiving pressure' },
      { name: 'Pump condition', value: actual.condition ?? pump.health, unit: 'fraction', source: 'Displayed characteristic condition; not revealed as an observation until inspected' },
      { name: 'Rated flow / head', value: `${pump.ratedFlowM3h} / ${pump.ratedHeadM}`, unit: 'm³/h / m', source: 'Canonical synthetic pump characteristic' },
      { name: 'Configured efficiency', value: scenario.overrides.pumpOverrides[pumpId]?.efficiency ?? pump.efficiency, unit: 'wire-to-water fraction', source: 'Declared synthetic efficiency characteristic' },
      { name: 'Motor reservation', value: world.feeders[pump.feederId]?.pumpBudgetKw?.[pumpId] ?? 0, unit: 'kW', source: 'Displayed feeder allocation' },
    ],
    unresolvedMeasurements: MEASUREMENTS.filter(id => !get(id)),
    limitations: ['Screening thresholds are explicit demonstration tolerances, not calibrated probabilities.', 'Counterfactuals retain other faults and current storage; capacity improvement is not a recovery forecast.', 'Captured observations from another time/configuration are stale and cannot justify a current conclusion.'] };
}
export type DiagnosticReport = ReturnType<typeof investigate>;
