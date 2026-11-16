# Gate A — Simulation Proof (Implementation Plan)

**Status:** in progress (architecture pivot). One repo, monorepo. **Temporal now** (pilot-aligned). **Stubbed/deterministic reviewer + model-provider interface from day one**. **OPA early (policy interface/gateway hook)**. TypeScript across stack. Shared engineering core remains authoritative for demonstration. **No industrial writes.**

## Decisions (confirmed)
- One repo (monorepo: `apps/*`, `packages/*`, `infra/`)
- Temporal for durable investigation lifecycle/orchestration
- Planner: deterministic/stubbed reviewer path + model-provider interface (local/cloud gateway) from day one
- OPA/policy evaluation integrated early (declarative authorization, app enforces)
- Gate A demo: backup alert → investigation → Power + relevant agents → evidence/conflict handling → scenario compare → approval → simulated execution → verified decision record (persisted/replayable)

## Target layout
- `apps/web` — presentation client (existing React UI, refactored to consume API/investigation state progressively)
- `apps/api` — site API (authn boundary, investigations/commands, idempotency, policy gateway enforcement, query surfaces)
- `apps/core-runtime` — Temporal workflows/activities/workers (Core deterministic orchestration), planner/reviewer activities, dispatch
- `packages/engineering-core` — deterministic simulation/domain/engineering services + snapshot/provenance (authoritative demo logic, stable)
- `packages/contracts` — task/evidence/report/investigation/snapshot/manifest/policy schemas (shared runtime schemas)
- `packages/agents` — 6 specialist manifests + typed tools/workers (Power end-to-end; others registered/scoped)
- `packages/adapters` — read-only adapter boundaries (sim/gateway/historian interfaces; OPC UA-ready boundary, no writes)
- `infra/` — local dev compose/config (Postgres, Temporal dev, optional OPA/NATS placeholders), migrations

## Gate A deliverables
1. Contracts & records: investigation/task/evidence/report, immutable snapshots, provenance, separation (telemetry truth / derivations / decisions / hypotheses), Postgres persistence.
2. Core deterministic runtime + planner boundary: lifecycle, budgets/rounds, dispatch/validation, conflict & rework, approval + revalidation, decision record; nondeterministic/external calls in recorded activities.
3. Six registered specialists with manifests/scoped tools over shared engineering services; **Power implemented**.
4. Scenario comparison (isolated), policy check hook, eligible approval, **simulated execution only**, outcome verification.
5. Web investigation/presentation flow consuming API state.
6. Traceability, idempotency basics, and defined failure outcomes for demo scenarios.

## Migration notes
- Preserve and reuse existing `src/simulation` and `src/domain` logic as `packages/engineering-core` (no core calculation rewrites).
- Keep existing web app functional during migration; progressively wire to API/Core. Use outbox/in-process where distributed infra not yet required (JetStream deferred unless needed).
- No industrial writes, no live site adapters required for Gate A.