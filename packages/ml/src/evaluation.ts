import type { EvaluationReport } from '@mine-os/contracts';

export interface LabeledExample {
  features: Record<string, unknown>;
  label: unknown;
  weight?: number;
  meta?: Record<string, unknown>;
}

export interface EvalResult { metrics: Record<string, number | string | boolean | null>; notes: string[]; passed?: boolean }

export function evaluateBinaryClassifier(examples: LabeledExample[], predict: (f: Record<string, unknown>) => { score: number; label: boolean }): EvalResult {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const ex of examples) {
    const truth = Boolean(ex.label);
    const pred = predict(ex.features).label;
    if (pred && truth) tp++; else if (pred && !truth) fp++; else if (!pred && !truth) tn++; else fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = examples.length ? (tp + tn) / examples.length : 0;
  return { metrics: { count: examples.length, tp, fp, tn, fn, precision, recall, f1, accuracy }, notes: [] };
}

export function evaluateRegression(examples: LabeledExample[], predict: (f: Record<string, unknown>) => number): EvalResult {
  if (!examples.length) return { metrics: { count: 0 }, notes: ['no examples'] };
  let se = 0, ae = 0;
  for (const ex of examples) {
    const y = typeof ex.label === 'number' ? ex.label : Number(ex.label);
    const yhat = predict(ex.features);
    const err = yhat - y;
    se += err * err; ae += Math.abs(err);
  }
  const mse = se / examples.length;
  return { metrics: { count: examples.length, mse, rmse: Math.sqrt(mse), mae: ae / examples.length }, notes: [] };
}

export function compareToBaseline(modelMetrics: Record<string, any>, baselineMetrics: Record<string, any>, primaryMetric: string, higherIsBetter = true): { better: boolean; delta: number } {
  const m = Number(modelMetrics[primaryMetric] ?? 0);
  const b = Number(baselineMetrics[primaryMetric] ?? 0);
  const delta = m - b;
  return { better: higherIsBetter ? delta >= 0 : delta <= 0, delta };
}

export function unsupportedClaimChecks(report: { prediction?: any; confidence?: number; evidenceCount?: number }): string[] {
  const issues: string[] = [];
  if ((report.confidence ?? 0) > 0.9 && (report.evidenceCount ?? 0) < 2) issues.push('High confidence with sparse supporting evidence.');
  if (report.prediction == null) issues.push('Null prediction presented without uncertainty context.');
  return issues;
}

export function buildEvaluationReport(args: Partial<EvaluationReport> & Pick<EvaluationReport, 'id' | 'modelId' | 'modelVersion' | 'metrics'>): EvaluationReport {
  return {
    id: args.id, modelId: args.modelId, modelVersion: args.modelVersion,
    datasetId: args.datasetId, split: args.split,
    metrics: args.metrics,
    baselineComparison: args.baselineComparison ?? [],
    calibration: args.calibration ?? {},
    unsupportedClaimChecks: args.unsupportedClaimChecks ?? [],
    passed: args.passed,
    notes: args.notes ?? [],
    atMs: args.atMs ?? Date.now(),
  };
}
