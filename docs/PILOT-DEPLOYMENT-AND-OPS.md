# Pilot Deployment & Operations (Phase B MVP)

## Scope and safety posture
- **Read-only:** pilot MVP ingests and replays/analyses data; it must **not** issue control commands or write to plant systems.
- **Not a safety system:** outputs are decision-support/modelled insights and require engineering validation.
- **Data handling:** file-import MVP processes data in-browser/session; do not upload sensitive data to untrusted hosts. For live connectors, use an approved, secured gateway.

## Packaging & deploy
- **Static build:** `npm ci && npm run build` (dist/) or `npm run build:pages` (GitHub Pages-style base). Serve over HTTPS.
- **Container:** serve built `dist/` via nginx/caddy; mount no secrets; keep read-only FS where possible.
- **Config per site:** provide `pilot-data/<site>/site.config.json` + telemetry export; avoid code changes per deployment.

## Environment/config (pluggable)
- **Data source plug:** file/CSV (MVP) or future live adapter implementing `TelemetryAdapter` (`src/domain/contracts.ts`).
- **Live connector (future):** deploy read-only gateway that normalizes tags → canonical schema (timestamp, sensorId, value, unit, quality) with authN/Z, TLS, allow-lists.
- **Secrets:** never commit credentials; inject via environment/secret manager in gateway, not in frontend bundle.

## Pilot runbook (design partner)
1. **Define scope:** assets/sumps/pumps/feeders, questions to answer, success metrics.
2. **Export data:** historian/CSV for selected window (include at least one event if possible) + asset metadata/geometry/ratings.
3. **Map tags:** complete `site.config.json` sensor mappings (source tag, canonical id/asset, unit, scale, provenance).
4. **Load & replay:** Telemetry → *Pilot data source* → load bundle; review confidence/freshness and backtest panel.
5. **Review evidence:** export evidence JSON, compare predicted vs observed, document assumptions/limitations and calibration needs.
6. **Iterate:** refine mappings/geometry/assumptions; re-run until fit-for-purpose for decision support.

## Operational checks
- Validate referential integrity (sensor→asset), units/ranges, timestamps/timezones.
- Monitor stale/missing data rates; treat gaps as reduced confidence.
- Version site configs and exports for reproducibility/audit.

## Limitations (communicate to stakeholders)
- Uncalibrated models may diverge from site behavior; backtest is indicative until calibrated.
- Sample MVP replay is a starting point; high-rate/high-volume streams require optimized storage/streaming adapters.
- No guaranteed compliance/certification; perform site-specific safety and security review before operational use.
