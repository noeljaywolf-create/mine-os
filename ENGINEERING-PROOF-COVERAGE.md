# Engineering-proof coverage audit

## Scope and mechanism

The runnable audit is **Engineering Lab → Model validation → Engineering-proof coverage audit**. `src/simulation/proofCoverage.ts` inventories the implemented consequence families and canonical runtime numeric fields. It checks equation/provenance/units/model version/quality/sensitivity/limitations/validation/trace completeness, and flags newly introduced unmapped runtime numbers. Tests exercise initial and disrupted worlds and deliberately introduce an unmapped output to verify detection.

The inventory covers pump, sump, feeder, zone, sensor and asset runtime numbers; hydraulic results; water and material ledgers; material throughput; site aggregates; and the five context-bound analysis families below. Clock/sample timestamps and UI counts are metadata. This is a scoped audit of the implemented engineering increment, not a claim that static inspection formally proves every frontend expression or future code path correct.

## Consequence-to-proof matrix

| Predicted/displayed engineering consequence | Actual implementation | Proof target / UI access |
|---|---|---|
| Pump flow, head, friction, efficiency, speed limiting and power | `hydraulics.ts`, `plant.ts` | Pump asset ID; analyser, inspector, schematic or audit |
| Integrated pumping energy and tariff cost | `engine.ts` pump counters | Pump asset ID and `site:energy`; Energy or audit |
| Stored water, stage, overflow and mass residual | `water.ts`, `waterNetwork.ts` | Sump asset ID and `site:water`; DeepWater, resilience or audit |
| Inter-sump transfers and cumulative mass closure | Recorded water ledger/totals | Sump asset ID / `site:water`; transfer debits/credits shown once |
| Source/feeder capacity, motor reservations and unsupplied demand | `plant.ts` | Feeder asset ID / `site:power`; Energy, inspector or audit |
| Delayed zone restrictions, restart ramp, foregone hours/tonnes/value | `production.ts`, `engine.ts` | Zone asset ID; Production, inspector, schematic or audit |
| Primary/alternate route flow, common hoist and finite receiving inventory | `materialHandling.ts` | Route ID / `mat-hoist`; material controls, schematic or audit |
| Processing throughput, actual processed/deferred tonnes and inventory | Material ledger / plant state | Plant asset ID / `site:production`; Production or audit |
| Reported readings, missing values, residuals and quality | `sensors.ts` | Sensor asset ID / `site:quality`; inspector or audit |
| Generic conditional status and modeled functional fractions | `propagation.ts` and physical model results | `site:dependencies`; audit. Non-physical fractions remain declared approximations. |
| Forecast envelopes and threshold arrivals | `forecast.ts`, canonical projection | `analysis:forecast`; Forecast and DeepWater, bound to displayed forecast points |
| Recovery onset/confirmation, exposure, cost and revenue consequences | `engineeringStudies.ts`, `recovery.ts` | `analysis:recovery`; each comparison/sensitivity result |
| Inspection residuals, hypothesis dispositions and restored-capacity comparisons | `diagnostics.ts` | `analysis:diagnostics`; workbench/challenges, bound to the actual report |
| Evidence/claims/calculation/alternative/action scoring | `investigation.ts` | `analysis:challenge`; reviewed challenge rubric |
| Capital assumptions, operating expenses and avoided deferred tonnes | Matched investment projections | `analysis:investment`; each investment row |

## Important distinctions

- Snapshot proofs use recorded scenario inputs and effective assumptions. Context-bound study proofs consume the actual computed result, not a generic asset explanation.
- Recovery onset is measured from projected performance. Electricity restoration or a short configured delay does not establish recovery. Unconfirmed recovery is reported as right-censored within the study horizon.
- Missing current/head/level readings remain indeterminate where unsupported or unavailable. Old inspection values retain their timestamp; they cannot justify the current snapshot until explicitly refreshed.
- Counterfactual proofs include effective station inputs, the exact changed override patch, solver status and flow/power changes. Other faults remain in place; a masked repair can yield no flow improvement.
- Numerical observation/calculation tolerances are explicit demonstration rules, not calibrated statistical limits. Quality indices are not probabilities. Vibration/temperature references are labeled illustrative formulas, not validated health predictions.
- Permanently lost production, calibrated failure probabilities, motor amperes, fault/arc-flash/protection analysis, specialist 3D flood routing and uncalibrated reliability predictions remain explicitly unsupported.

## Verification

`src/tests/engineeringIntelligence.test.ts` checks the runtime inventory, complete analysis proofs, unknown-field detection, unsupported requests and recorded historical assumptions. `e2e/intelligence.spec.ts` opens diagnostic, recovery, challenge, plant and forecast proof panels against real UI results. The full test counts and current execution results are recorded in `ENGINEERING-VERIFICATION.md`.
