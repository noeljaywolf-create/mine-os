import type { TaskContract } from '@mine-os/contracts';
import { attachMlFindings, makeEvidence, makeReport, num, type AgentInput, type AgentResult } from './types';
import { getAssets, getPumps, getSensors, pumpFlowM3h, pumpIsRunning, snapshotRef, sensorFreshness } from './snapshot';
import { resolveThresholds } from './thresholds';

/**
 * Maintenance specialist agent.
 * Focuses on condition, faults, availability, and instrumentation health signals from snapshot.
 * Grounded in pump/system reliability and proactive maintenance literature: degradation, running-without-flow,
 * repeated unavailability, and telemetry loss are maintenance-relevant indicators (not definitive diagnoses).
 * Thresholds calibration-tunable (Approach A).
 */
export function runMaintenanceAgent(task: TaskContract, input: AgentInput): AgentResult {
  const snap = input.snapshot;
  const ref = snapshotRef(snap);
  const pumps = getPumps(snap);
  const assets = getAssets(snap);
  const sensors = getSensors(snap);
  const { thresholds, calibrationRef } = resolveThresholds(input.context);
  const th = thresholds.maintenance;
  const evidence = [] as ReturnType<typeof makeEvidence>[];
  const findings: any[] = [];
  const assumptions = [
    'Condition/health indicators come from modelled snapshot fields (condition, status, efficiency proxies) and require field verification.',
    'Telemetry freshness reflects observability, not necessarily process health.',
  ];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const conflicts: string[] = [];
  let i = 1;
  if (calibrationRef) assumptions.push(`Applied calibration profile: ${calibrationRef}.`);

  for (const [id, p] of Object.entries(pumps)) {
    const cond = num(p?.condition ?? p?.health, NaN);
    const status = String(p?.status ?? '');
    const reason = String(p?.statusReason ?? '');
    const runningNoFlow = pumpIsRunning(p) && pumpFlowM3h(p) <= 0.01;
    const lowCond = Number.isFinite(cond) && cond < th.conditionConcern;
    const veryLow = Number.isFinite(cond) && cond < th.conditionLow;
    const degradedStatus = ['degraded', 'failed', 'blocked', 'offline'].includes(status.toLowerCase());
    const degraded = lowCond || degradedStatus || runningNoFlow;
    if (degraded) {
      findings.push({ type: 'maintenance-concern', assetId: id, condition: cond, status, runningNoFlow, reason, severity: veryLow || degradedStatus ? 'high' : 'medium' });
      evidence.push(makeEvidence({
        i: i++, task, kind: 'derived', snapshotRef: ref,
        claim: `Pump ${id} maintenance concern: condition ${Number.isFinite(cond) ? (cond * 100).toFixed(0) + '%' : 'n/a'}, status ${status || 'n/a'}${runningNoFlow ? ', running without effective flow' : ''}.`,
        value: { pumpId: id, condition: cond, status, statusReason: reason, flowM3h: pumpFlowM3h(p), mode: p?.mode },
        confidence: 0.74,
        refs: [id, ref].filter(Boolean) as string[],
        provenance: { source: 'snapshot/derived', deterministic: true, thresholds: th },
      }));
    }
  }

  if (findings.some(f => f.runningNoFlow)) {
    recommendations.push('Inspect pumps with flow loss for wear, blockage, suction issues, valves, alignment; correlate with vibration/power/pressure where available.');
  }
  if (findings.some(f => typeof f.condition === 'number' && f.condition < th.conditionLow)) {
    recommendations.push('Schedule condition-based inspection/overhaul for low-health units; avoid relying on degraded capacity for critical dewatering.');
    conflicts.push('Low pump health indicated for one or more units — capacity/reliability assumptions may not hold.');
  }
  if (!findings.length) {
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: 'No explicit pump degradation/fault flags detected in snapshot-derived condition/status fields.',
      confidence: 0.6,
      refs: [ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    uncertainties.push('Absence of flags does not guarantee health; inspections and trend data may reveal developing faults.');
  }

  const staleSensors = Object.entries(sensors).filter(([, s]) => ['stale', 'expired', 'unavailable', 'bad'].includes(sensorFreshness(s)));
  if (staleSensors.length) {
    findings.push({ type: 'telemetry-health', count: staleSensors.length, sensors: staleSensors.slice(0, 20).map(([id]) => id) });
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `${staleSensors.length} sensor(s) stale/expired/unavailable/bad; monitoring confidence and fault detection are reduced.`,
      value: staleSensors.slice(0, 20).map(([id, s]) => ({ id, freshness: sensorFreshness(s), note: s?.note })),
      confidence: 0.8,
      refs: [ref, ...staleSensors.slice(0, 10).map(([id]) => id)].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    recommendations.push('Restore instrumentation/communications for critical measurements to support diagnosis and safe operation.');
    uncertainties.push('Degraded telemetry can mask real process issues or create false concern; confirm with independent checks.');
  }

  const maintAssets = Object.entries(assets).filter(([, a]) => ['maintenance', 'offline', 'failed'].includes(String(a?.status ?? '').toLowerCase()));
  if (maintAssets.length) {
    findings.push({ type: 'asset-maintenance-state', assets: maintAssets.map(([id, a]) => ({ id, status: a?.status })) });
    recommendations.push('Account for assets in maintenance/offline/failed states in planning and spares/crew allocation.');
  }

  evidence.push(makeEvidence({
    i: i++, task, kind: 'document', snapshotRef: ref,
    claim: 'Grounding: proactive maintenance for mine dewatering/pump systems relies on condition indicators (vibration, temperature, flow/head/power deviations, wear) and timely response to degradation to prevent unplanned downtime/flooding (literature synthesis).',
    confidence: 0.67,
    refs: ['research:pmc12031373'],
    provenance: { source: 'internet-case-study-synthesis', deterministic: false },
  }));

  attachMlFindings(input, findings, evidence, uncertainties, task);
  const summary = `Maintenance assessment: ${findings.filter(f => f.type === 'maintenance-concern').length} pump concern(s), ${staleSensors.length} telemetry issue(s), ${maintAssets.length} asset(s) in maintenance/offline/failed state.`;

  return {
    report: makeReport({ task, agentVersion: '0.3.0', summary, findings, evidenceIds: evidence.map(e => e.id), assumptions, uncertainties, recommendations, conflicts }),
    evidence,
  };
}
