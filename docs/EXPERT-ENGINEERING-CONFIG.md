# Expert Engineering Configurations & Builds

This platform uses **configuration-driven, device-agnostic, read-only** engineering profiles. **Core simulation/domain/calculation logic is never changed** by site, sensor, protocol, or build differences.

## What "expert engineering configuration" means here
- **Design basis & operating envelopes:** sump/pump/pipeline/generator/inverter limits, duty margins, standby philosophy, alarm/trip-advisory setpoints, and provenance/basis for each value.
- **Alarm/alert setpoints:** engineering thresholds mapped to platform alert rules (thresholds, staleness, quality) for live/replay/gateway data.
- **Data quality & commissioning:** mapping/scaling/unit/timestamp checks, acceptance criteria, backtest expectations, and required sign-offs.
- **Power/generator/inverter monitoring (device-agnostic):** connect any monitor via gateway by exposed points/protocol; record measured signals only. Derived metrics (kWh, fuel consumed, fuel cost) require measured inputs + configured assumptions (e.g. fuel price) — no brand/model hardcoding.
- **Traceability:** revision, status, preparer/review roles, and auditable JSON exports.

## Expert profile templates
Located in `pilot-data/expert/`:
- `dewatering-engineering.config.json` — dewatering design basis, sump/pump envelopes, alert setpoints, commissioning/data quality.
- `power-generator-engineering.config.json` — power/generator/inverter envelopes, generic monitor mappings, derived-metrics definitions (energy/fuel/cost) and cost assumptions.
- `commissioning-and-build-profile.json` — phased commissioning/RACI, build profiles, config validation rules.

**Usage:** copy a template per site, replace values with verified/site-specific data, declare provenance (`measured`/`estimated`/assumed), review/approve, then load/map via gateway or pilot bundle. Generate platform alert rules from profiles in **Engineering Configurations & Builds** (`/app/engineering-config`).

## Build & deployment profiles
Defined in `pilot-data/expert/commissioning-and-build-profile.json` (`buildProfiles`):
- `dev`: local dev (`npm run dev`), base `/`, verbose, all features.
- `pilot`: read-only pilot/UAT build, production mode, approved gateway only.
- `production-static`: `npm run build` → `dist/`, serve behind TLS with recommended headers; read-only.
- `github-pages`: `npm run build:pages` → `docs/`, base `/mine-os/`.

### Commands
```powershell
npm run dev          # development
npm run typecheck    # type safety
npm run build        # production static (dist/)
npm run build:pages  # GitHub Pages (docs/, /mine-os/)
npm run preview      # preview build
```

## Applying configurations in the app
- **Engineering Configurations & Builds**: view expert profiles, apply numeric assumptions, generate alert rules from envelopes/setpoints, inspect commissioning/build details, export auditable config.
- **Telemetry & Integrations**: connect gateways (URL/IP), load pilot bundles, manage saved connection profiles, view health, export history/reports.
- **Alerts**: tune/enable rules, acknowledge/track events.

## Guardrails
- Read-only/advisory: **no plant control/write-back**.
- Validate units/scaling/timestamps/quality; treat missing data as reduced confidence.
- Calibrate and backtest before operational reliance. All templates are illustrative until site-verified and approved.