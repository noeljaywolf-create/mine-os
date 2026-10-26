import { useState } from 'react';
import { Badge, Button, Panel, Range, TableShell, Td, Th } from '../design-system';
import { useDisplayWorld, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { EngineeringBasis } from './EngineeringBasis';
import { EngineeringSchematic, type TwinView } from './EngineeringSchematic';

const VIEWS: Array<{ id: TwinView; label: string }> = [
  { id: 'section', label: 'Underground sectional twin' },
  { id: 'electrical', label: 'Electrical single-line twin' },
  { id: 'hydraulic', label: 'Hydraulic twin' },
  { id: 'material', label: 'Ore movement twin' },
];

export function EngineeringTwins() {
  const [view, setView] = useState<TwinView>('section');
  const mine = useMineStore(s => s.mine);
  const selection = useMineStore(s => s.selection.assetId);
  const select = useMineStore(s => s.selectAsset);
  const replay = useMineStore(s => s.replayActive);
  const replayIndex = useMineStore(s => s.replayIndex);
  const scrub = useMineStore(s => s.setReplayIndex);
  const world = useDisplayWorld();
  const run = useRun();
  const related = new Set([selection, ...mine.dependencies.filter(d => d.from === selection || d.to === selection).flatMap(d => [d.from, d.to])]);
  const choose = (id: string) => select({ assetId: id, sumpId: mine.sumps.some(s => s.id === id) ? id : mine.pumps.find(p => p.id === id)?.sumpId ?? null });
  const selectedAsset = mine.assets.find(a => a.id === selection);

  return <Panel className="my-3 min-w-0 overflow-hidden p-3 sm:p-4">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold text-ink-100">Engineering schematics</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-300">One scenario. Four linked views. Select equipment to follow its relationships.</p></div>
      <Badge tone={replay ? 'amber' : 'cyan'}>{replay ? 'Historical snapshot' : 'Shared live state'} · T+{(world.clock.elapsedSec / 3600).toFixed(2)} h</Badge>
    </div>
    <div role="group" aria-label="Engineering schematic views" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {VIEWS.map(v => <Button key={v.id} size="sm" className="min-h-10 whitespace-normal px-3 text-center" aria-pressed={v.id === view} variant={v.id === view ? 'primary' : 'outline'} onClick={() => setView(v.id)}>{v.label}</Button>)}
    </div>
    <EngineeringSchematic view={view} mine={mine} world={world} selection={selection} related={related} onSelect={choose} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900/70 p-3">
      <div className="min-w-0"><p className="text-xs font-medium text-ink-100">{selectedAsset?.name ?? 'Select an asset in any schematic'}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-300">{selection ? `${world.assets[selection]?.status ?? 'Unknown state'} · ${Math.max(0, related.size - 1)} directly linked assets highlighted across views` : 'Click or focus a card and press Enter. Selection is shared with the asset inspector.'}</p></div>
      {selection && <EngineeringBasis assetId={selection} />}
    </div>
    <div className="mt-4 rounded-lg border border-ink-800 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-medium text-ink-100">Scenario timeline</h3>
        {replay && <Button size="xs" onClick={() => scrub(null)}>Return to live state</Button>}</div>
      <Range label="Consistent scenario replay frame" min={0} max={Math.max(0, run.frames.length - 1)} step={1} value={replay ? replayIndex : Math.max(0, run.frames.length - 1)} onChange={i => scrub(i)} />
    </div>
    <details className="mt-4 rounded-lg border border-ink-800 text-xs"><summary className="cursor-pointer px-3 py-3 text-ink-200">Accessible engineering asset list / linked selection</summary>
      <TableShell><thead><tr><Th>Asset</Th><Th>Computed state</Th><Th>Numerical evidence</Th></tr></thead><tbody>
        {[...mine.feeders, ...mine.sumps, ...mine.pumps, ...mine.zones, ...(mine.materialHandling?.routes ?? [])].map(a => <tr key={a.id}><Td><Button size="xs" onClick={() => choose(a.id)}>{a.name}{related.has(a.id) ? ' · linked' : ''}</Button></Td><Td>{world.assets[a.id]?.status}</Td><Td><EngineeringBasis assetId={a.id} /></Td></tr>)}
      </tbody></TableShell>
    </details>
    <p className="mt-3 text-xs leading-relaxed text-ink-400">Synthetic geometry; not to scale. Storage bars show volume/capacity, not a 3D flood footprint. Spatial routing requires specialist hydraulic/hydrogeological modelling.</p>
  </Panel>;
}
