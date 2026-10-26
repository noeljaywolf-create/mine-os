import type { Scenario, ScenarioOverride, ScenarioId } from '../domain/types';
import type { EngineeringOverrides } from '../domain/engineering';

export function mergeEngineering(base: EngineeringOverrides = {}, patch: EngineeringOverrides = {}): EngineeringOverrides {
  const pipes = { ...base.pipes };
  for (const [id, pipe] of Object.entries(patch.pipes ?? {})) pipes[id] = { ...pipes[id], ...pipe };
  const materialRoutes = { ...base.materialRoutes };
  for (const [id, route] of Object.entries(patch.materialRoutes ?? {})) materialRoutes[id] = { ...materialRoutes[id], ...route };
  return { ...base, ...patch, pipes, materialRoutes, telemetryFaults: { ...base.telemetryFaults, ...patch.telemetryFaults },
    statusFeedback: { ...base.statusFeedback, ...patch.statusFeedback } };
}

/**
 * Scenario management.
 *
 * A scenario is an immutable identity plus a set of overrides on top of the
 * canonical mine. Cloning a scenario copies the overrides by value, so the
 * parent (and the baseline) can never be modified by work done in a branch.
 */

export const BASELINE_SCENARIO_ID: ScenarioId = 'scn-baseline';

export function emptyOverrides(): ScenarioOverride {
  return {
    assetOverrides: {},
    pumpOverrides: {},
    feederOverrides: {},
    sumpOverrides: {},
    sensorOverrides: {},
    assumptions: {},
  };
}

export function createBaselineScenario(epochMs: number): Scenario {
  return {
    id: BASELINE_SCENARIO_ID,
    name: 'Baseline — modelled steady state',
    description:
      'Reference condition for the synthetic mine: nominal drainage, healthy plant, no active deviations. Every branch is compared against this state.',
    parentId: null,
    isBaseline: true,
    createdAtMs: epochMs,
    createdBy: 'MINE OS simulation kernel',
    overrides: emptyOverrides(),
    seed: 20260101,
    hypothesis:
      'With nominal inflow and all duty plant available, sump levels remain below every threshold and production zones run at design rate.',
    tags: ['baseline', 'reference'],
  };
}

export function cloneOverrides(overrides: ScenarioOverride): ScenarioOverride {
  return structuredClone(overrides);
}

export interface CloneOptions {
  name: string;
  description: string;
  hypothesis: string;
  createdBy: string;
  nowMs: number;
  seed?: number;
  tags?: string[];
  /** Overrides applied on top of the parent's overrides. */
  overrides?: Partial<ScenarioOverride>;
}

export function cloneScenario(parent: Scenario, options: CloneOptions): Scenario {
  const overrides = cloneOverrides(parent.overrides);
  if (options.overrides) {
    overrides.engineering = mergeEngineering(overrides.engineering, options.overrides.engineering);
    overrides.assetOverrides = { ...overrides.assetOverrides, ...options.overrides.assetOverrides };
    overrides.pumpOverrides = { ...overrides.pumpOverrides, ...options.overrides.pumpOverrides };
    overrides.feederOverrides = { ...overrides.feederOverrides, ...options.overrides.feederOverrides };
    overrides.sumpOverrides = { ...overrides.sumpOverrides, ...options.overrides.sumpOverrides };
    overrides.sensorOverrides = { ...overrides.sensorOverrides, ...options.overrides.sensorOverrides };
    overrides.assumptions = { ...overrides.assumptions, ...options.overrides.assumptions };
  }
  return {
    id: `scn-${options.nowMs.toString(36)}-${Math.abs(hash(options.name)).toString(36)}`,
    name: options.name,
    description: options.description,
    parentId: parent.id,
    isBaseline: false,
    createdAtMs: options.nowMs,
    createdBy: options.createdBy,
    overrides,
    seed: options.seed ?? parent.seed + 1,
    hypothesis: options.hypothesis,
    tags: options.tags ?? ['branch'],
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return h;
}

/** Deep structural comparison of two override sets — used by the isolation test. */
export function overridesEqual(a: ScenarioOverride, b: ScenarioOverride): boolean {
  return JSON.stringify(sortOverrides(a)) === JSON.stringify(sortOverrides(b));
}

function sortOverrides(overrides: ScenarioOverride): ScenarioOverride {
  const sortRecord = (record: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(record).sort(([x], [y]) => x.localeCompare(y)));
  return {
    assetOverrides: sortRecord(overrides.assetOverrides) as ScenarioOverride['assetOverrides'],
    pumpOverrides: sortRecord(overrides.pumpOverrides) as ScenarioOverride['pumpOverrides'],
    feederOverrides: sortRecord(overrides.feederOverrides) as ScenarioOverride['feederOverrides'],
    sumpOverrides: sortRecord(overrides.sumpOverrides) as ScenarioOverride['sumpOverrides'],
    sensorOverrides: sortRecord(overrides.sensorOverrides) as ScenarioOverride['sensorOverrides'],
    assumptions: sortRecord(overrides.assumptions) as ScenarioOverride['assumptions'],
  };
}

/** The chain of scenarios from the baseline down to the given scenario. */
export function scenarioLineage(scenarios: Scenario[], id: ScenarioId): Scenario[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const chain: Scenario[] = [];
  let current = byId.get(id);
  const guard = new Set<ScenarioId>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
