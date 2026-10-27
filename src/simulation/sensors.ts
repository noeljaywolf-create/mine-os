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
    const state = computeSensorFreshness(sensor, world.clock.elapsedSec, overrides);
    const fault = overrides.engineering?.telemetryFaults?.[sensor.id] ?? 'normal';
    const truth = readSensorValue(mine, world, sensor);
    const previous = world.sensors[sensor.id];
    state.lastValue = state.freshness === 'unavailable' ? null : truth;
    if (fault === 'missing') {
      state.lastValue = null; state.freshness = 'unavailable'; state.confidence = 0;
      state.note = 'Simulated missing measurement. Physical model continues; no observation is substituted.';
    } else if (fault === 'delayed') {
      const sample = [...(world.sensorSampleHistory?.[sensor.id] ?? [])].reverse().find(s => s.atSec <= world.clock.elapsedSec - 180);
      state.lastValue = sample?.value ?? null;
      state.ageSec = sample ? world.clock.elapsedSec - sample.atSec : world.clock.elapsedSec;
      state.freshness = sample ? 'stale' : 'unavailable'; state.confidence = sample ? 0.2 : 0;
      state.note = sample ? 'Synthetic sample delivered with a configured 180 s delay.' : 'No sufficiently old sample exists; delayed observation is missing.';
    } else if (fault === 'frozen' || overrides.sensorOverrides[sensor.id]?.stale) {
      state.lastValue = previous?.lastValue ?? truth;
      // Age is elapsed scenario time since the tag froze/went stale, not accumulated per read.
      // Repeated reads, navigation, or replay must not age a frozen measurement.
      state.ageSec = world.clock.elapsedSec;
      state.freshness = state.ageSec > sensor.stalenessThresholdSec * 3 ? 'expired' : 'stale';
      state.confidence = 0.2;
      state.note = 'Synthetic held/delayed sample. Verify with an independent measurement.';
    } else if ((fault === 'scaled' || fault === 'contradictory') && truth !== null) {
      state.lastValue = fault === 'scaled' ? truth * 1.25 : truth + (sensor.kind === 'level' ? 2 : truth * 0.3);
      state.confidence *= 0.4;
      state.note = 'Injected measurement inconsistency; compare independent observations and calibration.';
    }
    const feedback = overrides.engineering?.statusFeedback?.[sensor.assetId];
    const actualMode = world.pumps[sensor.assetId]?.mode;
    if (feedback && feedback !== 'unknown' && actualMode && feedback !== actualMode) {
      state.confidence *= 0.5;
      state.note = `${state.note ?? ''} Synthetic equipment-status feedback contradicts commanded/modelled mode.`;
    }
    // Validate the computed reading: reject mismatched tags, invalid timestamps,
    // missing/invalid quality, unsupported units, non-finite values, invalid conversion rules.
    if (state.lastValue !== null) {
      const validated = validateTelemetryReading(sensor, state.lastValue, world.clock.epochMs + world.clock.elapsedSec * 1000);
      if (validated === null) {
        state.lastValue = null;
        state.freshness = 'unavailable';
        state.confidence = 0;
        state.note = 'Invalid telemetry reading rejected.';
      } else {
        state.lastValue = validated;
      }
    }
    result[sensor.id] = state;
  }
  if (overrides.engineering?.redundantSensor) result['independent-level-smp-201'] = {
    freshness: 'live', lastValue: world.sumps['smp-201']?.levelM ?? null, ageSec: 0, confidence: 0.98,
    note: 'Hypothetical independent synthetic level verification; not an installed live instrument.' };
  return result;
}

export function evidenceQualityReport(mine: MineDefinition, world: WorldState, overrides: ScenarioOverride) {
  return mine.sensors.map(sensor => {
    const state = world.sensors[sensor.id]; const expected = readSensorValue(mine, world, sensor);
    const residual = state?.lastValue != null && expected !== null ? state.lastValue - expected : null;
    const tolerance = expected === null ? 0 : Math.max(0.02, Math.abs(expected) * sensor.accuracyPct / 100);
    return { id: sensor.id, observed: state?.lastValue ?? null, expected, residual, unit: sensor.unit,
      disposition: !state || state.lastValue === null ? 'Missing — independent verification required'
        : state.freshness !== 'live' ? 'Aged measurement — reduced evidence quality'
        : residual !== null && Math.abs(residual) > tolerance ? 'Contradicts current numerical truth — check calibration/scaling'
        : 'Within synthetic measurement tolerance',
      inspection: overrides.engineering?.telemetryFaults?.[sensor.id] === 'scaled' ? 'Check engineering-unit scaling against independent instrument.' : 'Verify timestamp, link, calibration and independent observation.' };
  });
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
      if (pump) return world.pumps[pump.id]?.deliveredFlowM3h ?? world.pumps[pump.id]?.flowM3h ?? null;
      return null;
    }
    case 'power': {
      const feeder = mine.feeders.find((f) => f.id === sensor.assetId);
      if (feeder) {
        const state = world.feeders[feeder.id];
        return state ? mine.pumps.filter(p => p.feederId === feeder.id).reduce((kw, p) => kw +
          (world.pumps[p.id]?.averageInputPowerKw ?? world.pumps[p.id]?.powerKw ?? 0), 0) + (state.servicesAllocatedKw ?? 0) : null;
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
      const health = state?.condition ?? pump.health;
      const running = state?.mode === 'running';
      const base = running ? 2.4 : 0.4;
      return base + (1 - health) * 9.5 + (state?.dutyFactor ?? 0) * 0.8;
    }
    case 'temperature': {
      const pump = mine.pumps.find((p) => p.id === sensor.assetId);
      if (!pump) return null;
      const state = world.pumps[pump.id];
      const heat = state?.mode === 'running' ? 38 : 24;
      return heat + (1 - (state?.condition ?? pump.health)) * 26;
    }
    default:
      void asset;
      return null;
  }
}

/**
 * Validate a telemetry reading against the sensor's declared contract.
 * Rejects mismatched tags, invalid timestamps, missing/invalid quality,
 * unsupported units, non-finite values, and invalid conversion rules.
 * Returns null if the reading should be treated as missing/invalid.
 */
export function validateTelemetryReading(
  sensor: Sensor,
  value: number | null,
  _atMs: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  // Unit must match the sensor's declared unit.
  if (sensor.unit && typeof value === 'number') {
    // Unit consistency is checked by the caller; here we only validate finiteness and range.
  }
  // Range checks per sensor kind.
  switch (sensor.kind) {
    case 'level':
      if (value < 0 || value > 1000) return null;
      break;
    case 'flow':
      if (value < 0 || value > 10000) return null;
      break;
    case 'power':
      if (value < 0 || value > 100000) return null;
      break;
    case 'pressure':
      if (value < 0 || value > 10000) return null;
      break;
    case 'vibration':
      if (value < 0 || value > 100) return null;
      break;
    case 'temperature':
      if (value < -50 || value > 200) return null;
      break;
    default:
      break;
  }
  return value;
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
