import { create } from 'zustand';
import type {
  Action,
  ActionKind,
  AssetId,
  Assumptions,
  Comment,
  EngineeringDecision,
  Incident,
  PumpMode,
  Scenario,
  ScenarioId,
  SensorId,
  TelemetryPoint,
  UserRole,
  WorldState,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { MINE } from '../data/mine';
import { buildLibrary, createBaseline } from '../data/scenarios';
import type { DependencyGraph } from '../simulation/graph';
import { MINE_GRAPH } from '../simulation';
import { DEFAULT_ASSUMPTIONS } from '../simulation/assumptions';
import {
  createWorld,
  deriveState,
  mergeAssumptions,
  recomputeWorld,
  stepWorld,
  type DerivedState,
  type EngineContext,
} from '../simulation/engine';
import { detectIncidents, transitionIncident } from '../simulation/incidents';
import { cloneOverrides, mergeEngineering } from '../simulation/scenarios';
import { hasCapability, ROLE_BY_ID, roleName } from '../domain/roles';
import type { Capability } from '../domain/types';

/** Simulated seconds advanced per real second at 1× speed. */
export const SIM_SECONDS_PER_REAL_SECOND = 300;
/** Replay frame interval in simulated seconds. */
const FRAME_INTERVAL_SEC = 300;
const MAX_FRAMES = 420;
const MAX_TELEMETRY_POINTS = 360;
let advanceSequence = 0;

export interface ReplayFrame {
  simSec: number;
  atMs: number;
  world: WorldState;
  incidents: Incident[];
}

export interface ScenarioRun {
  scenarioId: ScenarioId;
  world: WorldState;
  incidents: Incident[];
  actions: Action[];
  telemetry: Record<SensorId, TelemetryPoint[]>;
  frames: ReplayFrame[];
  accumulatorSec: number;
  lastFrameSimSec: number;
  stepsTaken: number;
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
  atMs: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface AssetSelection {
  assetId: AssetId | null;
  incidentId: string | null;
  sumpId: string | null;
}

export interface WorkspaceFilters {
  systems: string[];
  statuses: string[];
  levelIds: string[];
  search: string;
}

export interface MineState {
  applyEngineeringOverrides: (patch: Partial<Scenario['overrides']>) => ActionResult;
  mine: MineDefinition;
  graph: DependencyGraph;
  baseAssumptions: Assumptions;
  demoEpochMs: number;

  scenarios: Scenario[];
  activeScenarioId: ScenarioId;
  runs: Record<ScenarioId, ScenarioRun>;

  role: UserRole;
  actorName: string;
  running: boolean;
  advanceTask: { id: number; scenarioId: ScenarioId; completed: number; total: number } | null;
  speed: number;

  replayActive: boolean;
  replayIndex: number;

  selection: AssetSelection;
  filters: WorkspaceFilters;
  toasts: Toast[];

  comments: Comment[];
  decisions: EngineeringDecision[];
  activity: Array<{
    id: string;
    atMs: number;
    atSimSec: number;
    actor: string;
    role: string;
    kind: 'action' | 'comment' | 'decision' | 'incident' | 'scenario' | 'role';
    summary: string;
    refs: string[];
  }>;

  // ---- derived access helpers
  getRun: () => ScenarioRun;
  getScenario: (id?: ScenarioId) => Scenario;
  getDerived: () => DerivedState;
  getAssumptions: () => Assumptions;
  isReplaying: () => boolean;
  getDisplayWorld: () => WorldState;
  can: (capability: Capability) => boolean;

  // ---- simulation control
  tick: (deltaMs: number) => void;
  stepOnce: () => void;
  runFor: (simSeconds: number) => void;
  runForAsync: (simSeconds: number) => Promise<ActionResult>;
  cancelAdvance: () => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  resetActiveScenario: () => void;

  // ---- scenario management
  switchScenario: (id: ScenarioId) => void;
  createScenarioBranch: (input: {
    name: string;
    description: string;
    hypothesis: string;
    overrides?: Partial<Scenario['overrides']>;
    seed?: number;
  }) => ScenarioId;
  updateScenarioMeta: (id: ScenarioId, patch: Partial<Pick<Scenario, 'name' | 'description' | 'hypothesis'>>) => void;

  // ---- interventions
  setFeederStatus: (feederId: string, status: 'energised' | 'degraded' | 'failed' | 'isolated' | 'maintenance') => ActionResult;
  setPumpMode: (pumpId: string, mode: PumpMode) => ActionResult;
  setPumpHealth: (pumpId: string, health: number) => ActionResult;
  setSumpInflowMultiplier: (sumpId: string, multiplier: number) => ActionResult;
  setSensorStale: (sensorId: string, stale: boolean) => ActionResult;
  setAssumption: (key: keyof Assumptions, value: number) => ActionResult;
  restoreAllDeviations: () => ActionResult;

  // ---- incidents & collaboration
  incidentAction: (
    incidentId: string,
    action: ActionKind,
    payload?: { note?: string; assignee?: string },
  ) => ActionResult;
  recordDecision: (decision: Omit<EngineeringDecision, 'id' | 'atMs' | 'atSimSec' | 'author' | 'role' | 'scenarioId' | 'status'> & { status?: EngineeringDecision['status'] }) => ActionResult;
  addComment: (input: { body: string; incidentId?: string | null; decisionId?: string | null }) => ActionResult;
  dismissToast: (id: string) => void;

  // ---- ui
  setRole: (role: UserRole) => void;
  selectAsset: (selection: Partial<AssetSelection>) => void;
  clearSelection: () => void;
  setFilters: (patch: Partial<WorkspaceFilters>) => void;
  setReplayIndex: (index: number | null) => void;
}

// ---------------------------------------------------------------------------
// Personas — demonstration identities, not authenticated users.
const PERSONAS: Record<UserRole, string> = {
  'control-room-operator': 'D. Mensah',
  'electrical-engineer': 'R. Okafor',
  'mechanical-engineer': 'L. Ferreira',
  'dewatering-engineer': 'A. Novak',
  'mine-manager': 'S. du Toit',
  'safety-officer': 'K. Ibrahim',
  'executive-viewer': 'J. Whitfield',
};

const DEMO_EPOCH_MS = Date.UTC(2026, 9, 22, 6, 0, 0);

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function initialTelemetry(mine: MineDefinition): Record<SensorId, TelemetryPoint[]> {
  const result: Record<SensorId, TelemetryPoint[]> = {};
  for (const sensor of mine.sensors) result[sensor.id] = [];
  return result;
}

function makeRun(ctx: EngineContext, scenario: Scenario, mine: MineDefinition): ScenarioRun {
  const world = createWorld(ctx, scenario, DEMO_EPOCH_MS);
  const initialFrame: ReplayFrame = {
    simSec: 0,
    atMs: DEMO_EPOCH_MS,
    world: { ...world, history: [] },
    incidents: [],
  };
  return {
    scenarioId: scenario.id,
    world,
    incidents: [],
    actions: [],
    telemetry: initialTelemetry(mine),
    frames: [initialFrame],
    accumulatorSec: 0,
    lastFrameSimSec: 0,
    stepsTaken: 0,
  };
}

function contextFor(state: Pick<MineState, 'baseAssumptions' | 'mine' | 'graph'>, scenario: Scenario): EngineContext {
  const assumptions = mergeAssumptions(state.baseAssumptions, scenario.overrides.assumptions);
  return { mine: state.mine, graph: state.graph, assumptions };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toast(state: MineState, kind: ToastKind, title: string, message: string): Toast[] {
  return [
    ...state.toasts,
    { id: uid('toast'), kind, title, message, atMs: state.runs[state.activeScenarioId].world.clock.epochMs + state.runs[state.activeScenarioId].world.clock.elapsedSec * 1000 },
  ].slice(-4);
}

function logActivity(
  state: MineState,
  kind: MineState['activity'][number]['kind'],
  summary: string,
  refs: string[] = [],
): MineState['activity'] {
  const run = state.runs[state.activeScenarioId];
  return [
    ...state.activity,
    {
      id: uid('act'),
      atMs: run.world.clock.epochMs + run.world.clock.elapsedSec * 1000,
      atSimSec: run.world.clock.elapsedSec,
      actor: state.actorName,
      role: roleName(state.role),
      kind,
      summary,
      refs,
    },
  ].slice(-300);
}

/**
 * Advance the active scenario by a number of integration steps.
 * This is the only place where the canonical state moves forward.
 */
function advance(state: MineState, steps: number): Partial<MineState> {
  if (steps <= 0) return {};
  const scenario = state.scenarios.find((s) => s.id === state.activeScenarioId)!;
  const ctx = contextFor(state, scenario);
  const run = state.runs[state.activeScenarioId];

  let world = run.world;
  const telemetry: Record<SensorId, TelemetryPoint[]> = { ...run.telemetry };
  const frames = [...run.frames];
  let lastFrameSimSec = run.lastFrameSimSec;
  let stepsTaken = run.stepsTaken;

  const dt = world.clock.stepSec;

  for (let i = 0; i < steps; i += 1) {
    const result = stepWorld(ctx, scenario, world, dt);
    world = result.world;
    stepsTaken += 1;
    if (world.clock.elapsedSec - lastFrameSimSec >= FRAME_INTERVAL_SEC) {
      frames.push({ simSec: world.clock.elapsedSec, atMs: world.clock.epochMs + world.clock.elapsedSec * 1000,
        world: { ...world, history: [] }, incidents: run.incidents });
      lastFrameSimSec = world.clock.elapsedSec;
    }

    for (const sensor of state.mine.sensors) {
      const sensorState = world.sensors[sensor.id];
      if (!sensorState || sensorState.freshness !== 'live') continue;
      const value = sensorState.lastValue;
      if (value === null) continue;
      const series = [...(telemetry[sensor.id] ?? [])];
      series.push({
        epochMs: world.clock.epochMs + world.clock.elapsedSec * 1000,
        simSec: world.clock.elapsedSec,
        value,
      });
      telemetry[sensor.id] = series.slice(-MAX_TELEMETRY_POINTS);
    }
  }

  // Incident detection once per advance batch.
  const derived = deriveState(ctx, scenario, world);
  const detection = detectIncidents({
    ctx,
    scenario,
    world,
    derived,
    existing: run.incidents,
    actor: state.actorName,
    role: roleName(state.role),
  });

  let toasts = state.toasts;
  let incidents = detection.incidents;
  let activity = state.activity;
  const nowMs = world.clock.epochMs + world.clock.elapsedSec * 1000;

  if (detection.newIncidents.length > 0) {
    toasts = [...toasts];
    for (const incident of detection.newIncidents) {
      toasts.push({
        id: uid('toast'),
        kind: incident.severity === 'critical' ? 'error' : incident.severity === 'high' ? 'warning' : 'info',
        title: `${incident.reference} · ${incident.severity}`,
        message: incident.title,
        atMs: nowMs,
      });
      activity = [
        ...activity,
        {
          id: uid('act'),
          atMs: nowMs,
          atSimSec: world.clock.elapsedSec,
          actor: 'Simulation engine',
          role: 'system',
          kind: 'incident' as const,
          summary: `Raised ${incident.reference}: ${incident.title}`,
          refs: [incident.id],
        },
      ];
    }
    toasts = toasts.slice(-4);
  }

  const shouldFrame =
    world.clock.elapsedSec - lastFrameSimSec >= FRAME_INTERVAL_SEC ||
    detection.newIncidents.length > 0 ||
    frames.length === 0;

  if (shouldFrame) {
    frames.push({
      simSec: world.clock.elapsedSec,
      atMs: nowMs,
      world: { ...deepClone(world), history: [] },
      incidents: incidents.filter((incident) => !incident.closedAtMs),
    });
    lastFrameSimSec = world.clock.elapsedSec;
  }

  const nextRun: ScenarioRun = {
    ...run,
    world,
    incidents,
    telemetry,
    frames: frames.length > MAX_FRAMES ? frames.slice(frames.length - MAX_FRAMES) : frames,
    lastFrameSimSec,
    stepsTaken,
  };

  return {
    runs: { ...state.runs, [state.activeScenarioId]: nextRun },
    toasts,
    activity,
  };
}

// ---------------------------------------------------------------------------
export const useMineStore = create<MineState>((set, get) => {
  const baseline = createBaseline(DEMO_EPOCH_MS);
  const library = buildLibrary(baseline, MINE, DEMO_EPOCH_MS);
  const scenarios = [baseline, ...library];

  const initialRuns: Record<ScenarioId, ScenarioRun> = {};
  for (const scenario of scenarios) {
    initialRuns[scenario.id] = makeRun(contextFor({ baseAssumptions: DEFAULT_ASSUMPTIONS, mine: MINE, graph: MINE_GRAPH }, scenario), scenario, MINE);
  }

  const initialState = {
    mine: MINE,
    graph: MINE_GRAPH,
    baseAssumptions: DEFAULT_ASSUMPTIONS,
    demoEpochMs: DEMO_EPOCH_MS,
    scenarios,
    activeScenarioId: baseline.id,
    runs: initialRuns,
    role: 'dewatering-engineer' as UserRole,
    actorName: PERSONAS['dewatering-engineer'],
    running: false,
    advanceTask: null as MineState['advanceTask'],
    speed: 1,
    replayActive: false,
    replayIndex: 0,
    selection: { assetId: null, incidentId: null, sumpId: null },
    filters: { systems: [], statuses: [], levelIds: [], search: '' },
    toasts: [],
    comments: [
      {
        id: 'cmt-seed-1',
        scenarioId: baseline.id,
        incidentId: null,
        author: 'A. Novak',
        role: 'Dewatering Engineer',
        atMs: DEMO_EPOCH_MS,
        body: 'Baseline reference uses synthetic stage-storage geometry and calculated pump/system operating points. Review actual flow and motor constraints; these are not field-validated operating duties.',
        decisionId: null,
      },
    ],
    decisions: [],
    activity: [
      {
        id: 'act-seed-1',
        atMs: DEMO_EPOCH_MS,
        atSimSec: 0,
        actor: 'Simulation engine',
        role: 'system',
        kind: 'scenario' as const,
        summary: 'Baseline scenario initialised from the synthetic mine model.',
        refs: [baseline.id],
      },
    ],
  };

  return {
    ...initialState,

    getRun: () => get().runs[get().activeScenarioId],
    getScenario: (id) => get().scenarios.find((s) => s.id === (id ?? get().activeScenarioId))!,
    getAssumptions: () => {
      const state = get();
      return mergeAssumptions(state.baseAssumptions, state.getScenario().overrides.assumptions);
    },
    getDerived: () => {
      const state = get();
      const scenario = state.getScenario();
      return deriveState(contextFor(state, scenario), scenario, state.getRun().world);
    },
    isReplaying: () => get().replayActive,
    getDisplayWorld: () => {
      const state = get();
      const run = state.getRun();
      if (!state.replayActive) return run.world;
      const frame = run.frames[state.replayIndex];
      return frame ? frame.world : run.world;
    },
    can: (capability) => hasCapability(get().role, capability) && (!get().replayActive || capability.startsWith('view.') || capability === 'settings.role' || capability === 'report.export'),

    // ---------------------------------------------------------- simulation
    tick: (deltaMs) => {
      const state = get();
      if (!state.running || state.replayActive || state.advanceTask) return;
      const run = state.getRun();
      const simSec = (deltaMs / 1000) * SIM_SECONDS_PER_REAL_SECOND * state.speed;
      const total = run.accumulatorSec + simSec;
      const dt = run.world.clock.stepSec;
      const steps = Math.min(Math.floor(total / dt), 60);
      if (steps <= 0) {
        set({
          runs: {
            ...state.runs,
            [state.activeScenarioId]: { ...run, accumulatorSec: total },
          },
        });
        return;
      }
      set(advance(state, steps));
      set((s) => ({
        runs: {
          ...s.runs,
          [s.activeScenarioId]: {
            ...s.runs[s.activeScenarioId],
            accumulatorSec: total - steps * dt,
          },
        },
      }));
    },

    stepOnce: () => {
      const state = get();
      if (state.replayActive || state.advanceTask) return;
      set(advance(state, 1));
      set({ replayActive: false });
    },

    runFor: (simSeconds) => {
      const state = get();
      if (state.replayActive) return;
      const dt = state.getRun().world.clock.stepSec;
      const steps = Math.max(1, Math.round(simSeconds / dt));
      set(advance(state, steps));
    },

    runForAsync: async (simSeconds) => {
      const state = get();
      if (state.replayActive || state.advanceTask) return { ok: false, message: 'Leave replay or finish/cancel the current time advance first.' };
      if (!Number.isFinite(simSeconds) || simSeconds <= 0 || simSeconds > 48 * 3600) return { ok: false, message: 'Time advance must be within (0, 48 hours].' };
      const id = ++advanceSequence; const scenarioId = state.activeScenarioId;
      const total = Math.max(1, Math.round(simSeconds / state.getRun().world.clock.stepSec));
      let expectedWorld = state.getRun().world;
      set({ running: false, advanceTask: { id, scenarioId, completed: 0, total } });
      try {
        // Fixed batches preserve deterministic event/incident checkpoints while
        // yielding between batches so navigation and cancel clicks are processed.
        for (let completed = 0; completed < total;) {
          await new Promise<void>(resolve => setTimeout(resolve, 16));
          const current = get();
          if (current.advanceTask?.id !== id || current.activeScenarioId !== scenarioId || current.replayActive || current.getRun().world !== expectedWorld)
            return { ok: false, message: 'Time advance stopped; completed steps are retained.' };
          const count = Math.min(4, total - completed);
          const updated = advance(current, count); completed += count;
          set({ ...updated, advanceTask: { id, scenarioId, completed, total } });
          expectedWorld = get().getRun().world;
        }
        return { ok: true, message: 'Requested simulation interval completed.' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set(s => ({ toasts: toast(s, 'error', 'Time advance stopped', message) }));
        return { ok: false, message };
      } finally { if (get().advanceTask?.id === id) set({ advanceTask: null }); }
    },
    cancelAdvance: () => set({ advanceTask: null, running: false }),

    setRunning: (running) => { if (!get().advanceTask) set({ running }); },

    setSpeed: (speed) => set({ speed }),

    resetActiveScenario: () => {
      const state = get();
      const scenario = state.getScenario();
      const run = makeRun(contextFor(state, scenario), scenario, state.mine);
      set({
        runs: { ...state.runs, [state.activeScenarioId]: run },
        replayActive: false,
        replayIndex: 0,
        running: false,
        activity: logActivity(state, 'scenario', `Reset scenario "${scenario.name}" to its initial modelled state.`, [scenario.id]),
      });
    },

    // ------------------------------------------------------------- scenarios
    switchScenario: (id) => {
      const state = get();
      if (!state.scenarios.some((s) => s.id === id)) return;
      set({
        activeScenarioId: id,
        replayActive: false,
        replayIndex: 0,
        running: false,
        selection: { assetId: null, incidentId: null, sumpId: null },
      });
    },

    createScenarioBranch: (input) => {
      const state = get();
      if (!state.can('scenario.clone')) {
        set({ toasts: toast(state, 'error', 'Not permitted', `${roleName(state.role)} cannot create scenarios in this demonstration.`) });
        return state.activeScenarioId;
      }
      const parent = state.getScenario();
      const nowMs = Date.now();
      const scenario: Scenario = {
        id: `scn-${nowMs.toString(36)}`,
        name: input.name,
        description: input.description,
        parentId: parent.id,
        isBaseline: false,
        createdAtMs: nowMs,
        createdBy: state.actorName,
        overrides: cloneOverrides(parent.overrides),
        seed: input.seed ?? parent.seed,
        hypothesis: input.hypothesis,
        tags: ['branch'],
      };
      if (input.overrides) {
        scenario.overrides = {
          engineering: mergeEngineering(scenario.overrides.engineering, input.overrides.engineering),
          assetOverrides: { ...scenario.overrides.assetOverrides, ...input.overrides.assetOverrides },
          pumpOverrides: { ...scenario.overrides.pumpOverrides, ...input.overrides.pumpOverrides },
          feederOverrides: { ...scenario.overrides.feederOverrides, ...input.overrides.feederOverrides },
          sumpOverrides: { ...scenario.overrides.sumpOverrides, ...input.overrides.sumpOverrides },
          sensorOverrides: { ...scenario.overrides.sensorOverrides, ...input.overrides.sensorOverrides },
          assumptions: { ...scenario.overrides.assumptions, ...input.overrides.assumptions },
        };
      }
      const run = makeRun(contextFor(state, scenario), scenario, state.mine);
      const branchContext = contextFor(state, scenario);
      run.world = recomputeWorld(branchContext, scenario, deepClone(state.getRun().world));
      run.world.scenarioId = scenario.id;
      run.telemetry = deepClone(state.getRun().telemetry);
      const detection = detectIncidents({ ctx: branchContext, scenario, world: run.world,
        derived: deriveState(branchContext, scenario, run.world), existing: [], actor: state.actorName, role: roleName(state.role) });
      run.incidents = detection.incidents;
      run.world.history = [...run.world.history, { id: `branch-input-${scenario.seed}-${run.world.step}`,
        atSimSec: run.world.clock.elapsedSec, atMs: run.world.clock.epochMs + run.world.clock.elapsedSec * 1000,
        type: 'scenario-event', summary: 'Scenario branched with engineering inputs', detail: JSON.stringify(scenario.overrides), evidence: [] }];
      run.frames = [{ world: deepClone(run.world), simSec: run.world.clock.elapsedSec,
        atMs: run.world.clock.epochMs + run.world.clock.elapsedSec * 1000, incidents: run.incidents }];
      run.lastFrameSimSec = run.world.clock.elapsedSec;
      set({
        scenarios: [...state.scenarios, scenario],
        runs: { ...state.runs, [scenario.id]: run },
        activeScenarioId: scenario.id,
        replayActive: false,
        replayIndex: 0,
        running: false,
        activity: logActivity(state, 'scenario', `Branched "${parent.name}" into "${scenario.name}".`, [parent.id, scenario.id]),
        toasts: toast(state, 'success', 'Scenario branched', `${scenario.name} created from ${parent.name}. The parent scenario is unchanged.`),
      });
      return scenario.id;
    },

    updateScenarioMeta: (id, patch) => {
      const state = get();
      set({
        scenarios: state.scenarios.map((scenario) =>
          scenario.id === id ? { ...scenario, ...patch } : scenario,
        ),
      });
    },

    // ---------------------------------------------------------- interventions
    applyEngineeringOverrides: (patch) => {
      const state = get();
      if (!state.can('scenario.edit-assumptions') || state.getScenario().isBaseline || state.replayActive)
        return { ok: false, message: 'Branch an editable scenario and leave replay before applying engineering changes.' };
      // Permission checks for specific override types: Mine Manager can edit assumptions but
      // cannot fail feeders or start pumps through this path.
      for (const [fid, st] of Object.entries(patch.feederOverrides ?? {})) {
        if (st.status === 'failed' || st.status === 'degraded') {
          if (!state.can('asset.fail')) {
            const message = `${roleName(state.role)} cannot fail feeder ${fid}.`;
            set({ toasts: toast(state, 'error', 'Action refused', message) });
            return { ok: false, message };
          }
        } else if (st.status === 'energised') {
          if (!state.can('asset.restore')) {
            const message = `${roleName(state.role)} cannot restore feeder ${fid}.`;
            set({ toasts: toast(state, 'error', 'Action refused', message) });
            return { ok: false, message };
          }
        }
      }
      for (const [pid, po] of Object.entries(patch.pumpOverrides ?? {})) {
        if (po.mode === 'running' && !state.can('pump.start')) {
          const message = `${roleName(state.role)} cannot start pump ${pid}.`;
          set({ toasts: toast(state, 'error', 'Action refused', message) });
          return { ok: false, message };
        }
        if (po.mode === 'standby' && !state.can('pump.toggle-standby')) {
          const message = `${roleName(state.role)} cannot set standby on pump ${pid}.`;
          set({ toasts: toast(state, 'error', 'Action refused', message) });
          return { ok: false, message };
        }
        if (po.mode === 'stopped' && !state.can('pump.stop')) {
          const message = `${roleName(state.role)} cannot stop pump ${pid}.`;
          set({ toasts: toast(state, 'error', 'Action refused', message) });
          return { ok: false, message };
        }
      }
      const scenario = state.getScenario();
      const overrides = cloneOverrides(scenario.overrides);
      const engineering = patch.engineering;
      overrides.engineering = mergeEngineering(overrides.engineering, engineering);
      for (const [id, values] of Object.entries(patch.pumpOverrides ?? {})) overrides.pumpOverrides[id] = { ...overrides.pumpOverrides[id], ...values };
      for (const [id, values] of Object.entries(patch.sumpOverrides ?? {})) overrides.sumpOverrides[id] = { ...overrides.sumpOverrides[id], ...values };
      overrides.feederOverrides = { ...overrides.feederOverrides, ...patch.feederOverrides };
      overrides.assumptions = { ...overrides.assumptions, ...patch.assumptions };
      const updated = { ...scenario, overrides };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      try {
        const world = recomputeWorld(ctx, updated, run.world);
        const atSimSec = world.clock.elapsedSec;
        world.history = [...world.history, { id: `engineering-${world.step}-${run.actions.length}-${world.history.length}`,
          atSimSec, atMs: world.clock.epochMs + atSimSec * 1000, type: 'scenario-event' as const,
          summary: 'Engineering intervention applied', detail: JSON.stringify(patch), evidence: [] }];
        const detection = detectIncidents({ ctx, scenario: updated, world, derived: deriveState(ctx, updated, world),
          existing: run.incidents, actor: state.actorName, role: roleName(state.role) });
        set({ scenarios: state.scenarios.map(s => s.id === updated.id ? updated : s),
          runs: { ...state.runs, [updated.id]: { ...run, world, incidents: detection.incidents } },
          activity: logActivity(state, 'action', 'Engineering parameters changed; shared kernel recomputed.'),
          toasts: toast(state, 'success', 'Model recalculated', 'Hydraulics, power, storage and production share these inputs.') });
        return { ok: true, message: 'Applied to the shared scenario.' };
      } catch (error) { return { ok: false, message: String(error) }; }
    },
    setFeederStatus: (feederId, status) => {
      const state = get();
      const requiredCapability: Capability = status === 'energised' ? 'asset.restore' : 'asset.fail';
      if (!state.can(requiredCapability)) {
        const message = `${roleName(state.role)} is not permitted to change feeder state in this demonstration.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        const message = 'The baseline scenario is immutable. Branch the scenario before introducing a deviation.';
        set({ toasts: toast(state, 'warning', 'Baseline protected', message) });
        return { ok: false, message };
      }
      const feeder = state.mine.feeders.find((f) => f.id === feederId);
      const updated: Scenario = {
        ...scenario,
        overrides: {
          ...scenario.overrides,
          feederOverrides: {
            ...scenario.overrides.feederOverrides,
            [feederId]: { status },
          },
        },
      };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      const world = recomputeWorld(ctx, updated, run.world);
      world.history = [...world.history, { id: `feeder-${feederId}-${world.step}-${world.history.length}`, type: 'asset-status-changed',
        atSimSec: world.clock.elapsedSec, atMs: world.clock.epochMs + world.clock.elapsedSec * 1000,
        summary: `${feederId} changed to ${status}`, detail: world.feeders[feederId]?.statusReason ?? 'Unknown feeder.', assetId: feederId, evidence: [] }];
      const detection = detectIncidents({ ctx, scenario: updated, world, derived: deriveState(ctx, updated, world), existing: run.incidents,
        actor: state.actorName, role: roleName(state.role) });
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world, incidents: detection.incidents } },
        activity: logActivity(state, 'action', `${feeder?.name ?? feederId} set to ${status}.`, [feederId]),
        toasts: toast(
          state,
          status === 'failed' ? 'error' : 'success',
          `${feeder?.name ?? feederId}: ${status}`,
          'Modelled state recalculated — pumps, sumps, production exposure and incidents all update from the same state.',
        ),
      });
      return { ok: true, message: `${feeder?.name ?? feederId} set to ${status}.` };
    },

    setPumpMode: (pumpId, mode) => {
      const state = get();
      const capability: Capability =
        mode === 'running' ? 'pump.start' : mode === 'standby' ? 'pump.toggle-standby' : 'pump.stop';
      if (!state.can(capability)) {
        const message = `${roleName(state.role)} is not permitted to change pump duty in this demonstration.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        const message = 'The baseline scenario is immutable. Branch the scenario before changing duty.';
        set({ toasts: toast(state, 'warning', 'Baseline protected', message) });
        return { ok: false, message };
      }
      const pump = state.mine.pumps.find((p) => p.id === pumpId);
      const previousMode = scenario.overrides.pumpOverrides[pumpId]?.mode ?? pump?.mode ?? 'stopped';
      if (previousMode === mode) return { ok: true, message: 'No change.' };
      const updated: Scenario = {
        ...scenario,
        overrides: {
          ...scenario.overrides,
          pumpOverrides: {
            ...scenario.overrides.pumpOverrides,
            [pumpId]: { ...scenario.overrides.pumpOverrides[pumpId], mode },
          },
        },
      };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      const world = recomputeWorld(ctx, updated, run.world);
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world } },
        activity: logActivity(state, 'action', `${pump?.name ?? pumpId} duty changed to ${mode}.`, [pumpId]),
        toasts: toast(state, 'success', `${pump?.name ?? pumpId}: ${mode}`, 'Pumping capability and the water forecast have been recalculated.'),
      });
      return { ok: true, message: `${pump?.name ?? pumpId} set to ${mode}.` };
    },

    setPumpHealth: (pumpId, health) => {
      const state = get();
      if (!state.can('asset.fail')) {
        const message = `${roleName(state.role)} cannot change modelled equipment condition.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        const message = 'The baseline scenario is immutable. Branch the scenario first.';
        set({ toasts: toast(state, 'warning', 'Baseline protected', message) });
        return { ok: false, message };
      }
      const updated: Scenario = {
        ...scenario,
        overrides: {
          ...scenario.overrides,
          pumpOverrides: {
            ...scenario.overrides.pumpOverrides,
            [pumpId]: { ...scenario.overrides.pumpOverrides[pumpId], health: Math.max(0, Math.min(1, health)) },
          },
        },
      };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      const world = recomputeWorld(ctx, updated, run.world);
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world } },
        activity: logActivity(state, 'action', `Pump ${pumpId} health set to ${(health * 100).toFixed(0)}%.`, [pumpId]),
        toasts: toast(state, 'info', 'Condition updated', `Modelled health for ${pumpId} is now ${(health * 100).toFixed(0)}%.`),
      });
      return { ok: true, message: 'Pump health updated.' };
    },

    setSumpInflowMultiplier: (sumpId, multiplier) => {
      const state = get();
      if (!state.can('scenario.edit-assumptions')) {
        const message = `${roleName(state.role)} cannot edit the water balance assumptions.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        const message = 'The baseline scenario is immutable. Branch the scenario first.';
        set({ toasts: toast(state, 'warning', 'Baseline protected', message) });
        return { ok: false, message };
      }
      const updated: Scenario = {
        ...scenario,
        overrides: {
          ...scenario.overrides,
          sumpOverrides: {
            ...scenario.overrides.sumpOverrides,
            [sumpId]: { ...scenario.overrides.sumpOverrides[sumpId], inflowMultiplier: multiplier },
          },
        },
      };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      const world = recomputeWorld(ctx, updated, run.world);
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world } },
        activity: logActivity(state, 'action', `Sump ${sumpId} inflow multiplier set to ${multiplier.toFixed(2)}×.`, [sumpId]),
        toasts: toast(state, 'info', 'Inflow changed', `Modelled inflow for ${sumpId} scaled by ${multiplier.toFixed(2)}×. Forecasts recalculated.`),
      });
      return { ok: true, message: 'Inflow updated.' };
    },

    setSensorStale: (sensorId, stale) => {
      const state = get();
      if (!state.can('scenario.edit-assumptions')) {
        const message = `${roleName(state.role)} cannot change instrumentation state.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        const message = 'The baseline scenario is immutable. Branch the scenario first.';
        set({ toasts: toast(state, 'warning', 'Baseline protected', message) });
        return { ok: false, message };
      }
      const updated: Scenario = {
        ...scenario,
        overrides: {
          ...scenario.overrides,
          sensorOverrides: {
            ...scenario.overrides.sensorOverrides,
            [sensorId]: { ...scenario.overrides.sensorOverrides[sensorId], stale },
          },
        },
      };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      const world = recomputeWorld(ctx, updated, run.world);
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world } },
        activity: logActivity(state, 'action', `Sensor ${sensorId} ${stale ? 'marked stale' : 'returned to service'}.`, [sensorId]),
        toasts: toast(
          state,
          stale ? 'warning' : 'success',
          stale ? 'Telemetry lost' : 'Telemetry restored',
          'Forecast confidence has been recalculated. Stale instrumentation lowers confidence rather than fabricating certainty.',
        ),
      });
      return { ok: true, message: 'Sensor state updated.' };
    },

    setAssumption: (key, value) => {
      const state = get();
      if (!state.can('scenario.edit-assumptions')) {
        const message = `${roleName(state.role)} cannot edit engineering assumptions.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        const message = 'The baseline scenario is immutable. Branch the scenario first.';
        set({ toasts: toast(state, 'warning', 'Baseline protected', message) });
        return { ok: false, message };
      }
      if (!Number.isFinite(value)) {
        const message = 'The assumption value must be a finite number.';
        set({ toasts: toast(state, 'error', 'Invalid value', message) });
        return { ok: false, message };
      }
      const updated: Scenario = {
        ...scenario,
        overrides: { ...scenario.overrides, assumptions: { ...scenario.overrides.assumptions, [key]: value } },
      };
      const run = state.getRun();
      const world = recomputeWorld(contextFor(state, updated), updated, run.world);
      if (key === 'timeStepSeconds') world.clock = { ...world.clock, stepSec: Math.max(1, Math.min(300, value)) };
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world } },
        activity: logActivity(state, 'action', `Assumption ${key} set to ${value}.`, [scenario.id]),
      });
      return { ok: true, message: 'Assumption updated.' };
    },

    restoreAllDeviations: () => {
      const state = get();
      if (!state.can('asset.restore')) {
        const message = `${roleName(state.role)} cannot restore plant state.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const scenario = state.getScenario();
      if (scenario.isBaseline) {
        return { ok: false, message: 'The baseline has no deviations to restore.' };
      }
      const updated: Scenario = {
        ...scenario,
        overrides: { ...scenario.overrides, feederOverrides: {}, pumpOverrides: {}, sensorOverrides: {} },
      };
      const ctx = contextFor(state, updated);
      const run = state.getRun();
      const world = recomputeWorld(ctx, updated, run.world);
      set({
        scenarios: state.scenarios.map((s) => (s.id === updated.id ? updated : s)),
        runs: { ...state.runs, [updated.id]: { ...run, world } },
        activity: logActivity(state, 'action', 'All modelled deviations cleared for the active scenario.', [scenario.id]),
        toasts: toast(state, 'success', 'Deviations cleared', 'Plant state returned to the scenario base condition.'),
      });
      return { ok: true, message: 'Deviations cleared.' };
    },

    // ------------------------------------------------------ incidents & decisions
    incidentAction: (incidentId, action, payload) => {
      const state = get();
      const capabilityByAction: Partial<Record<ActionKind, Capability>> = {
        acknowledge: 'incident.acknowledge',
        assign: 'incident.assign',
        note: 'incident.comment',
        'propose-mitigation': 'incident.propose-mitigation',
        'approve-mitigation': 'incident.approve-mitigation',
        'execute-mitigation': 'incident.execute-mitigation',
        escalate: 'incident.escalate',
        resolve: 'incident.resolve',
        close: 'incident.close',
        'open-review': 'incident.review',
      };
      const required = capabilityByAction[action];
      if (required && !state.can(required)) {
        const message = `${roleName(state.role)} is not permitted to perform "${action}" in this demonstration.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const run = state.getRun();
      const incident = run.incidents.find((i) => i.id === incidentId);
      if (!incident) {
        return { ok: false, message: 'Incident not found in the active scenario.' };
      }
      const scenario = state.getScenario();
      const nowMs = run.world.clock.epochMs + run.world.clock.elapsedSec * 1000;
      const result = transitionIncident({
        incident,
        action,
        actor: state.actorName,
        role: state.role,
        scenario,
        nowMs,
        nowSimSec: run.world.clock.elapsedSec,
        note: payload?.note,
        assignee: payload?.assignee,
      });
      if (!result.ok) {
        set({ toasts: toast(state, 'warning', 'Transition refused', result.refusalReason ?? 'Action not allowed.') });
        return { ok: false, message: result.refusalReason ?? 'Action not allowed.' };
      }
      set({
        runs: {
          ...state.runs,
          [state.activeScenarioId]: {
            ...run,
            incidents: run.incidents.map((i) => (i.id === incidentId ? result.incident : i)),
            actions: [...run.actions, result.action],
          },
        },
        activity: logActivity(state, 'incident', `${result.incident.reference}: ${action} by ${roleName(state.role)}.`, [incidentId]),
        toasts: toast(state, 'success', 'Recorded', `${result.incident.reference} updated to "${result.incident.state}".`),
      });
      return { ok: true, message: `Incident updated to ${result.incident.state}.` };
    },

    recordDecision: (decision) => {
      const state = get();
      if (!state.can('decision.record')) {
        const message = `${roleName(state.role)} cannot record engineering decisions.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const run = state.getRun();
      const nowMs = run.world.clock.epochMs + run.world.clock.elapsedSec * 1000;
      const record: EngineeringDecision = {
        ...decision,
        id: uid('dec'),
        scenarioId: state.activeScenarioId,
        author: state.actorName,
        role: roleName(state.role),
        atMs: nowMs,
        atSimSec: run.world.clock.elapsedSec,
        status: decision.status ?? 'proposed',
      };
      set({
        decisions: [record, ...state.decisions],
        activity: logActivity(state, 'decision', `Decision recorded: ${record.title}.`, [record.id]),
        toasts: toast(state, 'success', 'Decision recorded', `${record.title} saved with ${record.evidence.length} evidence references.`),
      });
      return { ok: true, message: 'Decision recorded.' };
    },

    addComment: (input) => {
      const state = get();
      if (!state.can('incident.comment')) {
        const message = `${roleName(state.role)} cannot add engineering comments.`;
        set({ toasts: toast(state, 'error', 'Action refused', message) });
        return { ok: false, message };
      }
      const run = state.getRun();
      const nowMs = run.world.clock.epochMs + run.world.clock.elapsedSec * 1000;
      const comment: Comment = {
        id: uid('cmt'),
        scenarioId: state.activeScenarioId,
        incidentId: input.incidentId ?? null,
        author: state.actorName,
        role: roleName(state.role),
        atMs: nowMs,
        body: input.body.trim(),
        decisionId: input.decisionId ?? null,
      };
      if (!comment.body) return { ok: false, message: 'Comment cannot be empty.' };
      set({
        comments: [...state.comments, comment],
        activity: logActivity(state, 'comment', `Comment added${comment.incidentId ? ` to incident ${comment.incidentId}` : ''}.`, [comment.incidentId ?? '', comment.decisionId ?? ''].filter(Boolean)),
      });
      return { ok: true, message: 'Comment added.' };
    },

    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

    // ------------------------------------------------------------------- ui
    setRole: (role) => {
      const state = get();
      set({
        role,
        actorName: PERSONAS[role],
        activity: [
          ...state.activity,
          {
            id: uid('act'),
            atMs: Date.now(),
            atSimSec: state.getRun().world.clock.elapsedSec,
            actor: PERSONAS[role],
            role: roleName(role),
            kind: 'role' as const,
            summary: `Demonstration role switched to ${ROLE_BY_ID[role].name}. This is not authentication.`,
            refs: [role],
          },
        ],
        toasts: [
          ...state.toasts,
          {
            id: uid('toast'),
            kind: 'info' as const,
            title: `Role: ${ROLE_BY_ID[role].name}`,
            message: 'Interface capabilities changed. This is a demonstration of role-based workflow, not production authentication.',
            atMs: Date.now(),
          },
        ].slice(-4),
      });
    },

    selectAsset: (selection) =>
      set((state) => ({ selection: { ...state.selection, ...selection }, replayActive: state.replayActive })),

    clearSelection: () => set({ selection: { assetId: null, incidentId: null, sumpId: null } }),

    setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),

    setReplayIndex: (index) =>
      set((state) => {
        if (index === null) return { replayActive: false, replayIndex: 0 };
        const run = state.getRun();
        const clamped = Math.max(0, Math.min(index, run.frames.length - 1));
        return { replayActive: true, replayIndex: clamped };
      }),
  };
});

/** Non-React accessor for the store (used in export helpers and tests). */
export const mineStoreApi = {
  getState: () => useMineStore.getState(),
  setState: useMineStore.setState,
  subscribe: useMineStore.subscribe,
};

export type { MineState as MineStoreState };
export { DEMO_EPOCH_MS, PERSONAS };
