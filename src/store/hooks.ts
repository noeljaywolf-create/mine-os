import { useEffect, useMemo, useRef } from 'react';
import type {
  Assumptions,
  Capability,
  Incident,
  Scenario,
  SumpId,
  WorldState,
} from '../domain/types';
import { mergeAssumptions, deriveState, type DerivedState, type EngineContext } from '../simulation/engine';
import { forecastAllSumps, type SumpForecastResult } from '../simulation/forecast';
import { buildAnalytics, type AnalyticsBundle } from '../simulation/analytics';
import { hasCapability, roleName, ROLE_BY_ID } from '../domain/roles';
import { useMineStore, type MineState, type ScenarioRun } from './mineStore';

/* -------------------------------------------------------------------------- */
/* Primitive selectors                                                        */
/* -------------------------------------------------------------------------- */

export function useActiveScenario(): Scenario {
  const scenarioId = useMineStore((s) => s.activeScenarioId);
  const scenarios = useMineStore((s) => s.scenarios);
  return useMemo(() => scenarios.find((s) => s.id === scenarioId)!, [scenarios, scenarioId]);
}

export function useRun(): ScenarioRun {
  const scenarioId = useMineStore((s) => s.activeScenarioId);
  const run = useMineStore((s) => s.runs[s.activeScenarioId]);
  return useMemo(() => run, [run, scenarioId]);
}

export function useWorld(): WorldState {
  return useMineStore((s) => s.runs[s.activeScenarioId].world);
}

export function useIncidents(): Incident[] {
  return useMineStore((s) => s.runs[s.activeScenarioId].incidents);
}

export function useReplayFrame() {
  const replayActive = useMineStore((s) => s.replayActive);
  const replayIndex = useMineStore((s) => s.replayIndex);
  const frames = useMineStore((s) => s.runs[s.activeScenarioId].frames);
  const frame = replayActive ? frames[replayIndex] : undefined;
  return { replayActive, replayIndex, frames, frame };
}

/* -------------------------------------------------------------------------- */
/* Context + derived state                                                    */
/* -------------------------------------------------------------------------- */

export function useContext(): EngineContext {
  const mine = useMineStore((s) => s.mine);
  const graph = useMineStore((s) => s.graph);
  const baseAssumptions = useMineStore((s) => s.baseAssumptions);
  const scenario = useActiveScenario();
  return useMemo(
    () => ({
      mine,
      graph,
      assumptions: mergeAssumptions(baseAssumptions, scenario.overrides.assumptions),
    }),
    [mine, graph, baseAssumptions, scenario],
  );
}

export function useAssumptions(): Assumptions {
  return useContext().assumptions;
}

/**
 * Derived state for the live world. This is the single source every module
 * reads from, so a change in one area is immediately visible in all others.
 */
export function useDerived(): DerivedState {
  const ctx = useContext();
  const scenario = useActiveScenario();
  const world = useWorld();
  return useMemo(() => deriveState(ctx, scenario, world), [ctx, scenario, world]);
}

/** Derived state for the currently displayed world (live or replay frame). */
export function useDisplayWorld(): WorldState {
  return useMineStore((s) => s.getDisplayWorld());
}

/* -------------------------------------------------------------------------- */
/* Forecasts and analytics                                                    */
/* -------------------------------------------------------------------------- */

const FORECAST_CACHE = new WeakMap<WorldState, Record<SumpId, SumpForecastResult>>();

export function useForecasts(): Record<SumpId, SumpForecastResult> {
  const ctx = useContext();
  const scenario = useActiveScenario();
  const world = useWorld();
  const derived = useDerived();
  return useMemo(() => {
    const cached = FORECAST_CACHE.get(world);
    if (cached) return cached;
    const next = forecastAllSumps({ ctx, scenario, world, derived });
    FORECAST_CACHE.set(world, next);
    return next;
  }, [ctx, scenario, world, derived]);
}

const ANALYTICS_CACHE = new WeakMap<WorldState, AnalyticsBundle>();

/**
 * Analytics are expensive; recompute at most once per simulated minute by
 * keying the cache on a quantised clock rather than the raw world reference.
 */
export function useAnalytics(): AnalyticsBundle {
  const ctx = useContext();
  const scenario = useActiveScenario();
  const world = useWorld();
  const derived = useDerived();
  const forecasts = useForecasts();
  const incidents = useIncidents();
  const assumptions = useAssumptions();

  const bucket = Math.floor(world.clock.elapsedSec / 60);
  const bucketWorld = useMemo(() => world, [bucket]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const cached = ANALYTICS_CACHE.get(bucketWorld);
    if (cached) return cached;
    const next = buildAnalytics({ ctx, scenario, world, derived, forecasts, incidents, assumptions });
    ANALYTICS_CACHE.set(bucketWorld, next);
    return next;
  }, [ctx, scenario, world, derived, forecasts, incidents, assumptions, bucketWorld]);
}

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

export function useCapabilities() {
  const role = useMineStore((s) => s.role);
  return useMemo(
    () => ({
      role,
      name: roleName(role),
      title: ROLE_BY_ID[role].title,
      remit: ROLE_BY_ID[role].remit,
      can: (capability: Capability) => hasCapability(role, capability),
      all: ROLE_BY_ID[role].capabilities,
      restrictions: ROLE_BY_ID[role].restrictions,
    }),
    [role],
  );
}

export function useCan(capability: Capability): boolean {
  const role = useMineStore((s) => s.role);
  return hasCapability(role, capability);
}

/* -------------------------------------------------------------------------- */
/* Simulation driver                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Drives the simulation with requestAnimationFrame. Paused on tab hide so a
 * background tab does not silently advance the demonstration.
 */
export function useSimulationDriver() {
  const running = useMineStore((s) => s.running);
  const replayActive = useMineStore((s) => s.replayActive);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    if (!running || replayActive) {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }

    const loop = (now: number) => {
      if (last.current === 0) last.current = now;
      const delta = Math.min(120, now - last.current);
      last.current = now;
      if (delta > 0) useMineStore.getState().tick(delta);
      raf.current = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (raf.current !== null) cancelAnimationFrame(raf.current);
        raf.current = null;
      } else if (raf.current === null) {
        last.current = 0;
        raf.current = requestAnimationFrame(loop);
      }
    };

    last.current = 0;
    raf.current = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, replayActive]);
}

/* -------------------------------------------------------------------------- */
/* Convenience read models                                                    */
/* -------------------------------------------------------------------------- */

export function useSimClock() {
  const world = useWorld();
  return useMemo(() => {
    const elapsedSec = world.clock.elapsedSec;
    return {
      elapsedSec,
      atMs: world.clock.epochMs + elapsedSec * 1000,
      stepSec: world.clock.stepSec,
      simTime: `${String(Math.floor(elapsedSec / 3600)).padStart(2, '0')}:${String(
        Math.floor((elapsedSec % 3600) / 60),
      ).padStart(2, '0')}`,
    };
  }, [world.clock]);
}

export function useSelectedAsset() {
  return useMineStore((s) => s.selection);
}

export function useToasts() {
  return useMineStore((s) => s.toasts);
}

export function useActivity() {
  return useMineStore((s) => s.activity);
}

export function useDecisions() {
  return useMineStore((s) => s.decisions);
}

/** Comments relevant to the active scenario (or a specific incident). */
export function useComments(incidentId?: string | null) {
  const scenarioId = useMineStore((s) => s.activeScenarioId);
  const comments = useMineStore((s) => s.comments);
  return useMemo(
    () =>
      comments.filter(
        (c) => c.scenarioId === scenarioId && (incidentId === undefined || c.incidentId === incidentId),
      ),
    [comments, scenarioId, incidentId],
  );
}

export function useStoreApi(): MineState {
  return useMineStore((s) => s);
}
