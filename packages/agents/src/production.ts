import type { TaskContract } from '@mine-os/contracts';
import { attachMlFindings, makeEvidence, makeReport, type AgentInput, type AgentResult } from './types';
import { getSumps, getZones, snapshotRef, sumpFillRatio, sumpSecondsToCritical, zoneRatio } from './snapshot';
import { resolveThresholds } from './thresholds';

/**
 * Production specialist agent.
 * Assesses throughput/access impact from dewatering/power/asset constraints. Grounded in case studies where
 * flooding, pump/power loss, and water accumulation restrict or halt production and create deferrals/losses.
 */
export function runProductionAgent(task: TaskContract, input: AgentInput): AgentResult {
  const snap = input.snapshot;
  const ref = snapshotRef(snap);
  const zones = getZones(snap);
  const sumps = getSumps(snap);
  const { thresholds, calibrationRef } = resolveThresholds(input.context);
  const evidence = [] as ReturnType<typeof makeEvidence>[];
  const findings: any[] = [];
  const assumptions = [
    'Zone operating ratios and constraints are taken from deterministic/snapshot state (modelled access/production policy).',
    'Production impact is indicative of constrained access/throughput, not a financial guarantee.',
  ];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const conflicts: string[] = [];
  let i = 1;
  if (calibrationRef) assumptions.push(`Applied calibration profile: ${calibrationRef}.`);

  const zoneEntries = Object.entries(zones);
  if (!zoneEntries.length) uncertainties.push('No zone/runtime production states in snapshot; production impact is partially indeterminate.');

  let constrainedZones = 0;
  let minRatio = 1;
  for (const [id, z] of zoneEntries) {
    const ratio = zoneRatio(z);
    minRatio = Math.min(minRatio, ratio);
    const status = String(z?.status ?? 'unknown');
    const constrainedBy = z?.constrainedBy ?? z?.constraint ?? null;
    const rate = (typeof z?.rateTph === 'number') ? z.rateTph : undefined;
    if (ratio < thresholds.production.constrainedRatio || ['degraded', 'failed', 'blocked', 'exposed', 'restricted'].includes(status.toLowerCase())) constrainedZones++;
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `Zone ${id}: operating ratio ${(ratio * 100).toFixed(1)}%, status ${status}${constrainedBy ? `, constrained by ${constrainedBy}` : ''}${rate != null ? `, rate ${rate.toFixed(1)} tph` : ''}.`,
      value: { zoneId: id, operatingRatio: ratio, status, constrainedBy, rateTph: rate, lostTonnes: z?.lostTonnes, lostHours: z?.lostHours, reason: z?.statusReason ?? z?.reason },
      confidence: 0.78,
      refs: [id, ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    if (ratio < thresholds.production.constrainedRatio) {
      findings.push({ type: 'zone-constrained', zoneId: id, operatingRatio: ratio, constrainedBy, status });
      recommendations.push(`Protect access/throughput for ${id}: address ${constrainedBy || 'reported constraint'} (dewatering/power/maintenance) per procedures.`);
    }
  }

  const stressedSumps = Object.entries(sumps).filter(([, s]) => sumpFillRatio(s) >= thresholds.dewater.fillHigh || !!s?.breach || (sumpSecondsToCritical(s) != null && (sumpSecondsToCritical(s) as number) <= thresholds.dewater.ttcWarningSec));
  if (stressedSumps.length) {
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `Dewatering stress on ${stressedSumps.length} sump(s) can restrict production access/floors if not mitigated (geometry/threshold dependent).`,
      value: { sumpIds: stressedSumps.map(([id]) => id) },
      confidence: 0.7,
      refs: [...stressedSumps.map(([id]) => id), ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    recommendations.push('Coordinate dewatering response to prevent water-induced access loss and production deferral.');
    if (constrainedZones > 0) conflicts.push('Active production constraints coincide with dewatering stress; prioritize actions that restore safe access and pumping capacity.');
  }

  evidence.push(makeEvidence({
    i: i++, task, kind: 'document', snapshotRef: ref,
    claim: 'Grounding: mine flooding/inadequate dewatering and power-related pump outages commonly cause production delays, restricted access, and throughput losses in underground operations (literature/case-study synthesis).',
    confidence: 0.68,
    refs: ['research:mdpi-2071-1050-18-4-1774', 'research:pmc12031373'],
    provenance: { source: 'internet-case-study-synthesis', deterministic: false },
  }));

  attachMlFindings(input, findings, evidence, uncertainties, task);
  const impact = constrainedZones === 0 ? 'no active constraint detected' : `${constrainedZones} zone(s) constrained, minimum operating ratio ${(minRatio * 100).toFixed(1)}%`;
  const summary = `Production assessment: ${impact}.`;

  return {
    report: makeReport({ task, agentVersion: '0.3.0', summary, findings, evidenceIds: evidence.map(e => e.id), assumptions, uncertainties, recommendations, conflicts }),
    evidence,
  };
}
