import { extractFeatures } from './features';
import { evaluateBinaryClassifier, buildEvaluationReport } from './evaluation';
import type { InferenceRuntime } from './inference';

/** Grounded benchmark harness: compare agent/ML outputs to labeled scenario records and baselines. */
export interface ScenarioRecord {
  id: string;
  archetype?: string;
  features: Record<string, unknown>;
  labels: Record<string, unknown>;
}

export function baselineFloodRisk(features: Record<string, unknown>): { score: number; label: boolean } {
  const n = (k: string) => { const v = features[k]; return typeof v === 'number' ? v : 0; };
  let score = 0;
  if (n('dewater.max_sump_fill_ratio') >= 0.85) score += 0.5;
  if (n('dewater.max_net_inflow_m3h') > 0) score += 0.2;
  if (n('power.margin_kw') < 0) score += 0.2;
  if (n('dewater.pumps_unavailable') > 0) score += 0.1;
  return { score: Math.min(1, score), label: score >= 0.5 };
}

export function runBaselineBenchmark(records: ScenarioRecord[], labelKey = 'flood_risk_high') {
  const examples = records.filter(r => labelKey in r.labels).map(r => ({ features: r.features, label: r.labels[labelKey] }));
  const result = evaluateBinaryClassifier(examples, f => baselineFloodRisk(f));
  return buildEvaluationReport({
    id: `eval-baseline-${labelKey}-${Date.now()}`,
    modelId: 'baseline-rules',
    modelVersion: '0.1.0',
    metrics: result.metrics,
    notes: [...result.notes, `Baseline benchmark for ${labelKey} over ${examples.length} grounded seed records.`],
    passed: (Number(result.metrics.f1 ?? 0) >= 0.5) || examples.length < 5,
  });
}

export async function runModelBenchmark(runtime: InferenceRuntime, modelId: string, records: ScenarioRecord[], labelKey = 'flood_risk_high') {
  const examples = records.filter(r => labelKey in r.labels).map(r => ({ features: r.features, label: r.labels[labelKey] }));
  const result = evaluateBinaryClassifier(examples, (_f) => ({ score: 0, label: false })); // placeholder; real impl would await runtime.predict
  return buildEvaluationReport({
    id: `eval-model-${modelId}-${labelKey}-${Date.now()}`,
    modelId, modelVersion: 'unknown', metrics: result.metrics, notes: ['Model benchmark scaffold; wire async predictions for full evaluation.'], passed: undefined,
  });
}

export function featuresFromSnapshot(snapshot: any) { return extractFeatures(snapshot); }
