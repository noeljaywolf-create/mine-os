import type { EngineeringOverrides } from '../domain/engineering';
import type { Scenario, ScenarioOverride, WorldState } from '../domain/types';
import { recomputeWorld, type EngineContext } from './engine';
import { projectWorld } from './projection';
import { cloneOverrides, mergeEngineering } from './scenarios';
import { achievedRecovery } from './recovery';

export interface Strategy { id: string; label: string; patch: Partial<ScenarioOverride>; delayHours: number;
  resourceCostUSD: number; prerequisites: string[]; risks: string[]; }
export function customRepairStrategy(world: WorldState, delay: number): Strategy {
  return { id: 'custom', label: 'Engineer-defined repair delay', patch: { engineering: { restoreAtSec: world.clock.elapsedSec + delay * 3600 } }, delayHours: delay,
    resourceCostUSD: 2000, prerequisites: ['Engineer-defined delay; repair crew and reviewed switching.'], risks: ['Repair feasibility and timing are assumptions.'] };
}
export function recoveryStrategies(world: WorldState): Strategy[] {
  const base = { delayHours: 0, resourceCostUSD: 0, prerequisites: ['Engineering review and site authorisation required.'],
    risks: ['Simplified model; unresolved inflow, geometry and equipment uncertainty.'] };
  return [
    { ...base, id: 'baseline', label: 'Reference infrastructure', patch: { feederOverrides: { 'fdr-02': { status: 'energised' } }, engineering: { utilityAvailable: true, restoreAtSec: null } } },
    { ...base, id: 'none', label: 'No action', patch: {} },
    { ...base, id: 'repair', label: 'A · Repair feeder (1 h)', delayHours: 1, resourceCostUSD: 2400,
      patch: { engineering: { restoreAtSec: world.clock.elapsedSec + 3600 } }, prerequisites: ['Repair crew and fault location; isolation, inspection and authorised re-energisation.'] },
    { ...base, id: 'backup', label: 'B · Evaluate backup supply', resourceCostUSD: 3800,
      patch: { engineering: { backupConnected: true } }, prerequisites: ['Healthy generator, approved switching AND an independent connection around a failed feeder.'] },
    { ...base, id: 'standby', label: 'C · Healthy standby pump', resourceCostUSD: 450,
      patch: { pumpOverrides: { 'pmp-202': { mode: 'running' } } }, prerequisites: ['Healthy P-202, usable feeder, suction/discharge path and electrical capacity.'] },
    { ...base, id: 'shed', label: 'D · Curtail production loads', resourceCostUSD: 200,
      patch: { engineering: { productionLoadScale: 0.5 } }, prerequisites: ['Operational permission to reduce selected production services; does not repair an open feeder.'] },
    { ...base, id: 'delayed', label: 'E · Delayed feeder repair (4 h)', delayHours: 4, resourceCostUSD: 1400,
      patch: { engineering: { restoreAtSec: world.clock.elapsedSec + 14400 } } },
  ];
}
export function patchedScenario(scenario: Scenario, patch: Partial<ScenarioOverride>): Scenario {
  const overrides = cloneOverrides(scenario.overrides);
  for (const [id, p] of Object.entries(patch.pumpOverrides ?? {})) overrides.pumpOverrides[id] = { ...overrides.pumpOverrides[id], ...p };
  overrides.feederOverrides = { ...overrides.feederOverrides, ...patch.feederOverrides };
  overrides.sumpOverrides = { ...overrides.sumpOverrides, ...patch.sumpOverrides };
  overrides.engineering = mergeEngineering(overrides.engineering, patch.engineering);
  overrides.sensorOverrides = { ...overrides.sensorOverrides, ...patch.sensorOverrides };
  overrides.assetOverrides = { ...overrides.assetOverrides, ...patch.assetOverrides };
  overrides.assumptions = { ...overrides.assumptions, ...patch.assumptions };
  return { ...scenario, overrides };
}
export function evaluateStrategy(ctx: EngineContext, scenario: Scenario, start: WorldState, strategy: Strategy, hours = 6) {
  const candidate = patchedScenario(scenario, strategy.patch);
  const initial = recomputeWorld(ctx, candidate, start);
  const frames = projectWorld(ctx, candidate, initial, hours);
  const end = frames[frames.length - 1];
  const violations: string[] = [];
  const e = candidate.overrides.engineering ?? {};
  const switches = ctx.mine.pumps.filter(p => initial.pumps[p.id].mode !== start.pumps[p.id].mode).length;
  const reserve = ctx.mine.pumps.filter(p => initial.pumps[p.id].mode === 'standby' && initial.pumps[p.id].powered).length;
  if (switches > (e.maximumPumpSwitches ?? 2)) violations.push(`Switching constraint: ${switches} changes exceeds ${e.maximumPumpSwitches ?? 2}.`);
  if (reserve < (e.requiredReservePumps ?? 0)) violations.push(`Conditional standby reserve ${reserve} below configured requirement ${e.requiredReservePumps}.`);
  if (strategy.id === 'backup' && (!e.switchingApproved || !e.electricalRedundancy || e.generatorAvailable === false))
    violations.push('Backup path unavailable: independent connection, healthy generator and approved switching are prerequisites.');
  if (strategy.id === 'standby' && !initial.pumps['pmp-202']?.powered) violations.push('P-202 shares failed feeder F-02; standby is not supply redundancy.');
  for (const pump of ctx.mine.pumps) if (candidate.overrides.pumpOverrides[pump.id]?.mode === 'running' && pump.mode === 'maintenance')
    violations.push(`${pump.id}: equipment held for maintenance.`);
  const exposureHours = frames.slice(1).reduce((sum, w, i) => sum +
    (Object.values(w.sumps).some(s => s.breach?.severity === 'critical') ? (w.clock.elapsedSec - frames[i].clock.elapsedSec) / 3600 : 0), 0);
  const energyKwh = Object.values(end.pumps).reduce((s, p) => s + (p.energyKwh ?? 0), 0) - Object.values(start.pumps).reduce((s, p) => s + (p.energyKwh ?? 0), 0);
  const deferredTonnes = (end.deferredTonnes ?? 0) - (start.deferredTonnes ?? 0);
  const costUSD = Object.values(end.pumps).reduce((s, p) => s + (p.energyCostUSD ?? 0), 0) - Object.values(start.pumps).reduce((s, p) => s + (p.energyCostUSD ?? 0), 0) + strategy.resourceCostUSD;
  const peakLevels = ctx.mine.sumps.map(s => ({ sumpId: s.id, levelM: Math.max(...frames.map(w => w.sumps[s.id].levelM)) }));
  const thresholdViolation = peakLevels.filter(p => p.levelM >= (ctx.mine.sumps.find(s => s.id === p.sumpId)?.thresholds.find(t => t.severity === 'critical')?.levelM ?? Infinity));
  if (thresholdViolation.length) violations.push(`Operating-threshold constraint exceeded: ${thresholdViolation.map(p => p.sumpId).join(', ')}.`);
  for (const w of frames) if (Object.values(w.pumps).some(p => p.hydraulic?.status === 'invalid' || p.hydraulic?.status === 'not-bracketed' ||
    (p.mode === 'running' && p.powered && p.hydraulic?.status !== 'solved'))) {
    violations.push('Hydraulic solution outside supported range.'); break;
  }
  return { strategy, candidate, frames, end, energyKwh, deferredTonnes, costUSD, exposureHours, peakLevels,
    recovery: achievedRecovery(ctx.mine, frames, e),
    feasible: violations.length === 0, violations,
    revenueExposureUSD: deferredTonnes * ctx.assumptions.valuePerTonneUSD };
}
export function compareStrategies(ctx: EngineContext, scenario: Scenario, world: WorldState, custom?: Strategy) {
  const options = [...recoveryStrategies(world), ...(custom ? [custom] : [])];
  return options.map(s => evaluateStrategy(ctx, scenario, world, s));
}
export function strategyObjectives(results: ReturnType<typeof compareStrategies>) {
  const feasible = results.filter(r => r.feasible);
  return { minCost: feasible.length ? Math.min(...feasible.map(r => r.costUSD)) : null,
    minExposure: feasible.length ? Math.min(...feasible.map(r => r.exposureHours)) : null,
    fastest: feasible.filter(r => r.strategy.id !== 'baseline' && r.strategy.id !== 'none' && r.recovery.recovered)
      .sort((a, b) => a.recovery.achievedAtHours! - b.recovery.achievedAtHours! || a.costUSD - b.costUSD || a.strategy.id.localeCompare(b.strategy.id))[0]?.strategy.id };
}
export function strategyInflowSensitivity(ctx: EngineContext, scenario: Scenario, world: WorldState, strategy: Strategy) {
  return [0.8, 1.2].map(f => evaluateStrategy(ctx, { ...scenario, overrides: { ...scenario.overrides,
    sumpOverrides: Object.fromEntries(ctx.mine.sumps.map(s => [s.id, { ...scenario.overrides.sumpOverrides[s.id],
      inflowMultiplier: (scenario.overrides.sumpOverrides[s.id]?.inflowMultiplier ?? 1) * f }])) } }, world, strategy));
}
/** Bounded exhaustive duty search. Every mask is returned, including rejected candidates. */
export function searchDutyStrategies(ctx: EngineContext, scenario: Scenario, world: WorldState) {
  const standby = ctx.mine.pumps.filter(p => (p.installed !== false || scenario.overrides.engineering?.additionalStandby) && (scenario.overrides.pumpOverrides[p.id]?.mode ?? p.mode) === 'standby').slice(0, 3);
  return Array.from({ length: 2 ** standby.length }, (_, mask) => {
    const selected = standby.filter((_, i) => mask & (1 << i));
    const candidate: Strategy = { id: `duty-${mask}`, label: `Duty search ${mask} · ${selected.map(p => p.id).join(' + ') || 'retain reserve'}`,
      patch: { pumpOverrides: Object.fromEntries(selected.map(p => [p.id, { mode: 'running' as const }])) }, delayHours: 0,
      resourceCostUSD: selected.length * 100, prerequisites: ['Electrical allocation, equipment availability and hydraulic envelope must all pass.'],
      risks: ['Reserve decreases when standby equipment is dispatched.', 'Starting/switching transients are not modelled.'] };
    const result = evaluateStrategy(ctx, scenario, world, candidate);
    selected.forEach(p => { if (!result.frames[0].pumps[p.id].powered) result.violations.push(`${p.id}: requested duty cannot be supplied.`); });
    result.feasible = result.violations.length === 0;
    return { ...result, switches: selected.length, remainingReserve: standby.length - selected.length };
  });
}
export const STRESS_CASES: Array<{ label: string; patch: Partial<ScenarioOverride> }> = [
  { label: 'Grid outage + rainfall', patch: { engineering: { utilityAvailable: false }, assumptions: { rainfallScenarioMultiplier: 2.5 } } },
  { label: 'Pump wear + restricted main', patch: { pumpOverrides: { 'pmp-201': { health: 0.6 } }, engineering: { pipes: { 'smp-201': { valveOpen: 0.25 } } } } },
  { label: 'Feeder failure + limited backup', patch: { feederOverrides: { 'fdr-02': { status: 'failed' } }, engineering: { backupConnected: true, backupCapacityKw: 100 } } },
  { label: 'Maintenance + water inrush', patch: { pumpOverrides: { 'pmp-201': { mode: 'maintenance' } }, engineering: { inflowPulse: { sumpId: 'smp-201', startSec: 0, endSec: 3600, flowM3h: 450 } } } },
  { label: 'Communications loss + inflow', patch: { engineering: { telemetryFaults: { 'sen-l-201': 'missing' } }, sumpOverrides: { 'smp-201': { inflowMultiplier: 2 } } } },
];
export const INVESTMENTS: Array<{ label: string; capitalUSD: number; settings: EngineeringOverrides; pumpOverrides?: ScenarioOverride['pumpOverrides']; limitation: string }> = [
  { label: 'Install and dispatch hypothetical P-204', capitalUSD: 160000, settings: { additionalStandby: true },
    pumpOverrides: { 'pmp-204': { mode: 'running' } }, limitation: 'Synthetic P-204 characteristics, shared main and F-02; no power diversity. Installation, suction, motor and pressure design require engineering review.' },
  { label: '25% more storage', capitalUSD: 120000, settings: { storageScale: 1.25 }, limitation: 'No excavation, stability, access or construction design.' },
  { label: '20% larger discharge diameter', capitalUSD: 210000, settings: { dischargeScale: 1.2 }, limitation: 'Pressure rating, transients and constructability require specialist review.' },
  { label: 'Independent backup connection', capitalUSD: 180000, settings: { electricalRedundancy: true, backupConnected: true, switchingApproved: true }, limitation: 'Switching approval is a scenario prerequisite; no protection coordination.' },
  { label: '500 kW backup source', capitalUSD: 320000, settings: { backupCapacityKw: 500, backupConnected: true, switchingApproved: true }, limitation: 'Does not bypass a damaged feeder without independent distribution.' },
  { label: 'Independent level verification', capitalUSD: 12000, settings: { redundantSensor: true }, limitation: 'Improves evidence availability, not physical pumping capability.' },
];

export function capitalAssumption(baseUSD: number, settings?: EngineeringOverrides): number {
  return baseUSD * (settings?.capitalCostMultiplier ?? 1);
}
export function compareInvestments(ctx: EngineContext, scenario: Scenario, world: WorldState) {
  const base = recoveryStrategies(world)[1];
  return [{ label: 'Current infrastructure', capitalUSD: 0, limitation: 'Reference for the same initial storage and scenario.',
    result: evaluateStrategy(ctx, scenario, world, base) }, ...INVESTMENTS.map(i => ({ ...i, capitalUSD: capitalAssumption(i.capitalUSD, scenario.overrides.engineering),
    result: evaluateStrategy(ctx, scenario, world, { ...base, id: i.label, label: i.label, patch: { engineering: i.settings, pumpOverrides: i.pumpOverrides } }) }))];
}
