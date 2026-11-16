# Grounding & Case-Study Research (Internet-Sourced)

**Status:** synthesized grounding inputs for specialist-agent features, labels, scenarios, and evaluation.  
**Retrieved:** 2026-11 (session web research). **Use:** contextual grounding and bootstrap data/scenario design; **not** a substitute for site-specific data, engineering validation, or operational authorization.

> ML outputs in Mine OS are **versioned, provenanced, advisory hypotheses**. Deterministic engineering services, measurements, policy, and competent human review remain authoritative for decisions and safety.

## Sources (provenance)

| ID | Title | Type | URL | Key relevance |
|---|---|---|---|---|
| S1 | Assessing Mining-Related Water Impacts: A Case Study-Based Systematic Review | case study / review | https://www.mdpi.com/2071-1050/18/4/1774 | Dewatering dependence, pump cessation/failure -> flooding/rise/overflow, uncontrolled discharge events (e.g. Wheal Jane decant context), long-term rewatering risks, production/environment/safety impacts |
| S2 | Proactive Maintenance of Pump Systems Operating in the Mining Industry—A Systematic Review (PMC12031373) | systematic review | https://pmc.ncbi.nlm.nih.gov/articles/PMC12031373/ | Pump failure modes, condition indicators (vibration/temp/pressure/flow/power), predictive/condition-based maintenance, dewatering criticality, downtime/safety/cost impact |
| S3 | Industry dewatering practice synthesis (Seepex, Pumps & Systems, etc.) | synthesis | seepex.com; pumpsandsystems.com | Inflow/head/pipe/solids factors, duty-standby and power/backup importance, inflow>capacity -> flooding/delay |

## Extracted grounding signals

### DeepWater / dewatering
- **Risk drivers:** sustained inflow exceeding discharge, pump unavailability/degradation, power loss, inadequate capacity/head/line condition. (S1,S3)
- **Indicators/labels:** sump level/fill, net inflow (Qin-Qout), time-to-threshold, threshold breach/overflow, discharge deficit, pump availability/running-no-flow. (S1,S3)
- **Outcomes:** water accumulation, access restriction, uncontrolled overflow/flooding, environmental/safety impact. (S1)

### Power
- **Risk drivers:** feeder/generator failure or unavailability, insufficient backup/switching, demand exceeding supply. (S1,S3)
- **Indicators/labels:** supply margin, unavailable feeders, load shedding, loss of critical dewatering load. (S3)
- **Outcomes:** loss of pumping capacity cascading to sump rise and production/safety impact. (S1,S3)

### Production
- **Risk drivers:** flooding/water-induced access loss, power/pump outages, constrained dewatering. (S1,S3)
- **Indicators/labels:** zone operating ratio, restricted/exposed zones, constrained-by (sump/power), deferred throughput indicators. (simulation/domain + S1)
- **Outcomes:** delays, restricted access, throughput/tonnage loss. (S1,S3)

### Engineering
- **Risk drivers:** infeasible demand/capacity, failed supply paths, inoperable/blocked equipment, hydraulic/network constraints. (S2,S3)
- **Indicators/labels:** demand vs supply, allocated budget, pump duty/flow/power sanity, asset failed/blocked states. (simulation/domain)
- **Outcomes:** inability to meet dewatering/production requirements; need for restoration or reconfiguration. (S2,S3)

### Maintenance
- **Risk drivers:** wear, blockage, cavitation, misalignment, corrosion/abrasion, inefficiency, delayed intervention. (S2)
- **Indicators/labels:** condition/health, flow/head/power deviation, running-without-flow, efficiency loss, vibration/temp anomalies (when available), telemetry loss. (S2)
- **Outcomes:** unplanned downtime, reduced capacity, secondary flooding/production impacts. (S1,S2)

### Safety
- **Risk drivers:** critical water levels/rapid rise, loss of dewatering/monitoring, restricted/exposed areas. (S1)
- **Indicators/labels:** breach severity, time-to-critical, access restriction flags, observability loss. (S1, simulation/domain)
- **Outcomes:** flooding/exposure hazard requiring conservative restrictions and escalation per procedure. (S1)

## Grounded scenario archetypes (for dataset generation & evaluation)

1. **Power-loss dewatering:** feeder/generation loss -> reduced discharge -> sump rise -> production/safety escalation.
2. **Pump degradation/failure:** condition loss/blockage -> low/no effective flow while running -> net inflow positive.
3. **Inflow surge:** ingress/rainfall-like increase -> capacity exceeded -> threshold/time-to-critical risk.
4. **Instrumentation loss:** stale/expired telemetry -> reduced confidence/observability (not proof of process safety).
5. **Compound cascade:** multi-domain faults (power + pumps + inflow) producing conflicts and critical risk.

## ML task/label suggestions (by agent)

- **Power:** `power_constraint_risk`, `backup_sufficiency` (classification/risk) — labels: constraint/load-shed/feeder-trip, backup adequate.
- **DeepWater:** `sump_overflow_risk`, `inflow_forecast`, `pump_effectiveness` (risk/forecast/regression) — labels: breach/overflow, time-to-critical bucket, future level/net, delivered flow.
- **Production:** `throughput_loss_risk` (risk) — labels: zone restricted, deferred tonnes.
- **Engineering:** `feasibility_violation` (classification) — labels: infeasible, constraint type.
- **Maintenance:** `pump_failure_risk`, `anomaly_score` (risk/anomaly) — labels: failure/degradation/RUL bucket, anomalous behavior.
- **Safety:** `hazard_escalation_risk` (advisory risk) — labels: escalation/restriction triggered.

## Data & evaluation implications

- **Bootstrap:** generate synthetic-but-grounded records via deterministic simulation scenarios mapped to archetypes; encode case-study patterns as labeled exemplars; backtest against baselines.
- **Calibration/validation:** requires site historian/telemetry, incident & maintenance records, and agreed label definitions/time horizons; perform split/backtest, calibration, and unsupported-claim checks.
- **Guardrails:** keep predictions advisory with confidence, model/version provenance, and explicit limitations; never bypass policy/safety/feasibility gates.

## Gaps / next data needs
- Site-specific tag maps, geometry/capacities, historical time series, labeled events (trips, overflows, failures, restrictions), maintenance/work-order outcomes.
- Agreed operational thresholds and risk horizons per site.
- Training environment and approved stack for producing versioned model artifacts.
