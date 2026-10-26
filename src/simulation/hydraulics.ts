import type { HydraulicResult, PipeModel } from '../domain/engineering';
import type { Pump, ScenarioOverride, SumpRuntimeState } from '../domain/types';
import type { MineDefinition } from '../domain/mine';

export const GRAVITY = 9.80665;
export const WATER_DENSITY = 998.2;
const KINEMATIC_VISCOSITY = 1.004e-6; // clean water at approximately 20 °C
export interface CurvePump {
  ratedFlowM3h: number; ratedHeadM: number; efficiency: number;
  speedRatio: number; health: number; curveScale: number;
}
export function defaultPipe(pump: Pump): PipeModel {
  return { lengthM: pump.liftHeadM * 1.6, diameterM: 0.2, roughnessM: 0.00015,
    minorK: 6, valveOpen: 1, staticHeadM: pump.liftHeadM, backPressureKpa: 0,
    destinationSumpId: null, configuration: 'parallel' };
}
export function effectivePipe(mine: MineDefinition, overrides: ScenarioOverride, sumpId: string, sumps?: Record<string, SumpRuntimeState>): PipeModel {
  const station = mine.pumps.filter(p => p.sumpId === sumpId);
  const source = mine.sumps.find(s => s.id === sumpId)!;
  const pipe = { ...defaultPipe(station[0]), ...overrides.engineering?.pipes?.[sumpId] };
  pipe.minorK += Math.max(0, ...station.map(p => overrides.pumpOverrides[p.id]?.suctionK ?? 0));
  pipe.diameterM *= overrides.engineering?.dischargeScale ?? 1;
  if (pipe.destinationSumpId) {
    const destination = mine.sumps.find(s => s.id === pipe.destinationSumpId);
    pipe.staticHeadM = destination ? destination.floorElevationM + (sumps?.[destination.id]?.levelM ?? 0) - source.floorElevationM - (sumps?.[sumpId]?.levelM ?? 0) : Number.NaN;
  } else pipe.staticHeadM -= sumps?.[sumpId]?.levelM ?? 0;
  return pipe;
}
/** Darcy factor: 64/Re laminar; Haaland turbulent (Re >= 4000); transition rejected. */
export function frictionFactor(re: number, relativeRoughness: number): number | null {
  if (!Number.isFinite(re) || re < 0 || relativeRoughness < 0 || relativeRoughness > 0.05) return null;
  if (re === 0) return 0;
  if (re < 2300) return 64 / re;
  if (re < 4000) return null;
  return 1 / Math.pow(-1.8 * Math.log10(Math.pow(relativeRoughness / 3.7, 1.11) + 6.9 / re), 2);
}
export function systemHead(flowM3h: number, pipe: PipeModel) {
  const areaM2 = Math.PI * pipe.diameterM ** 2 / 4;
  const velocity = flowM3h / 3600 / areaM2;
  const reynolds = velocity * pipe.diameterM / KINEMATIC_VISCOSITY;
  const factor = frictionFactor(reynolds, pipe.roughnessM / pipe.diameterM);
  // A transition interpolation is used only while bracketing. A final transition point is rejected.
  const f = factor ?? 0.04;
  const friction = f * pipe.lengthM / pipe.diameterM * velocity ** 2 / (2 * GRAVITY);
  const k = pipe.minorK + 20 * (1 / Math.max(0.001, pipe.valveOpen) - 1) ** 2;
  const minor = k * velocity ** 2 / (2 * GRAVITY);
  return { headM: pipe.staticHeadM + pipe.backPressureKpa * 1000 / (WATER_DENSITY * GRAVITY) + friction + minor,
    frictionHeadM: friction, minorHeadM: minor, reynolds, frictionFactor: f, valid: factor !== null };
}
/** Synthetic quadratic curve through rated duty with shutoff head 1.25 × rated. Affinity laws. */
export function pumpHead(flowM3h: number, p: CurvePump): number {
  const coefficient = 0.25 * p.ratedHeadM / (p.ratedFlowM3h * p.curveScale) ** 2;
  return 1.25 * p.ratedHeadM * p.speedRatio ** 2 * p.health - coefficient * flowM3h ** 2;
}
export function flowAtHead(headM: number, p: CurvePump): number {
  const shutoff = pumpHead(0, p);
  if (headM >= shutoff || p.speedRatio <= 0) return 0;
  return Math.sqrt((shutoff - headM) / (0.25 * p.ratedHeadM)) * p.ratedFlowM3h * p.curveScale;
}
function invalid(status: HydraulicResult['status'], warning: string): HydraulicResult {
  return { status, flowM3h: 0, headM: 0, frictionHeadM: 0, minorHeadM: 0, reynolds: 0,
    frictionFactor: 0, efficiency: 0, hydraulicPowerKw: 0, electricalPowerKw: 0,
    residualM: null, iterations: 0, warnings: [warning, ...(status === 'no-head' ? ['Zero hydraulic delivery; shutoff electrical demand is not modelled. Zero must not be interpreted as a validated electrical input estimate.'] : [])] };
}
/** Coupled shared main: heads add in series, flows add in parallel. Bounded bisection. */
export function solveStation(pumps: CurvePump[], pipe: PipeModel): HydraulicResult {
  if (!pumps.length) return invalid('unavailable', 'No available running pump in this station.');
  const numbers = [pipe.lengthM, pipe.diameterM, pipe.roughnessM, pipe.minorK, pipe.staticHeadM,
    pipe.backPressureKpa, pipe.valveOpen, ...pumps.flatMap(p => Object.values(p))];
  if (numbers.some(x => !Number.isFinite(x)) || pipe.diameterM <= 0 || pipe.lengthM < 0 ||
      pipe.staticHeadM < 0 || pipe.roughnessM < 0 || pipe.roughnessM / pipe.diameterM > 0.05 ||
      pipe.minorK < 0 || pipe.backPressureKpa < 0 || pipe.valveOpen < 0 || pipe.valveOpen > 1 ||
      pumps.some(p => p.ratedFlowM3h <= 0 || p.ratedHeadM <= 0 || p.speedRatio < 0 || p.speedRatio > 1.2 ||
        p.health <= 0 || p.health > 1 || p.efficiency <= 0 || p.efficiency > 1 || p.curveScale <= 0))
    return invalid('invalid', 'Invalid SI inputs or speed/roughness outside model bounds.');
  if (pipe.valveOpen === 0) return invalid('no-head', 'Discharge valve closed; shutoff operation is not thermally modelled.');
  const series = pipe.configuration === 'series';
  const shutoff = series ? pumps.reduce((s, p) => s + pumpHead(0, p), 0) : Math.max(...pumps.map(p => pumpHead(0, p)));
  if (shutoff <= systemHead(0, pipe).headM) return invalid('no-head', 'Shutoff head does not overcome static lift and backpressure.');
  const residual = (q: number) => {
    const head = systemHead(q, pipe).headM;
    return series ? pumps.reduce((s, p) => s + pumpHead(q, p), 0) - head
      : pumps.reduce((s, p) => s + flowAtHead(head, p), 0) - q;
  };
  let lo = 0;
  let hi = pumps.reduce((s, p) => s + p.ratedFlowM3h * p.curveScale * Math.max(p.speedRatio, 0.01) * 3, 0);
  if (residual(hi) >= 0) return invalid('not-bracketed', 'Operating point not bracketed inside the bounded search.');
  let iterations = 0;
  for (; iterations < 80 && hi - lo > 1e-7; iterations++) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) lo = mid; else hi = mid;
  }
  if (hi - lo > 1e-7) return invalid('not-converged', 'Bisection iteration limit reached without satisfying the absolute flow tolerance. No operating point is reported.');
  const q = (lo + hi) / 2;
  const system = systemHead(q, pipe);
  if (!system.valid) return invalid('invalid', 'Final operating point lies in transition flow; friction method not supported there.');
  const individualFlows = pumps.map(p => series ? q : flowAtHead(system.headM, p));
  const warnings: string[] = [];
  let electricalPowerKw = 0;
  let hydraulicPowerKw = 0;
  pumps.forEach((p, i) => {
    const ratio = individualFlows[i] / (p.ratedFlowM3h * p.curveScale * Math.max(p.speedRatio, 0.001));
    if (ratio > 1.6) warnings.push('Flow exceeds 160% of synthetic rated-speed duty; manufacturer curve required.');
    const efficiency = Math.max(0.15, p.efficiency * (1 - 0.35 * (ratio - 1) ** 2));
    const hp = WATER_DENSITY * GRAVITY * individualFlows[i] / 3600 * (series ? pumpHead(q, p) : system.headM) / 1000;
    hydraulicPowerKw += Math.max(0, hp);
    electricalPowerKw += Math.max(0, hp) / efficiency;
  });
  if (warnings.length) return invalid('invalid', warnings.join(' '));
  const headResidual = series ? residual(q) : Math.max(...pumps.map((p, i) =>
    individualFlows[i] > 0 ? Math.abs(pumpHead(individualFlows[i], p) - system.headM) : 0));
  return { status: 'solved', flowM3h: q, staticHeadM: pipe.staticHeadM, ...system, efficiency: electricalPowerKw > 0 ? hydraulicPowerKw / electricalPowerKw : 0,
    hydraulicPowerKw, electricalPowerKw, residualM: Math.abs(headResidual), iterations, warnings };
}
export function stationPumpFlows(pumps: CurvePump[], pipe: PipeModel, solved: HydraulicResult): number[] {
  return pumps.map(p => solved.status !== 'solved' ? 0 : pipe.configuration === 'series'
    ? solved.flowM3h : flowAtHead(solved.headM, p));
}
export function powerAtDuty(flowM3h: number, headM: number, pump: CurvePump) {
  const ratio = flowM3h / (pump.ratedFlowM3h * pump.curveScale * Math.max(pump.speedRatio, 0.001));
  const efficiency = Math.max(0.15, pump.efficiency * (1 - 0.35 * (ratio - 1) ** 2));
  const hydraulicPowerKw = Math.max(0, WATER_DENSITY * GRAVITY * flowM3h / 3600 * headM / 1000);
  return { efficiency, hydraulicPowerKw, electricalPowerKw: hydraulicPowerKw / efficiency };
}

export function curveSamples(pumps: CurvePump[], pipe: PipeModel, maxFlow: number) {
  return Array.from({ length: 61 }, (_, i) => {
    const q = maxFlow * i / 60;
    let head = 0;
    if (pipe.configuration === 'series') head = pumps.reduce((s, p) => s + pumpHead(q, p), 0);
    else {
      let lo = 0; let hi = Math.max(0, ...pumps.map(p => pumpHead(0, p)));
      for (let k = 0; k < 45; k++) {
        const mid = (lo + hi) / 2;
        if (pumps.reduce((s, p) => s + flowAtHead(mid, p), 0) > q) lo = mid; else hi = mid;
      }
      head = (lo + hi) / 2;
    }
    return { flowM3h: q, pumpHeadM: Math.max(0, head), systemHeadM: systemHead(q, pipe).headM };
  });
}
