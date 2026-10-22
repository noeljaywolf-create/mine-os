import type {
  ScenarioOverride,
  Sensor,
  SensorFreshness,
  SensorId,
  SensorState,
  WorldState,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';

/**
 * Instrumentation state.
 *
 * Freshness is a first-class modelled property. A stale sensor does not get
 * replaced by a confident guess: it lowers the confidence of every forecast
 * and diagnosis that depends on it, and that reduction is visible.
 */

export function computeSensorFreshness(
  sensor: Sensor,
  elapsedSec: number,
  overrides: ScenarioOverride,
): SensorState {
  const override = overrides.sensorOverrides[sensor.id];

  if (!sensor.commissioned || override?.offline) {
    return {
      freshness: 'unavailable',
      lastValue: null,
      ageSec: Infinity,
      confidence: 0,
      note: sensor.commissioned
        ? 'Tag marked offline in this scenario — no data is being received.'
        : 'Tag is configured but not commissioned; no data is being produced.',
    };
  }

  if (override?.stale) {
    const ageSec = elapsedSec;
    return {
      freshness: ageSec > sensor.stalenessThresholdSec * 3 ? 'expired' : 'stale',
      lastValue: null,
      ageSec,
      confidence: ageSec > sensor.stalenessThresholdSec * 3 ? 0.05 : 0.35,
      note: 'Reporting has stopped. The last known value is retained for reference only.',
    };
  }

  // Intermittent links deliver late: the effective sample period stretches as
  // link quality falls, which is what pushes a tag past its staleness window.
  const effectivePeriod = sensor.samplePeriodSec / Math.max(sensor.linkQuality, 0.05);
  const ageSec = effectivePeriod > 0 ? elapsedSec % effectivePeriod : 0;

  let freshness: SensorFreshness = 'live';
  if (ageSec > sensor.stalenessThresholdSec * 3) freshness = 'expired';
  else if (ageSec > sensor.stalenessThresholdSec) freshness = 'stale';

  const baseConfidence = Math.max(0, Math.min(1, sensor.linkQuality)) * (1 - sensor.accuracyPct / 200);
  const confidence =
    freshness === 'live'
      ? Math.min(1, baseConfidence)
      : freshness === 'stale'
        ? baseConfidence * 0.5
        : baseConfidence * 0.1;

  return {
    freshness,
    lastValue: null,
    ageSec,
    confidence,
    note:
      freshness === 'live'
        ? null
        : `Last valid sample ${Math.round(ageSec)} s ago (threshold ${sensor.stalenessThresholdSec} s).`,
  };
}

export function computeSensorStates(
  mine: MineDefinition,
  world: WorldState,
  overrides: ScenarioOverride,
): Record<SensorId, SensorState> {
  const result: Record<SensorId, SensorState> = {};
  for (const sensor of mine.sensors) {
    result[sensor.id] = computeSensorFreshness(sensor, world.clock.elapsedSec, overrides);
  }
  return result;
}

/**
 * Read the modelled value of a sensor from the canonical world state.
 *
 * These are not random walks: each tag reports the physical quantity that the
 * simulation is actually maintaining, so the charts agree with the panels.
 */
export function readSensorValue(
  mine: MineDefinition,
  world: WorldState,
  sensor: Sensor,
): number | null {
  const asset = mine.assets.find((a) => a.id === sensor.assetId);
  switch (sensor.kind) {
    case 'level': {
      const sump = mine.sumps.find((s) => s.id === sensor.assetId);
      if (sump) return world.sumps[sump.id]?.levelM ?? null;
      return null;
    }
    case 'flow': {
      const pump = mine.pumps.find((p) => p.id === sensor.assetId);
      if (pump) return world.pumps[pump.id]?.flowM3h ?? null;
      return null;
    }
    case 'power': {
      const feeder = mine.feeders.find((f) => f.id === sensor.assetId);
      if (feeder) {
        const state = world.feeders[feeder.id];
        return state ? state.connectedLoadKw * state.supplyRatio : null;
      }
      return null;
    }
    case 'pressure': {
      const sump = mine.sumps.find((s) => s.id === sensor.assetId);
      if (sump) {
        const state = world.sumps[sump.id];
        if (!state) return null;
        // Hydrostatic pressure of the water column above the sump floor.
        return (1000 * 9.81 * state.levelM) / 1000;
      }
      return null;
    }
    case 'vibration': {
      const pump = mine.pumps.find((p) => p.id === sensor.assetId);
      if (!pump) return null;
      const state = world.pumps[pump.id];
      const health = pump.health;
      const running = state?.mode === 'running';
      const base = running ? 2.4 : 0.4;
      return base + (1 - health) * 9.5 + (state?.dutyFactor ?? 0) * 0.8;
    }
    case 'temperature': {
      const pump = mine.pumps.find((p) => p.id === sensor.assetId);
      if (!pump) return null;
      const state = world.pumps[pump.id];
      const heat = state?.mode === 'running' ? 38 : 24;
      return heat + (1 - pump.health) * 26;
    }
    default:
      void asset;
      return null;
  }
}

/** Confidence-weighted average confidence of the sensors monitoring an asset. */
export function assetMonitoringConfidence(
  mine: MineDefinition,
  sensorStates: Record<SensorId, SensorState>,
  assetId: string,
): { confidence: number; sensors: SensorId[]; staleSensors: SensorId[] } {
  const sensors = mine.sensors.filter((s) => s.assetId === assetId);
  if (sensors.length === 0) return { confidence: 0.85, sensors: [], staleSensors: [] };
  const total = sensors.reduce((sum, s) => sum + (sensorStates[s.id]?.confidence ?? 0), 0);
  return {
    confidence: total / sensors.length,
    sensors: sensors.map((s) => s.id),
    staleSensors: sensors.filter((s) => sensorStates[s.id]?.freshness !== 'live').map((s) => s.id),
  };
}
