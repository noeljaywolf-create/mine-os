# MINE OS

Operational intelligence for underground mining — a demonstration build with a deterministic synthetic mine simulation.

**Live demo:** https://noeljaywolf-create.github.io/mine-os/

MINE OS connects dewatering, power and production into one operating picture. Two products share a single engine:

- **DeepWater Intelligence** — sump water balance, level forecasts, pumping capability and uncertainty.
- **Mine Impact Intelligence** — zone availability, tonnes lost, energy cost and recovery exposure.

Every module reads the same canonical state. Trip a feeder in the Digital Twin and the consequence appears in the sump forecast, the production table, the incident record and the decision ledger.

## Demonstration boundaries

This is a demonstration, not a deployment:

- The Kestrel Ridge site is fictional. Geometry and nameplate values are synthetic.
- There is no PLC, SCADA, historian or CMMS connection.
- The platform never commands plant equipment. Interventions are scenario inputs.
- Forecasts are deterministic model output and require engineering validation.
- Role switching demonstrates permission boundaries; it is **not** authentication.
- No functional-safety, cyber or regulatory certification is claimed.
- State is in memory only. Refreshing the page resets the simulation.

## 5-minute walkthrough

1. Open **Mission Control** to see the shared operating picture.
2. Go to **Digital Twin**, select `F-02 Central 11 kV Feeder`, and set it to `failed`.
3. Open **DeepWater Intelligence** — pump capability and sump forecasts have changed.
4. Open **Mine Impact** — zone throughput and value exposure have moved with it.
5. Open **Incident Command** — the correlated incident carries evidence and competing hypotheses.
6. Open **Scenario Lab** — branch the scenario, change an assumption, compare against baseline, then replay the run.
7. Open **Decision Ledger** — record the intervention with its alternatives and evidence.
8. Open **Governance & Safety** — inspect the permission matrix and stated limits.

Keyboard: `Space` runs or pauses the simulation, `Escape` closes overlays.

## Stack

React 18 · TypeScript 5.7 · Vite 5 · Tailwind 3 · Zustand 5 · React Router 6 · ECharts 5 · `@xyflow/react` 12 · Framer Motion 11 · Vitest · Playwright

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build:pages  # production build + SPA fallback for static hosts
npm run preview
```

`npm run build:pages` writes `dist/`, copies `dist/index.html` to `dist/404.html` and adds `.nojekyll` for GitHub Pages. The committed `docs/` folder is the published build.

## Verification

```bash
npm run typecheck    # strict TS, no unused locals
npm run build
npm run test         # Vitest (where tests are present)
npm run test:e2e     # Playwright
```

## License

Demonstration code. No production warranty or operational fitness is implied.
