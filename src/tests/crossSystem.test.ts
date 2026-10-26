import { afterEach, describe, expect, it } from 'vitest';
import { MINE } from '../data/mine';
import { createBaseline } from '../data/scenarios';
import { createWorld, deriveState, recomputeWorld, stepWorld } from '../simulation/engine';
import { DependencyGraph } from '../simulation/graph';
import { DEFAULT_ASSUMPTIONS } from '../simulation/assumptions';
import { compareStrategies, evaluateStrategy, recoveryStrategies, searchDutyStrategies, STRESS_CASES } from '../simulation/engineeringStudies';
import { projectWorld } from '../simulation/projection';
import { CHALLENGES, challengeScore, investigate } from '../simulation/investigation';
import { engineeringBasis } from '../simulation/engineeringEvidence';
import { forecastAllSumps } from '../simulation/forecast';
import { productionIsScheduled } from '../simulation/production';
import { useMineStore } from '../store/mineStore';
import { evidenceQualityReport } from '../simulation/sensors';

const ctx = { mine: MINE, graph: new DependencyGraph(MINE.dependencies), assumptions: DEFAULT_ASSUMPTIONS };
const scenario = () => ({ ...createBaseline(0), id: 'verification', isBaseline: false });
const initialStore = useMineStore.getState();
afterEach(() => useMineStore.setState(initialStore, true));

describe('cross-system software verification', () => {
  it('requires simulated time for production recovery instead of instantly clearing the restart ramp', () => {
    const s = scenario(); s.overrides.assumptions.restartRampHours = 2;
    s.overrides.engineering = { productionLoadScale: 0.5 };
    const initial = createWorld(ctx, s, 0);
    s.overrides.engineering.productionLoadScale = 1;
    const restored = recomputeWorld(ctx, s, initial);
    expect(restored.zones['zone-north'].operatingRatio).toBe(0.5);
    const advanced = stepWorld(ctx, s, restored, 60).world;
    expect(advanced.zones['zone-north'].operatingRatio).toBeCloseTo(0.5 + 60 / 7200, 7);
    expect(advanced.zones['zone-north'].operatingRatio).toBeLessThan(1);
  });
  it('keeps an uninstalled planning pump unavailable until explicitly installed and dispatched', () => {
    const s = scenario(); s.overrides.pumpOverrides['pmp-204'] = { mode: 'running' };
    const before = createWorld(ctx, s, 0);
    expect(before.pumps['pmp-204'].flowM3h).toBe(0);
    expect(before.pumps['pmp-204'].status).toBe('offline');
    s.overrides.engineering = { additionalStandby: true };
    const after = createWorld(ctx, s, 0);
    expect(after.pumps['pmp-204'].flowM3h).toBeGreaterThan(0);
    expect(after.sumps['smp-201'].outflowM3h).toBeGreaterThan(before.sumps['smp-201'].outflowM3h);
    expect(after.sumps['smp-201'].outflowM3h - before.sumps['smp-201'].outflowM3h).toBeLessThan(260);
  });
  it('delivers actual historical samples under delay without fabricating early measurements', () => {
    const s = scenario(); s.overrides.engineering = { telemetryFaults: { 'sen-l-201': 'delayed' } };
    let w = createWorld(ctx, s, 0); const initialLevel = w.sumps['smp-201'].levelM;
    w = stepWorld(ctx, s, w, 60).world;
    expect(w.sensors['sen-l-201'].lastValue).toBeNull();
    w = stepWorld(ctx, s, w, 60).world;
    w = stepWorld(ctx, s, w, 60).world;
    expect(w.sensors['sen-l-201'].lastValue).toBe(initialLevel);
    expect(w.sensors['sen-l-201'].ageSec).toBe(180);
  });
  it('holds frozen readings while truth evolves, and flags contradictory flow scaling', () => {
    const s = scenario(); s.overrides.engineering = { telemetryFaults: { 'sen-l-201': 'frozen', 'sen-f-201': 'scaled' } };
    let w = createWorld(ctx, s, 0); const held = w.sensors['sen-l-201'].lastValue;
    for (let i = 0; i < 4; i++) w = stepWorld(ctx, s, w, 60).world;
    expect(w.sensors['sen-l-201'].lastValue).toBe(held);
    expect(w.sumps['smp-201'].levelM).not.toBe(held);
    expect(evidenceQualityReport(MINE, w, s.overrides).find(r => r.id === 'sen-f-201')!.disposition).toContain('Contradicts');
  });
  it('accounts for partially overlapping inrush time intervals and cumulative mass closure', () => {
    const s = scenario(); s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    s.overrides.sumpOverrides['smp-201'] = { inflowMultiplier: 0 };
    s.overrides.engineering = { inflowPulse: { sumpId: 'smp-201', flowM3h: 3600, startSec: 30, endSec: 90 } };
    const initial = createWorld(ctx, s, 0);
    const first = stepWorld(ctx, s, initial, 60).world;
    const second = stepWorld(ctx, s, first, 60).world;
    expect(first.sumps['smp-201'].volumeM3 - initial.sumps['smp-201'].volumeM3).toBeCloseTo(30, 8);
    expect(second.sumps['smp-201'].volumeM3 - initial.sumps['smp-201'].volumeM3).toBeCloseTo(60, 8);
    expect(Math.abs(second.waterTotals!.residualM3)).toBeLessThan(1e-7);
  });
  it('limits actual dry-sump measured discharge and integrates only wet-cycle energy', () => {
    const s = scenario(); s.overrides.sumpOverrides['smp-201'] = { volumeM3: 0, inflowMultiplier: 0 };
    const w = stepWorld(ctx, s, createWorld(ctx, s, 0), 60).world;
    expect(w.pumps['pmp-201'].deliveredFlowM3h).toBe(0);
    expect(w.pumps['pmp-201'].energyKwh).toBe(0);
    expect(w.sumps['smp-201'].outflowM3h).toBe(0);
    expect(w.sensors['sen-f-201'].lastValue).toBe(0);
  });
  it('independent verification improves evidence coverage without changing physical storage', () => {
    const s = scenario(); s.overrides.engineering = { telemetryFaults: { 'sen-l-201': 'missing' } };
    const before = createWorld(ctx, s, 0);
    s.overrides.engineering.redundantSensor = true;
    const after = createWorld(ctx, s, 0);
    expect(after.sumps).toEqual(before.sumps);
    expect(after.sensors['independent-level-smp-201'].lastValue).toBe(after.sumps['smp-201'].levelM);
  });
  it('never exceeds any individual motor budget, including parallel duty', () => {
    const s = scenario(); s.overrides.pumpOverrides['pmp-202'] = { mode: 'running' };
    const w = createWorld(ctx, s, 0);
    for (const p of MINE.pumps) expect(w.pumps[p.id].powerKw).toBeLessThanOrEqual(p.powerRequiredKw + 1e-5);
  });
  it('backup around an intact utility does not create unlimited independent feeder capacity', () => {
    const s = scenario(); s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    s.overrides.engineering = { backupConnected: true, switchingApproved: true, electricalRedundancy: true, backupCapacityKw: 100 };
    const w = createWorld(ctx, s, 0);
    expect(w.feeders['fdr-02'].allocatedKw).toBeLessThanOrEqual(100);
    expect(w.pumps['pmp-201'].flowM3h).toBe(0); // 110 kW reservation does not fit
  });
  it('keeps isolated/maintenance feeders isolated when a repair delay expires', () => {
    const s = scenario(); s.overrides.feederOverrides['fdr-02'] = { status: 'maintenance' };
    s.overrides.engineering = { restoreAtSec: 0 };
    expect(createWorld(ctx, s, 0).feeders['fdr-02'].status).toBe('maintenance');
  });
  it('series train does not silently bypass an unavailable unit', () => {
    const s = scenario(); s.overrides.engineering = { pipes: { 'smp-201': { configuration: 'series' } } };
    const w = createWorld(ctx, s, 0);
    expect(w.pumps['pmp-201'].flowM3h).toBe(0);
    expect(w.pumps['pmp-201'].hydraulic?.status).toBe('unavailable');
  });
  it('integrates energy and changing tariffs over time rather than applying final power retroactively', () => {
    const s = scenario(); let w = createWorld(ctx, s, 0);
    w = stepWorld({ ...ctx, assumptions: { ...ctx.assumptions, energyTariffUSDPerKwh: 0.1 } }, s, w, 60).world;
    const priorEnergy = w.pumps['pmp-201'].energyKwh!;
    const priorCost = w.pumps['pmp-201'].energyCostUSD!;
    w = stepWorld({ ...ctx, assumptions: { ...ctx.assumptions, energyTariffUSDPerKwh: 0.5 } }, s, w, 60).world;
    expect(w.pumps['pmp-201'].energyCostUSD! - priorCost).toBeCloseTo((w.pumps['pmp-201'].energyKwh! - priorEnergy) * 0.5, 8);
    expect(priorCost).toBeCloseTo(priorEnergy * 0.1, 8);
  });
  it('has no production shortfall outside planned shifts', () => {
    const s = scenario(); s.overrides.engineering = { plannedShiftHours: 8, shiftStartHour: 8 };
    const w = stepWorld(ctx, s, createWorld(ctx, s, 0), 60).world;
    expect(w.deferredTonnes).toBe(0);
    expect(Object.values(w.zones).every(z => z.lostTonnes === 0)).toBe(true);
    expect(w.assets[MINE.plant.id].status).toBe('standby');
    expect(productionIsScheduled(8 * 3600, s.overrides.engineering)).toBe(true);
    expect(productionIsScheduled(16 * 3600, s.overrides.engineering)).toBe(false);
  });
  it('uses the ore buffer before deferring plant throughput after zone curtailment', () => {
    const s = scenario(); s.overrides.engineering = { productionLoadScale: 0.5 };
    // Keep process power available; this test independently checks material conservation.
    let w = createWorld(ctx, s, 0);
    w.feeders['fdr-01'].servicesAllocatedKw = 160;
    const before = w.oreBufferTonnes!;
    w = stepWorld(ctx, s, w, 60).world;
    expect(w.oreBufferTonnes!).toBeLessThan(before);
    expect(w.deferredTonnes).toBeCloseTo(0);
    expect(w.permanentLostTonnes).toBe(0);
  });
  it('rainfall assumptions reach direct kernel callers and thresholds have delayed effects', () => {
    const s = scenario(); const base = createWorld(ctx, s, 0);
    s.overrides.assumptions.rainfallScenarioMultiplier = 3;
    expect(createWorld(ctx, s, 0).sumps['smp-201'].inflowM3h).toBeGreaterThan(base.sumps['smp-201'].inflowM3h);
    s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    const start = recomputeWorld(ctx, s, base);
    expect(start.zones['zone-north'].rateTph).toBe(620);
    const frames = projectWorld(ctx, s, start, 6);
    expect(frames.find(w => w.zones['zone-north'].operatingRatio < 1)!.clock.elapsedSec).toBeGreaterThan(0);
    expect(frames.at(-1)!.deferredTonnes).toBeGreaterThan(0);
  });
  it.each(STRESS_CASES.map(c => [c.label, c.patch] as const))('conserves mass under combined stress: %s', (_label, patch) => {
    const s = scenario(); s.overrides = { ...s.overrides, ...patch };
    const frames = projectWorld(ctx, s, createWorld(ctx, s, 0), 2);
    for (const w of frames.slice(1)) {
      expect(Math.abs(w.waterLedger!.residualM3)).toBeLessThan(1e-7);
      expect(Object.values(w.sumps).every(x => Number.isFinite(x.volumeM3) && x.volumeM3 >= 0)).toBe(true);
      expect(Object.values(w.pumps).every(x => x.powered || x.flowM3h === 0)).toBe(true);
    }
  });
  it('retains rejected recovery and duty-search candidates with explanations', () => {
    const s = scenario(); s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    const w = createWorld(ctx, s, 0);
    const results = compareStrategies(ctx, s, w);
    expect(results).toHaveLength(7);
    expect(results.find(r => r.strategy.id === 'backup')!.violations.length).toBeGreaterThan(0);
    expect(results.find(r => r.strategy.id === 'standby')!.feasible).toBe(false);
    expect(results.find(r => r.strategy.id === 'repair')!.exposureHours).toBeLessThan(results.find(r => r.strategy.id === 'none')!.exposureHours);
    expect(searchDutyStrategies(ctx, s, w)).toHaveLength(4);
    expect(evaluateStrategy(ctx, s, w, recoveryStrategies(w)[1]).frames[0].clock.elapsedSec).toBe(w.clock.elapsedSec);
  });
  it('keeps all forecast central paths identical to a matched canonical projection', () => {
    const s = scenario(); s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    const w = createWorld(ctx, s, 0);
    const forecast = forecastAllSumps({ ctx, scenario: s, world: w, derived: deriveState(ctx, s, w), options: { horizonHours: 1, uncertaintyPct: 0 } });
    const frames = projectWorld(ctx, s, w, 1);
    expect(forecast['smp-201'].points.map(p => p.volumeM3)).toEqual(frames.map(f => f.sumps['smp-201'].volumeM3));
  });
  it('records nullable missing telemetry and traceable proof input values', () => {
    const s = scenario(); s.overrides.engineering = { telemetryFaults: { 'sen-l-201': 'missing' } };
    const w = createWorld(ctx, s, 0);
    const i = investigate(ctx, s, w, 'pmp-201', ['level', 'independent-level']);
    expect(i.measurements[0].observed).toBeNull(); expect(i.measurements[0].residual).toBeNull();
    const proof = engineeringBasis(MINE, s, w, 'pmp-201');
    expect(proof.inputs.find(x => x.name === 'Power')!.value).toBe(w.pumps['pmp-201'].powerKw);
    expect(engineeringBasis(MINE, s, w, 'unmodelled-arc-flash').validation).toContain('Unsupported');
  });
  it('grades investigative evidence once and requires a justified conclusion', () => {
    for (const c of CHALLENGES) {
      expect(challengeScore(c.id, 'advanced', [...c.required, ...c.required], c.answer).score).toBe(0);
      expect(challengeScore(c.id, 'advanced', [], c.answer).score).toBe(0);
      expect(challengeScore(c.id, 'advanced', c.required, 'unsupported-guess').resolved).toBe(false);
    }
  });
  it('branches current state, isolates inputs, records incident, and preserves historical replay', () => {
    useMineStore.getState().runFor(600);
    const parentVolume = useMineStore.getState().getRun().world.sumps['smp-201'].volumeM3;
    const id = useMineStore.getState().createScenarioBranch({ name: 'Verification branch', description: 'Test', hypothesis: 'Test', overrides: { feederOverrides: { 'fdr-02': { status: 'failed' } } } });
    const branch = useMineStore.getState().runs[id];
    expect(branch.world.clock.elapsedSec).toBe(600);
    expect(branch.world.sumps['smp-201'].volumeM3).toBe(parentVolume);
    expect(branch.incidents.length).toBeGreaterThan(0);
    expect(useMineStore.getState().scenarios[0].overrides.feederOverrides['fdr-02']).toBeUndefined();
    useMineStore.getState().runFor(600);
    const oldFrame = useMineStore.getState().getRun().frames[0];
    useMineStore.getState().applyEngineeringOverrides({ feederOverrides: { 'fdr-02': { status: 'energised' } } });
    expect(oldFrame.world.pumps['pmp-201'].flowM3h).toBe(0);
    useMineStore.getState().setReplayIndex(0);
    expect(useMineStore.getState().getDisplayWorld()).toBe(oldFrame.world);
    expect(useMineStore.getState().applyEngineeringOverrides({ engineering: { backupCapacityKw: 123 } }).ok).toBe(false);
  });
  it('rejects invalid configuration without corrupting active scenario state', () => {
    useMineStore.getState().createScenarioBranch({ name: 'Invalid input test', description: '', hypothesis: '' });
    const before = useMineStore.getState().getRun().world;
    expect(useMineStore.getState().applyEngineeringOverrides({ engineering: { backupCapacityKw: -10 } }).ok).toBe(false);
    expect(useMineStore.getState().getRun().world).toBe(before);
  });
});
