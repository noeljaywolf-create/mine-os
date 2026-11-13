# Pilot Data Request (Read-Only) — Template

**To:** <Site/Partner contact>  
**Subject:** Request for read-only historical data export for dewatering/power/production risk pilot (MINE OS)

Hi <Name>,

We’re running a **read-only** pilot analysis to evaluate a unified dewatering–power–production risk view (no control commands, no writes to plant systems). To do this, we’d like a historical data export and basic asset information. We can work under an NDA and share results back as a pilot report.

## 1) Time window & format
- **Period:** <start> to <end> (ideally 1–4 weeks; include at least one upset/event if available)
- **Timezone:** <site TZ or UTC>
- **Format:** CSV (preferred) or historian export. Columns: `timestamp, tag, value` (+ `unit`, `quality` if available)

## 2) Signals/tags (as available)
| Category | Examples | Unit (if known) | Tag/point name |
|---|---|---|---|
| Sump levels | S-101/S-201/S-202/S-301 levels | m, %, mm | |
| Pump telemetry | discharge flow, run status, power, speed | m³/h, on/off, kW, Hz | |
| Electrical | feeder status, load/power | on/off/trip, kW/kVA | |
| Pressures/other | discharge/suction pressure, vibration/temp | kPa/bar, mm/s, °C | |
| Events (optional) | trips, failures, maintenance, setpoint changes | text/code + time | |

## 3) Asset & site context (estimates OK, note provenance)
- Sumps: capacity/area/depth or dimensions, floor/protected elevations, thresholds.
- Pumps: rated flow/head/power, associated sump and feeder, duty/standby.
- Feeders: voltage/capacity, supplied loads.
- Topology: which pumps drain which sumps, discharge routing, dependencies if known.

## 4) Access & security (read-only)
- Preferred: **historian/CSV export** or read-only API/report. No VPN/credential sharing required for export-only.
- If live read-only later: endpoint/IP & protocol (OPC UA/Modbus/MQTT/REST), tag list, and a read-only account/cert (handled via approved gateway/secrets).

## 5) Outputs we can provide
- Replay/backtest against your data, risk/cascade insights, scenario what-ifs, and an evidence report (with assumptions/confidence/limitations).

Thanks,  
<Name / Org / Contact>
