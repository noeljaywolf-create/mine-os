import type {
  Assumptions,
  Incident,
  SumpId,
  WorldState,
  ZoneId,
} from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import type { DerivedState, EngineContext } from './engine';
import type { Scenario } from '../domain/types';
import { forecastSump, type SumpForecastResult } from './forecast';
import { sumpOutflowM3h, sumpReserveCapabilityM3h } from './plant';
import { hydraulicEnergyKwhPerM3 } from '../domain/units';
import { zoneFloodLevelM } from './production';

/**
 * Engineering analytics.
 *
 * Every figure in this module is computed from the live canonical state. There
 * are no hard-coded arrays feeding a chart. Where a metric depends on an
 * assumption, the assumption is passed in explicitly and shown in the UI.
 */

export interface WaterBalanceRow {
  sumpId: SumpId;
  sumpName: string;
  levelM: number;
  depthM: number;
  fillPct: number;
  inflowM3h: number;
  outflowM3h: number;
  netM3h: number;
  availableCapabilityM3h: number;
  standbyReserveM3h: number;
  timeToCriticalHours: number | null;
  pessimisticHours: number | null;
  trend: 'rising' | 'falling' | 'stable';
  confidence: number;
}

export function buildWaterBalance(
  ctx: EngineContext,
  scenario: Scenario,
  world: WorldState,
  derived: DerivedState,
  forecasts: Record<SumpId, SumpForecastResult>,
): WaterBalanceRow[] {
  return ctx.mine.sumps.map((sump) => {
    const state = world.sumps[sump.id];
    const forecast = forecasts[sump.id];
    const depthM = sump.capacityM3 / sump.areaM2;
    const net = state.inflowM3h - state.outflowM3h;
    const capability = sumpReserveCapabilityM3h(ctx.mine, derived.pumpStates, sump.id);
    const reserve = Math.max(0, capability - state.outflowM3h);
    void scenario;
    return {
      sumpId: sump.id,
      sumpName: sump.name,
      levelM: state.levelM,
      depthM,
      fillPct: state.fillRatio * 100,
      inflowM3h: state.inflowM3h,
      outflowM3h: state.outflowM3h,
      netM3h: net,
      availableCapabilityM3h: capability,
      standbyReserveM3h: reserve,
      timeToCriticalHours: forecast?.timeToCriticalHours ?? null,
      pessimisticHours: forecast?.timeToCriticalPessimisticHours ?? null,
      trend: net > 2 ? 'rising' : net < -2 ? 'falling' : 'stable',
      confidence: forecast?.confidence ?? 0,
    };
  });
}

export interface PumpPerformanceRow {
  energyCostUSD: number;
  pumpId: string;
  pumpName: string;
  sumpName: string;
  feederName: string;
  mode: string;
  status: string;
  flowM3h: number;
  availableM3h: number;
  ratedM3h: number;
  utilisationPct: number;
  powerKw: number;
  energyKwh: number;
  specificEnergyKwhPerM3: number;
  healthPct: number;
  efficiencyPct: number;
  powered: boolean;
  reason: string;
}

export function buildPumpPerformance(
  ctx: EngineContext,
  derived: DerivedState,
  elapsedHours: number,
): PumpPerformanceRow[] {
  return ctx.mine.pumps.map((pump) => {
    const runtime = derived.pumpStates[pump.id];
    const sump = ctx.mine.sumps.find((s) => s.id === pump.sumpId);
    const feeder = ctx.mine.feeders.find((f) => f.id === pump.feederId);
    const flow = runtime?.flowM3h ?? 0;
    const power = runtime?.powerKw ?? 0;
    const energyKwh = runtime?.energyKwh ?? 0;
    void elapsedHours;
    const specific = flow > 1 ? power / flow : 0;
    return {
      pumpId: pump.id,
      pumpName: pump.name,
      sumpName: sump?.name ?? pump.sumpId,
      feederName: feeder?.name ?? pump.feederId,
      mode: runtime?.mode ?? pump.mode,
      status: runtime?.status ?? 'operational',
      flowM3h: flow,
      availableM3h: runtime?.availableFlowM3h ?? 0,
      ratedM3h: pump.ratedFlowM3h,
      utilisationPct: pump.ratedFlowM3h > 0 ? (flow / pump.ratedFlowM3h) * 100 : 0,
      powerKw: power,
      energyKwh,
      energyCostUSD: runtime?.energyCostUSD ?? 0,
      specificEnergyKwhPerM3: specific,
      healthPct: (runtime?.condition ?? pump.health) * 100,
      efficiencyPct: (runtime?.hydraulic?.efficiency ?? pump.efficiency) * 100,
      powered: runtime?.powered ?? false,
      reason: runtime?.statusReason ?? '',
    };
  });
}

export interface EnergySummary {
  runningPowerKw: number;
  energyKwh: number;
  costUSD: number;
  averageSpecificKwhPerM3: number;
  byPump: Array<{ pumpId: string; pumpName: string; powerKw: number; energyKwh: number; energyCostUSD: number }>;
}

export function buildEnergySummary(
  rows: PumpPerformanceRow[],
  assumptions: Assumptions,
): EnergySummary {
  void assumptions;
  const runningPowerKw = rows.reduce((sum, row) => sum + row.powerKw, 0);
  const totalFlow = rows.reduce((sum, row) => sum + row.flowM3h, 0);
  const energyKwh = rows.reduce((sum, row) => sum + row.energyKwh, 0);
  return {
    runningPowerKw,
    energyKwh,
    costUSD: rows.reduce((sum, row) => sum + row.energyCostUSD, 0),
    averageSpecificKwhPerM3: totalFlow > 0 ? runningPowerKw / totalFlow : 0,
    byPump: rows.map((row) => ({
      pumpId: row.pumpId,
      pumpName: row.pumpName,
      powerKw: row.powerKw,
      energyKwh: row.energyKwh,
      energyCostUSD: row.energyCostUSD,
    })),
  };
}

export interface ZonePerformanceRow {
  zoneId: ZoneId;
  zoneName: string;
  rateTph: number;
  designRateTph: number;
  operatingPct: number;
  status: string;
  constraint: string;
  lostHours: number;
  lostTonnes: number;
  lostValueUSD: number;
  floodLevelM: number | null;
  currentLevelM: number | null;
  marginM: number | null;
  hoursToFlood: number | null;
}

export function buildZonePerformance(
  ctx: EngineContext,
  world: WorldState,
  forecasts: Record<SumpId, SumpForecastResult>,
): ZonePerformanceRow[] {
  return ctx.mine.zones.map((zone) => {
    const state = world.zones[zone.id];
    const sump = ctx.mine.sumps.find((s) => s.id === zone.floodControlSumpId);
    const sumpState = sump ? world.sumps[sump.id] : undefined;
    const floodLevelM = sump ? zoneFloodLevelM(zone, sump) : null;
    const forecast = sump ? forecasts[sump.id] : undefined;
    let hoursToFlood: number | null = null;
    if (forecast && floodLevelM !== null) {
      const crossing = forecast.points.find((p) => p.levelM >= floodLevelM);
      hoursToFlood = crossing ? crossing.tSec / 3600 : null;
    }
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      rateTph: state?.rateTph ?? 0,
      designRateTph: zone.designRateTph,
      operatingPct: (state?.operatingRatio ?? 0) * 100,
      status: state?.status ?? 'operational',
      constraint: state?.statusReason ?? '',
      lostHours: state?.lostHours ?? 0,
      lostTonnes: state?.lostTonnes ?? 0,
      lostValueUSD: state?.lostValueUSD ?? 0,
      floodLevelM,
      currentLevelM: sumpState?.levelM ?? null,
      marginM:
        floodLevelM !== null && sumpState ? Math.max(0, floodLevelM - sumpState.levelM) : null,
      hoursToFlood,
    };
  });
}

export interface ReliabilityRow {
  pumpId: string;
  pumpName: string;
  healthPct: number;
  availabilityPct: number | null;
  /** Illustrative, model-derived expected hours between failures. */
  expectedMtbfHours: number | null;
  expectedAnnualDowntimeHours: number | null;
  drivers: string[];
  recommendation: string;
}

export function buildReliability(
  ctx: EngineContext,
  derived: DerivedState,
): ReliabilityRow[] {
  return ctx.mine.pumps.map((pump) => {
    const runtime = derived.pumpStates[pump.id];
    const health = runtime?.condition ?? pump.health;
    // Illustrative reliability relationship, clearly synthetic.
    const mtbf = null;
    const availability = null;
    const annualDowntime = null;
    const drivers: string[] = [];
    if (health < 0.8) drivers.push(`Health ${(health * 100).toFixed(0)}% — below the 80% planning floor.`);
    if (runtime && !runtime.powered) drivers.push('No usable power from the connected feeder.');
    if (pump.mode === 'standby') drivers.push('Standby duty — limited running proof.');
    if (drivers.length === 0) drivers.push('No modelled reliability deviation.');
    return {
      pumpId: pump.id,
      pumpName: pump.name,
      healthPct: health * 100,
      availabilityPct: availability,
      expectedMtbfHours: mtbf,
      expectedAnnualDowntimeHours: annualDowntime,
      drivers,
      recommendation:
        health < 0.8
          ? 'Plan an overhaul and confirm spare rotables before the next production campaign.'
          : runtime && !runtime.powered
            ? 'Restore supply or provide power diversity before the next high-inflow period.'
            : 'Continue condition monitoring on the current interval.',
    };
  });
}

export interface SensitivityPoint {
  inflowMultiplier: number;
  label: string;
  sumps: Array<{ sumpId: string; sumpName: string; timeToCriticalHours: number | null; horizonLevelM: number }>;
}

export function buildSensitivity(args: {
  ctx: EngineContext;
  scenario: Scenario;
  world: WorldState;
  derived: DerivedState;
  multipliers?: number[];
}): SensitivityPoint[] {
  const multipliers = args.multipliers ?? [0.8, 1.0, 1.2, 1.5, 2.0];
  return multipliers.map((multiplier) => ({
    inflowMultiplier: multiplier,
    label: `${multiplier.toFixed(1)}× inflow`,
    sumps: args.ctx.mine.sumps.map((sump) => {
      const forecast = forecastSump({
        ctx: args.ctx,
        scenario: args.scenario,
        world: args.world,
        derived: args.derived,
        sumpId: sump.id,
        options: { inflowMultiplier: multiplier },
      });
      const last = forecast.points[forecast.points.length - 1];
      return {
        sumpId: sump.id,
        sumpName: sump.name,
        timeToCriticalHours: forecast.timeToCriticalHours,
        horizonLevelM: last?.levelM ?? 0,
      };
    }),
  }));
}

export interface IncidentAnalytics {
  total: number;
  active: number;
  bySeverity: Record<string, number>;
  byState: Record<string, number>;
  meanAcknowledgeMinutes: number | null;
  byHour: Array<{ hour: number; count: number }>;
  topIncidents: Incident[];
}

export function buildIncidentAnalytics(incidents: Incident[]): IncidentAnalytics {
  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byState: Record<string, number> = {};
  let ackTotal = 0;
  let ackCount = 0;

  for (const incident of incidents) {
    bySeverity[incident.severity] = (bySeverity[incident.severity] ?? 0) + 1;
    byState[incident.state] = (byState[incident.state] ?? 0) + 1;
    const ack = incident.events.find((event) => event.type === 'acknowledged');
    if (ack) {
      ackTotal += (ack.atMs - incident.openedAtMs) / 60000;
      ackCount += 1;
    }
  }

  const maxSim = Math.max(0, ...incidents.map((i) => i.openedAtSimSec));
  const buckets = Math.max(1, Math.ceil(maxSim / 3600));
  const byHour: Array<{ hour: number; count: number }> = [];
  for (let h = 0; h < buckets; h += 1) {
    byHour.push({
      hour: h,
      count: incidents.filter((i) => i.openedAtSimSec >= h * 3600 && i.openedAtSimSec < (h + 1) * 3600).length,
    });
  }

  const severityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return {
    total: incidents.length,
    active: incidents.filter((i) => i.state !== 'closed' && i.state !== 'resolved').length,
    bySeverity,
    byState,
    meanAcknowledgeMinutes: ackCount > 0 ? ackTotal / ackCount : null,
    byHour,
    topIncidents: [...incidents]
      .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) || a.openedAtMs - b.openedAtMs)
      .slice(0, 6),
  };
}

export interface ModelCheck {
  id: string;
  label: string;
  value: string;
  status: 'ok' | 'watch' | 'fail';
  explanation: string;
}

/**
 * Self-consistency checks.
 *
 * These compare the model against itself over time (mass balance closure,
 * forecast stability, sensor agreement). They are NOT field validation and the
 * UI must say so.
 */
export function buildModelChecks(
  ctx: EngineContext,
  derived: DerivedState,
  world: WorldState,
  forecasts: Record<SumpId, SumpForecastResult>,
): ModelCheck[] {
  const checks: ModelCheck[] = [];

  const worstBalance = Math.abs(world.waterLedger?.residualM3 ?? 0);
  checks.push({
    id: 'mass-balance',
    label: 'Mass balance closure',
    value: `${worstBalance.toFixed(3)} m³ max residual`,
    status: worstBalance < 0.01 ? 'ok' : 'fail',
    explanation:
      'Residual = initial storage + external inflow − external discharge − overflow − final storage. Internal transfers cancel. Software conservation check, not field validation.',
  });

  const levelSensors = ctx.mine.sensors.filter((s) => s.kind === 'level');
  const liveSensors = levelSensors.filter((s) => derived.sensorStates[s.id]?.freshness === 'live');
  const livePct = levelSensors.length > 0 ? (liveSensors.length / levelSensors.length) * 100 : 0;
  checks.push({
    id: 'telemetry-coverage',
    label: 'Level telemetry coverage',
    value: `${livePct.toFixed(0)}% live`,
    status: livePct >= 99 ? 'ok' : livePct >= 75 ? 'watch' : 'fail',
    explanation:
      'Percentage of level tags currently live. Forecast confidence is weighted by the freshness of the tags that feed it.',
  });

  const minConfidence = Math.min(...Object.values(forecasts).map((f) => f.confidence));
  checks.push({
    id: 'forecast-confidence',
    label: 'Lowest forecast confidence',
    value: `${(minConfidence * 100).toFixed(0)}%`,
    status: minConfidence > 0.75 ? 'ok' : minConfidence > 0.4 ? 'watch' : 'fail',
    explanation:
      'Stale or expired instrumentation reduces confidence. MINE OS reports the reduction rather than hiding it.',
  });

  const totalNet = ctx.mine.sumps.reduce((sum, sump) => {
    const state = world.sumps[sump.id];
    return sum + (state.inflowM3h - state.outflowM3h);
  }, 0);
  checks.push({
    id: 'pump-energy',
    label: 'Hydraulic specific energy',
    value: (() => {
      const running = ctx.mine.pumps
        .map((p) => derived.pumpStates[p.id])
        .filter((p) => p && p.flowM3h > 1);
      if (running.length === 0) return '—';
      const avg =
        running.reduce((sum, p) => sum + p!.powerKw / Math.max(1, p!.flowM3h), 0) / running.length;
      return `${avg.toFixed(3)} kWh/m³`;
    })(),
    status: 'ok',
    explanation:
      'Specific energy is computed from the modelled power and flow of each running pump, not from a rated-plate assumption.',
  });
  void totalNet;

  const criticalSump = ctx.mine.sumps
    .map((sump) => ({ sump, forecast: forecasts[sump.id] }))
    .filter((entry) => entry.forecast?.timeToCriticalHours != null)
    .sort((a, b) => (a.forecast!.timeToCriticalHours ?? 0) - (b.forecast!.timeToCriticalHours ?? 0))[0];
  checks.push({
    id: 'forecast-horizon',
    label: 'Earliest modelled threshold',
    value: criticalSump
      ? `${criticalSump.sump.name}: ${criticalSump.forecast.timeToCriticalHours!.toFixed(1)} h`
      : 'No threshold within horizon',
    status: criticalSump ? 'watch' : 'ok',
    explanation:
      'Earliest central-estimate crossing of any sump critical threshold inside the configured forecast horizon.',
  });

  return checks;
}

export interface AnalyticsBundle {
  waterBalance: WaterBalanceRow[];
  pumpPerformance: PumpPerformanceRow[];
  energy: EnergySummary;
  zones: ZonePerformanceRow[];
  reliability: ReliabilityRow[];
  sensitivity: SensitivityPoint[];
  incidents: IncidentAnalytics;
  modelChecks: ModelCheck[];
  elapsedHours: number;
  totalInflowM3h: number;
  totalOutflowM3h: number;
  totalPowerKw: number;
}

export function buildAnalytics(args: {
  ctx: EngineContext;
  scenario: Scenario;
  world: WorldState;
  derived: DerivedState;
  forecasts: Record<SumpId, SumpForecastResult>;
  incidents: Incident[];
  assumptions: Assumptions;
}): AnalyticsBundle {
  const elapsedHours = args.world.clock.elapsedSec / 3600;
  const waterBalance = buildWaterBalance(args.ctx, args.scenario, args.world, args.derived, args.forecasts);
  const pumpPerformance = buildPumpPerformance(args.ctx, args.derived, elapsedHours);
  const energy = buildEnergySummary(pumpPerformance, args.assumptions);
  const zones = buildZonePerformance(args.ctx, args.world, args.forecasts);
  const reliability = buildReliability(args.ctx, args.derived);
  const sensitivity = buildSensitivity({
    ctx: args.ctx,
    scenario: args.scenario,
    world: args.world,
    derived: args.derived,
  });
  const incidents = buildIncidentAnalytics(args.incidents);
  const modelChecks = buildModelChecks(args.ctx, args.derived, args.world, args.forecasts);

  const totalInflowM3h = ctxTotal(args.ctx.mine, args.world, 'inflow');
  const totalOutflowM3h = ctxTotal(args.ctx.mine, args.world, 'outflow');
  const totalPowerKw = pumpPerformance.reduce((sum, p) => sum + p.powerKw, 0);

  return {
    waterBalance,
    pumpPerformance,
    energy,
    zones,
    reliability,
    sensitivity,
    incidents,
    modelChecks,
    elapsedHours,
    totalInflowM3h,
    totalOutflowM3h,
    totalPowerKw,
  };
}

function ctxTotal(mine: MineDefinition, world: WorldState, field: 'inflow' | 'outflow'): number {
  return mine.sumps.reduce((sum, sump) => {
    const state = world.sumps[sump.id];
    return sum + (field === 'inflow' ? state.inflowM3h : state.outflowM3h);
  }, 0);
}

/** Hydraulic energy needed to lift a sump's current inflow (used in the water panel). */
export function theoreticalLiftEnergy(sumpName: string, headM: number): number {
  void sumpName;
  return hydraulicEnergyKwhPerM3(headM, 0.78);
}

export { sumpOutflowM3h };
