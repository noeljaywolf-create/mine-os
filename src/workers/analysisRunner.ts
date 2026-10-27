import { DependencyGraph } from '../simulation/graph';
import { deriveState } from '../simulation/engine';
import { forecastAllSumps } from '../simulation/forecast';
import { buildSensitivity } from '../simulation/analytics';
import { compareInvestments, compareStrategies, customRepairStrategy, searchDutyStrategies, strategyInflowSensitivity, type evaluateStrategy } from '../simulation/engineeringStudies';
import type { WorldState } from '../domain/types';
import type { AnalysisRequest, AnalysisResponse, AnalysisResults, AnalysisKind } from './analysisTypes';

// Projected sensor sample buffers and event logs are integration scratch/history,
// not inputs to the displayed study chart or metrics. Do not ship hundreds of
// duplicated buffers back to React; canonical live/replay history is untouched.
const compactWorld = (w: WorldState): WorldState => ({ ...w, history: [], sensorSampleHistory: undefined });
function compactStudy(result: ReturnType<typeof evaluateStrategy>) {
  return { ...result, frames: result.frames.map(compactWorld), end: compactWorld(result.end) };
}
export function runAnalysis(input: AnalysisRequest): AnalysisResponse {
  try {
    const ctx = { mine: input.mine, assumptions: input.assumptions, graph: new DependencyGraph(input.mine.dependencies) };
    let result: AnalysisResults[AnalysisKind];
    switch (input.kind) {
      case 'forecasts': {
        const forecasts = forecastAllSumps({ ctx, scenario: input.scenario, world: input.world, derived: deriveState(ctx, input.scenario, input.world) });
        Object.values(forecasts).forEach(f => { f.generatedAtSimSec = input.world.clock.elapsedSec; });
        result = forecasts; break;
      }
      case 'sensitivity': result = buildSensitivity({ ctx, scenario: input.scenario, world: input.world, derived: deriveState(ctx, input.scenario, input.world) }); break;
      case 'comparison': result = compareStrategies(ctx, input.scenario, input.world, customRepairStrategy(input.world, input.options.delay)).map(compactStudy); break;
      case 'duty': result = searchDutyStrategies(ctx, input.scenario, input.world).map(r => ({ ...r, ...compactStudy(r) })); break;
      case 'strategy-sensitivity': result = strategyInflowSensitivity(ctx, input.scenario, input.world, input.options.strategy).map(compactStudy); break;
      case 'investments': result = compareInvestments(ctx, input.scenario, input.world).map(r => ({ ...r, result: compactStudy(r.result) })); break;
    }
    return { ok: true, result };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
