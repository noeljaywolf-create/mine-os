import type { TaskContract } from '@mine-os/contracts';
import { attachMlFindings, makeEvidence, makeReport, type AgentInput, type AgentResult } from './types';
import { getSensors, getSumps, getZones, snapshotRef, sensorFreshness, sumpFillRatio, sumpLevelM, sumpSecondsToCritical, zoneRatio } from './snapshot';
import { resolveThresholds } from './thresholds';

/**
 * Safety specialist agent.
 * Interprets operating restrictions and safety-relevant conditions from snapshot (flooding/exposure risk, access loss,
 * loss of observability). Advisory: does not replace site safety rules, controls, or authorization; flags constraints.
 * Thresholds calibration-tunable (Approach A).
 */
export function runSafetyAgent(task: TaskContract, input: AgentInput): AgentResult {
  const snap = input.snapshot;
  const ref = snapshotRef(snap);
  const sumps = getSumps(snap);
  const zones = getZones(snap);
  const sensors = getSensors(snap);
  const { thresholds, calibrationRef } = resolveThresholds(input.context);
  const th = thresholds.safety;
  const evidence = [] as ReturnType<typeof makeEvidence>[];
  const findings: any[] = [];
  const assumptions = [
    'Safety interpretation is based on modelled/snapshot thresholds and states; actual site safety decisions require competent persons, procedures, and verified measurements.',
    'This agent provides advisory constraints/risk flags and does not authorize entry, energization, or operational changes.',
  ];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const conflicts: string[] = [];
  let i = 1;
  if (calibrationRef) assumptions.push(`Applied calibration profile: ${calibrationRef}.`);

  let criticalFloodRisk = false;
  for (const [id, s] of Object.entries(sumps)) {
    const fill = sumpFillRatio(s);
    const ttc = sumpSecondsToCritical(s);
    const breach = s?.breach;
    const sev = String(breach?.severity ?? '').toLowerCase();
    const high = sev === 'critical' || fill >= th.fillCritical || (ttc != null && ttc <= th.ttcCriticalSec);
    const warn = sev === 'warning' || sev === 'advisory' || fill >= th.fillWarning || (ttc != null && ttc <= th.ttcWarningSec);
    if (high || warn) {
      if (high) criticalFloodRisk = true;
      findings.push({ type: 'flooding-risk', sumpId: id, severity: high ? 'critical' : 'warning', fillRatio: fill, secondsToCritical: ttc, breach });
      evidence.push(makeEvidence({
        i: i++, task, kind: 'derived', snapshotRef: ref,
        claim: `Sump ${id} safety-relevant water condition: ${high ? 'critical' : 'warning'} (fill ${(fill * 100).toFixed(1)}%, level ${sumpLevelM(s).toFixed(2)} m${ttc != null ? `, ~${(ttc / 3600).toFixed(2)} h to critical at current net flow` : ''}).`,
        value: { sumpId: id, fillRatio: fill, levelM: sumpLevelM(s), breach, secondsToCritical: ttc },
        confidence: 0.77,
        refs: [id, ref].filter(Boolean) as string[],
        provenance: { source: 'snapshot/derived', deterministic: true, thresholds: th },
      }));
    }
  }

  const restrictedZones = Object.entries(zones).filter(([, z]) => zoneRatio(z) < thresholds.production.constrainedRatio || ['failed', 'exposed', 'blocked'].includes(String(z?.status ?? '').toLowerCase()));
  if (restrictedZones.length) {
    findings.push({ type: 'access-restriction', zones: restrictedZones.map(([id, z]) => ({ id, ratio: zoneRatio(z), status: z?.status })) });
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `${restrictedZones.length} zone(s) show restricted/exposed status or reduced operating ratio; treat affected areas per site access/water-management rules.`,
      value: restrictedZones.slice(0, 20).map(([id, z]) => ({ id, operatingRatio: zoneRatio(z), status: z?.status, reason: z?.statusReason })),
      confidence: 0.74,
      refs: [ref, ...restrictedZones.slice(0, 10).map(([id]) => id)].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    recommendations.push('Apply/verify access restrictions and withdrawal triggers for affected zones until water levels and controls are confirmed safe.');
  }

  const obsLoss = Object.entries(sensors).filter(([, s]) => ['expired', 'unavailable'].includes(sensorFreshness(s)));
  const stale = Object.entries(sensors).filter(([, s]) => ['stale', 'bad'].includes(sensorFreshness(s)));
  if (obsLoss.length) {
    findings.push({ type: 'observability-loss', count: obsLoss.length });
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `${obsLoss.length} sensor(s) expired/unavailable; reduced observability increases uncertainty for safe decisions.`,
      value: obsLoss.slice(0, 20).map(([id, s]) => ({ id, freshness: sensorFreshness(s) })),
      confidence: 0.8,
      refs: [ref, ...obsLoss.slice(0, 10).map(([id]) => id)].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    recommendations.push('Compensate for lost monitoring with verified manual checks and conservative operating limits.');
    uncertainties.push('Sensor expiry may hide worsening conditions; do not assume safety from lack of alarms.');
  } else if (stale.length) {
    uncertainties.push(`${stale.length} sensor(s) stale/bad; monitoring confidence reduced.`);
  }

  if (criticalFloodRisk) {
    recommendations.push('Escalate per emergency/water-management procedures: imminent flooding or critical threshold risk indicated by modelled state.');
    conflicts.push('Potential safety-critical flooding/exposure condition indicated; operational plans must satisfy safety constraints and verification.');
  } else if (!findings.length) {
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: 'No critical flooding/exposure flags detected in snapshot-derived safety indicators.',
      confidence: 0.55,
      refs: [ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    uncertainties.push('No flagged condition is not proof of safety; continue monitoring, inspections, and adherence to procedures.');
  }

  // knowledge/RAG citations if provided (untrusted context)
  const hits = Array.isArray((input.context as any)?.knowledgeHits) ? (input.context as any).knowledgeHits : [];
  if (hits.length) {
    evidence.push(makeEvidence({
      i: i++, task, kind: 'document', snapshotRef: ref,
      claim: `${hits.length} approved-document excerpt(s) retrieved for context (UNTRUSTED; verify against procedures and evidence).`,
      value: hits.slice(0, 5).map((h: any) => ({ citation: h.citation, score: h.score, chunkId: h.chunkId })),
      confidence: 0.5,
      refs: hits.slice(0, 5).map((h: any) => h.documentId).filter(Boolean),
      provenance: { source: 'rag-retrieval', untrusted: true },
    }));
  }

  evidence.push(makeEvidence({
    i: i++, task, kind: 'document', snapshotRef: ref,
    claim: 'Grounding: uncontrolled mine flooding and loss of dewatering/monitoring create serious safety and access hazards; conservative response and verified restrictions are essential (case-study synthesis).',
    confidence: 0.7,
    refs: ['research:mdpi-2071-1050-18-4-1774'],
    provenance: { source: 'internet-case-study-synthesis', deterministic: false },
  }));

  attachMlFindings(input, findings, evidence, uncertainties, task);
  const summary = criticalFloodRisk
    ? 'Safety assessment: CRITICAL flooding/exposure risk indicated by snapshot; immediate escalation and verified restrictions advised.'
    : findings.length
      ? `Safety assessment: ${findings.length} safety-relevant condition(s)/restriction(s) indicated; apply conservative controls and verification.`
      : 'Safety assessment: no critical flags in snapshot indicators; maintain monitoring and procedures.';

  return {
    report: makeReport({ task, agentVersion: '0.3.0', summary, findings, evidenceIds: evidence.map(e => e.id), assumptions, uncertainties, recommendations, conflicts }),
    evidence,
  };
}
