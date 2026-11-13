# Connecting to Sensors (Extraordinary Easy, Core Unchanged)

## Goal
Connect **any** sensors/machines by IP/API/protocol **without changing core engine code**. Different sites = different config only.

## Fastest path (recommended): On-site read-only gateway
1. Run a small gateway service near the plant network (or on a machine that can reach devices).
2. Gateway connects to field sources:
   - **IP/protocol:** OPC UA (`opc.tcp://...`), Modbus TCP (host:502), MQTT broker, REST APIs, PLC/historian.
3. Gateway exposes a **read-only HTTP API** (contract below) to MINE OS.
4. In MINE OS **Telemetry → Data sources → Quick Connect**: paste gateway URL (e.g. `http://192.168.1.50:8080`), click **Test connection**, then **Connect**. Core calculations remain unchanged.

### Gateway contract (minimum)
- `GET /health` → `{ "status": "ok|degraded|offline" }` (optional but helpful)
- `GET /catalog` → `{ "sensors": [{ "sensorId"|"id", "sourceTag"?, "assetId"?, "kind", "unit", "stalenessThresholdSec"? }] }` (optional; auto-mapping)
- `GET /samples/latest` → `{ "samples": [{ "sensorId"|"sourceTag", "epochMs", "value", "unit", "quality" (0..1) }] }` (required for live)
- Optional: `GET /samples/latest?ids=id1,id2`

All timestamps UTC epoch ms, values in declared units (or convert in gateway). **Read-only only.**

## Alternative: CSV/historian export (no live connection)
- Export `timestamp, sensor_tag, value, unit, quality` to CSV + create `site.config.json` (mappings).
- Telemetry → load file bundle. Good for pilots/validation.

## Configure (no core code changes)
- Edit `pilot-data/<site>/site.config.json` (or upload via UI):
  - `sensors[]`: map `sourceTag` → canonical `sensorId`, `assetId`, `kind`, `unit`, `scale`, provenance.
  - `connections[]`: document intended profiles (gateway/rest/mqtt/opcua/modbus) for your team/gateway config.
  - `mine` overrides: site geometry/ratings if needed.
- Secrets (tokens/certs): store in gateway/secret manager, never in the frontend bundle.

## Troubleshooting (quick)
- **Cannot reach gateway**: verify URL, port, firewall/VPN, CORS headers on gateway, use `http://` for local/IP testing if HTTPS not set up.
- **No data shown**: check `/samples/latest` returns `samples` array, `sensorId`/`sourceTag` matches mappings, timestamps/quality valid.
- **Wrong values**: fix units/scaling in mappings or convert in gateway; core math stays the same.
- **Different protocol (OPC UA/Modbus/MQTT)**: implement in gateway; browser always connects to gateway URL.

## Core principle
The calculation engine (`src/simulation/*`, `src/domain/*`) is stable. Every site/sensor/protocol difference lives in **gateway + config + adapter plugins**.
