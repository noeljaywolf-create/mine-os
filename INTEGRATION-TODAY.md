# Integration Today (Read-only, simple)

Goal: get generator/monitor data into MINE OS **read-only** as fast as possible.

## Fastest guaranteed demo path (works even if monitor details unknown)
1. Start app: `npm run dev` (or use latest published build) and open **Telemetry & Integrations** (`/app/telemetry`).
2. Sign in/select role **Electrical Engineer** (integration access).
3. Start simple gateway (new terminal):
   ```powershell
   cd "C:\Users\hp\Documents\Default Project\mine-os"
   node scripts/simple-gateway.mjs 8080
   ```
4. In **Data sources → Quick Connect**: URL `http://localhost:8080` → **Test connection** → **Connect**.
5. (Optional) Toggle **Synthetic demo data** Off to show live/read-only feed without fake data.
6. Show live values, health/freshness, analytics, and export **CSV/PDF**.

Fallback if gateway setup fails: **File/CSV replay** with `pilot-data/sample/site.config.json` + `pilot-data/sample/telemetry.csv`.

## Connect to a real generator monitor (on-site)
MINE OS connects to a **read-only HTTP gateway URL** (not directly to Modbus/OPC UA). The gateway must serve:
- `GET /health` (optional), `GET /catalog` (optional)
- **`GET /samples/latest`** → `{ "samples": [ { "sensorId"|"sourceTag", "epochMs", "value", "unit", "quality": 0..1 } ] }`

### Option A — Monitor/gateway already has HTTP API
- Point a small proxy/gateway to translate its response to the contract above, or if it already matches, connect directly with its base URL.

### Option B — Monitor speaks Modbus TCP / OPC UA / MQTT / serial
- Run a bridge on a machine that can reach the monitor, read the protocol, map tags/units, and expose `/health,/catalog,/samples/latest`.
- If time is tight and no bridge exists: use the **simple-gateway demo path** for buyers and explain "swap URL to on-site gateway once bridged".

### Option C — Manual/quick feed (today)
- Edit `gateway-simple.json` (sensor IDs/tags/units) and `samples.json` (current values) while `node scripts/simple-gateway.mjs 8080` runs. The gateway re-reads on each request.
- Connect MINE OS to `http://<your-pc-ip>:8080` (same network) or `http://localhost:8080`.

## Quick checks
- **Electrical Engineer** role → Telemetry visible. **Latest build** / hard refresh.
- URL is base gateway (e.g. `http://192.168.1.50:8080`), correct http/https, reachable, CORS allowed.
- "Did not respond to /health, /catalog, or /samples/latest" = gateway not running, wrong URL/port, unreachable, or contract mismatch. Test endpoints in a browser.
- Read-only only: no plant control. Validate units/mappings/freshness against the real monitor.
