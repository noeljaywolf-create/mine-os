# MINE OS Phase 2 — engineering verification report

**Model identifier:** `MINE-ENG-2.0`

**Delivery:** runnable local engineering-demonstration increment, extending the existing application.

**Status:** software-verified within the explicitly simplified model below. No field validation, engineering certification or enterprise-readiness claim.

## 1. Architecture and preserved system

The canonical state remains `src/store/mineStore.ts`, with scenario-specific `WorldState` objects. `src/simulation/engine.ts` remains the only time-transition kernel. Forecasts, recovery comparisons, stress cases and investment studies call that kernel on isolated snapshots through `projection.ts`; they do not maintain another physical engine or asset store. Numerical caches contain cloned pure solutions, not mutable scenario state.

The original 14 modules, public website, navigation/shell, role simulator, incident workflow, decision/comments ledger, exports and shared selection are retained. Engineering Lab adds `/app/engineering` with seven operating views. Existing DeepWater, Digital Twin, Energy, Mine Impact, Asset Inspector, Telemetry and Scenario Lab expose or link the new capabilities.

Key boundaries:

| Responsibility | Implementation |
|---|---|
| Domain and result contracts | `src/domain/engineering.ts`, `src/domain/types.ts` |
| Friction, system/pump curves, root finding, power | `src/simulation/hydraulics.ts` |
| Electrical allocation and station dispatch | `src/simulation/plant.ts` |
| Stage/storage conversion and conservative transfers | `src/simulation/water.ts`, `waterNetwork.ts` |
| Capacitated primary/alternate ore routes, shared hoist, finite ore inventory | `src/simulation/materialHandling.ts` |
| Ordered state transitions, events, energy and production accounting | `src/simulation/engine.ts` |
| Forecast and isolated scenario evaluation | `projection.ts`, `forecast.ts`, `engineeringStudies.ts` |
| Reported measurements and evidence residuals | `sensors.ts`, `investigation.ts` |
| Independent inspection evidence and concurrent-fault counterfactuals | `diagnostics.ts` |
| Sustained achieved operational recovery | `recovery.ts` |
| Analysis-specific proof factories and runtime coverage inventory | `analysisEvidence.ts`, `proofCoverage.ts` |
| Calculation provenance and validation register | `engineeringEvidence.ts`, `dependencyModel.ts`, `validation.ts` |
| Presentation only | Engineering Lab, Hydraulic Analyser, Engineering Twins and Engineering Basis components |

Branches inherit the current physical snapshot and isolate nested inputs. Replay frames retain historical inputs and states. Display readers use historical worlds, incidents and time-filtered telemetry; selecting an asset no longer silently exits replay. Mutating engineering actions are refused during replay.

## 2. Engineering foundations

### Hydraulics

- Flow is converted from m³/h to m³/s before velocity or hydraulic-power calculation.
- `Hsystem = Hstatic + p/(ρg) + f(L/D)v²/(2g) + K v²/(2g)` and `v = Q/A`.
- Darcy friction factor is `64/Re` below Re 2300 and Haaland at/above Re 4000. A final transitional operating point is rejected. A temporary transition approximation is used only to bracket/search the curve.
- Synthetic quadratic pump characteristics pass through rated duty: `H = 1.25 Hr n² condition − 0.25 Hr [Q/(Qr curveScale)]²`.
- Parallel flows and series heads are combined against the shared main. Series operation requires all installed train units; an unavailable unit is not silently bypassed.
- Bisection has a bounded search, an 80-iteration limit and an absolute flow-width tolerance of 1e-7 m³/h. Unbracketed/non-converged/invalid/no-head results are explicit states, not successful operating points.
- Hydraulic power uses density 998.2 kg/m³ and gravity 9.80665 m/s². Wire-to-water efficiency is a declared synthetic characteristic. Common VSD speed limiting enforces individual motor allocations.
- Suction storage level and, for explicit transfers, receiving storage level affect static lift.

### Water conservation

Stage is obtained by inverting monotone piecewise-linear stage/storage coordinates. Rectangular `h = V/A` remains an explicit fallback. Each transfer is debited once from the source and credited once to the receiver. Receiver inflow is not re-pumped within that integration interval.

`Residual = initial storage + external inflow − external discharge − overflow − final storage`.

Both the last-step ledger and cumulative totals are retained. Withdrawal is limited by available water; overflow is accounted separately. Actual last-interval flow/energy is distinguished from instantaneous wet-running curve capability. Hypothetical dry-sump on/off regulation is assumed; off-cycle/idle motor demand is not modelled. Storage reductions that would silently displace existing water are rejected.

### Power and production

Electrical allocation uses a 2000 kW utility budget, configurable backup source, feeder kVA × assumed 0.9 PF, explicit path availability and deterministic critical-motor-first allocation. Services follow motor reservations. A backup source does not bypass a damaged feeder unless an independent path and switching prerequisite are explicitly enabled. Scheduled repair does not re-energise maintenance/isolated feeders.

Water-induced zone restrictions follow configured stage thresholds, not an instantaneous feeder-to-production stop. Production uses left-endpoint time accounting, a configurable daily shift, a stateful restart ramp and an initial 560 t ore buffer with a default 1120 t receiving limit. A bounded Edmonds–Karp maximum-flow calculation allocates ore through available primary/alternative routes and a common 1200 t/h hoist limit. Finite receiving inventory back-pressures transport when processing is unavailable; ore is held at face instead of disappearing or overflowing an unlimited stockpile. Processing also requires its modelled electrical service allocation. Foregone zone tonnes, deferred processing and value exposure are separated from confirmed permanent loss; the latter is **not determined** by this model.

## 3. Interactive demonstrations delivered

- Pump selection, speed, condition, efficiency, suction loss, pipe diameter/length, valve opening, backpressure, series/parallel arrangement and controlled transfer routing.
- Electrical disruption → lost pump allocation → calculated hydraulic duty → storage evolution → threshold/access consequences → incident and evidence.
- Recovery alternatives A–E: scheduled repair, backup evaluation, existing standby, production curtailment and delayed intervention, with prerequisites and rejected constraints retained.
- Six-hour matched-horizon comparisons, an engineer-defined repair delay, ±20% inflow sensitivity and bounded exhaustive standby-duty search. The search enumerates at most three eligible standby units; it is not a general optimal-control solver.
- Five combined stress presets, frozen/delayed/scaled/missing/contradictory observations, equipment-status feedback disagreement and requested independent synthetic inspections.
- Investment studies for additional P-204, storage, electrical redundancy, discharge diameter, independent level verification and backup power, including capital sensitivity assumptions.
- Five deterministic challenge briefs and three substantive difficulties: guided investigation, independent diagnosis and concurrent impairment. Unique inspection budgets, cited primary/secondary claims, a unit-bearing calculation, a tested alternative and an appropriate verification proposal determine the rubric. Merely requesting measurements and choosing the correct cause cannot earn full credit. Difficulty changes invalidate the attempt.
- Diagnostic evidence has retained timestamps/configuration signatures. Stale observations are explicitly unusable until refreshed. Nine competing constraint hypotheses use independent inspections and six same-solver restoration comparisons; multiple constraints and masked repairs remain visible instead of being collapsed into a confident root cause.
- Recovery ranking uses achieved performance: at least 95% zone/plant throughput, storage below warning and non-growing over a 15-minute window, with sample gaps no greater than five minutes. Unconfirmed recovery is censored at the study horizon, and configured repair delay is not the ranking metric.
- Sectional, electrical, hydraulic and ore-movement twins sharing asset selection and replay. Dedicated lanes, wrapped labels, reserved connector channels, zoom/reset/fit controls and a bounded scroll canvas keep equipment readable. Storage bars represent computed inventory; flow animation is conditional on numerical discharge and respects reduced-motion preferences.
- Engineering Basis panels with actual inputs, units, sources, equations, recorded solver status, sensitivity and validation limits. JSON engineering evidence export includes inputs, outcomes, proofs and model status.
- Executive briefing and engineering presentation use the same displayed world.

## 4. Verification evidence

### Automated numerical and state tests

**85 tests passing across four Vitest suites.**

`src/tests/engineering.test.ts` includes an analytically checkable 100 m³/h, 100 m head fixture with zero pipe losses, SI power conversion, laminar factor 64/Re, turbulent/transition handling, series/parallel consistency, resistance response, speed affinity, invalid and non-converged cases, stage/storage inversion, overflow, dry withdrawal, explicit transfer conservation, scenario isolation and deterministic replay.

`src/tests/crossSystem.test.ts` verifies:

- Individual motor and source/feeder budgets, including independent backup with the utility still available.
- Maintenance isolation and no silent bypass of an unavailable series unit.
- Energy and tariff integration over time.
- Planned-shift handling and deterministic recovery ramp timing.
- No immediate water-induced production shortfall on feeder failure; delayed constraints and buffer drawdown.
- Conservation under each of the five combined stress cases; tested residual tolerance <1e-7 m³.
- Actual historical delayed samples, frozen observations, scaling residuals and null missing readings.
- Partial-time inrush integration, cumulative mass closure and dry-sump measured discharge.
- The uninstalled planning pump remaining unavailable until explicitly installed and dispatched.
- Independent verification improving evidence availability without changing physical storage.
- Retained rejected strategies, canonical forecast/projection agreement, evidence-process scoring and current-state branching with immutable historical frames.
- Rejection of invalid inputs without corrupting the active scenario.

The incident event identifier is deterministic; uncalibrated hypothesis probabilities have been removed. Legacy MTBF/annual-downtime/availability predictions are now explicitly unsupported instead of retaining arbitrary numeric estimates. The old seed-distance “forecast divergence” bar has been replaced by an actual horizon-storage difference.

`src/tests/materialHandling.test.ts` adds seven fixtures: a known 110 t/h max-flow solution with a shared 50 t/h alternate; common hoist and receiving-rate limits; finite stockpile mass closure; invalid-capacity rejection; 250 t/h alternative recovery after primary-route failure; delayed processing shortfall after complete material interruption; and finite-buffer backpressure after a plant-power outage.

`src/tests/engineeringIntelligence.test.ts` adds 35 fixtures covering independent/concurrent/masked fault evidence, null unsupported readings, observation staleness, all five challenges at all three difficulties, reasoning and inspection-budget requirements, actual recovery windows/ranking, sparse/off-shift/interrupted/unconfirmed cases, proof completeness, unknown-runtime-field detection and historical input provenance. See `ENGINEERING-PROOF-COVERAGE.md` for the consequence-to-proof matrix and scope.

### Browser regression and interaction checks

**Seventeen registered Chromium tests.** The full 16-test engineering regression passed before the latest zoom adjustment; all three focused schematic tests passed after it. Coverage includes:

1. Pipe diameter changes calculated flow; the basis dialog opens; the result persists when navigating to DeepWater.
2. Feeder failure causes storage growth, an incident, and usable historical replay.
3. A challenge accepts unique measurement requests and awards an evidence-supported score.
4. All 14 original routes and the additional investigation, comparison, investment and validation views render without runtime exceptions.
5. Primary ore-route failure removes actual route flow, enabling the alternate restores only its shared 250 t/h capacity, and the material-flow basis is inspectable.
6. All four schematics have non-overlapping equipment cards and fitting labels; keyboard selection, cross-view highlighting, zoom, fit/reset and dependency graph connections work.
7. Diagram overflow remains inside its scroll viewport at 375, 768, 1024 and 1440 px screen widths.
   The latest schematic check also verifies full-diagram centering, zoom-out below the previous 60% limit, preservation of the panned viewport center during zoom, and refitting after resize. Schematics start fitted and centered, support 5–300% manual zoom, and expose separate Fit diagram / Fit width controls.
8. All five challenge scenarios are solved through requested observations, cited evidence, calculations, alternative testing and verification proposals.
9. Advanced mode requires a concurrent impairment; difficulty switching invalidates the attempt.
10. Missing observations remain null and time advances require explicit evidence refresh.
11. Recovery comparisons expose achieved-performance criteria and result-bound mathematical evidence.
12. The proof inventory has no unmapped current runtime fields; plant and forecast proofs open against their actual outputs.

Browser interaction is exercised for all five challenge scenarios and an advanced concurrent-fault attempt. Scoring rules are unit-tested at all three difficulties. This is not an exhaustive human-factors, accessibility, device or long-duration load test.

Production checks also identified and fixed standalone deep-link asset resolution. Standalone builds use `/`; GitHub Pages builds retain `/mine-os/` and the existing static-host fallback.

Commands used:

```text
npm run verify
npm run build
node ./node_modules/@playwright/test/cli.js test
npm run test:e2e
```

Browser runs use the installed Chromium executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and the default local preview base URL. `playwright.config.ts` also accepts `E2E_BASE_URL`. Portable setup is `npx playwright install chromium` followed by `npm run test:e2e`. Long simulated-time advances and route sweeps have explicit per-test time budgets.

## 5. Declared synthetic-data adjustments

- South sump initial fill is 20%, avoiding a reference case beginning exactly at an advisory restriction.
- Lower-level baseline groundwater inflow is 200 m³/h rather than 230 m³/h, consistent with the synthetic 132 kW motor's approximate achievable duty. This is a fictional dataset adjustment, not field calibration.
- Stage/storage coordinates are synthetic, with a non-rectangular upper storage profile.
- P-204 is a unique canonical, initially uninstalled planning slot, not a duplicate runtime asset store. It shares F-02 and the north shared main; it provides no implicit electrical diversity.

## 6. Remaining model limits and incomplete full-scope items

This increment does **not** establish the entire requested specification as a validated enterprise system:

- The hydraulic network is a collection of lumped stations/shared mains with explicit transfers. It is not an arbitrary branched pressure-network solver. Default station lifts terminate at abstract intermediate reservoir boundaries, not a fully designed full-depth surface-discharge system.
- No cavitation/NPSH, water hammer, slurry, pipe-pressure integrity, detailed gravity/free-surface flow or spatial 3D inundation model is implemented. Specialist hydraulic/hydrogeological work is required beyond the sectional storage model.
- No AC load-flow, voltage drop, motor starting, fault-current, relay coordination or arc-flash model is implemented. Switching review is a scenario prerequisite, not actual operational authorisation.
- Production restriction fractions and recovery ramps are explicit policy assumptions. Primary/alternate haulage capacities, a shared hoist and finite receiving inventory are implemented, but detailed haulage equipment, travel-time/queueing, haulage power, crew logistics and calibrated shift-recovery/permanent-loss modelling remain incomplete. The capacity graph and stockpile inventory are not a mechanical or structural design.
- The bounded duty search checks the implemented constraints over six hours. It cannot certify a safe strategy or guarantee a global optimum. Response/capital costs are synthetic study assumptions, not quotations or a financial valuation.
- Input-quality indices are heuristic. Inflow envelopes and seeded ±3% variation are synthetic sensitivity mechanisms, not calibrated probabilities or statistical confidence intervals. Actual motor current measurements are unsupported and remain unavailable rather than fabricated.
- Investigations use ideal requested synthetic inspections, healthy-reference comparisons, explicit screening tolerances and one-constraint-family restoration tests. They retain simultaneous and masked impairments, but are not a field-validated diagnostic classifier. Vibration and temperature remain labelled demonstration relationships, not calibrated equipment-health models.
- Challenge hidden conditions are ordinary client-side scenario parameters, not a secure assessment system. Structured reasoning is checked against captured observations; free-text rationale is retained for human review, not automatically interpreted. No competency certification is implied.
- State remains in memory, role switching remains a demonstration interface, and no physical-system connector, authentication backend or durable operational record was added.

## 7. Run and review

From `mine-os/`:

```bash
npm install
npm run dev
# Open /app/engineering
```

For a standalone production preview:

```bash
npm run build
npm run preview
```

Start at **Joint failure / stress**, initiate F-02 failure, advance time and compare recovery alternatives. Select P-201 in **Hydraulic laboratory**, change resistance and inspect **Show Engineering Basis**. Then visit DeepWater, Mine Impact and replay to inspect the same causal chain.

The GitHub Pages publication is built into the tracked `docs/` directory with `npm run build:publish`. It includes the `/mine-os/` asset base, SPA fallback and `.nojekyll`; publication follows the repository's `main/docs` Pages configuration.
