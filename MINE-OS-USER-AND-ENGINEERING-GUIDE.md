# MINE OS: user and engineering guide

**Applies to:** MINE OS demonstration, model `MINE-ENG-2.0`  
**Audience:** operators, engineers, supervisors, managers and developers  
**Location:** this file is in the MINE OS project folder. It is a project document, not an in-app help page. Screen names and results may change as the software changes.

## Important: simulation only

MINE OS is a synthetic demonstration of a fictional underground mine. Its equipment, sensor readings, water levels, costs and diagrams are not live mine data. Buttons change a computer scenario; **they do not start pumps, switch generators or connect to PLC, SCADA, a historian or a maintenance system**. A “switching approved” setting is a model input, not an actual authorisation. Do not use this app to make real operating, safety, electrical or mine-design decisions.

Forecasts, warnings, costs and recommendations are estimates from simplified assumptions. They have not been calibrated or validated against a real mine. The role selector is a demonstration of permissions, not authentication. The simulation is held in memory: refreshing the page resets it. Download anything you need before refreshing. Notes in the Operations desk are only held while that screen is mounted; they are not an official handover record.

## Contents

1. [Getting started](#1-getting-started)
2. [Common controls and terms](#2-common-controls-and-terms)
3. [Using the Operations desk](#3-using-the-operations-desk)
4. [Every main screen](#4-every-main-screen)
5. [How to read graphs and diagrams](#5-how-to-read-graphs-and-diagrams)
6. [Formulas and model methods](#6-formulas-and-model-methods)
7. [Inputs, defaults and units](#7-inputs-defaults-and-units)
8. [Typical workflows](#8-typical-workflows)
9. [Troubleshooting](#9-troubleshooting)
10. [Software and verification reference](#10-software-and-verification-reference)

## 1. Getting started

### Open the app

The published demonstration is at <https://noeljaywolf-create.github.io/mine-os/>. Open the application from its public landing page. The project folder is `Documents/MINE OS` on the machine where it was installed. The online version may differ from local source until a Pages build is pushed and deployed.

### A first five-minute tour

1. Open **Mission Control**. Read the simulation warning and look at the Operations desk, water levels, power, production and active incidents.
2. Open **Scenarios** and create an editable branch. The baseline is intentionally protected. Depending on the screen, an engineering demonstration can also offer **Create editable branch**.
3. Return to Mission Control. In **Pumps**, choose **Preview stop**, **Preview start** or **Preview standby**. Read the estimated before/after flow and power; select **Apply to simulation** only if the action is enabled. These values describe the current model snapshot, not a future forecast.
4. Use **Preview generator settings** to change its simulated availability, connection, capacity and switching prerequisite. Read the warning and apply if the current demonstration role permits it. A generator does not automatically repair a failed feeder.
5. Open **DeepWater** and choose a sump. Read its water level and forecast graph. Select **Show Engineering Basis** for the formula, inputs and limitations.
6. Open **Digital Twin** and switch between the sectional, electrical, hydraulic and ore-movement views. Select a card to inspect the associated asset.
7. Open **Scenarios** to compare your branch with baseline and use replay. Download a summary or evidence before refreshing.

### Time and roles

- **Run/pause** starts or pauses simulated time; **Advance one simulation step** advances one step; speed controls change how quickly the simulation advances. Some screens provide an **Advance 1 h** action. Time is simulation time, not proof of an event at a real mine.
- Choose a role in **Role simulator**. Buttons may be unavailable when the selected role lacks a capability. **Governance** shows the capability matrix. Changing role does not sign in or establish identity.
- Many engineering changes require an editable branch and are not allowed while viewing a historical replay. Some screens also prevent changes during a running advance task.
- Background analyses may show a loading state or an older snapshot while the simulation runs. Check the displayed analysis time and pause for an exact current-step calculation when offered. A blank or loading result is not a safe result.

## 2. Common controls and terms

| Term | Meaning in this app |
|---|---|
| Scenario / branch | A separate set of assumptions and simulated state used to test a case. The baseline is protected. |
| Snapshot / replay | A stored simulated state at a particular time. Replay is historical and read-only for interventions. |
| Sump | A modeled water-storage location underground. |
| Stage / water level | Water height above the sump floor, in metres; not the surveyed elevation of the water surface. |
| Flow | Water volume per hour, usually m³/h. The current modeled pump curve output can differ from water actually delivered over the last interval. |
| Head | Energy per unit weight of water, expressed in metres. It includes lift, receiving pressure and pipe losses. |
| Feeder | A modeled electrical supply path. Capacity is an active-power allocation approximation, not an AC electrical study. |
| Standby | A modeled pump mode; it is not proof that equipment is installed, healthy, powered or available. |
| Threshold | A synthetic advisory, warning or critical water level used by the model. It is not a site operating limit. |
| Deferred tonnes | Modeled processing shortfall; it is not automatically permanent loss. |
| Evidence / basis | Inputs, formulas, calculation steps, assumptions and limitations associated with a result. |
| Input-quality index / confidence | A heuristic about synthetic observations, not a calibrated probability or a guarantee that a result is correct. |

Use **Show Engineering Basis** where available to see the specific result's values, units, sources, formula, assumptions and limitations. Not every result has the same plain-language explanation; use the formula reference below and the relevant source code when more detail is needed.

## 3. Using the Operations desk

### Pump controls

Each visible pump shows a modeled mode, instantaneous output and power. Select **Preview start**, **Preview stop** or **Preview standby**. The preview recomputes the shared model without advancing time. It shows total modeled pump output and power before and after the proposed change.

The **Apply to simulation** button is disabled for a protected baseline, replay, insufficient demo permission, an invalid preview, or a start whose preview has no modeled flow, no power or an unavailable pump. This is a model check, **not a comprehensive real-world interlock or safety review**. Select **Cancel** to discard a preview. Applying changes the active in-memory scenario; use another preview to change it back or create a separate scenario for comparison.

### Backup generator

Choose **Preview generator settings**, then set:

- **Available:** the modeled generator is available.
- **Connected:** the scenario requests a backup connection.
- **Switching approved in scenario:** a modeled prerequisite, not approval by a person or an electrical switching instruction.
- **Capacity (kW):** a non-negative modeled source limit; the interface accepts up to 100,000 kW, not a manufacturer rating.

All three prerequisite settings are needed before the model can use backup power. A damaged path may additionally require the independent-distribution assumption. Source and feeder limits, motor allocation and load priority still apply. Inspect the preview and **Energy** / **Engineering Lab** for effects and limitations.

### Water outlook and handover

The outlook shows current simulated levels and, when available, estimated time to a critical threshold. “No critical level projected in the forecast window” does not mean no future risk. A loading or unavailable forecast is not a safe indication.

Type a note under **Shift handover**, then select **Download simulation summary** if your demo role has export permission. The text file contains the current scenario snapshot, selected equipment and site figures, and your note. It is a synthetic summary—not an official record. Notes are not automatically saved and can disappear when leaving the screen or refreshing.

## 4. Every main screen

The navigation groups are **Operate**, **Intelligence**, **Engineering** and **System**. The following labels are the current navigation labels; some page headings use longer product names.

### Mission Control (`/app`)

The overview combines the Operations desk, sump inventory and forecasts, power availability, production rate, net water balance, pump energy cost, incidents, dependencies and recent activity. Select an asset or follow a link for details. **Advance 1 h** advances the model; it does not advance a real mine clock. Power availability shown here is an average of modeled feeder supply ratios, not a site electrical reliability figure.

### Digital Twin (`/app/digital-twin`)

Use the four twin buttons to switch views. Cards represent modeled assets; click or use keyboard focus and Enter/Space on selectable cards. Connected/selected assets are highlighted across views. The dependency graph shows modeled relationships and conditional consequences. It is not a surveyed plan or a detailed electrical or hydraulic drawing.

### DeepWater (`/app/dewatering`)

Choose a sump to see modeled level, fill, inflow, pump output, available and standby capability, thresholds, forecast and the connected pumps. Use the pump controls if allowed, inspect the basis, or follow links to energy, production and scenarios. The forecast is produced from a simulation snapshot and may take time to calculate.

### Mine Impact (`/app/impact`)

Shows how modeled water conditions and related assumptions can affect production, value exposure and recovery. Compare current versus design throughput by area, inspect the water-to-production explanation, the exposure register and recovery sensitivity. Financial values are synthetic assumptions; the figures are not an audited profit-and-loss statement.

### Incidents (`/app/incidents`)

Review the queue, open an incident and inspect its evidence, hypotheses, proposed actions and comments. Available workflow actions depend on the selected demonstration role and incident state. Incidents and acknowledgements are simulated and are not an emergency notification system.

### Energy (`/app/energy`)

Review feeder connected load and firm capability, pump demand, energy used and tariff-based cost. The load-versus-capacity bars compare kW; the trend chart uses modeled power-tag history when enough samples exist. Feeder state controls are scenario actions, subject to role and branch restrictions. See the Engineering Lab for backup assumptions.

### Production (`/app/production`)

Compare zone throughput with design, review constrained areas, modelled shortfall and the assumptions behind it. Water-threshold restrictions, planned shifts, restart ramp, transport paths and buffer availability affect the calculation. A modeled shortfall or deferred tonne is not necessarily a permanent loss.

### Forecast (`/app/forecast`)

Choose a sump and inspect its central forecast, lower/upper inflow-sensitivity envelope and threshold crossings. A sensitivity comparison explores how inputs change projected critical times. The input-quality section describes synthetic observation quality, not a probability of failure. Reliability-related displays are illustrative; unsupported lifetime or failure-rate estimates must not be treated as measured reliability.

### Engineering Lab (`/app/engineering`)

Use the tabs across the page:

1. **Hydraulic laboratory:** inspect modeled pump and system curves, change available inputs in an editable scenario, and inspect the four twin diagrams.
2. **Joint failure / stress:** simulate a feeder failure, adjust water and power assumptions, advance time and review shared consequences. Stress presets create isolated scenarios.
3. **Failure investigation:** request synthetic observations, compare competing hypotheses and inspect one-constraint-at-a-time restoration tests. Missing or stale evidence is not a diagnosis.
4. **Intervention comparison:** compare modeled recovery strategies over a common horizon, review rejected prerequisites and use **Inspect** / **Show Engineering Basis**. The bounded duty search is not a certified optimum. Export the engineering evidence JSON if required.
5. **Investment planning:** compare hypothetical infrastructure inputs and synthetic capital/operating consequences; they are not supplier quotes, payback calculations or approved designs.
6. **Engineer challenges:** select a challenge and difficulty, request observations within the inspection budget, cite evidence, provide the calculation and test an alternative. This is training, not certification.
7. **Model validation:** read the software verification register, proof coverage and modeled relationships. Passing software tests is not field validation.

The **Executive presentation** toggle presents the same underlying scenario in summary form; it does not create an independent calculation.

### Analytics (`/app/analytics`)

Review water balance, numerical self-checks, pumping energy, pump performance, production exposure, simulated incidents and reliability drivers. Where export is available, save the result before refreshing. Numerical closure checks whether the implementation balances its own ledger; it does not establish that inputs are accurate.

### Assets (`/app/assets`)

Browse the asset register and select a pump, sump, feeder, production area or other asset to inspect its modeled status, dependencies and evidence. Asset descriptions, names, ratings and condition are synthetic. This is not a live maintenance register or CMMS.

### Scenarios (`/app/scenarios`)

Create and name a branch from the current scenario, edit permitted assumptions or equipment states, compare the active branch against the baseline reference, and examine recorded frames with **Replay**. A branch inherits a modeled snapshot; read its starting conditions when comparing. Return to live state before changing inputs. Refreshing the browser clears in-memory scenarios.

### Decisions (`/app/decisions`)

Record a modeled decision, alternatives, rationale and evidence; inspect the decision trail and comments. Actions depend on demo-role permissions. The ledger is in memory, not a durable approval or audit system.

### Telemetry (`/app/telemetry`)

Inspect synthetic tags, current modeled values, freshness and the sample timeline. The adapter contract is an example of data shape, not an active connector. Missing or unsupported observations must remain missing; model values are not real measurements.

### Governance (`/app/governance`)

Read the demonstration boundaries, selected role and capability matrix, data provenance and deployment limitations. This page does not provide production authentication, functional-safety certification or regulatory approval.

## 5. How to read graphs and diagrams

### Water forecast graph

- Horizontal axis: **hours from the forecast snapshot**, shown as `T+`; vertical axis: **water level in metres above the sump floor**.
- The central line is the modeled central run. The shaded region and dashed upper line show the lower/upper modeled inflow cases; they are **sensitivity scenarios, not a statistical confidence interval**.
- Horizontal marked lines represent configured advisory, warning and critical levels. A crossing is estimated between adjacent samples; the time step limits precision. Hover or tap where supported to inspect level, band and modeled inflow/outflow.
- A critical time of `null`, “not reached” or “none projected” normally means no crossing within the displayed horizon, not that a crossing can never occur. Check whether the forecast is still loading or is unavailable.
- In the intervention comparison, the plotted North sump trajectory is a particular candidate's projected state; its low/high values are set to the same trajectory in that view, so it is not an uncertainty band.

### Pump and system curves

In the hydraulic laboratory the horizontal axis is pump flow (m³/h) and the vertical axis is head (m). The pump curve shows modeled head available at different flow; the system curve shows modeled head required by the pipe and boundary. Their modeled intersection gives the operating point when the solver succeeds. A failed, unsupported or non-converged solve is not a valid duty point. Curves are synthetic, not manufacturer curves.

### Bars, trends and tables

- **Energy:** feeder load and firm-capacity bars are in kW. Logged trend lines use simulated sensor history; absence of points can mean the clock has not advanced or data is unavailable.
- **Production and Mine Impact:** current versus design bars are in tonnes per hour. They are rates, not accumulated tonnes. Deferred or lost tonnes are integrated quantities and must not be read directly from a single bar.
- **Analytics:** pumping-energy bars and simulated incidents-by-hour bars use the units named on each panel. Inspect legends and hover values; different charts may use different scales.
- **Forecast sensitivity:** comparative bars/tables show modeled threshold times or scenario results, sometimes capped for display. A cap is not an exact crossing time beyond that cap.
- **Telemetry timeline:** shows freshness of synthetic samples over simulated time, not a field communication audit.
- **Tables and percentages:** read the heading, unit and source. A percentage may be a modeled functional fraction, fill ratio or heuristic index; it is not necessarily a probability.

### Four engineering schematics

| View | Reading direction and meaning |
|---|---|
| Underground sectional twin | Levels and modeled storage/equipment lanes; storage bars represent calculated fill. Not surveyed geometry. |
| Electrical single-line twin | Source and generator at top, then modeled feeder paths and motor loads. It is an active-power allocation view, not a protection or AC load-flow drawing. |
| Hydraulic twin | Sump → pump train → receiving boundary. Rows show the configured parallel or series arrangement; flow is modeled. |
| Ore movement twin | Mining zones → transport routes → common handling → finite ore buffer → processing. Links indicate modeled eligible paths, not actual haulage routes. |

**Reset** returns to a readable 100% view near the first asset. **Fit diagram** centers the full drawing, but may make labels small for a large drawing. **Fit width** fits horizontally and may require vertical scrolling. Use **+ / −** to zoom, and scroll inside the diagram to explore at a readable scale. A full overview and readable text cannot always both fit on a small screen. In the dependency graph use its zoom and fit controls. Cyan indicates selection/links; red and amber indicate modeled problem states, with accompanying text. Colours are not real alarm outputs.

## 6. Formulas and model methods

This is a readable reference to the principal equations and their displayed evidence panels, not a certification or a promise that every internal conditional branch is listed. The source files and the **Show Engineering Basis** panels are the detailed implementation and result-specific reference. Units must be consistent; convert m³/h to m³/s by dividing by 3,600 for hydraulic power and velocity.

### 6.1 Water storage and level

For a modeled sump over a time step:

```text
change in volume = (external inflow + transfer in − pump withdrawal) × Δt / 3,600 − overflow
new level = inverse stage–storage relationship(new volume)
```

Flows are m³/h, `Δt` is seconds, and volume/overflow are m³. Actual withdrawal is limited by available water. Transfers are debited from a source and credited to a receiver; receiving inflow is not re-pumped in the same interval. Stage–storage coordinates are synthetic piecewise-linear points `(level m, volume m³)`. If no curve exists, the explicit rectangular fallback is `level = volume / area`.

Site last-step water balance:

```text
residual = initial storage + external inflow − external discharge − overflow − final storage
```

All terms are volumes in m³ over the interval. Internal transfers cancel at site boundary. A small residual shows numerical closure, not correct sensors, geometry or field calibration. Before the first simulation step there is no integrated water ledger; instantaneous flow is not yet measured interval withdrawal. See `water.ts`, `waterNetwork.ts` and `engineeringEvidence.ts`.

### 6.2 Flow, pipe losses and pump curves

```text
area A = πD² / 4
velocity v = (Q / 3,600) / A
Reynolds number Re = vD / ν
system head = static lift + p/(ρg) + f(L/D) v²/(2g) + K v²/(2g)
```

`Q` is m³/h, `D` and pipe length `L` are m, `v` is m/s, `p` is Pa, `ρ` is kg/m³, `g` is m/s², `ν` is m²/s, and Darcy factor `f` and loss coefficient `K` are dimensionless. Receiving backpressure entered in kPa is multiplied by 1,000 to get Pa. The implementation assumes clean water near 20 °C: `ρ = 998.2`, `g = 9.80665`, `ν = 1.004 × 10⁻⁶`. Valve opening contributes an additional synthetic loss `20 × (1/opening − 1)²`; a closed valve has no supported running duty.

For `Re < 2,300`, `f = 64/Re`; at `Re ≥ 4,000` the Haaland approximation is used. The transition region is not accepted as a final solved operating point. The synthetic pump curve is:

```text
Hpump = 1.25 × Hr × n² × condition − 0.25 × Hr × [Q / (Qr × curveScale)]²
```

`Hr` and `Qr` are synthetic rated head and flow; `n` is speed relative to rated, and `condition` and `curveScale` are scenario inputs. For parallel pumps the model combines flow at a shared head; for series pumps it adds head at shared flow. Bounded bisection solves against the shared main. Invalid, no-head, unbracketed or non-converged solutions are reported as such. Motor allocation can limit speed. The model is not a full branched pressure-network solver and does not model water hammer, NPSH, slurry or pipe integrity. See `hydraulics.ts` and `plant.ts`.

### 6.3 Power, energy and electricity cost

```text
hydraulic power (kW) = ρ × g × (Q / 3,600) × H / 1,000
electrical input (kW) = hydraulic power / wire-to-water efficiency
energy (kWh) = Σ [interval input power (kW) × interval seconds / 3,600]
energy cost = Σ [interval energy × interval tariff]
```

Efficiency is a synthetic curve with bounds, not a tested motor/pump efficiency. The energy ledger uses modeled interval duty, which can differ from continuously running wet-duty capacity. Off-cycle and shutoff motor demand are not fully modeled. Specific energy is kWh per m³ when a meaningful flow is available; interpret zero/undefined cautiously.

### 6.4 Power allocation and generator

```text
modeled feeder path limit (kW) ≈ feeder rating (kVA) × 0.9 assumed power factor × availability
allocated load ≤ available source and path budgets
unsupplied demand = requested demand − allocated demand
```

The base utility budget is 2,000 kW; the default configured backup capacity is 250 kW. Backup requires availability, connection and a switching prerequisite. The model uses deterministic motor/service allocation and may require an independent path to bypass a damaged feeder. These are budget approximations—not voltage drop, starting current, fault current, relay coordination, arc flash or physical switching logic. See `plant.ts` and `engineeringEvidence.ts`.

### 6.5 Forecasts and crossing times

The forecast repeatedly runs the canonical time-step model on a snapshot. The central run and low/high inflow scenarios use the same model with different assumptions. The default horizon is 24 h; default time step is 60 s and default inflow envelope is ±18%, unless changed. Crossing time is obtained from the first relevant adjacent samples that bracket a threshold. Results depend on the snapshot, horizon, time step, inflow, pump and power assumptions. An envelope is not a statistical confidence interval, and no crossing in the horizon is not proof of safety after it. Check the displayed forecast snapshot age.

### 6.6 Production, material flow and exposure

```text
zone floor flood level above sump = zone floor elevation − sump floor elevation
modeled shortfall over step ≈ design rate × (1 − operating fraction) × Δt / 3,600
inventory next = inventory initial + transported ore − processed ore
```

Rates are t/h; time is seconds and resulting tonnes are t. Current modeled policy retains 90% of zone production at advisory, 75% at warning and 50% at critical, with zero when the modeled water surface reaches the controlling zone floor. Shift schedule, ramp, transport and other constraints also apply. These percentages are synthetic policies, not approved limits.

Available zone ore is routed through modeled primary/alternate route capacities and a shared hoist using bounded maximum flow. Receiving inventory and plant processing are finite; unavailable processing can hold material at the face. Default initial buffer is 560 t, default buffer capacity 1,120 t and common hoist capacity 1,200 t/h, subject to scenario inputs. `processed ≤ planned processing after power constraints` and `processed ≤ routed ore + initial inventory`.

```text
illustrative value exposure = deferred tonnes × assumed value per tonne
```

Deferred processing is not confirmed permanent loss, revenue or profit. Energy cost is not the full mine electricity bill, and response/capital assumptions are not quotations. See `production.ts`, `materialHandling.ts` and `engine.ts`.

### 6.7 Observation and diagnostic calculations

```text
observation residual = reported synthetic value − modeled comparison value
single-restoration flow gain = flow with one modeled constraint restored − current modeled flow
```

If either value is missing or unsupported, the residual is indeterminate. Inspections and reference values are synthetic. One-at-a-time restoration can be masked by another constraint; a small gain does not prove equipment is healthy. Heuristic quality indices, including the declared no-tag fallback, are not probabilities or field assurance. See `sensors.ts`, `diagnostics.ts` and `analysisEvidence.ts`.

### 6.8 Recovery, comparison, investment and challenge scoring

In the intervention comparison, achieved recovery is the first sampled window where zones and plant are at least 95%, storage is below warning and non-growing, and those conditions persist for 900 seconds. Confirmation is limited by frame spacing and the six-hour study horizon. “Not confirmed” means no qualifying window was found in that horizon, not that recovery is impossible. Comparison cost is modeled pumping energy plus the candidate's assumed response cost; value exposure is deferred tonnes × assumed value per tonne.

Investment comparison uses `avoided deferred tonnes = current case deferred tonnes − proposed case deferred tonnes` and a synthetic capital assumption multiplied by a selected factor. It is not NPV, payback or a supplier quote.

Challenge scoring adds up to 100 points: usable evidence 25, cited causal claims 25, dimensional calculation 25, tested alternative 15, and verification action 10. An over-budget attempt scores zero. It is a client-side training rubric, not an accredited examination.

## 7. Inputs, defaults and units

Defaults are illustrative and can be overridden in a scenario. The relevant displayed basis and scenario snapshot are more useful than assuming a default still applies.

| Input | Default | Caution |
|---|---:|---|
| Value per tonne | USD 78/t | Illustrative; not verified revenue or profit. |
| Operating cost | USD 4,200/h | Model assumption; see the specific cost view for its calculation. |
| Fixed overhead | USD 18,500/h | Reported separately where applicable; not necessarily caused by an event. |
| Inflow envelope | ±18% | Scenario sensitivity, not a statistical interval. |
| Rainfall multiplier | 1.0 | Applies to modeled rainfall-sensitive inflow. |
| Forecast horizon / step | 24 h / 60 s | Sampling and scenario settings affect results. |
| Production restart ramp | 0.75 h | Synthetic operating assumption. |
| Pumping tariff | USD 0.14/kWh | Scenario tariff, not actual contract pricing. |
| Crew callout | USD 2,400 | Synthetic response assumption. |
| Backup capacity | 250 kW | Configured capacity, not proof of available output. |

`sensorConfidenceDiscount` and `pumpDegradationPerHour` remain in the default assumptions with descriptive labels. Their labels alone do **not** establish that they drive every displayed result; inspect current code and result evidence before relying on them. Other scenario-specific engineering settings can change pipe geometry, storage, routes, shifts and source availability.

Common units: `m` metres; `m²` square metres; `m³` cubic metres; `m³/h` cubic metres per hour; `s` seconds; `h` hours; `kW` kilowatts (power); `kWh` kilowatt-hours (energy); `kVA` apparent power rating; `kPa` kilopascals; `t` tonnes; `t/h` tonnes per hour; `USD` illustrative US dollars.

## 8. Typical workflows

### Compare a pump change

Create a branch → Mission Control → preview the desired pump mode → review instantaneous output and power → apply to the simulation if allowed → inspect DeepWater forecasts and Energy → compare the branch with baseline in Scenarios → save a handover or evidence report. Preview is not an advance through future time.

### Explore a feeder failure

Open Engineering Lab → **Joint failure / stress** → **Initiate Simulated Feeder Failure** → advance simulated time → inspect water levels, incidents and production → compare recovery options. The modeled causal chain can be delayed by stored water and ore inventory; a feeder trip does not instantly establish a real flood or production loss.

### Evaluate backup supply

Create a branch → preview generator settings → set the scenario prerequisites and capacity → compare output and power → review feeder/path assumptions in Energy and Engineering Lab. An available generator cannot necessarily supply every pump, and an independent path may be required for a failed feeder. Do not use this as a switching procedure.

### Prepare a simulated shift handover

Pause at the intended snapshot → inspect current warnings, pump states, levels and production → enter a note in the Operations desk → download the text summary → check the saved file. The summary is not an official shift log, and notes vanish when the desk is left.

## 9. Troubleshooting

| Symptom | What to check |
|---|---|
| Apply button disabled | Is the baseline protected? Are you in replay, missing a demonstration capability, or applying an invalid input? For pump start, does the preview show power, availability and modeled flow? |
| Generator connected but no output | Check availability, scenario switching prerequisite, source capacity and the feeder/independent-path assumptions. A connection alone is not enough. |
| Diagram looks tiny | Use **Reset** or zoom in and scroll. **Fit diagram** prioritizes seeing the entire diagram over readable text. |
| Forecast says loading | Wait for background work; pause when exact current-step results are needed. Check snapshot time and data quality. |
| No threshold crossing | Confirm the forecast exists and check its horizon. No crossing within the horizon is not proof of no future crossing. |
| Energy or ledger is empty | Advance the simulated clock. Instantaneous power and integrated energy are different quantities. |
| A number or reading is missing | It may be unsupported, stale or absent; do not substitute a synthetic model value as a field measurement. |
| Scenario or notes disappeared | State is in memory. Browser refresh resets it; desk notes can also disappear when navigating away. Export before leaving. |
| Live site shows old content | Local edits and a local build do not publish automatically. Pages must be built, committed, pushed and deployed; browser cache may also show older assets. |

## 10. Software and verification reference

### Run locally

From the project folder with Node.js and npm installed:

```text
npm install
npm run dev
npm run typecheck
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright's configured web server serves the **production preview** on port 4173 and may reuse an existing server. Build the current source first; ensure any reused preview serves the intended build. `E2E_BASE_URL` can point tests at a separately started preview. `npm run lint` currently runs the TypeScript build check; it is not a separate ESLint audit.

`npm run build:pages` generates a Pages-style build under `dist/`. `npm run build:publish` regenerates the tracked `docs/` Pages output. Rebuilding `docs/` replaces generated files; this guide intentionally lives in the project root, not that generated directory.

### Source map

| Area | Files |
|---|---|
| Screen routes and navigation | `src/app/modules.ts`, `src/modules/` |
| Operations desk and visualizations | `src/components/OperationsDesk.tsx`, `EngineeringSchematic.tsx`, `DependencyGraph.tsx`, `charts.tsx`, `HydraulicAnalyser.tsx` |
| Shared state and role checks | `src/store/mineStore.ts`, `src/store/hooks.ts`, `src/domain/roles.ts` |
| Synthetic mine and defaults | `src/data/mine.ts`, `src/data/scenarios.ts`, `src/simulation/assumptions.ts` |
| Canonical transitions and projection | `src/simulation/engine.ts`, `projection.ts`, `forecast.ts`, `water.ts`, `waterNetwork.ts` |
| Pump, power and production | `src/simulation/hydraulics.ts`, `plant.ts`, `production.ts`, `materialHandling.ts` |
| Diagnostics, studies and evidence | `diagnostics.ts`, `investigation.ts`, `engineeringStudies.ts`, `recovery.ts`, `engineeringEvidence.ts`, `analysisEvidence.ts` in `src/simulation/` |
| Tests | `src/tests/` and `e2e/` |

See `ENGINEERING-AUDIT.md`, `ENGINEERING-PROOF-COVERAGE.md` and `ENGINEERING-VERIFICATION.md` for additional historical engineering notes. Their test counts and descriptions are time-specific and may be outdated; run the current test commands for current results. This guide summarizes the current implementation but does not replace reading the code and result-specific basis for engineering review.
