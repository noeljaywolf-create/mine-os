import type {
  AssetId,
  AssetRuntimeState,
  AssetStatus,
  EvidenceRef,
  FeederRuntimeState,
  IncidentSeverity,
  PumpRuntimeState,
  ScenarioOverride,
  SensorId,
  SensorState,
  SumpRuntimeState,
  ZoneRuntimeState,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import type { DependencyGraph } from './graph';
import type { ZoneEvaluation } from './production';
import { assetMonitoringConfidence } from './sensors';

/**
 * Failure propagation.
 *
 * The graph is typed and directed: an edge `from -> to` always means "from
 * provides something to to". Propagation therefore walks edges in their
 * natural direction, which is what makes "the feeder failed, so the pumps
 * stopped, so the sump filled, so the zone flooded" a computed result rather
 * than a hand-written narrative.
 *
 * Classification:
 *   failed   — the asset itself is not delivering its function
 *   blocked  — the asset cannot operate because a dependency is unavailable
 *   degraded — the asset is delivering, but below its designed performance
 *   exposed  — the asset still runs, but a dependency has been lost and its
 *              protection or margin has been withdrawn
 *   operational — unaffected
 */

export interface CascadeLink {
  sourceId: AssetId;
  targetId: AssetId;
  depth: number;
  path: AssetId[];
  via: string;
  effect: 'blocked' | 'exposed' | 'degraded' | 'unmonitored';
  rationale: string;
}

export interface PropagationInput {
  mine: MineDefinition;
  graph: DependencyGraph;
  overrides: ScenarioOverride;
  feederStates: Record<string, FeederRuntimeState>;
  pumpStates: Record<string, PumpRuntimeState>;
  sumpStates: Record<string, SumpRuntimeState>;
  zoneStates: Record<string, ZoneRuntimeState>;
  zoneEvaluations: ZoneEvaluation[];
  sensorStates: Record<SensorId, SensorState>;
  /** Ratio of the processing plant's design throughput currently being fed. */
  plantRatio: number;
}

export interface PropagationOutput {
  assetStates: Record<AssetId, AssetRuntimeState>;
  cascades: CascadeLink[];
  /** Asset id -> the asset that explains its current status. */
  rootCauseOf: Record<AssetId, AssetId>;
}

const SEVERITY_BY_CRITICALITY: Record<number, IncidentSeverity> = {
  1: 'low',
  2: 'low',
  3: 'medium',
  4: 'high',
  5: 'critical',
};

export function severityForCriticality(criticality: number): IncidentSeverity {
  return SEVERITY_BY_CRITICALITY[criticality] ?? 'medium';
}

export function computePropagation(input: PropagationInput): PropagationOutput {
  const { mine, graph, overrides, feederStates, pumpStates, sumpStates, zoneStates, zoneEvaluations, sensorStates } =
    input;

  const states: Record<AssetId, AssetRuntimeState> = {};
  const rootCauseOf: Record<AssetId, AssetId> = {};
  const cascades: CascadeLink[] = [];

  const setState = (
    id: AssetId,
    patch: Partial<AssetRuntimeState> & { status: AssetStatus },
  ): void => {
    const previous = states[id];
    states[id] = {
      status: patch.status,
      statusReason: patch.statusReason ?? '',
      effectiveness: patch.effectiveness ?? 1,
      causedBy: patch.causedBy ?? previous?.causedBy ?? [],
      exposes: patch.exposes ?? previous?.exposes ?? [],
      confidence: patch.confidence ?? previous?.confidence ?? 1,
    };
  };

  // ---------------------------------------------------------------- feeders
  for (const feeder of mine.feeders) {
    const state = feederStates[feeder.id];
    const status: AssetStatus =
      state.status === 'energised'
        ? 'operational'
        : state.status === 'degraded'
          ? 'degraded'
          : state.status === 'failed'
            ? 'failed'
            : 'offline';
    setState(feeder.id, {
      status,
      statusReason: state.statusReason,
      effectiveness: state.supplyRatio,
    });
  }

  // ------------------------------------------------------------------ pumps
  for (const pump of mine.pumps) {
    const state = pumpStates[pump.id];
    setState(pump.id, {
      status: state.status,
      statusReason: state.statusReason,
      effectiveness: state.mode === 'running' ? state.dutyFactor : 0,
    });
    if (state.status === 'blocked' || state.status === 'failed') {
      const feeder = mine.feeders.find((f) => f.id === pump.feederId);
      if (feeder) rootCauseOf[pump.id] = feeder.id;
    }
  }

  // ------------------------------------------------------------------ sumps
  for (const sump of mine.sumps) {
    const state = sumpStates[sump.id];
    const overfilled = state.volumeM3 >= sump.capacityM3 - 0.5;
    const status: AssetStatus = overfilled
      ? 'failed'
      : state.breach && state.breach.severity === 'warning'
        ? 'degraded'
        : state.breach && state.breach.severity === 'critical'
          ? 'degraded'
          : 'operational';
    const reason = overfilled
      ? 'Sump at capacity — inflow exceeds available pumping capability.'
      : state.breach
        ? `${state.breach.label} threshold breached (${state.levelM.toFixed(2)} m).`
        : 'Storage within limits.';
    setState(sump.id, {
      status,
      statusReason: reason,
      effectiveness: Math.max(0, 1 - state.fillRatio),
    });
  }

  // ------------------------------------------------------------------ zones
  for (const evaluation of zoneEvaluations) {
    const state = zoneStates[evaluation.zoneId];
    setState(evaluation.zoneId, {
      status: evaluation.status,
      statusReason: evaluation.reason,
      effectiveness: state?.operatingRatio ?? evaluation.ratio,
    });
  }

  // ------------------------------------------------------------------ plant
  setState(mine.plant.id, {
    status: input.plantRatio <= 0.01 ? 'failed' : input.plantRatio < 0.95 ? 'degraded' : 'operational',
    statusReason:
      input.plantRatio <= 0.01
        ? 'No feed available from the underground production zones.'
        : input.plantRatio < 0.95
          ? `Receiving ${(input.plantRatio * 100).toFixed(0)}% of design feed.`
          : 'Receiving design feed rate.',
    effectiveness: input.plantRatio,
  });

  // --------------------------------------------------------- generic assets
  for (const asset of mine.assets) {
    if (states[asset.id]) continue;
    const override = overrides.assetOverrides[asset.id];
    setState(asset.id, {
      status: override?.status ?? 'operational',
      statusReason: override?.statusReason ?? 'No modelled deviation recorded.',
      effectiveness: override?.effectiveness ?? 1,
    });
  }

  // --------------------------------------------- explicit scenario overrides
  for (const [assetId, override] of Object.entries(overrides.assetOverrides)) {
    if (!override.status && !override.statusReason && override.effectiveness === undefined) continue;
    const current = states[assetId];
    if (!current) continue;
    setState(assetId, {
      status: override.status ?? current.status,
      statusReason: override.statusReason ?? current.statusReason,
      effectiveness: override.effectiveness ?? current.effectiveness,
    });
  }

  // ----------------------------------------------- cascade through the graph
  const queue: Array<{ id: AssetId; depth: number; path: AssetId[]; sourceId: AssetId }> = [];
  for (const [assetId, state] of Object.entries(states)) {
    if (state.status === 'failed' || state.status === 'blocked') {
      queue.push({ id: assetId, depth: 0, path: [assetId], sourceId: assetId });
    }
  }

  const degradedSources = Object.entries(states)
    .filter(([, state]) => state.status === 'degraded')
    .map(([id]) => id);

  const visited = new Set<string>(queue.map((q) => q.id));

  while (queue.length) {
    const current = queue.shift()!;
    const sourceState = states[current.id];
    for (const edge of graph.out(current.id)) {
      if (edge.type === 'monitors' || edge.type === 'pumps_from' || edge.type === 'drains_to') continue;
      const targetId = edge.to;
      const targetState = states[targetId];
      if (!targetState) continue;

      let effect: CascadeLink['effect'];
      if (edge.type === 'powered_by') {
        if (targetState.status === 'failed') continue;
        effect = 'blocked';
      } else if (sourceState.status === 'degraded') {
        effect = 'degraded';
      } else {
        effect = 'exposed';
      }

      if (effect === 'blocked' && targetState.status !== 'blocked' && targetState.status !== 'failed') {
        setState(targetId, {
          status: 'blocked',
          statusReason: `Dependency ${current.id} unavailable — ${edge.rationale}`,
          effectiveness: 0,
          causedBy: [...new Set([...targetState.causedBy, current.id])],
        });
        rootCauseOf[targetId] = current.id;
      } else if (effect === 'exposed' && targetState.status === 'operational') {
        setState(targetId, {
          status: 'exposed',
          statusReason: `Dependency ${current.id} lost — ${edge.rationale}`,
          effectiveness: targetState.effectiveness,
          causedBy: [...new Set([...targetState.causedBy, current.id])],
        });
        rootCauseOf[targetId] = current.id;
      } else if (effect === 'degraded' && targetState.status === 'operational') {
        setState(targetId, {
          status: 'degraded',
          statusReason: `Dependency ${current.id} degraded — ${edge.rationale}`,
          effectiveness: Math.min(targetState.effectiveness, 0.7),
          causedBy: [...new Set([...targetState.causedBy, current.id])],
        });
        rootCauseOf[targetId] = current.id;
      }

      cascades.push({
        sourceId: current.sourceId,
        targetId,
        depth: current.depth + 1,
        path: [...current.path, targetId],
        via: edge.type,
        effect,
        rationale: edge.rationale,
      });

      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push({ id: targetId, depth: current.depth + 1, path: [...current.path, targetId], sourceId: current.sourceId });
      }
    }
  }

  // ------------------------------- degraded dependencies attenuate their dependents
  for (const sourceId of degradedSources) {
    for (const edge of graph.out(sourceId)) {
      const target = states[edge.to];
      if (!target || target.status === 'failed' || target.status === 'blocked') continue;
      if (target.status === 'operational') {
        setState(edge.to, {
          status: 'degraded',
          statusReason: `Dependency ${sourceId} degraded — ${edge.rationale}`,
          effectiveness: Math.min(target.effectiveness, 0.7),
          causedBy: [...new Set([...target.causedBy, sourceId])],
        });
        rootCauseOf[edge.to] = sourceId;
        cascades.push({
          sourceId,
          targetId: edge.to,
          depth: 1,
          path: [sourceId, edge.to],
          via: edge.type,
          effect: 'degraded',
          rationale: edge.rationale,
        });
      }
    }
  }

  // --------------------------------- instrumentation gaps reduce confidence
  for (const asset of mine.assets) {
    const state = states[asset.id];
    if (!state) continue;
    const monitoring = assetMonitoringConfidence(mine, sensorStates, asset.id);
    if (monitoring.sensors.length === 0) continue;
    const expired = monitoring.staleSensors.some(
      (sensorId) => sensorStates[sensorId]?.freshness === 'expired',
    );
    const stale = monitoring.staleSensors.length > 0;

    const confidence = expired ? Math.min(state.confidence, 0.2) : stale ? Math.min(state.confidence, 0.5) : state.confidence;

    if (expired && state.status === 'operational') {
      setState(asset.id, {
        status: 'degraded',
        statusReason:
          'Monitoring instrumentation has expired — the modelled state is inferred without live verification.',
        effectiveness: state.effectiveness,
        confidence,
        causedBy: [...new Set([...state.causedBy, ...monitoring.staleSensors])],
      });
    } else {
      setState(asset.id, {
        status: state.status,
        statusReason: state.statusReason,
        effectiveness: state.effectiveness,
        confidence,
        causedBy: state.causedBy,
        exposes: state.exposes,
      });
    }
  }

  // ----------------------------------------------- exposes relationships
  for (const link of cascades) {
    const source = states[link.sourceId];
    if (!source) continue;
    source.exposes = [...new Set([...source.exposes, link.targetId])];
  }

  return { assetStates: states, cascades, rootCauseOf };
}

/** Evidence describing a cascade, used in incident records and reports. */
export function cascadeEvidence(link: CascadeLink, atMs: number): EvidenceRef {
  return {
    id: `ev-cascade-${link.sourceId}-${link.targetId}-${link.depth}`,
    kind: 'dependency',
    label: `Dependency path ${link.path.join(' → ')}`,
    detail: `${link.via}: ${link.rationale} Effect on downstream asset: ${link.effect}.`,
    refs: link.path,
    atMs,
  };
}

/** Direct dependents of an asset with the effect a failure would have. */
export function directDependencyEffects(
  graph: DependencyGraph,
  assetId: AssetId,
): Array<{ assetId: AssetId; effect: CascadeLink['effect']; rationale: string; type: string }> {
  return graph.out(assetId).map((edge) => ({
    assetId: edge.to,
    effect: edge.type === 'powered_by' ? 'blocked' : edge.type === 'monitors' ? 'unmonitored' : 'exposed',
    rationale: edge.rationale,
    type: edge.type,
  }));
}
