# ML & Agent Implementation Status (Steps 1-3)

## Step 1 — Specialist agents (implemented)
Implemented deterministic, snapshot-driven specialist agents with structured evidence, findings, assumptions, uncertainties, recommendations, conflicts, and ML-hypothesis attachment points:
- `packages/agents/src/power.ts` — supply/demand, feeder condition, power-driven constraints (case-grounded: outages/feeder loss impact dewatering).
- `packages/agents/src/deepwater.ts` — sump levels/fill/net flow, time-to-critical/breaches, pump discharge/availability (grounded: inflow vs capacity, flooding risk).
- `packages/agents/src/production.ts` — zone operating ratios/constraints and dewatering-stress linkage (grounded: access/throughput loss).
- `packages/agents/src/engineering.ts` — network/power feasibility, pump/asset state issues, allocation sanity checks.
- `packages/agents/src/maintenance.ts` — condition/degradation/fault indicators, running-no-flow, telemetry health (grounded: proactive/condition-based maintenance signals).
- `packages/agents/src/safety.ts` — advisory flood/exposure/access and observability-loss flags with conservative recommendations.
- Shared: `types.ts`, `snapshot.ts` (resilient readers), `dispatch.ts`, manifests updated. Core-runtime activities wired to `runSpecialistAgent` with `mlPredictions` context hook.

**Design:** deterministic core over recorded snapshots; ML outputs treated as versioned/provenanced advisory hypotheses (never ground truth, no policy/safety bypass).

## Step 2 — ML platform scaffolding (implemented)
- `packages/contracts/src/ml.ts` — schemas/interfaces for data sources, feature/label specs, dataset manifests, model manifests, inference req/res, training jobs, evaluation reports, grounding documents.
- `packages/ml` — feature extraction (`features.ts`), model registry interface/in-memory impl (`registry.ts`), inference runtime + baseline rule adapter (`inference.ts`), evaluation helpers and unsupported-claim checks (`evaluation.ts`), training job templates/targets per agent (`training.ts`), case-study grounding objects and dataset manifest builder (`caseStudies.ts`), benchmark harness (`benchmark.ts`).
- Default training targets defined per agent (risk/forecast/anomaly/classification/regression) with suggested labels and horizons.

## Step 3 — Grounding & evaluation (implemented as bootstrap/scaffold)
- Internet deep-research synthesis documented with provenance: `docs/research/GROUNDING-CASE-STUDIES.md` (dewatering/flooding/power-loss/pump-maintenance case studies & reviews).
- Grounded scenario archetypes and extracted signals mapped to agents/features/labels.
- Seed grounded dataset: `packages/ml/data/grounded-scenarios.json` (archetype-labeled records for baseline evaluation).
- Baseline benchmark path in `packages/ml/src/benchmark.ts` (e.g. flood-risk baseline over seed records).

## Blockers / required to produce real trained models
Actual ML **training and weight artifacts** require:
1. **Data access:** site telemetry/historian exports, tag maps, incident/fault and maintenance/work-order records, outcomes (breaches, downtime, failures) with timestamps/quality.
2. **Labels & horizons:** agreed definitions per target (e.g. breach within 6h, failure within 14d) and site-calibrated thresholds.
3. **Training environment & stack:** compute (CPU/GPU as needed), approved runtime (e.g. Python + scikit-learn/PyTorch/XGBoost), artifact storage, and reproducible pipelines.
4. **Operational/safety bar confirmation:** read-only shadow vs production decision support; any control remains gated/simulated per policy.

## Confirmations 1–5 (implemented as defaults/scaffolding)
User directed: address **1–5 in order** with well-engineered, non-hallucinated implementation. Delivered as **configurable, evidence/provenance-driven scaffolding** (no site data, labels, or environment invented):

1. **ML approach:** **A+B+C+D** supported — calibration/grounding, RAG over approved docs (cited, untrusted), training/fine-tuning pipeline & exports, and governed feedback/rule learning (`config`, `calibration`, `rag`, `training`/`export`, `feedback`).
2. **Targets:** default per-agent targets/tasks/labels/horizons defined and configurable (`training.ts` `AGENT_TRAINING_TARGETS`, feature schema in `features.ts`, agent ML hooks).
3. **Data access:** snapshot/CSV/historian/incident/maintenance adapter interfaces & dataset builders/manifests with provenance; **real data/labels to be supplied** (`datasets.ts`, config adapter slots).
4. **Training env/stack:** stack/environment agnostic (local/on-prem/cloud, sklearn/pytorch/xgboost/external) with portable job export + Python skeletons, `autoTrain=false` (`config.ts`, `export.ts`).
5. **Operational scope:** default **`shadow_readonly`** (advisory, human validation + policy, deterministic authority, **no industrial writes/control**); progression only via governed gates (`config.ts`, agent/runtime constraints).

See `docs/research/CONFIRMATIONS-1-5-IMPLEMENTATION.md` for the detailed mapping and guardrails. Actual trained artifacts/evaluation on real data remain pending supplied datasets, labels/horizons, and a training runtime.
