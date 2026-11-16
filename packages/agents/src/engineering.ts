import type { TaskContract } from '@mine-os/contracts';
import { attachMlFindings, makeEvidence, makeReport, num, type AgentInput, type AgentResult } from './types';
import { feederAvailableKw, getAssets, getFeeders, getPumps, listPumpIssues, pumpFlowM3h, pumpIsRunning, pumpPowerKw, snapshotRef, totalFeederSupplyKw, totalPumpDemandKw } from './snapshot';
import { resolveThresholds } from './thresholds';

/**
 * Engineering specialist agent.
 * Evaluates equipment/network feasibility: power-path sufficiency, pump duty/delivery sanity, and asset state consistency.
 * Deterministic checks over snapshot; flags infeasible conditions (demand>supply, unavailable required equipment).
 */
export function runEngineeringAgent(task: TaskContract, input: AgentInput): AgentResult {
  const snap = input.snapshot;
  const ref = snapshotRef(snap);
  const pumps = getPumps(snap);
  const feeders = getFeeders(snap);
  const assets = getAssets(snap);
  const { calibrationRef } = resolveThresholds(input.context);
  const evidence = [] as ReturnType<typeof makeEvidence>[];
  const findings: any[] = [];
  const assumptions = [
    'Feasibility assessed against reported snapshot capacities/allocations and modelled pump duties; not a substitute for protection studies or detailed hydraulics recalculation.',
  ];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const conflicts: string[] = [];
  let i = 1;
  if (calibrationRef) assumptions.push(`Applied calibration profile: ${calibrationRef}.`);

  const demand = totalPumpDemandKw(pumps);
  const supply = totalFeederSupplyKw(feeders);
  const margin = supply - demand;
  const powerFeasible = !(supply > 0 && demand > supply + 1e-6) && !(supply <= 0 && demand > 0);

  evidence.push(makeEvidence({
    i: i++, task, kind: 'derived', snapshotRef: ref,
    claim: `Network/power feasibility (modelled): running pump demand ${demand.toFixed(1)} kW vs available supply ${supply.toFixed(1)} kW (margin ${margin.toFixed(1)} kW).`,
    value: { demandKw: demand, supplyKw: supply, marginKw: margin, feasible: powerFeasible },
    confidence: 0.8,
    refs: [ref, ...Object.keys(feeders).slice(0, 10)].filter(Boolean) as string[],
    provenance: { source: 'snapshot/derived', deterministic: true },
  }));
  if (!powerFeasible) {
    findings.push({ type: 'power-infeasible', demandKw: demand, supplyKw: supply });
    recommendations.push('Reduce load or restore supply: demand exceeds available electrical capacity for current running duties.');
    conflicts.push('Electrical capacity insufficient for current demand (modelled); shedding or restoration required for feasibility.');
  }

  const pumpIssues = listPumpIssues(pumps);
  for (const iss of pumpIssues.slice(0, 12)) {
    findings.push({ type: 'pump-issue', pumpId: iss.id, reason: iss.reason });
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `Pump ${iss.id} issue: ${iss.reason}.`,
      value: { pumpId: iss.id, status: iss.p?.status, mode: iss.p?.mode, flowM3h: pumpFlowM3h(iss.p), powerKw: pumpPowerKw(iss.p), condition: iss.p?.condition ?? iss.p?.health },
      confidence: 0.75,
      refs: [iss.id, ref].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
  }
  if (pumpIssues.length) recommendations.push('Address degraded/unavailable pumps and verify duty points, condition, and power paths before relying on capacity.');

  for (const [fid, f] of Object.entries(feeders)) {
    const avail = feederAvailableKw(f);
    if (avail <= 0 && ['failed', 'isolated', 'offline', 'maintenance'].includes(String(f?.status).toLowerCase())) {
      findings.push({ type: 'feeder-unavailable', feederId: fid, status: f?.status });
    }
  }

  const badAssets = Object.entries(assets).filter(([, a]) => ['failed', 'blocked', 'offline', 'exposed'].includes(String(a?.status ?? '').toLowerCase()));
  if (badAssets.length) {
    evidence.push(makeEvidence({
      i: i++, task, kind: 'derived', snapshotRef: ref,
      claim: `${badAssets.length} asset(s) in failed/blocked/offline/exposed state in snapshot.`,
      value: badAssets.slice(0, 20).map(([id, a]) => ({ id, status: a?.status, reason: a?.statusReason })),
      confidence: 0.72,
      refs: [ref, ...badAssets.slice(0, 10).map(([id]) => id)].filter(Boolean) as string[],
      provenance: { source: 'snapshot/derived', deterministic: true },
    }));
    recommendations.push('Review failed/exposed assets for root causes and dependency impacts; confirm isolations before restoration.');
  }

  // Cross-check: running pumps but no feeders modelled
  const running = Object.values(pumps).filter(pumpIsRunning).length;
  if (running > 0 && Object.keys(feeders).length === 0) uncertainties.push('Pumps running but no feeder states modelled; electrical feasibility cannot be fully verified.');

  evidence.push(makeEvidence({
    i: i++, task, kind: 'document', snapshotRef: ref,
    claim: 'Grounding: engineering feasibility depends on intact electrical supply paths and operable pumping equipment; mismatches between demand/capacity and hidden faults require verification (case-study/engineering synthesis).',
    confidence: 0.65,
    refs: ['research:pmc12031373'],
    provenance: { source: 'internet-case-study-synthesis', deterministic: false },
  }));

  attachMlFindings(input, findings, evidence, uncertainties, task);
  const summary = `Engineering feasibility: ${powerFeasible ? 'power path feasible' : 'power constraint detected'} for ${running} running pump(s); ${pumpIssues.length} pump issue(s), ${badAssets.length} asset state concern(s).`;

  return {
    report: makeReport({ task, agentVersion: '0.3.0', summary, findings, evidenceIds: evidence.map(e => e.id), assumptions, uncertainties, recommendations, conflicts }),
    evidence,
  };
}
