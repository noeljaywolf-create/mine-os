# Integration Templates (Read-only)

Use these templates to connect generator/monitor data to MINE OS quickly. Copy a template, fill in the **TODO** fields, and use the matching method below.

## Choose a method
| Situation | Use | Files |
|---|---|---|
| Live demo or quick manual feed (HTTP gateway) | **Simple gateway** | `generator/gateway-simple.template.json`, `generator/samples.template.json` |
| Live on-site gateway already exposing HTTP API matching MINE OS contract | **Quick Connect** | (gateway base URL only) |
| Historian/CSV export available | **File/CSV replay** | `generator/site.config.template.json`, `generator/telemetry.template.csv` |

MINE OS Quick Connect expects a **base URL** serving: `GET /health`, `/catalog` (optional), **`GET /samples/latest`** → `{ "samples":[{ "sensorId"|"sourceTag", "epochMs", "value", "unit", "quality":0..1 }] }`.

## 1) Simple gateway (recommended for today)
1. Copy `generator/gateway-simple.template.json` and `generator/samples.template.json` to the project root (or any folder) as `gateway-simple.json` and `samples.json`.
2. Edit sensor IDs/tags/units/assets and current values to match the monitor.
3. Run: `node scripts/simple-gateway.mjs 8080 gateway-simple.json`
4. In MINE OS: **Electrical Engineer** → **Telemetry & Integrations** → **Data sources → Quick Connect** → `http://localhost:8080` (or `http://<your-ip>:8080`) → **Test connection** → **Connect**.
5. Update `samples.json` anytime; gateway re-reads on each request.

## 2) CSV replay (historian/export)
1. Copy `generator/site.config.template.json` and `generator/telemetry.template.csv`.
2. Map `sourceTag` (as in CSV) to canonical `sensorId`/`assetId`/`kind`/`unit`.
3. Load both files in **Telemetry & Integrations → File/CSV replay → Load pilot bundle**.

## 3) On-site checklist
- [ ] Monitor/gateway make, model, interface (HTTP API / Modbus TCP / OPC UA / MQTT / export)
- [ ] IP/URL, port, network/VPN access, read-only credentials/token (if any)
- [ ] Tag/register list and units: kW, kVA, V, A, Hz, PF, fuel, temperature, running/status, alarms
- [ ] Confirm values/units/scaling/freshness against monitor/HMI (unvalidated until checked)
- [ ] Read-only only (no control writes)

**Role/UI:** select **Electrical Engineer** → open **Telemetry & Integrations** (`/app/telemetry`). Toggle **Synthetic demo data** Off to show live/read-only feed without fake data.
