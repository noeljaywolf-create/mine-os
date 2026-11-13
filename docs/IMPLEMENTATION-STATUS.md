# MINE OS Implementation Status (Pilot MVP)

## Completed (Steps 1 foundations)
- **Pluggable, device-agnostic integration (core unchanged):** gateway HTTP adapter, pilot CSV/replay bundle, canonical observation seam, Quick Connect/probe, saved connection profiles, mapping-driven configs.
- **Operating modes (both):** `test` (read-only external dispatch, safe for validation) and `operational` (audited control-intent dispatch to configured gateway endpoints). Persisted and UI-managed in Governance.
- **Alerts & health:** configurable rules/events (sensor value/freshness, sump level/fill), live/replay evaluation, ack/clear, connection & device health dashboard.
- **Persistence & evidence (MVP):** local browser persistence for session/auth, profiles, alert rules, last gateway, capped history; exportable history/evidence/report bundles.
- **Access & governance:** pilot sign-in/session, role-based capabilities, audit/activity trails, updated governance/readiness boundaries.
- **Expert engineering configurations & builds:** expert templates (`pilot-data/expert/*`), Engineering Configurations & Builds module, commissioning/QA/data-quality artifacts, build profiles (`dev/pilot/production-static/github-pages`).
- **Verification:** `npm run typecheck` passes, `npm run test` passes (100 tests), `npm run build` succeeds.

## Pilot readiness (Step 2) - requires site/gateway access
- Deploy/configure read-only gateway exposing `/health`, `/catalog`, `/samples/latest` (and optional `/control` in operational mode).
- Map site tags to canonical sensors/assets with units/scale/provenance; validate and backtest against historical/known events.
- Tune expert envelopes/alert setpoints; complete commissioning checklist and approvals.

## Production hardening targets (Step 3)
- Server-side durable storage (TSDB/historian + app DB), enterprise SSO/IAM, centralized immutable audit/retention, secrets management.
- Hardened OT/edge connectors, cyber/network controls, HA/multi-site tenancy, APIs.
- Site calibration, V&V, and safety case for any control path.

## Product evolution (Step 4)
- Deeper workflows (alarm management, SOP/runbooks, shift handover), CMMS/FMS/planning/BI integrations, and stronger calibration/explainability - all via config/adapters without core rewrites.

**Guardrail:** `src/simulation/*` and core domain calculation logic remain unchanged across sensors/sites/protocols/modes. All external differences belong in config, mappings, gateway/adapters, and workflow layers. Read-only/advisory posture unless explicitly enabled, approved, and validated in operational mode.