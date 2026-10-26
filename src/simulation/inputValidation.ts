import type { ScenarioOverride } from '../domain/types';

export function validateEngineeringInputs(overrides: ScenarioOverride): void {
  for (const [key, value] of Object.entries(overrides.assumptions)) {
    if (!Number.isFinite(value) || value < 0 || (key === 'forecastHorizonHours' && value > 48) ||
      (key === 'timeStepSeconds' && (value < 1 || value > 300)) || (key === 'inflowUncertaintyPct' && value > 90))
      throw new Error(`Assumption ${key} is non-finite or outside the supported numerical bounds.`);
  }
  const e = overrides.engineering ?? {};
  const bounds: Array<[string, number | undefined, number, number]> = [
    ['capitalCostMultiplier', e.capitalCostMultiplier, 0, 10],
    ['hoistCapacityTph', e.hoistCapacityTph, 0, 1e6], ['oreBufferCapacityTonnes', e.oreBufferCapacityTonnes, 0, 1e9],
    ['storageScale', e.storageScale, 0.2, 5], ['dischargeScale', e.dischargeScale, 0.2, 3],
    ['backupCapacityKw', e.backupCapacityKw, 0, 1e6], ['productionLoadScale', e.productionLoadScale, 0, 1],
    ['plannedShiftHours', e.plannedShiftHours, 0, 24], ['shiftStartHour', e.shiftStartHour, 0, 23.999],
    ['requiredReservePumps', e.requiredReservePumps, 0, 6], ['maximumPumpSwitches', e.maximumPumpSwitches, 0, 6],
    ['restoreAtSec', e.restoreAtSec ?? undefined, 0, 1e9],
  ];
  for (const [name, value, lo, hi] of bounds) if (value !== undefined && (!Number.isFinite(value) || value < lo || value > hi))
    throw new Error(`${name} outside supported bounds [${lo}, ${hi}].`);
  for (const route of Object.values(e.materialRoutes ?? {})) if (route.capacityTph !== undefined && (!Number.isFinite(route.capacityTph) || route.capacityTph < 0))
    throw new Error('Material-route capacity must be finite nonnegative t/h.');
  for (const [id, pump] of Object.entries(overrides.pumpOverrides)) {
    for (const [name, value, lo, hi] of [ ['health', pump.health, 0, 1], ['efficiency', pump.efficiency, 0.01, 1],
      ['speedRatio', pump.speedRatio, 0, 1.2], ['curveScale', pump.curveScale, 0.01, 5], ['suctionK', pump.suctionK, 0, 1e4] ] as const)
      if (value !== undefined && (!Number.isFinite(value) || value < lo || value > hi)) throw new Error(`${id}.${name} outside supported bounds.`);
  }
  for (const s of Object.values(overrides.sumpOverrides)) {
    if (s.inflowMultiplier !== undefined && (!Number.isFinite(s.inflowMultiplier) || s.inflowMultiplier < 0))
      throw new Error('Inflow multiplier must be finite and nonnegative.');
    if (s.volumeM3 !== undefined && (!Number.isFinite(s.volumeM3) || s.volumeM3 < 0)) throw new Error('Initial storage volume must be finite and nonnegative.');
  }
  const pulse = e.inflowPulse;
  if (pulse && (![pulse.startSec, pulse.endSec, pulse.flowM3h].every(Number.isFinite) || pulse.startSec < 0 || pulse.endSec < pulse.startSec || pulse.flowM3h < 0))
    throw new Error('Inrush requires finite nonnegative flow and ordered start/end times.');
}
