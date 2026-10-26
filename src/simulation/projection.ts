import type { Scenario, WorldState } from '../domain/types';
import { stepWorld, mergeAssumptions, type EngineContext } from './engine';

/** Isolated forward evaluation of the canonical kernel, never a second engine. */
export function projectWorld(ctx: EngineContext, scenario: Scenario, start: WorldState, hours: number, stepSec = 300): WorldState[] {
  if (!Number.isFinite(hours) || hours < 0 || hours > 48 || !Number.isFinite(stepSec) || stepSec <= 0 || stepSec > 300)
    throw new Error('Projection bounds: 0–48 hours, timestep (0,300] seconds.');
  const effectiveContext = { ...ctx, assumptions: mergeAssumptions(ctx.assumptions, scenario.overrides.assumptions) };
  const frames = [start];
  let world: WorldState = { ...start, history: [] };
  const end = start.clock.elapsedSec + hours * 3600;
  while (world.clock.elapsedSec < end - 1e-8) {
    world = stepWorld(effectiveContext, scenario, world, Math.min(stepSec, end - world.clock.elapsedSec)).world;
    frames.push(world);
  }
  return frames;
}
