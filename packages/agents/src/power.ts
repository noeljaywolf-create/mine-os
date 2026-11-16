import type { TaskContract } from '@mine-os/contracts';
import { attachMlFindings, makeEvidence, makeReport, num, type AgentInput, type AgentResult } from './types';
import { getFeeders, getPumps, pumpIsRunning, pumpPowerKw, snapshotRef, totalFeederSupplyKw, totalPumpDemandKw } from './snapshot';
import { resolveThresholds } from './thresholds';

/**
 * Power specialist agent.
 * Analyzes supply vs demand, feeder health/availability, and power-driven pumping constraints.
 * Grounded in case studies where power outages/feeder failures remove dewatering capacity and escalate flooding/production risk.
 * Thresholds calibration-tunable (Approach A, no ML training required).
 */
export function runPowerAgent(task: TaskContract, input: AgentInput): AgentResult {
  const snap = input.snapshot;
  const ref = snapshotRef(snap);
  const feeders = getFeeders(snap);
  const pumps = getPumps(snap);
  const { thresholds, calibrationRef } = resolveThresholds(input.context);
  const evidence = [] as ReturnType<typeof makeEvidence>[];
  const findings: any[] = [];
  const assumptions = [
    'Uses derived/modelled feeder and pump power states from snapshot; not a protection/SCADA authority.',
    'Available supply is taken from snapshot allocation/capacity fields when present.',
  ];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const conflicts: string[] = [];
  let i = 1;
  if (calibrationRef) assumptions.push(`Applied calibration profile: ${calibrationRef}.`);

  const demand = totalPumpDemandKw(pumps);
  const supply = totalFeederSupplyKw(feeders);
  const margin = supply - demand;
  const constrained = supply > 0 ? demand > supply + 1e-6 : (demand > 0);
  const tightMargin = !constrained && margin <= thresholds.power.marginWarningKw && demand > 0;

  evidence.push(makeEvidence({
    i: i++, task, kind: 'derived', snapshotRef: ref,
    claim: constrained
      ? `Power constraint: running demand ${demand.toFixed(1)} kW exceeds available supply ${supply.toFixed(1)} kW.`
      : `Power balance: demand ${demand.toFixed(1)} kW vs available supply ${supply.toFixed(1)} kW (margin ${margin.toFixed(1)} kW${tightMargin ? ', tight' : ''}).`,
    value: { totalDemandKw: demand, availableSupplyKw: supply, marginKw: margin, constrained, tightMargin },
    confidence: 0.82,
    refs: [ref, ...Object.keys(feeders).slice(0, 10)].filter(Boolean) as string[],
    provenance: { source: 'snapshot/derived', deterministic: true },
  }));

  const feederEntries = Object.entries(feeders);
  const badFeeders = feederEntries.filter(([, f]) => ['failed', 'isolated', 'offline', 'maintenance'].includes(String(f?.status ?? '').toLowerCase()) || num(f?.supplyRatio, 1) <= 0);
  const degradedFeeders = feederEntries.filter(([, f]) => String(f?.status ?? '').toLowerCase() === 'degraded' || (num(f?.supplyRatio, 1) > 0 && num(f?.supplyRatio, 1) < thresholds.power.supplyRatioDegraded));

  for (const [fid, f] of [...badFeeders, ...degradedFeeders].slice(0, 12)) {
    findings.push({ type: 'feeder-condition', feederId: fid, status: f?.status, supplyRatio: f?.supplyRatio, availableKw: f?.availableKw });
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `Feeder ${fid} status ${String(f?.status ?? 'unknown')} (supply ratio ${num(f?.supplyRatio, 1).toFixed(2)}). ${String(f?.statusReason ?? '')}`.trim(),
      value: { feederId: fid, status: f?.status, supplyRatio: f?.supplyRatio, availableKw: f?.availableKw, allocatedKw: f?.allocatedKw },
      confidence: 0.78,
      refs: [fid, ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
  }

  const powerlessPumps = Object.entries(pumps).filter(([, p]) => pumpIsRunning(p) && p?.powered === false);
  if (powerlessPumps.length) {
    findings.push({ type: 'running-unpowered', pumps: powerlessPumps.map(([id]) => id) });
    conflicts.push(`Inconsistent state: ${powerlessPumps.length} pump(s) marked running but unpowered in snapshot.`);
    recommendations.push('Resolve power-state inconsistency for running/unpowered pumps and confirm actual electrical status.');
  }
  const runningNoPowerDraw = Object.entries(pumps).filter(([, p]) => pumpIsRunning(p) && pumpPowerKw(p) <= 0.01 && p?.powered !== false);
  if (runningNoPowerDraw.length) uncertainties.push(`${runningNoPowerDraw.length} running pump(s) report ~0 kW draw; verify metering or actual running state.`);

  if (!feederEntries.length) uncertainties.push('No feeder states in snapshot; supply-side assessment limited.');
  if (demand > 0 && supply <= 0) conflicts.push('Running pump demand indicated with zero available supply — dewatering capacity at risk if not backed by unreported source.');
  if (constrained) {
    recommendations.push('Prioritize critical dewatering loads, shed non-critical demand, and restore feeder/generation capacity per procedures.');
    conflicts.push('Electrical demand exceeds available supply (modelled) — load shedding or supply restoration required.');
  } else if (tightMargin) {
    recommendations.push('Power margin is tight; verify backup readiness and prepare load-shedding priorities for critical dewatering.');
  }
  if (badFeeders.length) recommendations.push('Investigate/restore unavailable feeders or switch to verified backup supply paths per procedures.');
  if (!constrained && !badFeeders.length && !tightMargin) recommendations.push('Maintain monitoring of load margin and backup readiness for dewatering-critical circuits.');

  evidence.push(makeEvidence({
    i: i++, task, kind: 'document', snapshotRef: ref,
    claim: 'Grounding: power loss or feeder unavailability can halt dewatering pumps, driving rapid sump accumulation and downstream production/safety impacts; backup readiness and load prioritization are critical (case-study synthesis).',
    confidence: 0.7,
    refs: ['research:mdpi-2071-1050-18-4-1774', 'research:pmc12031373'],
    provenance: { source: 'internet-case-study-synthesis', deterministic: false },
  }));

  attachMlFindings(input, findings, evidence, uncertainties, task);

  const summary = constrained
    ? `Power assessment: CONSTRAINED (demand ${demand.toFixed(1)} kW > supply ${supply.toFixed(1)} kW), ${badFeeders.length} feeder(s) unavailable.`
    : `Power assessment: ${badFeeders.length ? 'degraded supply' : tightMargin ? 'tight margin' : 'stable'} (demand ${demand.toFixed(1)} kW, supply ${supply.toFixed(1)} kW, margin ${margin.toFixed(1)} kW).`;

  return {
    report: makeReport({ task, agentVersion: '0.3.0', summary, findings, evidenceIds: evidence.map(e => e.id), assumptions, uncertainties, recommendations, conflicts }),
    evidence,
  };
}
