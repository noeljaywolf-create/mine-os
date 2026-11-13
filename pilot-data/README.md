# Pilot data (Phase B MVP)

This folder contains templates for loading **real/historical** site data into MINE OS.

## Bundle format
- `site.config.json` — site metadata, sensor/tag mappings, provenance, and (future) mine/config overrides.
- `telemetry.csv` — time-series samples.

### `telemetry.csv` columns
| column | required | description |
|---|---:|---|
| `timestamp` | yes | ISO8601 (e.g. `2026-10-22T06:00:00Z`) or epoch ms/seconds |
| `sensor_id` | yes | source tag id (mapped via `sensors[].sourceTag`) |
| `value` | yes | numeric value |
| `quality` | no | 0..1 (default 1) |
| `unit` | no | source unit; converted/validated against mapping |

## Sample
See `sample/` for a minimal template. Replace with site-specific mappings and exported historian/SCADA/CSV data.

## Integration code
- Schema/parser/adapter scaffold: `src/integration/pilot/`
- Roadmap: `docs/REAL-MVP-PHASE-B.md`

## Next wiring steps
1. Add UI/import flow to load a bundle (config + CSV).
2. Map config to a `MineDefinition`/scenario for the active run.
3. Drive replay from `PilotFileAdapter.getSamplesAt(...)` aligned to simulation clock.
4. Add backtest/evidence export comparing predicted vs observed.
