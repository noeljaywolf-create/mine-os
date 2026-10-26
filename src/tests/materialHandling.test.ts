import { describe, expect, it } from 'vitest';
import { allocateMaterial, stepMaterial } from '../simulation/materialHandling';
import { createWorld, deriveState } from '../simulation/engine';
import { projectWorld } from '../simulation/projection';
import { DEFAULT_ASSUMPTIONS } from '../simulation/assumptions';
import { DependencyGraph } from '../simulation/graph';
import { MINE } from '../data/mine';
import { createBaseline } from '../data/scenarios';
import type { MaterialHandlingModel } from '../domain/engineering';

const model: MaterialHandlingModel = { routes: [
  { id: 'primary-a', name: 'A primary', zoneIds: ['a'], capacityTph: 60, defaultAvailable: true, alternative: false },
  { id: 'primary-b', name: 'B primary', zoneIds: ['b'], capacityTph: 0, defaultAvailable: true, alternative: false },
  { id: 'alternate', name: 'Shared alternate', zoneIds: ['a', 'b'], capacityTph: 50, defaultAvailable: true, alternative: true },
], hoistCapacityTph: 150, bufferCapacityTonnes: 100, initialBufferTonnes: 100 };
const ctx = { mine: MINE, graph: new DependencyGraph(MINE.dependencies), assumptions: DEFAULT_ASSUMPTIONS };
const scenario = () => ({ ...createBaseline(0), id: 'material-test', isBaseline: false });

describe('analytical capacity flow and finite material conservation', () => {
  it('finds analytically known 110 t/h maximum flow without double-counting a shared alternate', () => {
    const r = allocateMaterial(model, {}, { a: 100, b: 100 }, Infinity);
    expect(r.totalTph).toBe(110);
    expect(r.routeFlowsTph.alternate).toBe(50);
    expect(r.zoneRatesTph.a + r.zoneRatesTph.b).toBe(110);
    expect(r.routeFlowsTph['primary-a']).toBeLessThanOrEqual(60);
  });
  it('respects the common hoist and finite receiving rate', () => {
    expect(allocateMaterial(model, { hoistCapacityTph: 70 }, { a: 100, b: 100 }, Infinity).totalTph).toBe(70);
    expect(allocateMaterial(model, {}, { a: 100, b: 100 }, 40).totalTph).toBe(40);
    expect(allocateMaterial(model, { hoistAvailable: false }, { a: 100, b: 100 }, Infinity).totalTph).toBe(0);
  });
  it('does not overflow a full stockpile; routes only what can be processed', () => {
    const r = stepMaterial(model, {}, 100, { a: 100, b: 100 }, 100, 40, 3600);
    expect(r.ledger.producedTonnes).toBe(40);
    expect(r.ledger.processedTonnes).toBe(40);
    expect(r.ledger.finalBufferTonnes).toBe(100);
    expect(r.ledger.heldAtFaceTonnes).toBe(160);
    expect(r.ledger.residualTonnes).toBe(0);
  });
  it('rejects invalid capacities instead of inventing transport flow', () => {
    expect(() => allocateMaterial(model, { hoistCapacityTph: -1 }, { a: 100 }, 100)).toThrow();
    expect(() => stepMaterial(model, {}, 101, { a: 100 }, 100, 100, 60)).toThrow();
  });
  it('opening a shared alternative restores only its actual modeled capacity', () => {
    const s = scenario(); s.overrides.engineering = { materialRoutes: { 'mat-north': { available: false } } };
    const blocked = createWorld(ctx, s, 0);
    expect(blocked.zones['zone-north'].rateTph).toBe(0);
    s.overrides.engineering.materialRoutes!['mat-crosscut'] = { available: true };
    const alternate = createWorld(ctx, s, 0);
    expect(alternate.zones['zone-north'].rateTph).toBeCloseTo(250, 7);
    expect(alternate.materialFlow!.routeFlowsTph['mat-crosscut']).toBeCloseTo(250, 7);
    expect(alternate.zones['zone-north'].rateTph).toBeLessThan(620);
  });
  it('finite inventory delays processing loss after a complete ore-movement interruption', () => {
    const s = scenario(); s.overrides.engineering = { hoistAvailable: false };
    const frames = projectWorld(ctx, s, createWorld(ctx, s, 0), 1, 60);
    expect(frames[1].plantProcessedTonnes).toBeGreaterThan(0);
    expect(frames[1].deferredTonnes).toBeCloseTo(0, 7);
    expect(frames.at(-1)!.deferredTonnes).toBeCloseTo(560, 5);
    for (const w of frames.slice(1)) expect(Math.abs(w.materialLedger!.residualTonnes)).toBeLessThan(1e-7);
  });
  it('plant outage fills a bounded buffer and then constrains underground transport', () => {
    const s = scenario(); s.overrides.feederOverrides['fdr-01'] = { status: 'failed' };
    const frames = projectWorld(ctx, s, createWorld(ctx, s, 0), 1, 60);
    for (const w of frames) expect(w.oreBufferTonnes!).toBeLessThanOrEqual(1120 + 1e-7);
    const end = frames.at(-1)!;
    expect(end.oreBufferTonnes).toBeCloseTo(1120, 6);
    expect(deriveState(ctx, s, end).materialFlow.totalTph).toBeCloseTo(0, 6);
  });
});
