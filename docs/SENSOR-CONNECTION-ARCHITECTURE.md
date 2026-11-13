# Sensor Connection Architecture (Pluggable, Core-Unchanged)

## Principle
**Connecting to different sensors, machines, IPs, APIs, or protocols must never require changes to core engine, domain, or hydraulic/water/production calculation modules.**

- **Stable core:** `src/simulation/*`, `src/domain/*` (contracts/types) define canonical state and physics/calculations.
- **Pluggable edges:** adapters, gateways, and **configuration** (mappings + connection profiles) translate site-specific sources into canonical samples.
- **Canonical seam:** `TelemetrySample { sensorId, epochMs, value, unit, quality }` and `WorldState.observations` (injection point). `TelemetryAdapter` is the integration interface (`src/domain/contracts.ts`).

## How connections work
1. **Source (site-specific):** sensors/machines exposed via OPC UA (`opc.tcp://ip:port`), Modbus TCP (ip:port), MQTT broker, REST/HTTP API, historian export, CSV, etc.
2. **Gateway/adapter (pluggable):** a read-only connector (often an on-site gateway service) polls/subscribes using a **connection profile** (config), authenticates via secret refs, and normalizes raw tags to canonical samples using **sensor mappings**.
3. **MINE OS core:** receives normalized samples, applies freshness/confidence/validation, and runs the same hydraulic, power, water-balance, and production calculations regardless of sensor brand/protocol.

## Configuration (no code changes per site)
- **`site.config.json`**: `site`, `sensors[]` mappings (sourceTag→sensorId/assetId/kind/unit/scale/provenance), optional `connections[]` profiles, optional `mine` overrides, `assumptions`.
- **Connection profiles (`src/integration/connections/types.ts`)**: `file`, `rest-api` (baseUrl/IP), `mqtt`, `opcua` (endpointUrl), `modbus-tcp` (host/port), `gateway` (gatewayUrl). Profiles are data; secrets referenced by id, not embedded.
- **Adapter registry (`src/integration/connections/registry.ts`)**: register adapter factories/plugins per type; add support without modifying engine.

## Browser + OT reality (important)
Browsers cannot safely/directly reach most OT endpoints (network isolation, TLS/certs, CORS, protocol support). **Recommended production pattern:**
- Deploy a **read-only on-site/edge gateway** that connects to machines by IP/protocol and exposes a secure HTTP(S)/SSE/WebSocket API to MINE OS with canonical samples.
- Frontend uses `gateway` or `rest-api` connection profile; core remains unchanged.

## Gateway contract (read-only)
A gateway implementing this contract can front any sensor source:

- `GET {gatewayUrl}/health` → `{ status: "ok|degraded|offline", timeMs, source, details? }`
- `GET {gatewayUrl}/catalog` → `{ sensors: [{ sensorId, sourceTag, assetId, kind, unit }], assets? }`
- `GET {gatewayUrl}/samples?from=<epochMs>&to=<epochMs>&ids=<csv>` or `GET {gatewayUrl}/samples/latest?ids=<csv>`
  → `{ samples: [{ sensorId, epochMs, value, unit, quality, sourceTag? }] }`
- Optional stream: `SSE {gatewayUrl}/stream` or `WS {gatewayUrl}/ws` emitting the same sample objects.

All responses must be **normalized** (canonical units/ids/quality 0..1, UTC epoch ms). Gateway enforces read-only access and secret management.

## How calculations use connected data (unchanged core)
- **Measured path:** observations override/drive sensor states (freshness/confidence from timestamp/quality).
- **Calculated path:** engine computes pump/system hydraulics (curves, Darcy–Weisbach/Haaland, power limits, station solve), feeder power allocation, and water balance `V_next = clamp(V + (Q_in−Q_out)Δt, 0, Vcap)` / levels & forecasts. Connected values can serve as inputs (e.g. actual status/flow/level) and for calibration/backtest; physics model remains the same code.

## Adding a new sensor/site/protocol
1. Create/update `site.config.json` (mappings + connection profile + mine overrides) — **no core code change**.
2. If protocol already supported by gateway/adapter: configure endpoint/IP/API and tags.
3. If new protocol: implement an **adapter plugin** or extend the **gateway**; register factory if in-app; core still unchanged.
4. Validate with replay/backtest and label provenance/confidence.
