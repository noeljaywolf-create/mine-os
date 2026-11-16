import type { InferenceRequest, InferenceResponse, ModelManifest } from '@mine-os/contracts';
import type { ModelRegistry } from './registry';

export interface InferenceRuntime {
  predict(req: InferenceRequest): Promise<InferenceResponse>;
}

export interface ModelAdapter {
  supports(model: ModelManifest): boolean;
  predict(model: ModelManifest, req: InferenceRequest): Promise<InferenceResponse>;
}

/** Deterministic baseline adapter: produces rule/threshold-based advisory scores when no trained artifact is available. */
export class BaselineRuleAdapter implements ModelAdapter {
  supports(model: ModelManifest): boolean {
    return model.algorithm === 'baseline-rules' || model.status === 'draft';
  }
  async predict(model: ModelManifest, req: InferenceRequest): Promise<InferenceResponse> {
    const f = req.features || {};
    const riskLike = model.target.includes('risk') || model.target.includes('failure') || model.target.includes('flood');
    let score = 0;
    const reasons: string[] = [];
    const n = (k: string) => { const v = f[k]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
    if (n('dewater.max_sump_fill_ratio') >= 0.85) { score += 0.35; reasons.push('high sump fill'); }
    if (n('power.margin_kw') < 0) { score += 0.25; reasons.push('negative power margin'); }
    if (n('dewater.pumps_unavailable') > 0) { score += 0.15; reasons.push('unavailable pumps'); }
    if (n('maintenance.pump_concerns') > 0) { score += 0.1; reasons.push('pump concerns'); }
    if (n('safety.critical_flood_flags') > 0) { score += 0.2; reasons.push('flood flags'); }
    if (!riskLike) score = 1 - Math.min(1, score);
    score = Math.max(0, Math.min(1, score));
    return {
      requestId: req.requestId,
      modelId: model.id,
      modelVersion: model.version,
      prediction: { score, label: score >= 0.6 ? 'elevated' : 'normal', reasons },
      confidence: 0.45,
      explanation: { method: 'baseline-rules', reasons, featuresUsed: Object.keys(f) },
      drift: {},
      provenance: { adapter: 'baseline-rules', deterministic: true, trained: false },
      atMs: Date.now(),
      advisory: true,
    };
  }
}

export class RegistryInferenceRuntime implements InferenceRuntime {
  constructor(private registry: ModelRegistry, private adapters: ModelAdapter[] = [new BaselineRuleAdapter()]) {}

  async predict(req: InferenceRequest): Promise<InferenceResponse> {
    const model = await this.registry.get(req.modelId, req.modelVersion);
    if (!model) {
      return {
        requestId: req.requestId, modelId: req.modelId, modelVersion: req.modelVersion || 'unknown',
        prediction: null, confidence: 0, explanation: { error: 'model-not-found' }, drift: {},
        provenance: { error: 'model-not-found' }, atMs: Date.now(), advisory: true,
      };
    }
    const adapter = this.adapters.find(a => a.supports(model));
    if (!adapter) {
      return {
        requestId: req.requestId, modelId: model.id, modelVersion: model.version,
        prediction: null, confidence: 0, explanation: { error: 'no-adapter', algorithm: model.algorithm }, drift: {},
        provenance: { error: 'no-adapter' }, atMs: Date.now(), advisory: true,
      };
    }
    const res = await adapter.predict(model, req);
    return { ...res, advisory: true, provenance: { ...res.provenance, modelStatus: model.status, limitations: model.limitations } };
  }
}
