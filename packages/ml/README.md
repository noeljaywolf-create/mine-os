# `@mine-os/ml` — ML platform scaffolding (advisory, versioned, provenanced)

Supports the specialist-agent hybrid architecture: **deterministic engineering services remain authoritative**; ML outputs are **versioned, evidenced hypotheses** with confidence/provenance and never bypass policy, safety, or feasibility checks.

## Capabilities
- **Features:** `extractFeatures(snapshot)` + `COMMON_FEATURES` schema (deterministic, snapshot-derived).
- **Registry:** versioned model manifests (`ModelRegistry`, in-memory; pluggable to persistent store).
- **Inference:** `RegistryInferenceRuntime` + adapters (baseline rules; add trained-model adapters). Responses always `advisory: true`.
- **Training (C):** `TrainingJobSpec` templates/targets per agent, dataset manifests, stack-agnostic export (`exportTrainingJob`, `pythonSklearnSkeleton`) for external runtimes (local/on-prem/cloud).
- **Datasets (3):** build feature/label examples from snapshot logs, deterministic splits, CSV adapter helpers; manifests with provenance.
- **Evaluation:** metrics, baseline comparison, unsupported-claim checks, grounded benchmark harness (`runBaselineBenchmark`).
- **Grounding/calibration (A):** calibration profiles/store, candidate proposals from approved feedback, backtest-before-activation flow.
- **RAG/approved knowledge (B):** document/chunk/lexical retrieval scaffold with citations; retrieved content is **UNTRUSTED** and must be verified against deterministic evidence. Approved-doc filter supported.
- **Feedback/rule learning (D):** feedback records, learning-signal summaries, governed `approvedForLearning` gating.
- **Config/safety (5):** `DEFAULT_CONFIG` = `shadow_readonly`, `mlAdvisoryOnly`, no industrial writes/control actions; `assertSafeDeployment`.

## Data & environment (no assumptions)
Data access, labels, and training environment are **site/user-provided**. Use adapters/mappings to ingest snapshot logs, historian/CSV exports, incidents, and maintenance records into `TabularExample`/dataset manifests, then run training externally and register versioned artifacts+metrics.

## Grounding
Case-study/internet synthesis with provenance: `docs/research/GROUNDING-CASE-STUDIES.md`, seed records `data/grounded-scenarios.json`, archetypes in `caseStudies.ts`.
