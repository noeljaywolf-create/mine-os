import { useState } from 'react';
import { Badge, Button, Metric, MetricCell, MetricGrid, Notice, Panel, Range, TableShell, Td, Th } from '../design-system';
import { useActiveScenario, useDerived, useDisplayWorld } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { materialCapacity, materialModel } from '../simulation/materialHandling';
import { EngineeringBasis } from './EngineeringBasis';

export function MaterialHandlingPanel() {
  const store = useMineStore(); const scenario = useActiveScenario(); const world = useDisplayWorld(); const derived = useDerived();
  const model = materialModel(store.mine); const e = world.scenarioSnapshot?.engineering ?? scenario.overrides.engineering ?? {};
  const [message, setMessage] = useState('');
  const apply = (settings: typeof e) => setMessage(store.applyEngineeringOverrides({ engineering: settings }).message);
  return <Panel className="my-3 p-3"><div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="label-micro">Ore movement, alternative routes and finite buffer</h2>
    <EngineeringBasis assetId="mat-hoist" />
    {scenario.isBaseline && <Button size="xs" onClick={() => store.createScenarioBranch({ name: 'Material-handling study', description: 'Capacity-constrained ore movement and finite inventory.', hypothesis: 'Alternative routes and buffer inventory can delay but not eliminate production consequences.' })}>Create material-handling branch</Button>}
  </div>
    <MetricGrid cols={3}><MetricCell><Metric label="Ore buffer inventory" value={(world.oreBufferTonnes ?? 0).toFixed(1)} unit="t" hint={`capacity ${materialCapacity(model, world.scenarioSnapshot?.engineering ?? e).toFixed(0)} t`} /></MetricCell>
      <MetricCell><Metric label="Routed underground throughput" value={derived.materialFlow.totalTph.toFixed(1)} unit="t/h" /></MetricCell>
      <MetricCell><Metric label="Material ledger residual" value={(world.materialLedger?.residualTonnes ?? 0).toExponential(2)} unit="t" /></MetricCell></MetricGrid>
    <fieldset disabled={scenario.isBaseline || store.replayActive}>
      <TableShell><thead><tr><Th>Ore movement route</Th><Th>Calculated flow</Th><Th>Availability / intervention</Th><Th>Transport capacity</Th></tr></thead><tbody>{model.routes.map(r => {
        const available = e.materialRoutes?.[r.id]?.available ?? r.defaultAvailable;
        return <tr key={r.id}><Td>{r.name} {r.alternative && <Badge tone="blue">Shared alternate</Badge>}</Td><Td><output data-testid={`route-flow-${r.id}`}>{(derived.materialFlow.routeFlowsTph[r.id] ?? 0).toFixed(1)} t/h</output></Td>
          <Td><Button size="xs" onClick={() => apply({ materialRoutes: { [r.id]: { available: !available } } })}>{r.name}: {available ? 'available' : 'unavailable'}</Button></Td>
          <Td><Range label={`${r.name} capacity (t/h)`} min={0} max={1000} step={25} value={e.materialRoutes?.[r.id]?.capacityTph ?? r.capacityTph} onChange={v => apply({ materialRoutes: { [r.id]: { capacityTph: v } } })} /></Td></tr>;
      })}</tbody></TableShell>
      <div className="mt-3 grid gap-3 md:grid-cols-3"><Button size="xs" onClick={() => apply({ hoistAvailable: e.hoistAvailable === false })}>Common hoist: {e.hoistAvailable === false ? 'unavailable' : 'available'}</Button>
        <Range label="Common hoist capacity (t/h)" min={0} max={1600} step={50} value={e.hoistCapacityTph ?? model.hoistCapacityTph} onChange={v => apply({ hoistCapacityTph: v })} />
        <Range label="Ore-buffer capacity assumption (t)" min={560} max={2240} step={140} value={e.oreBufferCapacityTonnes ?? model.bufferCapacityTonnes} onChange={v => apply({ oreBufferCapacityTonnes: v })} /></div>
      <Button size="xs" className="mt-3" onClick={() => store.runFor(3600)}>Advance material simulation 1 h</Button>
    </fieldset>
    <p role="status" className="my-2 text-xs text-signal-cyanBright">{message}</p>
    <Notice tone="neutral" title="Capacity-network assumptions">Deterministic maximum-flow allocation respects route, shared-hoist and finite receiving capacities. Equal-value ore is allocated in stable graph order; no claim of profit-optimal scheduling. Alternative access is not available through a flooded working zone. Route geometry, travel times, haulage power, hoist mechanics and stockpile construction are not engineering designs.</Notice>
  </Panel>;
}
