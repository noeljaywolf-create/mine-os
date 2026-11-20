# Generator Monitor Integration Checklist (Read-only)

Fill this on-site to make connection fast and repeatable.

## 1) Source details
- Site: __________________________  Date: __________  Contact: __________________
- Generator/asset ID(s): ______________________________________________________
- Monitor make/model: __________________________  Firmware/app (if known): ______
- Data interface available: [ ] HTTP/API  [ ] Modbus TCP  [ ] OPC UA  [ ] MQTT  [ ] Serial/RTU  [ ] CSV/export  [ ] Other: ______
- Endpoint/broker/IP: ____________________  Port: ______  Unit/Slave ID: ______
- Network/VPN required: ____________________  Read-only credentials/token: [ ] yes [ ] no (location: ______)

## 2) Tags / points to integrate
| Monitor tag/register | Meaning | sensorId (canonical) | unit | scale/notes | sample rate |
|---|---|---|---|---|---|
| | Active power | gen1_active_power_kw | kW | | |
| | Voltage | gen1_voltage_v | V | | |
| | Current | gen1_current_a | A | | |
| | Frequency | gen1_frequency_hz | Hz | | |
| | Fuel level | gen1_fuel_level_pct | % | | |
| | Running/state | gen1_running | state (0/1) | | |
| | Alarm/fault | gen1_alarm | state (0/1) | | |
| | Temperature | gen1_coolant_temp_c | degC | | |

## 3) Integration path chosen
- [ ] **A. Existing HTTP gateway** (matches contract) — Base URL: __________________  → Quick Connect
- [ ] **B. Simple gateway (manual/feed)** — `node scripts/simple-gateway.mjs 8080` + `gateway-simple.json` + `samples.json`
- [ ] **C. Protocol bridge needed** (Modbus/OPC UA/MQTT → HTTP contract) — owner: ______ ETA: ______
- [ ] **D. CSV replay** — files: __________________  mapping config: __________________

## 4) Validation (read-only)
- [ ] Values/units/scaling match monitor/HMI
- [ ] Timestamps/freshness reasonable, quality reported
- [ ] MINE OS shows live gateway/replay and sensor health as expected
- [ ] Exports (CSV/PDF) generated; copyright/disclaimer noted
- [ ] **No control writes** performed

## 5) MINE OS steps
1. Latest app/build, sign in/select **Electrical Engineer**
2. **Telemetry & Integrations** (`/app/telemetry`) → **Data sources**
3. Quick Connect URL / Load pilot bundle → **Test connection** → **Connect**
4. Toggle **Synthetic demo data** Off if showing live-only view
