import type { MineDefinition } from '../domain/mine';
import type { Assumptions, Scenario, WorldState } from '../domain/types';
import type { forecastAllSumps } from '../simulation/forecast';
import type { buildSensitivity } from '../simulation/analytics';
import type { compareInvestments, compareStrategies, searchDutyStrategies, strategyInflowSensitivity, Strategy } from '../simulation/engineeringStudies';

export interface AnalysisResults {
  forecasts: ReturnType<typeof forecastAllSumps>;
  sensitivity: ReturnType<typeof buildSensitivity>;
  comparison: ReturnType<typeof compareStrategies>;
  duty: ReturnType<typeof searchDutyStrategies>;
  'strategy-sensitivity': ReturnType<typeof strategyInflowSensitivity>;
  investments: ReturnType<typeof compareInvestments>;
}
export type AnalysisKind = keyof AnalysisResults;
export interface AnalysisOptions {
  forecasts: Record<string, never>;
  sensitivity: Record<string, never>;
  comparison: { delay: number };
  duty: Record<string, never>;
  'strategy-sensitivity': { strategy: Strategy };
  investments: Record<string, never>;
}
export interface AnalysisInput {
  mine: MineDefinition; assumptions: Assumptions; scenario: Scenario; world: WorldState;
}
export type AnalysisRequest = { [K in AnalysisKind]: AnalysisInput & { kind: K; options: AnalysisOptions[K] } }[AnalysisKind];
export type AnalysisResponse = { ok: true; result: AnalysisResults[AnalysisKind] } | { ok: false; error: string };
