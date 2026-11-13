# Pilot Readiness Checklist (Step 2)

Use in **Test/read-only mode** until commissioning, calibration, and approvals are complete. Core engine unchanged.

## A. Gateway & connectivity (device-agnostic)
- [ ] Identify monitor/inverter/generator/sensor interfaces (protocol, IP/endpoint, port, point/register/topic list, units, scaling). *No brand/model hardcoding.*
- [ ] Deploy read-only gateway/edge that can reach devices and expose: `GET /health`, `GET /catalog` (recommended), `GET /samples/latest?ids=...` (required). Optional `POST /control` for operational intents (guarded).
- [ ] Verify from browser/host: reachability, latency, CORS/TLS as needed, timestamps (UTC epoch ms), quality [0..1], and correct units/scaling.
- [ ] **Local smoke test:** `node scripts/mock-gateway.mjs 8090` → Telemetry > Quick Connect `http://localhost:8090` → Test → Connect.

## B. Mapping & expert configuration
- [ ] Create site config from `pilot-data/sample/site.config.json` or `pilot-data/expert/*` templates.
- [ ] Map `sourceTag → sensorId/assetId/kind/unit/scale/provenance/staleness/sample period` for all critical points.
- [ ] Declare derived metrics explicitly (e.g. kWh integration, fuel consumed, fuel cost = measured fuel × configured price). Record only measured signals.
- [ ] Apply expert envelopes/assumptions; generate and tune alert rules in **Engineering Configurations & Builds** / **Alerts**.

## C. Data quality & validation
- [ ] Validate completeness, monotonic timestamps, ranges, flatlines, and quality flags; treat gaps as reduced confidence.
- [ ] Run pilot replay/backtest: compare predicted vs observed, review MAE/residuals, document deviations.
- [ ] Confirm power/fuel/energy/cost figures against monitor displays/historian for known intervals.

## D. Operating mode, safety & governance
- [ ] Remain in **Test/read-only** during validation/pilot. Enable **Operational** only with approved procedures, endpoint allowlists, change control, and safety review.
- [ ] Confirm control-intent audit trail and gateway behavior (`POST /control`) in a non-production/test environment.
- [ ] Review roles/access, alarm setpoints, and response procedures with ops/electrical/dewatering/safety.

## E. Evidence & sign-off
- [ ] Export evidence/report/history bundles; capture commissioning outcomes per `pilot-data/expert/commissioning-and-build-profile.json`.
- [ ] Record provenance, assumptions, limitations, and approvals. Do not claim certification/field validation without completed V&V and safety case.