# Phase B — Real MVP (Qualification Track)

Goal: move MINE OS from a **synthetic demo** to a **pilot-ready, data-driven MVP** that can ingest real/historical mine data, be configured for a site, and produce evidence for customers/investors (e.g. Skilltor Tech Venture Studio).

## MVP definition (Phase B exit criteria)
- [ ] **External data input:** load telemetry from at least one real source format (CSV/historian export; optional live read-only adapter).
- [ ] **Site configuration:** define a mine/site (assets, sumps, pumps, feeders, sensors, topology/mapping) via config without changing core engine code.
- [ ] **Replay/operate on data:** run simulation/analytics against imported time-series or mapped tag values; show results in existing modules.
- [ ] **Validation evidence:** compare model outputs vs observed data where available; export a pilot evidence/report artifact.
- [ ] **Pilot packaging:** deployable build + setup guide + demo script for a design-partner site.

## Workstreams

### B1. Pilot dataset & ingestion (`src/integration/pilot/`)
**Purpose:** accept historical/field data with minimal friction.

- **Input formats (MVP):**
  - `site.config.json` — site metadata, asset/sensor catalog or mapping to canonical IDs, units, thresholds/geometry overrides.
  - `telemetry.csv` — rows: `timestamp,sensor_id,value[,quality,unit]` (ISO8601 or epoch ms). Supports replay at original cadence or resampled to sim step.
  - Optional `events.csv` — known failures/interventions for backtesting.
- **Adapter:** `PilotFileAdapter` implementing `TelemetryAdapter` (`src/domain/contracts.ts`) for file/replay sources.
- **Normalization:** reuse `normaliseSample`/`convertUnit`; explicit unit mapping and quality handling.
- **Acceptance:** can load a sample dataset and see sensor/derived values update deterministically.

### B2. Site-configurable model
**Purpose:** run on a real site, not only Kestrel Ridge.

- Extend/bridge config to produce `MineDefinition` (or a validated subset/override) and scenario/assumption defaults.
- Tag mapping: external tag -> canonical `sensorId`/`assetId`/`kind`.
- Calibration fields: sump geometry/capacity, pump curves/ratings, inflow baselines, thresholds (with provenance = "site estimate/measured").
- **Acceptance:** switching config changes the active mine model without code edits.

### B3. Store/app integration
- Add import/load flow: select pilot bundle (config + CSV) -> validate (zod) -> initialize run/replay.
- Modes: **Replay** (drive from historical timestamps) and **Live-sim** (model steps using last known inputs).
- Preserve synthetic demo as default; pilot mode as opt-in.

### B4. Validation & evidence
- Backtest view: predicted vs actual (levels/flows/status) over replay window; error/lead-time summaries.
- Export: JSON/CSV/PDF-ready report with inputs, assumptions, outputs, confidence/limitations.
- Engineering-basis/evidence panels must label provenance (`measured`/`estimated`/`synthetic`).

### B5. Deployment & pilot ops
- Build target for pilot (static or container), env/config for data paths/endpoints.
- Read-only posture: no plant control commands; clear safety/limits banner in pilot mode.
- Setup guide for a design partner (data requirements, mapping template, runbook).

## Suggested implementation order
1. **Scaffold** pilot types + zod schemas + CSV parser (`src/integration/pilot/*`).
2. **Sample dataset** in `pilot-data/sample/` proving the format end-to-end.
3. **PilotFileAdapter** + normalization/mapping.
4. **Loader/import UI** in Scenario/Telemetry/Engineering area (minimal).
5. **Replay driver** in store/engine hook (feed samples by timestamp).
6. **Configurable mine builder** (map site config -> model).
7. **Backtest & evidence export**.

## Data requirements for a first pilot (ask design partner)
Minimum viable (historical export is enough):
- Sump level(s): timestamp, value, unit, tag id.
- Pump status/flow/power (if available): running state, flow (m3/h), kW.
- Feeder/power availability events (optional but high value).
- Asset list: sump capacities/areas/depths or estimates, pump ratings, known thresholds.
- 1–4 weeks of data covering at least one upset/event if possible.

## Risks / notes
- Real sites have missing/noisy data: model must degrade confidence, not fake certainty (aligns with existing sensor-freshness behavior).
- Config correctness is critical: validate units, ranges, referential integrity.
- Keep synthetic demo intact for demos/tests; pilot mode isolated behind explicit load.
