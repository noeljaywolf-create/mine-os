# No-ML Operating Approach (Steps 1–6) — Deterministic, Knowledge-Grounded, Shadow-Validated

**Goal:** maximize core intelligence **without ML training/data** using deterministic simulation + specialist agents, calibration, approved knowledge (RAG), feedback/rules, quality inputs, and shadow measurement.  
**ML plug remains open:** feature extraction, targets, registry/inference, RAG/calibration/feedback stores, training/export and dataset builders are implemented so trained, validated models can be registered and used as **advisory** layers later (`packages/ml/*`, agent `mlPredictions` hooks).

## 1) Strengthen deterministic brain
- **Authoritative core:** `src/simulation/*`, `src/domain/*` (water/power/production/propagation/incidents logic) + 6 specialist agents with evidence, confidence, assumptions/uncertainties, recommendations, conflicts (`packages/agents/src/*`).
- **Calibration-tunable thresholds:** agents resolve thresholds from `context.calibrationProfile` (defaults in `packages/agents/src/thresholds.ts`); tune per site without code changes.
- **Cross-signal checks:** e.g. running-unpowered/no-flow, demand>supply, net inflow with ~0 discharge, low health/capacity conflicts, telemetry/observability gaps surfaced as conflicts/uncertainties.
- **Scenario coverage:** grounded archetypes (power-loss dewatering, pump degradation/no-flow, inflow surge, instrumentation loss, compound cascade) — `packages/ml/src/scenarios.ts` (`DEFAULT_SCENARIOS`), `docs/research/GROUNDING-CASE-STUDIES.md`.

## 2) Calibrate and tune from expertise (A)
- **Profiles:** versioned `CalibrationProfile` (thresholds/params, draft→candidate→validated→active) — `packages/contracts/src/feedback.ts`, `packages/ml/src/calibration.ts`, defaults `packages/ml/data/calibration/default-profiles.json`.
- **Workflow:** propose from approved feedback (`proposeCalibrationFromFeedback`) → **backtest/validate on known scenarios/events** → activate. Never activate unvalidated changes.
- **Assumptions:** keep scenario/assumption sensitivity explicit in reports.

## 3) Ground in approved knowledge (B)
- **Corpus:** approved, versioned manuals/SOPs/P&IDs/limits/procedures/incident learnings (`packages/contracts/src/knowledge.ts`, `packages/ml/src/rag.ts`, `packages/ml/data/knowledge/`).
- **Retrieval:** cited excerpts via `Retriever` (lexical baseline; pluggable vector/hybrid). **UNTRUSTED** — verify against deterministic evidence/measurements/policy; do not use as authorization or ground truth.
- **Prefer encoding:** clear limits/playbooks become deterministic rules/calibration; RAG supplies supporting context. Seed: `packages/ml/src/knowledgeSeed.ts`.

## 4) Learn from people via feedback/rules (D)
- **Feedback:** structured `FeedbackRecord` (correct/incorrect, false pos/neg, threshold/label/rule suggestion, playbook outcome) with `approvedForLearning` governance (`packages/contracts/src/feedback.ts`, `packages/ml/src/feedback.ts`).
- **Rules/playbooks:** deterministic, approved, versioned rules evaluated on feature vectors (`packages/ml/src/rules.ts`, `DEFAULT_RULES`, `evaluateRules`); candidate rules from approved feedback require review/approval before enablement.
- **Expert queue:** prioritize conflict/uncertainty cases for review; promote vetted outcomes into calibration/rules with audit trail.

## 5) Improve observability and data quality
- **Snapshot quality:** `assessSnapshotQuality` scores/issues (missing domains, stale sensors, range sanity) — `packages/ml/src/snapshotQuality.ts`; agents also surface missing/stale signals as uncertainties.
- **Standardized records:** snapshot/feature extraction (`packages/ml/src/features.ts`), dataset builders/adapters & manifests (`packages/ml/src/datasets.ts`), consistent incident/maintenance/feedback capture to enable future labeling.

## 6) Operate and measure (shadow, read-only)
- **Mode:** `shadow_readonly` (advisory-only, human validation + policy, no industrial writes/control) — `packages/ml/src/config.ts` (`DEFAULT_CONFIG`).
- **Regression:** run `DEFAULT_SCENARIOS` / library on changes (`packages/ml/src/scenarios.ts`, `checkScenarioResult`, `packages/ml/data/scenarios/regression-library.json`).
- **Metrics:** record recommendation outcomes and compute ops metrics (known-outcome precision proxy, conflict/flag rates) — `packages/ml/src/ops.ts` (`computeOpsMetrics`, `shadowRunSummary`). Measure usefulness, false alarms/misses vs known events, and explanation quality.

## ML plug (open, when data arrives)
- Provide data/labels+horizons → build datasets (`datasets.ts`) → train externally via exported jobs (`training.ts`, `export.ts`) → register versioned artifacts/metrics (`registry.ts`, contracts `ModelManifest`) → serve via `RegistryInferenceRuntime` (advisory) → backtest/benchmark/calibrate (`evaluation.ts`, `benchmark.ts`). No architecture change required; deterministic core remains authoritative. 
