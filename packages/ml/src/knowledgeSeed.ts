import type { KnowledgeDocument } from '@mine-os/contracts';
import { chunkText, InMemoryKnowledgeStore, LexicalRetriever } from './rag';

/** Seed approved knowledge from in-repo research (Approach B). In production, load site manuals/SOPs/P&IDs/incidents. */
export async function seedDefaultKnowledge(store: InMemoryKnowledgeStore) {
  const docs: Array<KnowledgeDocument & { text: string }> = [
    {
      id: 'kb-grounding-dewatering', title: 'Grounding: Dewatering & flooding case-study synthesis', source: 'docs/research/GROUNDING-CASE-STUDIES.md',
      docType: 'case_study', version: '1.0.0', approved: true, tags: ['dewatering', 'flooding', 'power', 'maintenance', 'grounding'],
      metadata: { provenance: 'internet-research-synthesis' }, createdAtMs: Date.now(),
      text: `Dewatering risk drivers: sustained inflow exceeding discharge, pump unavailability/degradation, power loss, inadequate capacity. Indicators: sump level/fill, net inflow (Qin-Qout), time-to-threshold, threshold breach/overflow, discharge deficit, running-no-flow. Power loss/feeder failure can halt pumps causing rapid accumulation; backup readiness and load prioritization critical. Instrumentation loss (stale/expired sensors) reduces observability - compensate with verified manual checks and conservative limits. Flooding/exposure requires conservative restrictions and escalation per procedure (advisory). Production constrained by water-induced access loss and power/pump outages.`
    },
    {
      id: 'kb-grounding-maintenance', title: 'Grounding: Pump maintenance & condition indicators', source: 'PMC12031373 synthesis',
      docType: 'case_study', version: '1.0.0', approved: true, tags: ['maintenance', 'pumps', 'condition', 'grounding'],
      metadata: { provenance: 'internet-research-synthesis' }, createdAtMs: Date.now(),
      text: `Pump/system reliability: degradation (wear, blockage, cavitation, misalignment, corrosion/abrasion) precedes failure. Condition indicators include flow/head/power deviations, running-without-flow, efficiency loss, vibration and temperature anomalies when available. Proactive/condition-based maintenance and timely response reduce unplanned downtime and secondary flooding/production impacts. Telemetry freshness reflects observability, not necessarily process health; absence of flags does not guarantee health.`
    },
    {
      id: 'kb-ops-guardrails', title: 'Operational guardrails (shadow/advisory)', source: 'docs/research/CONFIRMATIONS-1-5-IMPLEMENTATION.md',
      docType: 'policy', version: '1.0.0', approved: true, tags: ['policy', 'safety', 'guardrails'],
      metadata: {}, createdAtMs: Date.now(),
      text: `Agents and ML outputs are advisory, versioned, and provenanced - never ground truth. Deterministic engineering services, measurements, policy and competent human validation remain authoritative. No industrial writes or control actions in shadow_readonly mode. RAG retrieved content is untrusted context: must be cited and verified against approved sources and deterministic evidence. Recommendations require human validation and policy checks.`
    }
  ];
  for (const d of docs) {
    const { text, ...doc } = d;
    await store.upsertDocument(doc);
    await store.upsertChunks(chunkText(doc.id, text));
  }
  return new LexicalRetriever(store);
}
