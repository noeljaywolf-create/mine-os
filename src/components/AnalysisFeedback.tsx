import { useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import { analysisActivity, analysisRevision, analysisScope, analysisSnapshots, subscribeAnalysis } from '../store/analysisJobs';
import { useDisplayWorld } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { Button } from '../design-system';

export function AnalysisLoading({ label = 'Calculating engineering results' }: { label?: string }) {
  return <section aria-busy="true" aria-label={label} data-testid="analysis-loading" className="my-3 rounded-lg border border-ink-700 bg-ink-900/60 p-5">
    <div className="flex items-center gap-3"><Loader2 size={18} className="animate-spin text-signal-cyanBright motion-reduce:animate-none" /><h2 className="text-sm font-medium text-ink-100">{label}</h2></div>
    <p className="mt-2 text-xs leading-relaxed text-ink-300">The numerical model is running in the background. Navigation and schematic controls remain available; leaving this view cancels its unfinished calculations.</p>
  </section>;
}
export function AnalysisStatus() {
  const world = useDisplayWorld();
  const task = useMineStore(s => s.advanceTask); const cancel = useMineStore(s => s.cancelAdvance);
  useSyncExternalStore(subscribeAnalysis, analysisRevision, analysisRevision);
  const scope = analysisScope();
  const pending = analysisActivity(scope);
  const older = analysisSnapshots(scope).filter(s => s.atSimSec !== world.clock.elapsedSec);
  if (!pending.length && !older.length && !task) return null;
  return <div role="status" data-testid="analysis-status" className="mb-3 rounded border border-signal-cyan/30 bg-signal-cyan/5 px-3 py-2 text-xs leading-relaxed text-ink-200">
    {task && <div className="mb-2 flex flex-wrap items-center gap-3"><span>Advancing simulation: {task.completed}/{task.total} steps. Navigation remains available.</span><Button size="xs" onClick={cancel}>Cancel time advance</Button></div>}
    {pending.length > 0 && <p>Background calculation: {pending.map(p => `${p.kind} at T+${(p.atSimSec / 3600).toFixed(2)} h`).join('; ')}. Navigation remains available.</p>}
    {older.length > 0 && <p>Analysis snapshots: {older.map(p => `${p.kind} T+${(p.atSimSec / 3600).toFixed(2)} h`).join('; ')}. Live-clock refreshes are coalesced; pause for an exact current-step calculation.</p>}
  </div>;
}
