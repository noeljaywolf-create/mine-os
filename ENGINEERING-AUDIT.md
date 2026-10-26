# Phase 2 engineering forensic assessment

## Baseline examined

Source tree, domain/data contracts, all module route registrations, store actions and replay handling, numerical functions, telemetry adapters, chart inputs and test configuration. Generated `docs/`, `dist/` and dependencies are build artifacts, not engineering implementations. The app has 14 existing workspace modules and a public landing page. No authentication backend exists; personas are an explicit role demonstration.

## Findings

| Area | Functional baseline | Engineering gap / disposition |
|---|---|---|
| State | One Zustand store; scenario runs; immutable world transitions; seeded inflow; in-memory reset | Preserve. Branch construction resets to initial conditions rather than branching the current state. Nested override cloning is shallow. |
| Engine | `engine.ts`: create/derive/recompute/step; power → pumps → storage → production | Preserve orchestration. Fix instantaneous re-evaluation of sump flows after controls and effective assumption handling. |
| Hydraulics | `plant.ts`, `units.ts`: rated flow adjusted for lift, health, efficiency | Replace heuristic. No pipes, Reynolds number, system curve, operating-point convergence, parallel interaction or hydraulic power consistency. Efficiency incorrectly multiplies flow directly. |
| Water | `water.ts`: m³/h × seconds / 3600; rectangular V/A stage relation | Interior integration dimensionally valid. Clamping silently discards overflow and overstates dry-sump pumping. No transfer ledger. Evidence equation omits /3600. Rectangular geometry is a valid stated approximation, not a general stage-storage model. |
| Forecast | `forecast.ts`: deterministic independent single-sump projection; inflow envelope | Uses frozen discharge; no coupled transfers. Stale tags reduce a heuristic quality index but do not widen band despite UI claims. Seeded variation is synthetic, not a calibrated hydrological distribution. |
| Electrical | Feeders, downstream motors, status controls | Supply ratio uses static connected nameplate load; counts standby demand incorrectly; kVA × assumed PF is stated but demand allocation does not enforce motor/feeder limits. No source/backup switching. |
| Production | `production.ts`: geometric flood/access elevations; configured threshold restriction rules | Temporal storage effect works, but accumulates whole-step restriction at end-of-step. No buffer or deferred/permanent distinction; arbitrary restriction policy must be labelled as such. |
| Dependencies | Typed directed graph (`powered_by`, `pumps_from`, `drains_to`, `monitors`, `supports`, `feeds`) | Generic propagation assigns arbitrary 0.7 effectiveness and can contradict computed zone states. Preserve links; numerical models must govern physical consequences. |
| Telemetry | Freshness, offline nulls, source-unit contracts, synthetic readings from world | `lastValue` never populated. Trends reread truth instead of reported measurement. No frozen/scaled/delayed samples, contradiction diagnostic or measurement request workflow. Vibration/temperature are illustrative formulas, not calibrated diagnostics. |
| Incidents | Detection, correlation, lifecycle, append-only evidence/actions | Confidence numbers (0.35–0.85 etc.) are uncalibrated. Remove probability presentation. Random event IDs prevent exact incident replay. |
| Analytics | Computed charts, sensitivity via projections, exposure arithmetic | Current power × elapsed time is not integrated energy. “Mass balance closure” only checks bounds. MTBF/annual downtime/availability are uncalibrated heuristics, not engineering estimates. |
| Replay | Recorded worlds and incidents; scenario scrubber | Some components derive from live world/current overrides, contradicting the scrubbed frame. Replay needs historical overrides and direct historical runtime readers. |
| UI | Working pump, feeder, inflow, assumption, branching, clock, decision and incident actions | Filter/tags/dialog buttons intentionally affect presentation. No evidence of a separate numerical store. Preserve them. DeepWater text hardcodes an incorrect step interval and calls synthetic inflow sensor-derived. |
| Verification | TS strict build; Vitest/Playwright dependencies/configs; ad-hoc browser smoke | No committed numerical tests; Vitest references missing setup file. No field validation, calibration or certified engineering capability. |

## Preserved capabilities

All existing routes, landing page, shell, role/capability interfaces, asset selection, scenario library, incident lifecycle, decision/comments ledger, exports, ECharts/ReactFlow components and visual tokens. Keep physical logic outside React. All new projections call the canonical step function on isolated snapshots.

## Upgrade sequence

1. Testable bounded hydraulic solver, explicit synthetic pipe/train assumptions and dimensional power calculation.
2. Conservative multi-node storage integration, actual pumping limits, transfer/overflow ledger, effective stage-storage and integrated energy.
3. Capacity-constrained electrical allocation; delayed conditional production and buffer accounting.
4. Shared engineering controls/twins, calculation traces, recovery/stress/investment comparisons, evidence-quality workbench and deterministic challenges.
5. Analytical and integration fixtures, browser interaction checks, validation-status dashboard and verification report.

Software tests establish implementation consistency only. They do not establish agreement with field measurements, safe operating envelopes, hydrogeological adequacy, protection coordination or approved mine operating procedures.
