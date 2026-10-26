import { describe, expect, it } from 'vitest';
import { MINE } from '../data/mine';
import { createBaseline } from '../data/scenarios';
import { DEFAULT_ASSUMPTIONS } from '../simulation/assumptions';
import { DependencyGraph } from '../simulation/graph';
import { createWorld, deriveState, recomputeWorld, stepWorld } from '../simulation/engine';
import { cloneOverrides } from '../simulation/scenarios';
import { frictionFactor, pumpHead, solveStation, systemHead, type CurvePump } from '../simulation/hydraulics';
import { integrateWater, sumpLevelM, sumpVolumeAtLevel, crossingTimeSeconds } from '../simulation/water';
import { integrateNetwork } from '../simulation/waterNetwork';
import { projectWorld } from '../simulation/projection';
import type { PipeModel } from '../domain/engineering';

const ctx = { mine: MINE, graph: new DependencyGraph(MINE.dependencies, MINE.assets.map(a => a.id)), assumptions: DEFAULT_ASSUMPTIONS };
const pump: CurvePump = { ratedFlowM3h: 100, ratedHeadM: 100, efficiency: 0.8, speedRatio: 1, health: 1, curveScale: 1 };
const pipe: PipeModel = { lengthM: 0, diameterM: 0.2, roughnessM: 0, minorK: 0, valveOpen: 1,
  staticHeadM: 100, backPressureKpa: 0, destinationSumpId: null, configuration: 'parallel' };
const scenario = () => ({ ...createBaseline(0), id: 'test', isBaseline: false });

describe('analytically checkable hydraulic foundations', () => {
  it('uses Darcy 64/Re in laminar flow and rejects transition', () => {
    expect(frictionFactor(1000, 0)).toBeCloseTo(0.064, 12);
    expect(frictionFactor(3000, 0)).toBeNull();
    expect(frictionFactor(100000, 0.001)).toBeGreaterThan(0.02);
  });
  it('solves known Q=100 m³/h at H=100 m, with SI hydraulic power', () => {
    const r = solveStation([pump], pipe);
    expect(r.status).toBe('solved');
    expect(r.flowM3h).toBeCloseTo(100, 5);
    expect(r.hydraulicPowerKw).toBeCloseTo(998.2 * 9.80665 * 100 / 3600 * 100 / 1000, 7);
    expect(r.electricalPowerKw).toBeCloseTo(r.hydraulicPowerKw / 0.8, 6);
    expect(r.residualM!).toBeLessThan(1e-5);
  });
  it('adds flow in parallel and head in series', () => {
    expect(solveStation([pump, pump], pipe).flowM3h).toBeCloseTo(200, 5);
    expect(solveStation([pump, pump], { ...pipe, configuration: 'series', staticHeadM: 200 }).flowM3h).toBeCloseTo(100, 5);
  });
  it('increasing pipe resistance reduces operating flow', () => {
    expect(solveStation([pump], { ...pipe, lengthM: 1000 }).flowM3h).toBeLessThan(100);
    expect(systemHead(100, { ...pipe, lengthM: 1000 }).headM).toBeGreaterThan(100);
  });
  it('does not fabricate unreachable or invalid operating points', () => {
    expect(solveStation([pump], { ...pipe, staticHeadM: 130 }).status).toBe('no-head');
    expect(solveStation([pump], { ...pipe, diameterM: -1 }).status).toBe('invalid');
    expect(solveStation([pump], { ...pipe, valveOpen: 0 }).flowM3h).toBe(0);
    expect(solveStation([], pipe).status).toBe('unavailable');
    expect(solveStation([{ ...pump, ratedFlowM3h: 1e20 }], { ...pipe, diameterM: 1e10 }).status).toBe('not-converged');
  });
  it('applies speed affinity laws at shutoff', () => {
    expect(pumpHead(0, { ...pump, speedRatio: 0.5 })).toBeCloseTo(125 / 4);
  });
});

describe('conservative storage and stage geometry', () => {
  it('converts m³/h × seconds / 3600 and closes the ledger', () => {
    const r = integrateWater({ volumeM3: 10, inflowM3h: 100, outflowM3h: 40, dtSec: 60, capacityM3: 100 });
    expect(r.volumeM3).toBeCloseTo(11);
    expect(r.residualM3).toBeCloseTo(0, 12);
  });
  it('records overflow and limits withdrawal from dry storage', () => {
    const full = integrateWater({ volumeM3: 99, inflowM3h: 7200, outflowM3h: 0, dtSec: 1, capacityM3: 100 });
    expect(full.overflowM3).toBe(1);
    expect(full.residualM3).toBe(0);
    const dry = integrateWater({ volumeM3: 1, inflowM3h: 0, outflowM3h: 7200, dtSec: 1, capacityM3: 100 });
    expect(dry.volumeM3).toBe(0); expect(dry.actualOutM3).toBe(1); expect(dry.residualM3).toBe(0);
  });
  it('rejects invalid dimensions and negative integration time', () => {
    expect(() => integrateWater({ volumeM3: 10, inflowM3h: 1, outflowM3h: 0, dtSec: -1, capacityM3: 100 })).toThrow();
  });
  it('inverts a piecewise stage-storage relation', () => {
    const s = { ...MINE.sumps[0], stageStorage: [{ levelM: 0, volumeM3: 0 }, { levelM: 2, volumeM3: 100 }, { levelM: 5, volumeM3: 400 }] };
    expect(sumpLevelM(s, 250)).toBeCloseTo(3.5);
    expect(sumpVolumeAtLevel(s, 3.5)).toBeCloseTo(250);
  });
  it('records each inter-sump transfer exactly once, conserving site mass', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    s.overrides.engineering = { pipes: { 'smp-301': { destinationSumpId: 'smp-201' } } };
    const r = integrateNetwork(MINE, s.overrides, w.sumps, w.pumps, {}, 60);
    expect(r.ledger.transfers).toHaveLength(1);
    expect(r.ledger.transfers[0].volumeM3).toBeGreaterThan(0);
    expect(Math.abs(r.ledger.residualM3)).toBeLessThan(1e-8);
  });
  it('recognises an already-crossed threshold at time zero', () => {
    expect(crossingTimeSeconds([{ tSec: 0, levelM: 10 } as never], 8)).toBe(0);
  });
});

describe('canonical cross-system simulation', () => {
  it('removes failed-feeder pumping without instantaneous production loss', () => {
    const s = scenario(); const initial = createWorld(ctx, s, 0);
    s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    const w = recomputeWorld(ctx, s, initial);
    expect(w.pumps['pmp-201'].flowM3h).toBe(0);
    expect(w.sumps['smp-201'].outflowM3h).toBe(0);
    expect(w.zones['zone-north'].operatingRatio).toBe(1);
    expect(w.zones['zone-north'].lostTonnes).toBe(0);
    const next = stepWorld(ctx, s, w, 60).world;
    expect(next.sumps['smp-201'].volumeM3).toBeGreaterThan(w.sumps['smp-201'].volumeM3);
    expect(Math.abs(next.waterLedger!.residualM3)).toBeLessThan(1e-8);
  });
  it('enforces feeder capacity and excludes maintenance motors', () => {
    const s = scenario(); s.overrides.engineering = { utilityAvailable: false, backupConnected: true,
      generatorAvailable: true, switchingApproved: true, backupCapacityKw: 100 };
    s.overrides.pumpOverrides['pmp-101'] = { mode: 'maintenance' };
    const w = createWorld(ctx, s, 0);
    expect(w.pumps['pmp-101'].flowM3h).toBe(0);
    expect(Object.values(w.feeders).reduce((n, f) => n + (f.allocatedKw ?? 0), 0)).toBeLessThanOrEqual(100);
    expect(Object.values(w.pumps).reduce((n, p) => n + p.powerKw, 0)).toBeLessThanOrEqual(100 + 1e-5);
  });
  it('has deterministic replay and scenario isolation', () => {
    const s = scenario(); const initial = createWorld(ctx, s, 0);
    expect(projectWorld(ctx, s, initial, 0.5)).toEqual(projectWorld(ctx, s, initial, 0.5));
    const copy = cloneOverrides(s.overrides); copy.pumpOverrides['pmp-201'] = { health: 0.2 };
    expect(s.overrides.pumpOverrides['pmp-201']).toBeUndefined();
    expect(initial.clock.elapsedSec).toBe(0);
  });
  it('does not use future overrides to modify historical snapshot inputs', () => {
    const s = scenario(); const w = createWorld(ctx, s, 0);
    s.overrides.feederOverrides['fdr-02'] = { status: 'failed' };
    expect(w.scenarioSnapshot!.feederOverrides['fdr-02']).toBeUndefined();
  });
  it('keeps missing observations null while physical storage continues', () => {
    const s = scenario(); s.overrides.engineering = { telemetryFaults: { 'sen-l-201': 'missing' } };
    const w = stepWorld(ctx, s, createWorld(ctx, s, 0), 60).world;
    expect(w.sensors['sen-l-201'].lastValue).toBeNull();
    expect(w.sensors['sen-l-201'].confidence).toBe(0);
    expect(w.sumps['smp-201'].volumeM3).toBeGreaterThanOrEqual(0);
    expect(deriveState(ctx, s, w).sensorStates['sen-l-201'].freshness).toBe('unavailable');
  });
});
