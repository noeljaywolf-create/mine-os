# No-ML Implementation Status (Steps 1–6 complete as scaffold + deterministic system)

Implemented per user direction: **steps 1–6 in order**, with the **ML plug kept open** (no trained models required/claimed).

## Delivered
1. **Deterministic brain:** 6 specialist agents with calibration-tunable thresholds (`packages/agents/src/thresholds.ts`), cross-signal checks/conflicts/uncertainties, grounded evidence; deterministic sim/domain core unchanged (`src/simulation`, `src/domain`).
2. **Calibration (A):** versioned profiles/store, `resolveActiveCalibration`, candidate proposals from approved feedback, default profile data (`packages/ml/src/calibration.ts`, `packages/ml/data/calibration/default-profiles.json`).
3. **Knowledge/RAG (B):** approved docs/chunks/retrieval with citations and **untrusted** handling, seed corpus loader (`packages/ml/src/rag.ts`, `knowledgeSeed.ts`, `packages/ml/data/knowledge/`), agents can attach cited hits from context.
4. **Feedback/rules (D):** feedback records/store/signals, deterministic approved playbook rules + evaluation and feedback-derived candidates (`packages/ml/src/feedback.ts`, `rules.ts`).
5. **Observability/data quality:** snapshot quality assessment (`packages/ml/src/snapshotQuality.ts`), deterministic feature extraction and dataset/adapter helpers (`features.ts`, `datasets.ts`).
6. **Shadow ops/measurement:** regression scenario library + checks (`packages/ml/src/scenarios.ts`, `packages/ml/data/scenarios/`), ops metrics and shadow summaries (`packages/ml/src/ops.ts`), ops guide `docs/operations/NO-ML-APPROACH-1-6.md`.

## ML plug (open)
Contracts/registry/inference (advisory, baseline fallback), training targets/job specs, dataset manifests/builders, external training export, evaluation/benchmark — `packages/contracts/src/ml.ts`, `packages/ml/src/{registry,inference,training,export,evaluation,benchmark,features,datasets}.ts`. Agents accept `mlPredictions` and record as provenanced hypotheses.

## Notes
- No site data or ML artifacts invented. Site calibration, approved corpus, and real backtests/outcomes depend on user-provided inputs. Mode remains `shadow_readonly`, advisory-only, no industrial writes/control.
