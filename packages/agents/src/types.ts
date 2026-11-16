import type { AgentReport, EvidenceItem, TaskContract } from '@mine-os/contracts';

/** Versioned ML prediction/hypothesis attached to a snapshot analysis (provenanced, not ground truth). */
export interface MLPrediction {
  modelId: string;
  modelVersion: string;
  task: string;
  value: unknown;
  confidence?: number;
  featuresRef?: string;
  provenance: Record<string, unknown>;
  atMs: number;
}

export interface AgentInput {
  siteId: string;
  /** Derived/telemetry snapshot (e.g. WorldState or recorded snapshot.data). */
  snapshot?: any;
  /** Optional mine definition/config for geometry/limits context. */
  mine?: any;
  /** Investigation context/history (may include calibrationProfile, knowledgeHits, feedback, rules). */
  context?: Record<string, unknown>;
  /** Versioned ML inference outputs (recorded hypotheses). Agents must treat as non-authoritative. */
  mlPredictions?: MLPrediction[];
}

export interface AgentResult {
  report: AgentReport;
  evidence: EvidenceItem[];
}

export type AgentRunner = (task: TaskContract, input: AgentInput) => AgentResult;

export function nowMs(): number {
  return Date.now();
}

export function evId(taskId: string, i: number): string {
  return `ev-${taskId}-${i}`;
}

export function repId(taskId: string): string {
  return `rep-${taskId}`;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

export function entriesOf<T = any>(v: unknown): Array<[string, T]> {
  const r = asRecord(v);
  return Object.entries(r) as Array<[string, T]>;
}

export function valuesOf<T = any>(v: unknown): T[] {
  return entriesOf<T>(v).map(([, val]) => val);
}

export function makeEvidence(args: {
  i: number;
  task: TaskContract;
  kind: EvidenceItem['kind'];
  claim: string;
  value?: unknown;
  unit?: string;
  confidence?: number;
  refs?: string[];
  snapshotRef?: string;
  provenance?: Record<string, unknown>;
}): EvidenceItem {
  return {
    id: evId(args.task.id, args.i),
    investigationId: args.task.investigationId,
    taskId: args.task.id,
    agentId: args.task.agentId,
    kind: args.kind,
    claim: args.claim,
    value: args.value,
    unit: args.unit,
    confidence: args.confidence == null ? undefined : clamp01(args.confidence),
    refs: args.refs ?? [],
    snapshotRef: args.snapshotRef,
    provenance: args.provenance ?? {},
    atMs: nowMs(),
  };
}

export function makeReport(args: {
  task: TaskContract;
  agentVersion: string;
  summary: string;
  findings?: any[];
  evidenceIds?: string[];
  assumptions?: string[];
  uncertainties?: string[];
  recommendations?: string[];
  conflicts?: string[];
}): AgentReport {
  return {
    id: repId(args.task.id),
    investigationId: args.task.investigationId,
    taskId: args.task.id,
    agentId: args.task.agentId,
    agentVersion: args.agentVersion,
    summary: args.summary,
    findings: args.findings ?? [],
    evidenceIds: args.evidenceIds ?? [],
    assumptions: args.assumptions ?? [],
    uncertainties: args.uncertainties ?? [],
    recommendations: args.recommendations ?? [],
    conflicts: args.conflicts ?? [],
    atMs: nowMs(),
  };
}

export function attachMlFindings(input: AgentInput, findings: any[], evidence: EvidenceItem[], uncertainties: string[], task: TaskContract) {
  const preds = input.mlPredictions ?? [];
  if (!preds.length) return;
  for (const [idx, p] of preds.entries()) {
    findings.push({ source: 'ml-hypothesis', modelId: p.modelId, modelVersion: p.modelVersion, task: p.task, value: p.value, confidence: p.confidence });
    evidence.push(makeEvidence({
      i: 900 + idx,
      task,
      kind: 'hypothesis',
      claim: `ML hypothesis (${p.modelId}@${p.modelVersion}, task=${p.task}) — advisory, requires validation against deterministic/field evidence`,
      value: p.value,
      confidence: p.confidence,
      refs: p.featuresRef ? [p.featuresRef] : [],
      provenance: { ...p.provenance, modelId: p.modelId, modelVersion: p.modelVersion, authoritative: false },
    }));
    uncertainties.push(`ML output ${p.modelId}@${p.modelVersion} is a versioned hypothesis, not ground truth; validate with measurements and deterministic checks.`);
  }
}
