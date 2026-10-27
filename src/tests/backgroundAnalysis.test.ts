import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { MINE } from '../data/mine';
import { createBaseline } from '../data/scenarios';
import { DEFAULT_ASSUMPTIONS } from '../simulation/assumptions';
import { createWorld, deriveState } from '../simulation/engine';
import { DependencyGraph } from '../simulation/graph';
import { buildAnalytics } from '../simulation/analytics';
import { forecastAllSumps } from '../simulation/forecast';
import { compareStrategies, customRepairStrategy, recoveryStrategies, strategyInflowSensitivity } from '../simulation/engineeringStudies';
import { runAnalysis } from '../workers/analysisRunner';
import type { AnalysisInput, AnalysisResponse, AnalysisResults } from '../workers/analysisTypes';
import { useMineStore } from '../store/mineStore';

const ctx = { mine: MINE, assumptions: { ...DEFAULT_ASSUMPTIONS, forecastHorizonHours: 1 }, graph: new DependencyGraph(MINE.dependencies) };
function input(): AnalysisInput {
  const scenario = { ...createBaseline(0), id: 'background-study', isBaseline: false };
  return { mine: MINE, assumptions: ctx.assumptions, scenario, world: createWorld(ctx, scenario, 0) };
}

describe('background projections use the canonical calculations', () => {
  it('returns the same forecast points, with an explicit source timestamp', () => {
    const data = input(); const before = JSON.stringify(data.world);
    const result = runAnalysis({ ...data, kind: 'forecasts', options: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const forecasts = result.result as AnalysisResults['forecasts'];
    const direct = forecastAllSumps({ ctx, scenario: data.scenario, world: data.world, derived: deriveState(ctx, data.scenario, data.world) });
    for (const s of MINE.sumps) {
      expect(forecasts[s.id].points).toEqual(direct[s.id].points);
      expect(forecasts[s.id].generatedAtSimSec).toBe(data.world.clock.elapsedSec);
    }
    expect(JSON.stringify(data.world)).toBe(before);
    expect(buildAnalytics({ ctx, scenario: data.scenario, world: data.world, derived: deriveState(ctx, data.scenario, data.world), forecasts,
      assumptions: ctx.assumptions, incidents: [], includeSensitivity: false })).toMatchObject({ sensitivity: [], sensitivityComputed: false });
  });
  it('retains study metrics and recovery results while omitting duplicated integration scratch buffers', () => {
    const data = input(); const before = JSON.stringify(data.world);
    const result = runAnalysis({ ...data, kind: 'comparison', options: { delay: 2 } });
    if (!result.ok) throw new Error(result.error);
    const studies = result.result as AnalysisResults['comparison'];
    const direct = compareStrategies(ctx, data.scenario, data.world, customRepairStrategy(data.world, 2));
    studies.forEach((r, i) => {
      expect(r.deferredTonnes).toBe(direct[i].deferredTonnes);
      expect(r.costUSD).toBe(direct[i].costUSD);
      expect(r.recovery).toEqual(direct[i].recovery);
      expect(r.end.sumps).toEqual(direct[i].end.sumps);
      expect(r.frames[0].sensorSampleHistory).toBeUndefined();
    });
    expect(JSON.stringify(data.world)).toBe(before);
  }, 30_000);
  it('evaluates bounded duty and investment studies in the worker runner', () => {
    const data = input();
    const duty = runAnalysis({ ...data, kind: 'duty', options: {} });
    const investment = runAnalysis({ ...data, kind: 'investments', options: {} });
    expect(duty.ok && (duty.result as AnalysisResults['duty']).length).toBeGreaterThan(0);
    expect(investment.ok && (investment.result as AnalysisResults['investments']).length).toBe(7);
  }, 30_000);
  it('keeps the actual inflow-sensitivity calculations and reports invalid inputs honestly', () => {
    const data = input(); const strategy = recoveryStrategies(data.world)[1];
    const response = runAnalysis({ ...data, kind: 'strategy-sensitivity', options: { strategy } });
    if (!response.ok) throw new Error(response.error);
    const direct = strategyInflowSensitivity(ctx, data.scenario, data.world, strategy);
    expect((response.result as AnalysisResults['strategy-sensitivity']).map(r => r.deferredTonnes)).toEqual(direct.map(r => r.deferredTonnes));
    const sensitivity = runAnalysis({ ...data, kind: 'sensitivity', options: {} });
    expect(sensitivity.ok && (sensitivity.result as AnalysisResults['sensitivity']).length).toBe(5);
    data.world.sumps['smp-201'].volumeM3 = -1;
    expect(runAnalysis({ ...data, kind: 'forecasts', options: {} })).toMatchObject({ ok: false });
  }, 30_000);
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  stopped = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage() {}
  terminate() { this.stopped = true; }
  reply(result: AnalysisResults['forecasts']) { this.onmessage?.({ data: { ok: true, result } } as MessageEvent<AnalysisResponse>); }
}
function suspension(action: () => unknown): Promise<void> {
  try { action(); } catch (value) { if (value instanceof Promise) return value; throw value; }
  throw new Error('Expected a pending worker resource to suspend, not return invented results.');
}
const fixture = (at: number): AnalysisResults['forecasts'] => ({ 'smp-201': { sumpId: 'smp-201', points: [], thresholdCrossings: [], timeToCriticalHours: null,
  timeToCriticalPessimisticHours: null, confidence: 0, contributingSensors: [], evidence: [], assumedOutflowM3h: 0, degradedByInstrumentation: true, generatedAtSimSec: at } });

describe('worker scheduling, cancellation and bounded result caching', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('Worker', FakeWorker); FakeWorker.instances = []; window.history.replaceState(null, '', '/app/forecast'); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('coalesces duplicate requests and terminates completed workers', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    const first = suspension(() => service.readAnalysis('forecasts', {}, data, false));
    expect(suspension(() => service.readAnalysis('forecasts', {}, data, false))).toBe(first);
    expect(FakeWorker.instances).toHaveLength(1);
    FakeWorker.instances[0].reply(fixture(0)); await first;
    expect(service.readAnalysis('forecasts', {}, data, false)).toEqual(fixture(0));
    expect(FakeWorker.instances[0].stopped).toBe(true);
  });
  it('cancels abandoned routes and ignores a late result', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    const pending = suspension(() => service.readAnalysis('forecasts', {}, data, false));
    service.cancelOtherAnalysisScopes('/app/digital-twin'); await pending;
    expect(FakeWorker.instances[0].stopped).toBe(true);
    FakeWorker.instances[0].reply(fixture(999));
    FakeWorker.instances[0].onerror?.({ message: 'Cancelled worker' } as ErrorEvent);
    expect(service.analysisActivity('/app/forecast')).toEqual([]);
    expect(service.analysisSnapshots('/app/forecast')).toEqual([]);
  });
  it('uses the full deployment subpath when retaining current-route work', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    window.history.replaceState(null, '', '/mine-os/app/forecast');
    const pending = suspension(() => service.readAnalysis('forecasts', {}, data, false));
    service.cancelOtherAnalysisScopes(service.analysisScope());
    expect(service.analysisActivity('/mine-os/app/forecast')).toHaveLength(1);
    FakeWorker.instances[0].reply(fixture(0)); await pending;
    expect(service.analysisSnapshots('/mine-os/app/forecast')).toHaveLength(1);
  });
  it('reuses a completed identical projection across module navigation', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    const pending = suspension(() => service.readAnalysis('forecasts', {}, data, false));
    FakeWorker.instances[0].reply(fixture(0)); await pending;
    window.history.replaceState(null, '', '/app/energy');
    service.cancelOtherAnalysisScopes('/app/energy');
    expect(service.readAnalysis('forecasts', {}, data, false)).toEqual(fixture(0));
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it('requires exact paused snapshots, while coalescing live clock refreshes', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    const pending = suspension(() => service.readAnalysis('forecasts', {}, data, true));
    FakeWorker.instances[0].reply(fixture(0)); await pending;
    const newer = { ...data, world: structuredClone(data.world) }; newer.world.clock.elapsedSec = 600;
    expect(service.readAnalysis('forecasts', {}, newer, true)['smp-201'].generatedAtSimSec).toBe(0);
    const exact = suspension(() => service.readAnalysis('forecasts', {}, newer, false));
    FakeWorker.instances[1].reply(fixture(600)); await exact;
    expect(service.readAnalysis('forecasts', {}, newer, false)['smp-201'].generatedAtSimSec).toBe(600);
  });
  it('does not reuse live results across changed engineering inputs and exposes worker errors', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    const pending = suspension(() => service.readAnalysis('forecasts', {}, data, true));
    FakeWorker.instances[0].reply(fixture(0)); await pending;
    const changed = { ...data, assumptions: { ...data.assumptions, rainfallScenarioMultiplier: 2 } };
    const current = suspension(() => service.readAnalysis('forecasts', {}, changed, true));
    FakeWorker.instances[1].onmessage?.({ data: { ok: false, error: 'Unsupported hydraulic duty' } } as MessageEvent<AnalysisResponse>);
    await current;
    expect(() => service.readAnalysis('forecasts', {}, changed, true)).toThrow('Unsupported hydraulic duty');
  });
  it('evicts old completed snapshots rather than retaining unbounded projection histories', async () => {
    const service = await import('../store/analysisJobs'); const data = input();
    for (let i = 0; i < 9; i++) {
      const world = i === 0 ? data.world : structuredClone(data.world); world.clock.elapsedSec = i * 60;
      const current = suspension(() => service.readAnalysis('forecasts', {}, { ...data, world }, false));
      FakeWorker.instances.at(-1)!.reply(fixture(i * 60)); await current;
    }
    const first = suspension(() => service.readAnalysis('forecasts', {}, data, false));
    FakeWorker.instances.at(-1)!.reply(fixture(0)); await first;
    expect(FakeWorker.instances).toHaveLength(10);
  });
});

const initial = useMineStore.getState();
describe('cancellable deterministic time-advance batches', () => {
  beforeEach(() => {
    useMineStore.setState({ ...initial, runs: structuredClone(initial.runs), scenarios: structuredClone(initial.scenarios), advanceTask: null, running: false });
    useMineStore.getState().createScenarioBranch({ name: 'Responsive advance', description: 'test', hypothesis: 'same engine' });
  });
  it('matches synchronous physical accounting and publishes fixed four-step progress batches', async () => {
    const store = useMineStore.getState(); store.runFor(3600); const expected = structuredClone(store.getRun().world);
    store.resetActiveScenario(); const steps: number[] = [];
    const stop = useMineStore.subscribe(s => { if (s.advanceTask) steps.push(s.advanceTask.completed); });
    const result = await store.runForAsync(3600); stop();
    const actual = store.getRun().world;
    expect(result.ok).toBe(true); expect(actual.sumps).toEqual(expected.sumps); expect(actual.zones).toEqual(expected.zones);
    expect(actual.plantProcessedTonnes).toBe(expected.plantProcessedTonnes);
    expect(actual.pumps['pmp-201'].energyKwh).toBe(expected.pumps['pmp-201'].energyKwh);
    expect(steps.every((v, i) => i === 0 || v - steps[i - 1] <= 4)).toBe(true);
    expect(useMineStore.getState().advanceTask).toBeNull();
  });
  it('cancels before the next batch without discarding or overwriting completed steps', async () => {
    const firstBatch = new Promise<void>(resolve => {
      const unsubscribe = useMineStore.subscribe(s => { if (s.advanceTask && s.advanceTask.completed > 0) { unsubscribe(); resolve(); } });
    });
    const store = useMineStore.getState(); const pending = store.runForAsync(3600);
    await firstBatch;
    const at = store.getRun().world.clock.elapsedSec; store.cancelAdvance();
    expect((await pending).ok).toBe(false); expect(store.getRun().world.clock.elapsedSec).toBe(at);
    expect(at).toBeGreaterThan(0); expect(at).toBeLessThan(3600);
  });
  it('stops on a scenario switch and rejects invalid advance horizons', async () => {
    const store = useMineStore.getState(); const pending = store.runForAsync(3600); store.switchScenario('scn-baseline');
    expect((await pending).ok).toBe(false); expect(store.getRun().world.clock.elapsedSec).toBe(0);
    expect((await store.runForAsync(Number.NaN)).ok).toBe(false);
    expect((await store.runForAsync(-1)).ok).toBe(false);
  });
});
