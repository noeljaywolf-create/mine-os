import type { DatasetManifest, TrainingJobSpec, ModelManifest } from '@mine-os/contracts';

/** Stack/environment-agnostic exports for external training runtimes (Approach C). */
export function exportTrainingJob(job: TrainingJobSpec, dataset?: DatasetManifest) {
  return {
    kind: 'mine-os-training-job',
    version: '0.1.0',
    job,
    dataset,
    contract: {
      inputs: 'feature table/jsonl matching dataset.features (or extracted via packages/ml features.extractFeatures)',
      outputs: 'model artifact + metrics + model manifest (packages/contracts ModelManifest)',
      constraints: ['record provenance and dataset versions', 'produce calibration/metrics and baseline comparison', 'mark outputs advisory-only in deployment'],
    },
  };
}

export function pythonSklearnSkeleton(job: TrainingJobSpec): string {
  return `# Mine OS external training skeleton (scikit-learn) — generated/exported spec
# Job: ${job.id}  model=${job.modelId}  target=${job.target}  task=${job.taskType}
# NOTE: Fill data loading, feature/label mapping, and artifact registration per your environment.
import json
from pathlib import Path

def main():
    spec = json.loads(r'''${JSON.stringify(job)}''')
    # 1) Load dataset(s): spec['datasetIds'] (JSONL/CSV/Parquet) with features + label '${job.target}'
    # 2) Split train/val/test with seed=${job.seed ?? 42}
    # 3) Train algorithm='${job.algorithm}' with hyperparameters=spec['hyperparameters']
    # 4) Evaluate (metrics + baseline + calibration) and emit ModelManifest + EvaluationReport JSON
    # 5) Persist artifact and register in model registry (versioned, provenanced)
    print('spec-loaded', spec['id'])

if __name__ == '__main__':
    main()
`;
}

export function draftModelManifest(args: Partial<ModelManifest> & Pick<ModelManifest,'id'|'name'|'version'|'taskType'|'target'>): ModelManifest {
  return {
    id: args.id, name: args.name, version: args.version, agentId: args.agentId,
    taskType: args.taskType, target: args.target, description: args.description,
    featureSchema: args.featureSchema ?? [], labelSchema: args.labelSchema ?? [],
    trainingDatasetIds: args.trainingDatasetIds ?? [], algorithm: args.algorithm,
    hyperparameters: args.hyperparameters ?? {}, metrics: args.metrics ?? {}, calibration: args.calibration ?? {},
    limitations: args.limitations ?? ['Advisory only; not ground truth; requires validation and policy/safety gates.'],
    provenance: args.provenance ?? {}, createdAtMs: args.createdAtMs ?? Date.now(),
    artifactUri: args.artifactUri, status: args.status ?? 'draft',
  };
}
