import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, Layers, Network } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { DependencyGraph } from '../components/DependencyGraph';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  StatusBadge,
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useDerived } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import type { IndustrialSystem } from '../domain/types';
import { EngineeringTwins } from '../components/EngineeringTwins';

const SYSTEMS: IndustrialSystem[] = [
  'dewatering',
  'electrical',
  'production',
  'processing',
  'ventilation',
  'infrastructure',
  'instrumentation',
];

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  blocked: 1,
  degraded: 2,
  exposed: 3,
  standby: 4,
  offline: 5,
  operational: 6,
};

export function DigitalTwin() {
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const selection = useMineStore((s) => s.selection.assetId);
  const selectAsset = useMineStore((s) => s.selectAsset);
  const clearSelection = useMineStore((s) => s.clearSelection);
  const [systems, setSystems] = useState<IndustrialSystem[]>(SYSTEMS);
  const [showSensors, setShowSensors] = useState(true);

  const affected = useMemo(
    () =>
      [...mine.assets]
        .map((asset) => ({ asset, state: derived.assetStates[asset.id] }))
        .filter((row) => row.state && row.state.status !== 'operational' && row.state.status !== 'standby')
        .sort((a, b) => (STATUS_ORDER[a.state.status] ?? 9) - (STATUS_ORDER[b.state.status] ?? 9)),
    [mine.assets, derived.assetStates],
  );

  const toggleSystem = (system: IndustrialSystem) =>
    setSystems((current) =>
      current.includes(system) ? current.filter((item) => item !== system) : [...current, system],
    );

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID['digital-twin']}
        actions={
          <>
            <Button size="sm" variant={showSensors ? 'primary' : 'outline'} onClick={() => setShowSensors((value) => !value)}>
              <Layers size={11} /> Tags {showSensors ? 'on' : 'off'}
            </Button>
            <Button size="sm" variant="outline" onClick={clearSelection} disabled={!selection}>
              <Crosshair size={11} /> Clear focus
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1">
          {SYSTEMS.map((system) => (
            <button
              key={system}
              onClick={() => toggleSystem(system)}
              className={cx(
                'rounded-[2px] border px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-[0.1em]',
                systems.includes(system)
                  ? 'border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyanBright'
                  : 'border-[color:var(--hairline)] text-ink-500 hover:text-ink-300',
              )}
            >
              {system}
            </button>
          ))}
        </div>
      </ModuleHeader>

      <EngineeringTwins />

      <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel className="min-w-0 overflow-hidden">
          <PanelTitle
            right={
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-signal-green" /> operational</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-signal-amber" /> degraded</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-signal-red" /> blocked</span>
              </div>
            }
          >
            Kestrel Ridge · synthetic dependency graph
          </PanelTitle>
          <DependencyGraph
            height={610}
            systems={systems}
            showSensors={showSensors}
            focusId={selection}
            onSelect={(assetId) => selectAsset({ assetId })}
          />
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{derived.cascades.length} paths</span>}>
              Propagation paths
            </PanelTitle>
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto p-2">
              {derived.cascades.length === 0 ? (
                <p className="px-1 py-2 text-2xs leading-relaxed text-ink-400">
                  All assets are within their modelled envelope. Introduce a failure in the inspector to watch the
                  graph recompute.
                </p>
              ) : (
                derived.cascades.map((cascade) => (
                  <button
                    key={`${cascade.sourceId}-${cascade.targetId}-${cascade.depth}`}
                    onClick={() => selectAsset({ assetId: cascade.targetId })}
                    className="w-full rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/60 px-2 py-1.5 text-left hover:border-ink-500"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-mono text-[10px] text-ink-200">{cascade.path.join(' → ')}</span>
                      <Badge tone={cascade.effect === 'blocked' ? 'red' : cascade.effect === 'unmonitored' ? 'amber' : 'neutral'}>
                        {cascade.effect}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[9.5px] leading-snug text-ink-400">{cascade.rationale}</p>
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<Link to="/app/assets" className="text-[10px] text-ink-400 hover:text-ink-100">register →</Link>}>
              Assets off nominal
            </PanelTitle>
            {affected.length === 0 ? (
              <EmptyState title="Nothing degraded" detail="All modelled assets are at their designed function." icon={<Network size={18} />} />
            ) : (
              <div className="divide-y divide-[color:var(--hairline)]">
                {affected.slice(0, 12).map(({ asset, state }) => (
                  <button
                    key={asset.id}
                    onClick={() => selectAsset({ assetId: asset.id })}
                    className="block w-full px-3 py-1.5 text-left hover:bg-ink-800/60"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] text-ink-100">{asset.name}</span>
                      <span className="ml-auto shrink-0"><StatusBadge status={state.status} /></span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="font-mono text-[9px] text-ink-500">{(state.effectiveness * 100).toFixed(0)}% effective</span>
                      <span className="truncate text-[9px] text-ink-500">{asset.system}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle>How to read the twin</PanelTitle>
            <ul className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <li>· Edges are engineering dependencies, not cable runs. Each has a written rationale and criticality.</li>
              <li>· Geometry is synthetic and schematic. It is not surveyed or spatially valid.</li>
              <li>· Selecting a node focuses the graph and follows you into every other module.</li>
              <li>· A blocked upstream asset reduces downstream effectiveness through the same propagation used by forecasts.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel className="mt-2">
        <PanelTitle>Dependency register</PanelTitle>
        <TableShell>
          <thead>
            <tr>
              <Th>From</Th>
              <Th>Type</Th>
              <Th>To</Th>
              <Th align="center">Criticality</Th>
              <Th>Rationale</Th>
            </tr>
          </thead>
          <tbody>
            {mine.dependencies.map((dependency) => (
              <tr key={dependency.id} className="hover:bg-ink-800/50">
                <Td>
                  <button onClick={() => selectAsset({ assetId: dependency.from })} className="font-mono text-[10.5px] hover:text-signal-cyanBright">
                    {dependency.from}
                  </button>
                </Td>
                <Td><Badge tone="neutral">{dependency.type}</Badge></Td>
                <Td>
                  <button onClick={() => selectAsset({ assetId: dependency.to })} className="font-mono text-[10.5px] hover:text-signal-cyanBright">
                    {dependency.to}
                  </button>
                </Td>
                <Td align="center" className="num">{dependency.criticality}</Td>
                <Td className="text-2xs text-ink-400">{dependency.rationale}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </div>
  );
}
