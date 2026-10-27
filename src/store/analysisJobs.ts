import type { AnalysisInput, AnalysisKind, AnalysisOptions, AnalysisRequest, AnalysisResponse, AnalysisResults } from '../workers/analysisTypes';
import type { WorldState } from '../domain/types';

interface Job {
  owner: Map<string, Job>;
  key: string; scope: string; kind: AnalysisKind; atSimSec: number; config: string;
  status: 'pending' | 'complete' | 'failed' | 'cancelled'; result?: unknown; error?: Error;
  worker: Worker | null; promise: Promise<void>; resolve: () => void;
}
const cache = new WeakMap<WorldState, Map<string, Job>>();
const active = new Set<Job>();
const samples = new Map<string, { world: WorldState; at: number }>();
const lastResults = new Map<string, Job>();
const completed: Job[] = [];
const listeners = new Set<() => void>();
let revision = 0;
let notificationQueued = false;
export const analysisScope = () => window.location.pathname + window.location.search;
export const subscribeAnalysis = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const analysisRevision = () => revision;
function remember(job: Job) {
  const index = completed.indexOf(job);
  if (index >= 0) completed.splice(index, 1);
  completed.push(job);
  for (const [key, previous] of lastResults) if (previous.scope === job.scope && previous.kind === job.kind && key !== job.key) lastResults.delete(key);
  lastResults.set(job.key, job);
  while (completed.length > 8) {
    const oldest = completed.shift()!;
    oldest.owner.delete(oldest.key);
    if (lastResults.get(oldest.key) === oldest) lastResults.delete(oldest.key);
  }
}
function notify() {
  if (notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => { notificationQueued = false; revision++; listeners.forEach(listener => listener()); });
}
export function cancelOtherAnalysisScopes(scope: string) {
  for (const job of active) if (job.scope !== scope) {
    job.worker?.terminate(); job.worker = null; job.status = 'cancelled'; job.resolve(); active.delete(job);
  }
  // Retain only small, relevant live-sampling references when navigating away.
  for (const key of samples.keys()) if (!key.startsWith(`${scope}|`)) samples.delete(key);
  for (const [key, job] of lastResults) if (job.scope !== scope) lastResults.delete(key);
  notify();
}
export function analysisActivity(scope: string) {
  return [...active].filter(j => j.scope === scope).map(j => ({ kind: j.kind, atSimSec: j.atSimSec }));
}
export function analysisSnapshots(scope: string) {
  return [...lastResults.values()].filter(j => j.scope === scope).map(j => ({ kind: j.kind, atSimSec: j.atSimSec }));
}

/** Suspense-backed worker resource. No numerical work runs during React rendering.
 * Running-clock refreshes are coalesced; input changes and paused snapshots remain exact. */
export function readAnalysis<K extends AnalysisKind>(kind: K, options: AnalysisOptions[K], input: AnalysisInput, live: boolean): AnalysisResults[K] {
  const scope = analysisScope();
  const config = JSON.stringify([input.mine.id, input.assumptions, input.scenario.id, input.scenario.seed, input.scenario.overrides, options]);
  const key = `${kind}|${config}`;
  const sampleKey = `${scope}|${key}`;
  let world = input.world;
  const previousSample = samples.get(sampleKey);
  const previousJob = previousSample && cache.get(previousSample.world)?.get(key);
  if (live && previousSample && (Date.now() - previousSample.at < 3000 || previousJob?.status === 'pending')) world = previousSample.world;
  else {
    samples.set(sampleKey, { world, at: Date.now() });
    if (samples.size > 24) samples.delete(samples.keys().next().value!);
  }
  let entries = cache.get(world);
  if (!entries) { entries = new Map(); cache.set(world, entries); }
  let job = entries.get(key);
  if (!job || job.status === 'cancelled') {
    // A newer snapshot/parameter change supersedes an unfinished task of the same kind.
    for (const pending of active) if (pending.scope === scope && pending.kind === kind) {
      pending.worker?.terminate(); pending.worker = null; pending.status = 'cancelled'; pending.resolve(); active.delete(pending);
    }
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    job = { owner: entries, key, config, scope, kind, atSimSec: world.clock.elapsedSec, status: 'pending', promise, resolve, worker: null };
    entries.set(key, job); active.add(job);
    const current = job;
    const finish = () => { current.worker?.terminate(); current.worker = null; active.delete(current); current.resolve(); notify(); };
    try {
      const worker = new Worker(new URL('../workers/engineering.worker.ts', import.meta.url), { type: 'module' });
      current.worker = worker;
      worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        if (current.status !== 'pending') return;
        if (event.data.ok) {
          current.status = 'complete'; current.result = event.data.result; remember(current);
        } else { current.status = 'failed'; current.error = new Error(event.data.error); }
        finish();
      };
      worker.onerror = event => { if (current.status !== 'pending') return; current.status = 'failed'; current.error = new Error(event.message || 'Background engineering calculation failed.'); finish(); };
      worker.postMessage({ ...input, world: { ...world, history: [] }, kind, options } as AnalysisRequest);
    } catch (error) { current.status = 'failed'; current.error = error instanceof Error ? error : new Error(String(error)); finish(); }
    notify();
  }
  if (job.status === 'complete') {
    const changedScope = job.scope !== scope;
    job.scope = scope;
    if (lastResults.get(key) !== job || changedScope) { remember(job); notify(); }
    return job.result as AnalysisResults[K];
  }
  if (job.status === 'failed') throw job.error;
  const last = lastResults.get(key);
  if (live && last?.status === 'complete') {
    if (last.scope !== scope) { last.scope = scope; notify(); }
    return last.result as AnalysisResults[K];
  }
  throw job.promise;
}
