import { useMemo, useState } from 'react';
import { Button, Dialog, TableShell, Th, Td } from '../design-system';
import { useActiveScenario, useDisplayWorld } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { engineeringBasis } from '../simulation/engineeringEvidence';
import type { EngineeringBasis as Basis } from '../domain/engineering';

export function EngineeringBasis({ assetId, providedBasis }: { assetId: string; providedBasis?: Basis }) {
  const [open, setOpen] = useState(false);
  const mine = useMineStore(s => s.mine);
  const scenario = useActiveScenario();
  const world = useDisplayWorld();
  const explanation = mine.sumps.some(s => s.id === assetId)
    ? 'Water stored changes by the water entering, plus transfers in, minus water pumped and any overflow. The water level is found from the sump’s storage curve. Δt is the step length in seconds; dividing by 3,600 converts hourly flows to the amount for that step.'
    : mine.pumps.some(p => p.id === assetId)
      ? 'The pump must overcome the height difference, receiving pressure and losses in the pipe. Q is water flow, H is head (energy per unit weight, shown in metres), and η is efficiency. Power depends on flow, head and efficiency.'
      : assetId === 'site:water'
        ? 'The water balance compares starting storage plus water entering with water leaving, overflow and ending storage. A residual near zero indicates numerical balance, not measurement accuracy.'
        : assetId === 'site:energy'
          ? 'Energy is power multiplied by time. Cost is the energy used in each interval multiplied by that interval’s assumed electricity price.'
          : null;
  const basis = useMemo(() => open ? providedBasis ?? engineeringBasis(mine, { ...scenario, overrides: world.scenarioSnapshot ?? scenario.overrides }, world, assetId) : null,
    [mine, scenario, world, assetId, open, providedBasis]);
  return <>
    <Button size="xs" data-engineering-proof={assetId} onClick={() => setOpen(true)}>Show Engineering Basis</Button>
    {basis && <Dialog open={open} onClose={() => setOpen(false)} title={basis.title} width="850px">
      <div className="space-y-3 p-4 text-xs text-ink-300">
        <p>{basis.quantity} · {basis.modelVersion}</p>
        {explanation && <p className="leading-relaxed"><strong>In plain language: </strong>{explanation}</p>}
        <div><h3 className="mb-1 font-semibold text-ink-100">Formula</h3><p className="overflow-x-auto border border-ink-700 bg-ink-950 p-3 font-mono text-signal-cyanBright">{basis.equation}</p></div>
        <TableShell><thead><tr><Th>Input</Th><Th>Value</Th><Th>Units</Th><Th>Source</Th></tr></thead><tbody>
          {basis.inputs.map(i => <tr key={i.name}><Td>{i.name}</Td><Td>{typeof i.value === 'number' ? Number(i.value.toPrecision(8)) : i.value}</Td><Td>{i.unit}</Td><Td>{i.source}</Td></tr>)}
        </tbody></TableShell>
        <h3 className="label-micro">Calculation trace</h3><ol className="list-decimal space-y-1 pl-4">{basis.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <h3 className="label-micro">Assumptions / provenance</h3>{basis.assumptions.map(a => <p key={a}>{a}</p>)}
        <p><strong>Data quality: </strong>{basis.quality}</p><p><strong>Sensitivity: </strong>{basis.sensitivity}</p>
        <h3 className="label-micro">Limitations</h3>{basis.limitations.map(l => <p key={l}>{l}</p>)}
        <p className="text-signal-amber"><strong>Validation status: </strong>{basis.validation}</p>
      </div>
    </Dialog>}
  </>;
}
