import { runAnalysis } from './analysisRunner';
import type { AnalysisRequest } from './analysisTypes';

// Disposable read-only projections: no live simulation state is written here.
self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  self.postMessage(runAnalysis(event.data));
};
