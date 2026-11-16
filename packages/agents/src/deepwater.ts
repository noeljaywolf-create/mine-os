import type { TaskContract } from '@mine-os/contracts';
import { attachMlFindings, makeEvidence, makeReport, num, type AgentInput, type AgentResult } from './types';
import { getPumps, getSumps, pumpFlowM3h, pumpIsRunning, snapshotRef, sumpFillRatio, sumpLevelM, sumpNetM3h, sumpSecondsToCritical } from './snapshot';
import { resolveThresholds } from './thresholds';

/**
 * DeepWater (dewatering) specialist agent.
 * Grounded in dewatering case studies: sump accumulation, inflow/outflow imbalance, pump availability/flow loss,
 * threshold exceedance and time-to-critical drive flooding and production access risk. Deterministic over snapshot;
 * ML outputs are advisory hypotheses with provenance. Thresholds are calibration-tunable (no ML training required).
 */
export function runDeepWaterAgent(task: TaskContract, input: AgentInput): AgentResult {
  const snap = input.snapshot;
  const ref = snapshotRef(snap);
  const sumps = getSumps(snap);
  const pumps = getPumps(snap);
  const { thresholds, calibrationRef } = resolveThresholds(input.context);
  const th = thresholds.dewater;
  const evidence = [] as ReturnType<typeof makeEvidence>[];
  const findings: any[] = [];
  const assumptions = [
    'Uses derived/modelled sump and pump states from the provided snapshot (not direct SCADA truth unless snapshot is telemetry).',
    'Time-to-critical and threshold breach are modelled projections; real inflow can vary with geology/rainfall/operations.',
  ];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const conflicts: string[] = [];
  let i = 1;
  if (calibrationRef) assumptions.push(`Applied calibration profile: ${calibrationRef}.`);

  const sumpEntries = Object.entries(sumps);
  if (sumpEntries.length === 0) uncertainties.push('No sump states present in snapshot; dewatering assessment is indeterminate.');

  let worst: { id: string; fill: number; net: number; ttc: number | null; breach: any } | null = null;
  let anyBreached = false;
  let anyNetPositive = false;

  for (const [id, s] of sumpEntries) {
    const fill = sumpFillRatio(s);
    const net = sumpNetM3h(s);
    const level = sumpLevelM(s);
    const ttc = sumpSecondsToCritical(s);
    const breach = s?.breach ?? null;
    const inflow = num(s?.inflowM3h);
    const outflow = num(s?.outflowM3h);
    if (net > th.netPositiveM3h) anyNetPositive = true;
    if (breach) anyBreached = true;
    if (!worst || fill > worst.fill || (breach && !worst.breach)) worst = { id, fill, net, ttc, breach };

    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `Sump ${id}: level ${level.toFixed(2)} m, fill ${(fill * 100).toFixed(1)}%, inflow ${inflow.toFixed(1)} m3/h, outflow ${outflow.toFixed(1)} m3/h, net ${net.toFixed(1)} m3/h${breach ? `, breach=${breach.label ?? breach.severity ?? 'threshold'}` : ''}.`,
      value: { sumpId: id, levelM: level, fillRatio: fill, inflowM3h: inflow, outflowM3h: outflow, netM3h: net, breach, secondsToCritical: ttc },
      confidence: 0.8,
      refs: [id, ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true, thresholds: th },
    }));

    if (breach || fill >= th.fillHigh || (ttc != null && ttc <= th.ttcWarningSec)) {
      recommendations.push(`Prioritize dewatering at ${id}: high storage/risk state (verify pump availability, discharge path, and inflow sources).`);
    }
    // cross-signal: reported outflow but no running discharge contribution known elsewhere handled at pump level; flag impossible-looking state
    if (inflow === 0 && outflow === 0 && fill > 0.001) uncertainties.push(`Sump ${id}: zero inflow/outflow reported with stored volume; verify measurements or accounting.`);
  }

  const pumpEntries = Object.entries(pumps);
  const running = pumpEntries.filter(([, p]) => pumpIsRunning(p));
  const totalDischarge = pumpEntries.reduce((a, [, p]) => a + pumpFlowM3h(p), 0);
  const notDelivering = running.filter(([, p]) => pumpFlowM3h(p) <= 0.01);
  const unavailable = pumpEntries.filter(([, p]) => String(p?.status ?? '').toLowerCase().match(/failed|blocked|offline|unavailable/) || p?.powered === false);

  evidence.push(makeEvidence({
    i: i++, task, kind: 'derived', snapshotRef: ref,
    claim: `Pumping capacity snapshot: ${running.length}/${pumpEntries.length} running, total delivered ${totalDischarge.toFixed(1)} m3/h, ${unavailable.length} unavailable/blocked, ${notDelivering.length} running with negligible flow.`,
    value: { running: running.length, total: pumpEntries.length, totalDischargeM3h: totalDischarge, unavailable: unavailable.map(([id]) => id), runningNoFlow: notDelivering.map(([id]) => id) },
    confidence: 0.78,
    refs: [ref, ...pumpEntries.slice(0, 10).map(([id]) => id)].filter(Boolean) as string[],
    provenance: { source: 'snapshot/derived', deterministic: true },
  }));

  if (notDelivering.length) {
    findings.push({ type: 'pump-delivery-loss', pumps: notDelivering.map(([id]) => id) });
    recommendations.push('Investigate pumps running without effective discharge (power, suction, blockage/wear, valve/line, instrumentation disagreement).');
    uncertainties.push('Running-without-flow can reflect hydraulic limits, faults, or measurement issues; requires inspection/diagnostics.');
  }
  if (unavailable.length) {
    recommendations.push('Restore or substitute unavailable pumping capacity; confirm electrical supply and maintenance isolations.');
  }
  if (anyNetPositive) {
    findings.push({ type: 'net-inflow-positive' });
    recommendations.push('Net inflow exceeds discharge in at least one sump: reduce inflow where possible and increase effective dewatering within safe limits.');
  }
  if (totalDischarge <= 0.01 && anyNetPositive) {
    conflicts.push('Net inflow positive while total delivered discharge is ~0 m3/h — dewatering capacity ineffective or unavailable.');
  }
  if (worst?.ttc != null && worst.ttc <= th.ttcUrgentSec) {
    conflicts.push(`Urgent: sump ${worst.id} projected to reach critical in ${(worst.ttc / 3600).toFixed(2)} h at current net flow (threshold ${ (th.ttcUrgentSec/3600).toFixed(2)} h).`);
  }

  // Case-study grounding note (provenance recorded): uncontrolled accumulation/flooding follows sustained inflow>outflow or pump/power loss.
  evidence.push(makeEvidence({
    i: i++, task, kind: 'document', snapshotRef: ref,
    claim: 'Grounding: mine dewatering failures and flooding are commonly driven by sustained inflow exceeding pumping capacity, pump unavailability/degradation, or power loss; time-to-threshold and outflow deficit are key risk indicators (literature/case-study synthesis).',
    confidence: 0.7,
    refs: ['research:mdpi-2071-1050-18-4-1774', 'research:pmc12031373'],
    provenance: { source: 'internet-case-study-synthesis', deterministic: false, note: 'Use for contextual grounding; site conditions govern.' },
  }));

  attachMlFindings(input, findings, evidence, uncertainties, task);

  const risk = anyBreached || (worst && (worst.fill >= th.fillCritical || (worst.ttc != null && worst.ttc <= th.ttcWarningSec))) ? 'high' : anyNetPositive || (worst && worst.fill >= th.fillHigh) ? 'elevated' : 'managed';
  const summary = `DeepWater assessment: ${risk} dewatering risk. Worst sump ${worst?.id ?? 'n/a'} fill ${worst ? (worst.fill * 100).toFixed(1) : 'n/a'}%, net ${worst ? worst.net.toFixed(1) : 'n/a'} m3/h, total discharge ${totalDischarge.toFixed(1)} m3/h.`;

  return {
    report: makeReport({
      task, agentVersion: '0.3.0', summary, findings, evidenceIds: evidence.map(e => e.id),
      assumptions, uncertainties, recommendations, conflicts,
    }),
    evidence,
  };
}
