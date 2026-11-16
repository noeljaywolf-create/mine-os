# Confirmations 1–5: Implemented Defaults, Scaffolding, and Guardrails

This document records how confirmations **1–5** were addressed in code/docs **without hallucinating site data, labels, or training environment specifics**. All ML/agent behavior remains **advisory, versioned/provenanced, and governed**; deterministic engineering services, measurements, policy, and competent human validation remain authoritative.

## 1) ML approach (A + B + C + D) — combined, configurable
| Approach | Implemented support | Location |
|---|---|---|
| **A. Grounding/calibration** | Calibration profiles (thresholds/params, versioned, status lifecycle), candidate proposals from approved feedback, backtest-before-activation expectation; deterministic feature extraction and case-study grounding | `packages/ml/src/calibration.ts`, `features.ts`, `caseStudies.ts`, `docs/research/GROUNDING-CASE-STUDIES.md` |
| **B. Knowledge/RAG** | Approved knowledge docs/chunks, retrieval interface + lexical baseline, **citations**, `requireApproved`, retrieved content marked **UNTRUSTED** (never ground truth / no safety-policy bypass) | `packages/contracts/src/knowledge.ts`, `packages/ml/src/rag.ts` |
| **C. ML training/fine-tuning** | Training job specs/targets per agent, dataset manifests/builders, model manifests/registry, inference runtime+adapters, stack-agnostic export and Python skeletons for external training; artifact registration path | `packages/ml/src/training.ts`, `datasets.ts`, `registry.ts`, `inference.ts`, `export.ts`, `packages/contracts/src/ml.ts` |
| **D. Rule/playbook learning** | Feedback records/kinds, governed `approvedForLearning`, learning-signal summaries, calibration/rule-suggestion flow | `packages/contracts/src/feedback.ts`, `packages/ml/src/feedback.ts`, `calibration.ts` |

## 2) Prediction targets per agent — defaults defined, configurable
Default targets/horizons/labels are encoded and **must be refined per site/data availability**:

| Agent | Default targets | Task types (examples) |
|---|---|---|
| Power | `power_constraint_risk`, `backup_sufficiency` | risk scoring / classification |
| DeepWater | `sump_overflow_risk`, `inflow_forecast`, `pump_effectiveness` | risk / forecast / regression |
| Production | `throughput_loss_risk` | risk scoring |
| Engineering | `feasibility_violation` | classification |
| Maintenance | `pump_failure_risk`, `anomaly_score` | risk / anomaly detection |
| Safety (advisory) | `hazard_escalation_risk` | risk scoring |

Source: `packages/ml/src/training.ts` (`AGENT_TRAINING_TARGETS`, `defaultJobsForAgents`). Features: `packages/ml/src/features.ts`. Agents attach ML hypotheses as advisory evidence (`packages/agents/src/types.ts`).

## 3) Data access — adapters/interfaces ready (data not assumed)
Implemented **interfaces/helpers**; no site data invented or required in-repo:
- Snapshot-log → feature/label examples: `buildExamplesFromSnapshots`, deterministic splits, dataset manifests (`packages/ml/src/datasets.ts`).
- CSV parsing/mapping helper: `parseSimpleCsv` (map columns to features/labels per source).
- Configured adapter slots: `snapshot-json`, `csv-timeseries`, `historian-export`, `incident-records`, `maintenance-records` (`packages/ml/src/config.ts`).
- Provenance via `DataSource`/dataset manifests and grounding docs.

**To train for real:** provide tag maps, historian/telemetry exports, incident & maintenance/work-order records, outcome labels with timestamps/quality and horizon definitions; run backtests/splits and register artifacts.

## 4) Training environment/stack — stack/environment agnostic
- Config: `training.stack` (`python-sklearn` | `python-pytorch` | `python-xgboost` | `external`), `training.environment` (`local` | `onprem` | `cloud`), optional runtime/artifact endpoints, `autoTrain=false` by default (`packages/ml/src/config.ts`).
- External execution: `exportTrainingJob` + `pythonSklearnSkeleton` produce portable specs/skeletons; artifacts/metrics return as versioned `ModelManifest`/`EvaluationReport` for registry/inference.
- No in-repo assumption of GPU/cloud availability; on-prem/offline compatible by design.

## 5) Operational/safety scope — “no longer a demo” as shadow/validated decision support
- **Default deployment:** `mode=shadow_readonly`, `allowIndustrialWrites=false`, `allowControlActions=false`, `requirePolicyApproval=true`, `requireHumanValidation=true`, `mlAdvisoryOnly=true`, `deterministicAuthority=true` (`DEFAULT_CONFIG`, `assertSafeDeployment`).
- **Runtime behavior:** specialist outputs are advisory with evidence/confidence/conflicts/uncertainties; ML predictions recorded as hypotheses with provenance; workflow constraints include `advisory-only`, `no-industrial-writes`, `deterministic-snapshot-analysis`.
- **Progression path:** `shadow_readonly` → `decision_support` (governed approvals, validated recommendations) → `operational_gated` only with policy/human gates; **live control/industrial writes require separate safety/commissioning scope** (not enabled).

## Engineering guardrails (non-negotiable)
- ML is **not** ground truth; always versioned, provenanced, confidence-scored, and benchmarked/calibrated.
- Deterministic physics/feasibility, measurements, and policy/safety gates are authoritative.
- RAG content is **untrusted** and must be cited and verified.
- No hallucinated labels, site conditions, or training results; unsupported claims checked/flagged.

## Next concrete increments (when data/env are provided)
1. Ingest real snapshot/historian/incident/maintenance data via adapters → build labeled datasets & manifests.
2. Run backtests/baselines, train externally per exported jobs, register validated artifacts, and record inference/evaluations.
3. Add persistent (Postgres/object-store) registry, dataset/experiment, feedback, and calibration storage wired to API/Core.
4. Ingest approved manuals/SOPs/P&IDs/incidents into RAG index with access controls and citations in investigations.
5. Calibrate thresholds per site/agent/target from validated feedback and measured outcomes (A/D) under shadow validation.
