import type {
  AssetId,
  ElectricalFeeder,
  FeederId,
  FeederRuntimeState,
  MineLevel,
  Pump,
  PumpId,
  PumpRuntimeState,
  PumpMode,
  ScenarioOverride,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { pumpFlowAtHead } from '../domain/units';

/**
 * Plant model — power availability and pumping capability.
 *
 * The chain is explicit and ordered:
 *
 *   feeder status  ->  supply ratio  ->  pump power  ->  pump flow (m3/h)
 *
 * Every pump therefore depends on the electrical state of the feeder it is
 * connected to. Failing a feeder removes power from every pump on it, which
 * removes dewatering capacity, which raises sump levels. That chain is the
 * backbone of the cross-system behaviour in MINE OS.
 */

/** Nominal power factor used to convert kVA to kW for the overload check. */
const POWER_FACTOR = 0.9;

/** Supply ratio applied to a degraded feeder. */
const DEGRADED_SUPPLY_RATIO = 0.55;

export function feederSupplyRatio(feeder: ElectricalFeeder, status: FeederRuntimeState['status']): number {
  switch (status) {
    case 'energised':
      break;
    case 'degraded':
      return DEGRADED_SUPPLY_RATIO;
    case 'failed':
    case 'isolated':
    case 'maintenance':
      return 0;
  }
  const usableKw = feeder.capacityKva * POWER_FACTOR;
  if (feeder.connectedLoadKw <= 0) return 1;
  if (feeder.connectedLoadKw <= usableKw) return 1;
  return Math.max(0.25, usableKw / feeder.connectedLoadKw);
}

export function computeFeederStates(
  mine: MineDefinition,
  overrides: ScenarioOverride,
): Record<FeederId, FeederRuntimeState> {
  const result: Record<FeederId, FeederRuntimeState> = {};
  for (const feeder of mine.feeders) {
    const override = overrides.feederOverrides[feeder.id];
    const status = override?.status ?? feeder.status;
    const connectedLoadKw = mine.pumps
      .filter((pump) => pump.feederId === feeder.id && pump.mode !== 'maintenance')
      .reduce((sum, pump) => sum + pump.powerRequiredKw * pump.efficiency, 0);
    const supplyRatio = feederSupplyRatio(feeder, status);
    result[feeder.id] = {
      status,
      connectedLoadKw,
      capacityKva: feeder.capacityKva,
      supplyRatio,
      statusReason:
        status === 'failed'
          ? 'Feeder protection operated — no voltage available downstream.'
          : status === 'isolated'
            ? 'Feeder is isolated for switching or maintenance.'
            : status === 'maintenance'
              ? 'Feeder is out of service for planned work.'
              : status === 'degraded'
                ? 'Feeder energised at reduced capacity (e.g. partial cable fault).'
                : feeder.connectedLoadKw > feeder.capacityKva * POWER_FACTOR
                  ? 'Connected load exceeds usable feeder capacity.'
                  : 'Feeder energised and within capacity.',
    };
  }
  return result;
}

export function computePumpStates(
  mine: MineDefinition,
  overrides: ScenarioOverride,
  feederStates: Record<FeederId, FeederRuntimeState>,
): Record<PumpId, PumpRuntimeState> {
  const result: Record<PumpId, PumpRuntimeState> = {};

  for (const pump of mine.pumps) {
    const override = overrides.pumpOverrides[pump.id];
    const mode: PumpMode = override?.mode ?? pump.mode;
    const health = override?.health ?? pump.health;
    const efficiency = override?.efficiency ?? pump.efficiency;

    const feeder = mine.feeders.find((f) => f.id === pump.feederId);
    const feederState = feederStates[pump.feederId];
    const supplyRatio = feederState?.supplyRatio ?? 0;
    const powered = supplyRatio > 0 && mode !== 'maintenance';

    const ratedAtDuty = pumpFlowAtHead(pump.ratedFlowM3h, pump.ratedHeadM, pump.liftHeadM);
    const conditionFactor = Math.max(0, Math.min(1, health)) * Math.max(0.05, Math.min(1, efficiency));
    const availableFlowM3h = powered ? ratedAtDuty * conditionFactor * supplyRatio : 0;

    const running = mode === 'running';
    const flowM3h = running ? availableFlowM3h : 0;
    const powerKw = running ? pump.powerRequiredKw * (flowM3h / Math.max(1, pump.ratedFlowM3h)) : 0;

    let status: PumpRuntimeState['status'] = 'operational';
    let statusReason = 'Operating within design duty.';

    if (mode === 'maintenance') {
      status = 'offline';
      statusReason = 'Isolated for planned maintenance.';
    } else if (!powered) {
      status = 'blocked';
      statusReason = feeder
        ? `No usable power from ${feeder.name} (${feederState?.status ?? 'unknown'}).`
        : 'No usable power — feeder state unknown.';
    } else if (health < 0.65) {
      status = 'degraded';
      statusReason = `Asset health ${(health * 100).toFixed(0)}% — delivering ${(conditionFactor * 100).toFixed(
        0,
      )}% of design flow.`;
    } else if (mode === 'standby') {
      status = 'standby';
      statusReason = 'Available on standby; available flow is reserved capacity.';
    } else if (mode === 'stopped') {
      status = 'offline';
      statusReason = 'Deliberately stopped — not available for dispatch.';
    } else if (supplyRatio < 1) {
      status = 'degraded';
      statusReason = `Reduced supply from ${feeder?.name ?? 'feeder'} — ${(supplyRatio * 100).toFixed(0)}% of demand.`;
    }

    result[pump.id] = {
      mode,
      flowM3h,
      availableFlowM3h,
      powerKw,
      powered,
      unavailable: !powered,
      status,
      statusReason,
      dutyFactor: running && pump.ratedFlowM3h > 0 ? flowM3h / pump.ratedFlowM3h : 0,
    };
  }

  return result;
}

/** Total discharge currently being delivered from a sump (m3/h). */
export function sumpOutflowM3h(
  mine: MineDefinition,
  pumpStates: Record<PumpId, PumpRuntimeState>,
  sumpId: string,
): number {
  return mine.pumps
    .filter((pump) => pump.sumpId === sumpId)
    .reduce((sum, pump) => sum + (pumpStates[pump.id]?.flowM3h ?? 0), 0);
}

/** Discharge that a sump *could* deliver if every available standby pump were started (m3/h). */
export function sumpReserveCapabilityM3h(
  mine: MineDefinition,
  pumpStates: Record<PumpId, PumpRuntimeState>,
  sumpId: string,
): number {
  return mine.pumps
    .filter((pump) => pump.sumpId === sumpId)
    .reduce((sum, pump) => sum + (pumpStates[pump.id]?.availableFlowM3h ?? 0), 0);
}

/** Pumps that serve a sump, ordered so the first entry is the lead duty pump. */
export function pumpsForSump(mine: MineDefinition, sumpId: string): Pump[] {
  return mine.pumps.filter((pump) => pump.sumpId === sumpId);
}

/** Convenience: the level a sump belongs to. */
export function levelFor(mine: MineDefinition, levelId: string): MineLevel | undefined {
  return mine.levels.find((level) => level.id === levelId);
}

/** Convenience: asset id of a pump / feeder / sump / zone (used for graph lookups). */
export function assetIdForPump(pump: Pump): AssetId {
  return pump.id;
}
