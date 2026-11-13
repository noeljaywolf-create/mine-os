# Production Hardening (Step 3) & Product Evolution (Step 4)

Core principle: **no changes to `src/simulation/*` core calculation logic**. Differences handled via config, mappings, gateway/adapters, and service layers.

## Step 3 — Production hardening (enterprise)

### Architecture targets
- **Durable storage:** server-side TSDB/historian for telemetry & history; relational/document DB for sites, configs, mappings, profiles, alert rules/events, incidents, decisions, control intents, audit. Backups, retention, and export APIs.
- **Identity & security:** enterprise SSO/IAM (OIDC/SAML), fine-grained RBAC/ABAC, centralized immutable audit, secrets/credential vault (gateway tokens/certs), TLS/CSP, secure headers, network segmentation, cyber review.
- **OT/edge & connectivity:** hardened edge gateway deployment, certified connectors (OPC UA, Modbus TCP/RTU, MQTT, historians, vendor APIs), buffering/retry, store-and-forward, time sync, read-only by default with guarded write paths.
- **Deployment & ops:** HA/multi-site tenancy, environment separation (dev/test/pilot/prod), CI/CD, IaC, observability (logs/metrics/traces), change management.
- **Model trust:** site calibration (curves, geometry, losses), V&V, backtesting pipelines, uncertainty quantification, and safety case for any operational control path.

### Foundation implemented in MVP (to extend)
- Pluggable adapter/registry and canonical contracts (`TelemetrySample`, observations, gateway HTTP contract, control-intent dispatch).
- Dual operating modes (test/operational) with audited intents.
- Config-driven expert profiles, mappings, provenance, and validation posture.
- Local persistence helpers (`src/integration/persistence.ts`) and export bundles as migration-friendly artifacts.

## Step 4 — Product evolution (all-in-one depth)

### Workflows & operations
- Alarm management aligned to ISA-18.2 (rationalization, shelving, escalation, KPIs), SOP/runbooks linked to alerts/incidents, shift handover, operator rounds.
- Condition-based maintenance triggers → CMMS/EAM work orders (integration), spares/criticality context.

### Cross-domain integrations (without core rewrites)
- **FMS/dispatch:** ingest fleet states/cycles to refine production availability/impact and bottleneck attribution.
- **Planning/scheduling/geology:** import plans/block/schedule targets for plan-vs-actual and scenario alignment.
- **BI/historian:** standardized APIs/exports, connectors to enterprise historians and BI tools.
- **Energy management:** tariff structures, demand response, generator/fuel optimization using measured inputs and configured economics.

### Trust & explainability
- Calibration workbench, confidence/uncertainty visualization, explainable “why” for alerts/forecasts/impacts, automated backtest/regression on new data.
- Mobile/field views and notification channels (email/SMS/push) via external services.

## Implementation rule
All new sensors, sites, protocols, and deployments integrate through **configuration + gateway/adapters + service interfaces**. The core deterministic calculation engine remains stable and verifiable.