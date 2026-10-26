import type { MineDefinition } from '../domain/mine';
import type { PumpRuntimeState, ScenarioOverride, Sump, SumpRuntimeState } from '../domain/types';
import type { WaterLedger } from '../domain/engineering';
import { computeSumpState, integrateWater } from './water';
import { sumpOutflowM3h } from './plant';

export function effectiveSump(sump: Sump, overrides: ScenarioOverride): Sump {
  const scale = overrides.engineering?.storageScale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Storage scale must be positive.');
  return { ...sump, capacityM3: sump.capacityM3 * scale, areaM2: sump.areaM2 * scale,
    stageStorage: sump.stageStorage?.map(p => ({ ...p, volumeM3: p.volumeM3 * scale })) };
}
/** Explicit simultaneous transfers: receiver inflow appears once; it cannot be re-pumped this step. */
export function integrateNetwork(mine: MineDefinition, overrides: ScenarioOverride,
  previous: Record<string, SumpRuntimeState>, pumps: Record<string, PumpRuntimeState>,
  external: Record<string, number>, dtSec: number) {
  if (!(dtSec > 0) || !Number.isFinite(dtSec)) throw new Error('Network timestep must be finite and positive.');
  const ledger: WaterLedger = { durationSec: dtSec, initialM3: 0, finalM3: 0, externalInM3: 0, externalOutM3: 0,
    overflowM3: 0, residualM3: 0, transfers: [] };
  const withdrawals: Record<string, number> = {};
  const incoming: Record<string, number> = {};
  for (const s of mine.sumps) {
    const volume = previous[s.id].volumeM3;
    ledger.initialM3 += volume;
    const inflow = external[s.id] ?? 0;
    const actual = Math.min(sumpOutflowM3h(mine, pumps, s.id) * dtSec / 3600, volume + inflow * dtSec / 3600);
    withdrawals[s.id] = actual;
    const to = overrides.engineering?.pipes?.[s.id]?.destinationSumpId;
    if (to && to !== s.id && mine.sumps.some(sump => sump.id === to)) {
      incoming[to] = (incoming[to] ?? 0) + actual;
      ledger.transfers.push({ from: s.id, to, volumeM3: actual });
    } else if (to) throw new Error('Unknown or self-referencing hydraulic destination.');
    else ledger.externalOutM3 += actual;
  }
  const sumps: Record<string, SumpRuntimeState> = {};
  for (const definition of mine.sumps) {
    const s = effectiveSump(definition, overrides);
    const ext = external[s.id] ?? 0;
    const inflow = ext + (incoming[s.id] ?? 0) * 3600 / dtSec;
    const outflow = withdrawals[s.id] * 3600 / dtSec;
    // Storage investment changes can lower the ceiling; displaced water is explicitly overflow.
    const displaced = Math.max(0, previous[s.id].volumeM3 - s.capacityM3);
    const step = integrateWater({ volumeM3: Math.min(previous[s.id].volumeM3, s.capacityM3),
      inflowM3h: inflow, outflowM3h: outflow, dtSec, capacityM3: s.capacityM3 });
    sumps[s.id] = computeSumpState(s, step.volumeM3, inflow, outflow);
    ledger.externalInM3 += ext * dtSec / 3600;
    ledger.overflowM3 += step.overflowM3 + displaced;
    ledger.finalM3 += step.volumeM3;
  }
  ledger.residualM3 = ledger.initialM3 + ledger.externalInM3 - ledger.externalOutM3 - ledger.overflowM3 - ledger.finalM3;
  return { sumps, ledger, withdrawals };
}
