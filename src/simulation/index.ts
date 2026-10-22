import { MINE } from '../data/mine';
import { DEFAULT_ASSUMPTIONS } from './assumptions';
import type { EngineContext } from './engine';
import { DependencyGraph } from './graph';
import { deriveSeed, DeterministicRandom, hashString } from './rng';

/** The canonical dependency graph, built once from the mine model. */
export const MINE_GRAPH = new DependencyGraph(
  MINE.dependencies,
  MINE.assets.map((asset) => asset.id),
);

export function createEngineContext(
  assumptions = DEFAULT_ASSUMPTIONS,
  mine = MINE,
  graph = MINE_GRAPH,
): EngineContext {
  return { mine, graph, assumptions };
}

export const ENGINE_CONTEXT = createEngineContext();

export * from './assumptions';
export * from './engine';
export * from './graph';
export * from './incidents';
export * from './plant';
export * from './production';
export * from './propagation';
export * from './rng';
export * from './scenarios';
export * from './sensors';
export * from './water';

export { DeterministicRandom, deriveSeed, hashString };
