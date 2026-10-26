/** Synthetic, SI-based engineering contracts. No site-calibrated parameters. */
export const MODEL_VERSION = 'MINE-ENG-2.0';
export interface PipeModel {
  lengthM: number;
  diameterM: number;
  roughnessM: number;
  minorK: number;
  valveOpen: number;
  staticHeadM: number;
  backPressureKpa: number;
  destinationSumpId: string | null;
  configuration: 'parallel' | 'series';
}
export type TelemetryFault = 'normal' | 'frozen' | 'delayed' | 'scaled' | 'missing' | 'contradictory';
export interface EngineeringOverrides {
  materialRoutes?: Record<string, { available?: boolean; capacityTph?: number }>;
  hoistAvailable?: boolean;
  hoistCapacityTph?: number;
  oreBufferCapacityTonnes?: number;
  capitalCostMultiplier?: number;
  plannedShiftHours?: number;
  shiftStartHour?: number;
  requiredReservePumps?: number;
  maximumPumpSwitches?: number;
  pipes?: Record<string, Partial<PipeModel>>;
  utilityAvailable?: boolean;
  generatorAvailable?: boolean;
  backupConnected?: boolean;
  backupCapacityKw?: number;
  switchingApproved?: boolean;
  restoreAtSec?: number | null;
  productionLoadScale?: number;
  storageScale?: number;
  dischargeScale?: number;
  additionalStandby?: boolean;
  electricalRedundancy?: boolean;
  redundantSensor?: boolean;
  telemetryFaults?: Record<string, TelemetryFault>;
  statusFeedback?: Record<string, 'running' | 'stopped' | 'unknown'>;
  inflowPulse?: { sumpId: string; startSec: number; endSec: number; flowM3h: number };
}
export interface MaterialRoute { id: string; name: string; zoneIds: string[]; capacityTph: number; defaultAvailable: boolean; alternative: boolean; }
export interface MaterialHandlingModel { routes: MaterialRoute[]; hoistCapacityTph: number; bufferCapacityTonnes: number; initialBufferTonnes: number; }
export interface MaterialFlow { totalTph: number; zonePotentialTph: Record<string, number>; zoneRatesTph: Record<string, number>; routeFlowsTph: Record<string, number>; }
export interface MaterialLedger { initialBufferTonnes: number; producedTonnes: number; processedTonnes: number;
  finalBufferTonnes: number; capacityTonnes: number; deferredProcessingTonnes: number; heldAtFaceTonnes: number; residualTonnes: number; }
export interface HydraulicResult {
  staticHeadM?: number;
  unitHeadM?: number;
  effectiveSpeedRatio?: number;
  status: 'solved' | 'no-head' | 'invalid' | 'not-bracketed' | 'not-converged' | 'unavailable';
  flowM3h: number;
  headM: number;
  frictionHeadM: number;
  minorHeadM: number;
  reynolds: number;
  frictionFactor: number;
  efficiency: number;
  hydraulicPowerKw: number;
  electricalPowerKw: number;
  residualM: number | null;
  iterations: number;
  warnings: string[];
}
export interface WaterLedger {
  durationSec: number;
  initialM3: number;
  finalM3: number;
  externalInM3: number;
  externalOutM3: number;
  overflowM3: number;
  residualM3: number;
  transfers: Array<{ from: string; to: string; volumeM3: number }>;
}
export interface EngineeringBasis {
  title: string;
  quantity: string;
  equation: string;
  inputs: Array<{ name: string; value: number | string; unit: string; source: string }>;
  steps: string[];
  assumptions: string[];
  quality: string;
  sensitivity: string;
  limitations: string[];
  validation: string;
  modelVersion: string;
}
