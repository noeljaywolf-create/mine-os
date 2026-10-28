import { describe, expect, it } from 'vitest';
import { MINE } from '../data/mine';
import { createBaseline } from '../data/scenarios';
import { DEFAULT_ASSUMPTIONS } from '../simulation/assumptions';
import { createWorld, deriveState } from '../simulation/engine';
import { DependencyGraph } from '../simulation/graph';
import { projectWorld } from '../simulation/projection';
import { patchedScenario, evaluateStrategy, recoveryStrategies, strategyObjectives } from '../simulation/engineeringStudies';
import { investigate, type Measurement } from '../simulation/diagnostics';
import { CHALLENGES, challengeDefinition, challengeScore, EMPTY_REASONING, type ChallengeDifficulty, type ChallengeReasoning } from '../simulation/investigation';
import { achievedRecovery } from '../simulation/recovery';
import { basisIssues, proofCoverage } from '../simulation/proofCoverage';
import { engineeringBasis } from '../simulation/engineeringEvidence';
import { challengeBasis, diagnosticBasis, forecastBasis, investmentBasis, recoveryBasis } from '../simulation/analysisEvidence';
import { forecastSump } from '../simulation/forecast';

const ctx = { mine: MINE, graph: new DependencyGraph(MINE.dependencies), assumptions: DEFAULT_ASSUMPTIONS };
const scenario = () => ({ ...createBaseline(0), id: 'intelligence-test', isBaseline: false });

describe('independent evidence and simultaneous fault investigation', () => {
  it('presents sump geometry and material rates without raw JSON', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    const sump = engineeringBasis(MINE, s, w, 'smp-101');
    const coordinates = sump.inputs.find(input => input.name === 'Stage-storage coordinates');
    expect(coordinates?.value).toContain('(0, 0)');
    expect(coordinates?.value).not.toContain('levelM');
    expect(sump.inputs.find(input => input.name === 'Pump outflow before first step')).toBeDefined();
    const material = engineeringBasis(MINE, s, w, 'mat-hoist');
    for (const input of material.inputs.slice(0, 3)) expect(String(input.value)).not.toMatch(/[{}"]+/);
  });
  it('does not identify wear from low flow or label naturally large pipe losses as a fault', () => {
    const s = patchedScenario(scenario(), { engineering: { pipes: { 'smp-201': { diameterM: 0.12 } } } });
    const w = createWorld(ctx, s, 0);
    const incomplete = investigate(ctx, s, w, 'pmp-201', ['flow', 'head']);
    expect(incomplete.hypotheses.find(h => h.id === 'wear')!.support).toBe(false);
    expect(incomplete.hypotheses.find(h => h.id === 'resistance')!.disposition).toBe('unresolved');
    const inspected = investigate(ctx, s, w, 'pmp-201', ['flow', 'pipe-diameter']);
    expect(inspected.hypotheses.find(h => h.id === 'resistance')!.support).toBe(true);
  });
  it('retains concurrent wear and restriction instead of selecting a unique root cause', () => {
    const s = patchedScenario(scenario(), { pumpOverrides: { 'pmp-201': { health: 0.6 } }, engineering: { pipes: { 'smp-201': { diameterM: 0.12 } } } });
    const r = investigate(ctx, s, createWorld(ctx, s, 0), 'pmp-201', ['flow', 'condition', 'pipe-diameter']);
    expect(r.hypotheses.find(h => h.id === 'wear')!.support).toBe(true);
    expect(r.hypotheses.find(h => h.id === 'resistance')!.support).toBe(true);
    expect(r.hypotheses.find(h => h.id === 'resistance')!.masked).toBe(true);
  });
  it('recognizes a masked mechanical impairment behind a failed supply', () => {
    const s = patchedScenario(scenario(), { feederOverrides: { 'fdr-02': { status: 'failed' } }, pumpOverrides: { 'pmp-201': { health: 0.85 } } });
    const r = investigate(ctx, s, createWorld(ctx, s, 0), 'pmp-201', ['flow', 'condition', 'electrical-path']);
    expect(r.hypotheses.find(h => h.id === 'wear')!.masked).toBe(true);
    expect(r.hypotheses.find(h => h.id === 'power')!.support).toBe(true);
    expect(r.counterfactuals.find(c => c.id === 'wear')!.flowGainM3h).toBe(0);
    expect(r.counterfactuals.find(c => c.id === 'power')!.flowGainM3h).toBeGreaterThan(0);
  });
  it('distinguishes suction inspection from discharge inspection', () => {
    const s = patchedScenario(scenario(), { pumpOverrides: { 'pmp-201': { suctionK: 35 } } });
    const r = investigate(ctx, s, createWorld(ctx, s, 0), 'pmp-201', ['suction', 'valve', 'flow']);
    expect(r.hypotheses.find(h => h.id === 'suction')!.support).toBe(true);
    expect(r.hypotheses.find(h => h.id === 'resistance')!.support).toBe(false);
  });
  it('leaves amperes and an unsolved head indeterminate', () => {
    const s = patchedScenario(scenario(), { feederOverrides: { 'fdr-02': { status: 'failed' } } });
    const r = investigate(ctx, s, createWorld(ctx, s, 0), 'pmp-201', ['current', 'head']);
    expect(r.measurements.every(m => m.observed === null && !m.usable)).toBe(true);
    expect(r.measurements.find(m => m.id === 'current')!.expected).toBeNull();
  });
  it('invalidates captured evidence after time or configuration changes without overwriting observations', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    const captured = investigate(ctx, s, w, 'pmp-201', ['flow']).measurements;
    const later = projectWorld(ctx, s, w, 1 / 60, 60).at(-1)!;
    const stale = investigate(ctx, s, later, 'pmp-201', ['flow'], [], captured);
    expect(stale.measurements[0].observed).toBe(captured[0].observed);
    expect(stale.measurements[0].usable).toBe(false);
    expect(captured[0].usable).toBe(true);
    const revisedInputs = structuredClone(w);
    revisedInputs.assumptionsSnapshot!.rainfallScenarioMultiplier *= 2;
    expect(investigate(ctx, s, revisedInputs, 'pmp-201', ['flow'], [], captured).measurements[0].usable).toBe(false);
  });
  it('compares total station withdrawal, not a single pump, and does not mutate the physical world', () => {
    const s = patchedScenario(scenario(), { pumpOverrides: { 'pmp-202': { mode: 'running' } } });
    const w = projectWorld(ctx, s, createWorld(ctx, s, 0), 1 / 60, 60).at(-1)!;
    const before = JSON.stringify(w);
    const r = investigate(ctx, s, w, 'pmp-201', ['inflow']);
    expect(r.measurements[0].expected).toBe(w.sumps['smp-201'].outflowM3h);
    expect(JSON.stringify(w)).toBe(before);
  });
  it('requires retained closure history to report a delay', () => {
    const s = patchedScenario(scenario(), CHALLENGES[4].patch);
    const w = createWorld(ctx, s, 0);
    expect(investigate(ctx, s, w, 'pmp-201', ['timeline']).measurements[0].observed).toBeNull();
    expect(() => investigate(ctx, s, w, 'unknown-pump', [])).toThrow('registered pump');
  });
});

describe('reasoning-based training assessment', () => {
  for (const difficulty of ['beginner', 'engineer', 'advanced'] as ChallengeDifficulty[]) for (const item of CHALLENGES) {
    it(`${item.id} / ${difficulty}: requires evidence, quantitative reasoning, an alternative and a verification action`, () => {
      const c = challengeDefinition(item.id, difficulty);
      const s = patchedScenario(scenario(), c.patch);
      const frames = projectWorld(ctx, s, createWorld(ctx, s, 0), item.id === 'delayed' ? 5 : 1 / 6, 60);
      const w = frames.at(-1)!;
      const requested: Measurement[] = [...new Set([...c.required, ...c.calculationMeasurements, 'suction' as const, ...(c.secondary === 'wear' ? ['flow' as const] : [])])];
      const report = investigate(ctx, s, w, 'pmp-201', requested, frames);
      const m = report.measurements.find(m => m.id === c.calculationMeasurements[0])!;
      const value = c.calculation === 'delay' ? m.observed : c.calculation === 'level-residual' ? m.observed! - report.measurements.find(m => m.id === 'independent-level')!.observed! : m.residual;
      const reasoning: ChallengeReasoning = { ...EMPTY_REASONING, primaryEvidence: requested,
        secondary: c.secondary ?? '', secondaryEvidence: requested, alternative: 'suction', alternativeEvidence: ['suction'],
        calculation: c.calculation, calculationValue: value, action: c.action, explanation: 'Trace the cited inspections to a quantified mechanism, retaining concurrent constraints.' };
      const graded = challengeScore(item.id, difficulty, requested, c.answer, reasoning, report);
      expect(graded, JSON.stringify({ missing: graded.missing, rubric: graded.rubric, measurements: report.measurements })).toMatchObject({ score: 100, resolved: true });
      expect(challengeScore(item.id, difficulty, [...requested, ...requested], c.answer, reasoning, report).score).toBe(100);
      expect(challengeScore(item.id, difficulty, requested, c.answer, EMPTY_REASONING, report).score).toBeLessThanOrEqual(25);
      expect(challengeScore(item.id, difficulty, requested, c.answer, { ...reasoning, calculationValue: 1e9 }, report).resolved).toBe(false);
      if (difficulty === 'advanced') expect(challengeScore(item.id, difficulty, requested, c.answer, { ...reasoning, secondary: '' }, report).resolved).toBe(false);
    });
  }
  it('does not award credit for a correct answer without captured observations', () => {
    expect(challengeScore('rising', 'engineer', ['flow', 'inflow', 'head', 'power'], 'inflow').score).toBe(0);
  });
  it('rejects over-budget attempts and unregistered challenges', () => {
    expect(challengeScore('rising', 'beginner', ['flow', 'head', 'power', 'speed', 'level', 'independent-level', 'condition'], 'inflow').score).toBe(0);
    expect(() => challengeDefinition('unknown', 'engineer')).toThrow('Unknown challenge');
  });
});

function recoveryFrames() {
  const s = scenario(); const w = createWorld(ctx, s, 0);
  return Array.from({ length: 9 }, (_, i) => {
    const f = structuredClone(w); f.clock.elapsedSec = i * 300;
    for (const sump of Object.values(f.sumps)) { sump.volumeM3 = 100 - i; sump.levelM = 1; }
    for (const zone of Object.values(f.zones)) zone.operatingRatio = i < 2 ? 0.7 : 1;
    f.assets[MINE.plant.id].effectiveness = 1;
    return f;
  });
}
describe('sampled achieved recovery, not nominal repair delay', () => {
  it('reports onset and sustained confirmation at analytically known samples', () => {
    expect(achievedRecovery(MINE, recoveryFrames())).toMatchObject({ recovered: true, achievedAtHours: 600 / 3600, confirmedAtHours: 1500 / 3600, resolutionSec: 300 });
  });
  it('does not confirm short windows, curtailed throughput, off-shift operation or a growing sump', () => {
    expect(achievedRecovery(MINE, recoveryFrames().slice(0, 4)).recovered).toBe(false);
    const low = recoveryFrames(); low.forEach(w => { w.assets[MINE.plant.id].effectiveness = 0.5; });
    expect(achievedRecovery(MINE, low).recovered).toBe(false);
    const shift = recoveryFrames(); shift.forEach(w => { w.scenarioSnapshot!.engineering = { plannedShiftHours: 0 }; });
    expect(achievedRecovery(MINE, shift).recovered).toBe(false);
    const growing = recoveryFrames(); growing.forEach((w, i) => { w.sumps['smp-201'].volumeM3 = 100 + i; });
    expect(achievedRecovery(MINE, growing).recovered).toBe(false);
  });
  it('resets the confirmation window after a new interruption', () => {
    const frames = recoveryFrames(); frames[4].zones['zone-north'].operatingRatio = 0;
    expect(achievedRecovery(MINE, frames).achievedAtHours).toBe(1500 / 3600);
  });
  it('does not infer sustained recovery across sparse samples or invalid frame ordering', () => {
    const frames = recoveryFrames();
    expect(achievedRecovery(MINE, [frames[2], frames[8]]).recovered).toBe(false);
    expect(achievedRecovery(MINE, []).recovered).toBe(false);
    expect(() => achievedRecovery(MINE, [frames[2], frames[1]])).toThrow('strictly increasing');
  });
  it('requires every sump to be below its warning threshold', () => {
    const frames = recoveryFrames();
    frames.forEach(w => { w.sumps['smp-201'].levelM = 10; });
    expect(achievedRecovery(MINE, frames).recovered).toBe(false);
  });
  it('ranks actual restoration and excludes unconfirmed candidates even with zero configured delay', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    const result = evaluateStrategy(ctx, s, w, recoveryStrategies(w)[1], 0.5);
    const a = { ...result, feasible: true, strategy: { ...result.strategy, id: 'nominal-fast', delayHours: 0 }, recovery: { ...result.recovery, recovered: true, achievedAtHours: 2, confirmedAtHours: 2.25 } };
    const b = { ...result, feasible: true, strategy: { ...result.strategy, id: 'actually-fast', delayHours: 4 }, recovery: { ...result.recovery, recovered: true, achievedAtHours: 1, confirmedAtHours: 1.25 } };
    const c = { ...a, strategy: { ...a.strategy, id: 'never-restored' }, recovery: { ...a.recovery, recovered: false, achievedAtHours: null, confirmedAtHours: null } };
    expect(strategyObjectives([a, b, c]).fastest).toBe('actually-fast');
    expect(strategyObjectives([c]).fastest).toBeUndefined();
  });
});

describe('engineering-proof provenance inventory', () => {
  it('covers every registered asset/aggregate target at initial and stressed snapshots', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    expect(proofCoverage(MINE, s, w).gaps).toBe(0);
    const failed = patchedScenario(s, { feederOverrides: { 'fdr-02': { status: 'failed' } } });
    const end = projectWorld(ctx, failed, createWorld(ctx, failed, 0), 1, 300).at(-1)!;
    expect(proofCoverage(MINE, failed, end).gaps).toBe(0);
    expect(engineeringBasis(MINE, s, w, 'arc-flash').equation).toBe('Unsupported');
  });
  it('fails the inventory when a new numerical runtime output has no mapping', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    Object.assign(w.pumps['pmp-201'], { untracedPrediction: 42 });
    expect(proofCoverage(MINE, s, w).uncoveredNumericFields).toContain('pumps.pmp-201.untracedPrediction');
  });
  it('builds complete proofs from actual analysis results rather than generic asset substitutes', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    const result = evaluateStrategy(ctx, s, w, recoveryStrategies(w)[1], 0.5);
    const diagnostic = investigate(ctx, s, w, 'pmp-201', ['flow', 'current']);
    const forecast = forecastSump({ ctx, scenario: s, world: w, derived: deriveState(ctx, s, w), sumpId: 'smp-201', options: { horizonHours: 0.5 } });
    const bases = [recoveryBasis(result, ctx.assumptions), diagnosticBasis(diagnostic), investmentBasis(result, result, 12345, ctx.assumptions),
      challengeBasis(challengeScore('rising', 'beginner', [], '')), forecastBasis(forecast)];
    bases.forEach(b => expect(basisIssues(b), b.title).toEqual([]));
    expect(bases[2].inputs.find(i => i.name === 'Capital assumption')!.value).toBe(12345);
    expect(bases[0].inputs.find(i => i.name === 'Deferred processing')!.value).toBe(result.deferredTonnes);
  });
  it('retains effective assumptions for historical evidence after later settings change', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    const recorded = w.assumptionsSnapshot!.valuePerTonneUSD;
    s.overrides.assumptions.valuePerTonneUSD = recorded * 2;
    const b = engineeringBasis(MINE, s, w, 'zone-north');
    expect(b.inputs.find(i => i.name === 'Current value per tonne')!.value).toBe(recorded);
  });
});
