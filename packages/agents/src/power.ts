import type { AgentReport, EvidenceItem, TaskContract } from '@mine-os/contracts';

/** Gate A: Power agent implemented end-to-end over deterministic inputs (simulation/derived snapshot data). */
export function runPowerAgent(task: TaskContract, input: { snapshot?: any; siteId: string }): { report: AgentReport; evidence: EvidenceItem[] } {
  const now = Date.now();
  const derived = input.snapshot?.data || {};
  const feeders = derived.feeders || derived.feederStates || {};
  const pumps = derived.pumps || derived.pumpStates || {};
  const totalDemand = Object.values(pumps).reduce((a: number, p: any) => a + (Number(p?.powerKw) || 0), 0);
  const available = Object.values(feeders).reduce((a: number, f: any) => a + (Number(f?.availableKw ?? f?.capacityKw) || 0), 0);
  const constrained = available > 0 && totalDemand > available;
  const evidence: EvidenceItem[] = [{
    id: `ev-${task.id}-1`,
    investigationId: task.investigationId,
    taskId: task.id,
    agentId: 'power',
    kind: 'derived',
    claim: constrained ? 'Power supply constrained relative to pumping demand' : 'Power supply sufficient for current pumping demand (modelled)',
    value: { totalDemandKw: +totalDemand.toFixed(2), availableKw: +available.toFixed(2), constrained },
    confidence: 0.8,
    refs: [input.snapshot?.id].filter(Boolean) as string[],
    snapshotRef: input.snapshot?.id,
    provenance: { source: 'engineering-core/derived', deterministic: true },
    atMs: now,
  }];
  const report: AgentReport = {
    id: `rep-${task.id}`,
    investigationId: task.investigationId,
    taskId: task.id,
    agentId: 'power',
    agentVersion: '0.1.0',
    summary: constrained ? 'Power constraint indicated: demand exceeds available supply in current snapshot.' : 'No power constraint indicated in current snapshot.',
    findings: [{ constrained, totalDemandKw: +totalDemand.toFixed(2), availableKw: +available.toFixed(2) }],
    evidenceIds: evidence.map(e => e.id),
    assumptions: ['Uses derived/modelled snapshot values', 'Not a substitute for protection/SCADA status'],
    uncertainties: available === 0 ? ['Supply availability unknown or zero in snapshot'] : [],
    recommendations: constrained ? ['Prioritize critical dewatering loads', 'Verify feeder status and backup availability'] : ['Monitor load vs supply margin'],
    conflicts: [],
    atMs: now,
  };
  return { report, evidence };
}