import type {
  Action,
  ActionKind,
  AssetId,
  EvidenceRef,
  Incident,
  IncidentEvent,
  IncidentHypothesis,
  IncidentSeverity,
  IncidentState,
  Scenario,
  UserRole,
  WorldState,
} from '../domain/types';
import type { EngineContext, DerivedState } from './engine';
import { cascadeEvidence, severityForCriticality } from './propagation';
import { roleName } from '../domain/roles';

/**
 * Incident lifecycle.
 *
 * Incidents are raised by the simulation from actual modelled state changes,
 * never hand-authored. Each transition appends an immutable audit event, and
 * every hypothesis carries the evidence that supports (and contradicts) it.
 */

const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function highestSeverity(a: IncidentSeverity, b: IncidentSeverity): IncidentSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

const TERMINAL: IncidentState[] = ['closed', 'resolved'];

export function isIncidentActive(incident: Incident): boolean {
  return !TERMINAL.includes(incident.state);
}

function incidentReference(simSec: number, index: number): string {
  const day = 'INC';
  const minutes = Math.floor(simSec / 60);
  return `${day}-${String(minutes).padStart(4, '0')}-${String(index).padStart(2, '0')}`;
}

export function assetName(ctx: EngineContext, assetId: AssetId): string {
  return ctx.mine.assets.find((a) => a.id === assetId)?.name ?? assetId;
}

export function newIncidentEvent(args: {
  atMs: number;
  atSimSec: number;
  type: IncidentEvent['type'];
  actor: string;
  role: string;
  summary: string;
  detail: string;
  evidence?: EvidenceRef[];
}): IncidentEvent {
  return {
    id: `evt-${Math.round(args.atMs)}-${Math.random().toString(36).slice(2, 8)}`,
    atMs: args.atMs,
    atSimSec: args.atSimSec,
    type: args.type,
    actor: args.actor,
    role: args.role,
    summary: args.summary,
    detail: args.detail,
    evidence: args.evidence ?? [],
  };
}

export interface DetectionCandidate {
  correlationKey: string;
  title: string;
  severity: IncidentSeverity;
  rootAssetId: AssetId | null;
  affectedAssetIds: AssetId[];
  summary: string;
  evidence: EvidenceRef[];
  hypotheses: IncidentHypothesis[];
  assetId: AssetId;
}

/**
 * Build the incident candidates implied by the current modelled state.
 */
export function buildDetectionCandidates(
  ctx: EngineContext,
  world: WorldState,
  derived: DerivedState,
): DetectionCandidate[] {
  const { mine } = ctx;
  const atMs = world.clock.epochMs + world.clock.elapsedSec * 1000;
  const candidates: DetectionCandidate[] = [];
  const seenKeys = new Map<string, DetectionCandidate>();

  const pushCandidate = (candidate: DetectionCandidate): void => {
    const existing = seenKeys.get(candidate.correlationKey);
    if (existing) {
      existing.severity = highestSeverity(existing.severity, candidate.severity);
      existing.affectedAssetIds = [...new Set([...existing.affectedAssetIds, ...candidate.affectedAssetIds])];
      existing.evidence.push(...candidate.evidence);
      existing.summary = `${existing.summary} ${candidate.summary}`;
      return;
    }
    seenKeys.set(candidate.correlationKey, candidate);
    candidates.push(candidate);
  };

  // Asset failures: the root cause is the deepest asset in the modelled chain.
  for (const [assetId, state] of Object.entries(derived.assetStates)) {
    if (state.status !== 'failed' && state.status !== 'blocked') continue;
    const root = derived.rootCauseOf[assetId] ?? assetId;
    const rootAsset = mine.assets.find((a) => a.id === root);
    const affected = Object.entries(derived.assetStates)
      .filter(([id, s]) => id !== root && (s.causedBy.includes(root) || derived.rootCauseOf[id] === root))
      .map(([id]) => id);
    const criticality = Math.max(
      2,
      ...ctx.graph.out(root).map((edge) => edge.criticality),
      ...ctx.graph.in(root).map((edge) => edge.criticality),
    );
    const cascades = derived.cascades.filter((link) => link.sourceId === root);

    const evidence: EvidenceRef[] = [
      {
        id: `ev-state-${assetId}`,
        kind: 'event',
        label: `${rootAsset?.name ?? root} state`,
        detail: `${state.statusReason} (status: ${state.status}).`,
        refs: [assetId, root],
        atMs,
      },
      ...cascades.slice(0, 5).map((link) => cascadeEvidence(link, atMs)),
    ];

    const monitoring = derived.sensorStates;
    const monitoringSensors = mine.sensors.filter((s) => s.assetId === root);
    const stale = monitoringSensors.filter((s) => monitoring[s.id]?.freshness !== 'live');
    if (stale.length > 0) {
      evidence.push({
        id: `ev-monitor-${root}`,
        kind: 'telemetry',
        label: `${rootAsset?.name ?? root}: instrumentation`,
        detail: `${stale.length} of ${monitoringSensors.length} monitoring tags are not live (${stale
          .map((s) => monitoring[s.id]?.freshness)
          .join(', ')}). Confidence in the inferred state is reduced.`,
        refs: stale.map((s) => s.id),
        atMs,
      });
    }

    const hypotheses: IncidentHypothesis[] = [
      {
        id: `hyp-direct-${root}`,
        statement: `${rootAsset?.name ?? root} is unavailable in the modelled state.`,
        confidence: derived.rootCauseOf[assetId] ? 0.35 : stale.length > 0 ? 0.55 : 0.85,
        supportingEvidence: evidence.slice(0, 3),
        contradictingEvidence: [],
        alternatives: derived.rootCauseOf[assetId]
          ? [`The observed condition on ${assetName(ctx, assetId)} may be a consequence rather than a cause.`]
          : ['A protection operation or upstream supply condition not modelled here.'],
      },
    ];

    if (derived.rootCauseOf[assetId]) {
      hypotheses.push({
        id: `hyp-dependency-${root}`,
        statement: `${assetName(ctx, assetId)} lost function because ${assetName(ctx, root)} became unavailable.`,
        confidence: stale.length > 0 ? 0.6 : 0.8,
        supportingEvidence: evidence.filter((e) => e.kind === 'dependency'),
        contradictingEvidence: [],
        alternatives: ['A simultaneous independent failure on the dependent asset cannot be excluded.'],
      });
    }

    pushCandidate({
      correlationKey: `asset:${root}`,
      title: `${rootAsset?.name ?? root} — ${state.status}`,
      severity: severityForCriticality(criticality),
      rootAssetId: root,
      affectedAssetIds: [root, ...affected],
      summary: `${state.statusReason} Downstream assets: ${affected.length}.`,
      evidence,
      hypotheses,
      assetId,
    });
  }

  // Threshold breaches on sumps
  for (const sump of mine.sumps) {
    const state = world.sumps[sump.id];
    if (!state?.breach) continue;
    if (state.breach.severity === 'advisory') continue;
    const severity: IncidentSeverity = state.breach.severity === 'critical' ? 'critical' : 'high';
    const critical = sump.thresholds.find((t) => t.severity === 'critical');
    const zones = mine.zones.filter((zone) => zone.governedBySumpIds.includes(sump.id));
    const evidence: EvidenceRef[] = [
      {
        id: `ev-threshold-${sump.id}`,
        kind: 'calculation',
        label: `${sump.name} water level`,
        detail: `Level ${state.levelM.toFixed(2)} m (${state.volumeM3.toFixed(
          0,
        )} m³) has breached "${state.breach.label}" at ${state.breach.levelM.toFixed(2)} m. Inflow ${state.inflowM3h.toFixed(
          0,
        )} m³/h against outflow ${state.outflowM3h.toFixed(0)} m³/h.`,
        refs: [sump.id, state.breach.id],
        atMs,
      },
    ];
    const pumps = mine.pumps.filter((p) => p.sumpId === sump.id);
    const unavailable = pumps.filter((p) => derived.pumpStates[p.id]?.unavailable);
    if (unavailable.length > 0) {
      evidence.push({
        id: `ev-pumps-${sump.id}`,
        kind: 'dependency',
        label: `${sump.name}: pumping availability`,
        detail: `${unavailable.map((p) => p.name).join(', ')} ${
          unavailable.length === 1 ? 'is' : 'are'
        } unavailable; discharge reduced to ${state.outflowM3h.toFixed(0)} m³/h.`,
        refs: unavailable.map((p) => p.id),
        atMs,
      });
    }
    if (critical) {
      evidence.push({
        id: `ev-critical-${sump.id}`,
        kind: 'calculation',
        label: `${sump.name}: time to critical`,
        detail:
          state.secondsToCritical === null
            ? 'Net flow is non-positive; the critical level is not projected to be reached at the current balance.'
            : `${(state.secondsToCritical / 3600).toFixed(2)} h to the critical threshold at the current net flow.`,
        refs: [sump.id, critical.id],
        atMs,
      });
    }

    pushCandidate({
      correlationKey: `sump:${sump.id}`,
      title: `${sump.name} — ${state.breach.label} breached`,
      severity,
      rootAssetId: sump.id,
      affectedAssetIds: [sump.id, ...zones.map((z) => z.id)],
      summary: `Water level ${state.levelM.toFixed(2)} m against a ${state.breach.levelM.toFixed(
        2,
      )} m ${state.breach.severity} threshold. ${zones.length} production zone(s) depend on this sump.`,
      evidence,
      hypotheses: [
        {
          id: `hyp-water-${sump.id}`,
          statement: `Inflow exceeds available pumping capability at ${sump.name}.`,
          confidence: 0.8,
          supportingEvidence: evidence,
          contradictingEvidence: [],
          alternatives: [
            'An unmodelled inflow source (e.g. a broken water main) could be contributing.',
            'Sump geometry assumptions may be conservative or optimistic.',
          ],
        },
      ],
      assetId: sump.id,
    });
  }

  // Instrumentation expiry — an incident about lost observability, not about water.
  for (const sensor of mine.sensors) {
    const state = derived.sensorStates[sensor.id];
    if (state?.freshness !== 'expired') continue;
    pushCandidate({
      correlationKey: `sensor:${sensor.id}`,
      title: `${sensor.name} — telemetry expired`,
      severity: 'medium',
      rootAssetId: sensor.id,
      affectedAssetIds: [sensor.id, sensor.assetId],
      summary: `No valid sample for ${Math.round(state.ageSec)} s (staleness window ${sensor.stalenessThresholdSec} s). Forecasts and diagnoses that depend on this tag must be treated as lower confidence.`,
      evidence: [
        {
          id: `ev-sensor-${sensor.id}`,
          kind: 'telemetry',
          label: `${sensor.name} freshness`,
          detail: state.note ?? 'Tag has expired.',
          refs: [sensor.id, sensor.assetId],
          atMs,
        },
      ],
      hypotheses: [
        {
          id: `hyp-sensor-${sensor.id}`,
          statement: `Instrumentation or communications failure on ${sensor.name}; the process itself may be unchanged.`,
          confidence: 0.7,
          supportingEvidence: [],
          contradictingEvidence: [],
          alternatives: ['The tag may be correctly reporting a stopped process — a physical check is required.'],
        },
      ],
      assetId: sensor.assetId,
    });
  }

  return candidates;
}

/**
 * Raise new incidents for candidates that have no active incident with the
 * same correlation key. Existing incidents are updated with new evidence.
 */
export function detectIncidents(args: {
  ctx: EngineContext;
  scenario: Scenario;
  world: WorldState;
  derived: DerivedState;
  existing: Incident[];
  actor?: string;
  role?: string;
}): { incidents: Incident[]; newIncidents: Incident[] } {
  const { ctx, scenario, world, derived, existing } = args;
  const atMs = world.clock.epochMs + world.clock.elapsedSec * 1000;
  const atSimSec = world.clock.elapsedSec;
  const candidates = buildDetectionCandidates(ctx, world, derived);

  const incidents = existing.map((incident) => ({ ...incident, events: [...incident.events], evidence: [...incident.evidence] }));
  const newIncidents: Incident[] = [];
  let counter = incidents.length;

  for (const candidate of candidates) {
    const active = incidents.find(
      (incident) => incident.correlationKey === candidate.correlationKey && isIncidentActive(incident),
    );
    if (active) {
      active.severity = highestSeverity(active.severity, candidate.severity);
      active.affectedAssetIds = [...new Set([...active.affectedAssetIds, ...candidate.affectedAssetIds])];
      const newEvidence = candidate.evidence.filter(
        (e) => !active.evidence.some((existingEvidence) => existingEvidence.id === e.id),
      );
      if (newEvidence.length > 0) {
        active.evidence = [...active.evidence, ...newEvidence];
        active.events.push(
          newIncidentEvent({
            atMs,
            atSimSec,
            type: 'status-change',
            actor: 'Simulation engine',
            role: 'system',
            summary: 'Modelled condition changed — evidence updated',
            detail: candidate.summary,
            evidence: newEvidence,
          }),
        );
      }
      continue;
    }

    counter += 1;
    const rootName = candidate.rootAssetId ? assetName(ctx, candidate.rootAssetId) : candidate.title;
    const incident: Incident = {
      id: `inc-${scenario.id}-${counter}-${Math.abs(hashKey(candidate.correlationKey))}`,
      reference: incidentReference(atSimSec, counter),
      title: candidate.title,
      severity: candidate.severity,
      state: 'open',
      rootAssetId: candidate.rootAssetId,
      affectedAssetIds: [...new Set(candidate.affectedAssetIds)],
      correlationKey: candidate.correlationKey,
      openedAtMs: atMs,
      openedAtSimSec: atSimSec,
      closedAtMs: null,
      owner: null,
      ownerRole: null,
      summary: candidate.summary,
      hypotheses: candidate.hypotheses,
      events: [
        newIncidentEvent({
          atMs,
          atSimSec,
          type: 'detected',
          actor: 'Simulation engine',
          role: 'system',
          summary: `Incident raised automatically from modelled state`,
          detail: `${candidate.summary} Root asset: ${rootName}.`,
          evidence: candidate.evidence,
        }),
      ],
      evidence: candidate.evidence,
      correlatedInto: null,
    };
    incidents.push(incident);
    newIncidents.push(incident);
  }

  return { incidents, newIncidents };
}

function hashKey(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return h;
}

/** Allowed state transitions for the demonstration workflow. */
export const INCIDENT_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  open: ['acknowledged'],
  acknowledged: ['investigating', 'mitigating'],
  investigating: ['mitigating', 'resolved'],
  mitigating: ['resolved', 'investigating'],
  resolved: ['closed', 'review'],
  closed: ['review'],
  review: [],
};

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return INCIDENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  incident: Incident;
  action: Action;
  ok: boolean;
  refusalReason?: string;
}

/**
 * Apply a workflow transition to an incident, appending the audit record.
 */
export function transitionIncident(args: {
  incident: Incident;
  action: ActionKind;
  actor: string;
  role: UserRole;
  scenario: Scenario;
  nowMs: number;
  nowSimSec: number;
  note?: string;
  assignee?: string;
}): TransitionResult {
  const { incident, action, actor, role, scenario, nowMs, nowSimSec, note, assignee } = args;
  const roleLabel = roleName(role);
  const fail = (reason: string): TransitionResult => ({
    incident,
    ok: false,
    refusalReason: reason,
    action: {
      id: `act-refused-${Math.round(nowMs)}`,
      kind: action,
      title: `Refused: ${action}`,
      description: reason,
      actor,
      role: roleLabel,
      atMs: nowMs,
      atSimSec: nowSimSec,
      incidentId: incident.id,
      scenarioId: scenario.id,
      effects: [],
      evidence: [],
    },
  });

  const nextState: Partial<Record<ActionKind, IncidentState>> = {
    acknowledge: 'acknowledged',
    'propose-mitigation': 'mitigating',
    'execute-mitigation': 'mitigating',
    resolve: 'resolved',
    close: 'closed',
    'open-review': 'review',
  };

  if (action === 'assign') {
    if (!assignee) return fail('An assignee is required.');
    const updated: Incident = {
      ...incident,
      owner: assignee,
      state: incident.state === 'open' ? 'acknowledged' : incident.state,
      events: [
        ...incident.events,
        newIncidentEvent({
          atMs: nowMs,
          atSimSec: nowSimSec,
          type: 'assigned',
          actor,
          role: roleLabel,
          summary: `Assigned to ${assignee}`,
          detail: note || 'Responsibility transferred.',
        }),
      ],
    };
    return {
      incident: updated,
      ok: true,
      action: {
        id: `act-${Math.round(nowMs)}`,
        kind: action,
        title: `Assigned ${incident.reference}`,
        description: `Owner set to ${assignee}`,
        actor,
        role: roleLabel,
        atMs: nowMs,
        atSimSec: nowSimSec,
        incidentId: incident.id,
        scenarioId: scenario.id,
        effects: [{ kind: 'incident-state', target: incident.id, field: 'owner', from: incident.owner, to: assignee }],
        evidence: [],
      },
    };
  }

  if (action === 'note') {
    const updated: Incident = {
      ...incident,
      events: [
        ...incident.events,
        newIncidentEvent({
          atMs: nowMs,
          atSimSec: nowSimSec,
          type: 'noted',
          actor,
          role: roleLabel,
          summary: 'Engineering note added',
          detail: note || '',
        }),
      ],
    };
    return {
      incident: updated,
      ok: true,
      action: {
        id: `act-${Math.round(nowMs)}`,
        kind: action,
        title: `Note on ${incident.reference}`,
        description: note || '',
        actor,
        role: roleLabel,
        atMs: nowMs,
        atSimSec: nowSimSec,
        incidentId: incident.id,
        scenarioId: scenario.id,
        effects: [],
        evidence: [],
      },
    };
  }

  const target = nextState[action];
  if (!target) {
    return fail(`Action "${action}" is not a workflow transition.`);
  }

  if (!canTransition(incident.state, target)) {
    return fail(
      `Cannot move ${incident.reference} from "${incident.state}" to "${target}". Allowed next states: ${
        INCIDENT_TRANSITIONS[incident.state].join(', ') || 'none'
      }.`,
    );
  }

  if (target === 'closed' && incident.evidence.length === 0) {
    return fail('An incident cannot be closed without at least one piece of supporting evidence.');
  }

  const updated: Incident = {
    ...incident,
    state: target,
    closedAtMs: target === 'closed' ? nowMs : incident.closedAtMs,
    events: [
      ...incident.events,
      newIncidentEvent({
        atMs: nowMs,
        atSimSec: nowSimSec,
        type:
          action === 'open-review'
            ? 'review-opened'
            : action === 'resolve'
              ? 'resolved'
              : action === 'close'
                ? 'closed'
                : action === 'propose-mitigation'
                  ? 'mitigation-proposed'
                  : action === 'execute-mitigation'
                    ? 'mitigation-executed'
                    : 'acknowledged',
        actor,
        role: roleLabel,
        summary: `State → ${target}`,
        detail: note || `Workflow transition performed by ${roleLabel}.`,
      }),
    ],
  };

  return {
    incident: updated,
    ok: true,
    action: {
      id: `act-${Math.round(nowMs)}`,
      kind: action,
      title: `${incident.reference}: ${action}`,
      description: note || `Incident moved to ${target}.`,
      actor,
      role: roleLabel,
      atMs: nowMs,
      atSimSec: nowSimSec,
      incidentId: incident.id,
      scenarioId: scenario.id,
      effects: [{ kind: 'incident-state', target: incident.id, field: 'state', from: incident.state, to: target }],
      evidence: incident.evidence.slice(0, 3),
    },
  };
}

/** Deterministic narrative of an incident, used by the report generator. */
export function incidentNarrative(ctx: EngineContext, incident: Incident): string[] {
  const lines: string[] = [];
  lines.push(`${incident.reference}: ${incident.title} (${incident.severity}).`);
  lines.push(incident.summary);
  if (incident.rootAssetId) {
    const asset = ctx.mine.assets.find((a) => a.id === incident.rootAssetId);
    if (asset) lines.push(`Root asset: ${asset.name} [${asset.tag}] — ${asset.description}`);
  }
  if (incident.hypotheses.length > 0) {
    const top = [...incident.hypotheses].sort((a, b) => b.confidence - a.confidence)[0];
    lines.push(`Leading hypothesis (${(top.confidence * 100).toFixed(0)}% modelled confidence): ${top.statement}`);
  }
  lines.push(
    `${incident.events.length} audit events recorded, ${incident.evidence.length} evidence artefacts retained.`,
  );
  return lines;
}
