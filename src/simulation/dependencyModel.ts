import type { MineDefinition } from '../domain/mine';

export type IndustrialRelationship = 'electrical' | 'hydraulic' | 'mechanical' | 'process' | 'capacity'
  | 'standby-substitution' | 'access' | 'operational-schedule' | 'human-approval' | 'instrumentation';
export interface EngineeringRelationship { from: string; to: string; kind: IndustrialRelationship; condition: string; evaluator: string; }
/** Read-only semantics derived from canonical equipment and links, not another graph/state engine. */
export function engineeringRelationships(mine: MineDefinition): EngineeringRelationship[] {
  const relationships: EngineeringRelationship[] = mine.dependencies.map(d => ({ from: d.from, to: d.to,
    kind: d.type === 'powered_by' ? 'electrical' : d.type === 'pumps_from' || d.type === 'drains_to' ? 'hydraulic'
      : d.type === 'monitors' ? 'instrumentation' : d.type === 'feeds' ? 'process' : 'access',
    condition: d.type === 'powered_by' ? 'Path energised AND motor/service budget allocated, not merely feeder colour.'
      : d.type === 'supports' ? 'Storage crosses a configured access/production threshold; no automatic instantaneous production stop.' : d.rationale,
    evaluator: d.type === 'powered_by' ? 'plant.ts' : d.type === 'supports' ? 'production.ts / waterNetwork.ts' : d.type === 'monitors' ? 'sensors.ts' : 'engine.ts / hydraulics.ts' }));
  for (const sump of mine.sumps) {
    const station = mine.pumps.filter(p => p.sumpId === sump.id);
    for (const p of station.filter(p => p.mode === 'standby')) relationships.push({ from: p.id, to: sump.id, kind: 'standby-substitution',
      condition: 'Requires healthy equipment, allocated electrical supply and a solvable shared-main operating point.', evaluator: 'plant.ts / engineeringStudies.ts' });
    relationships.push({ from: sump.id, to: station.map(p => p.id).join(', '), kind: 'capacity', condition: 'Shared pipe diameter, Darcy resistance, valve position and available motor kW constrain discharge.', evaluator: 'hydraulics.ts' });
    if (station.length > 1) relationships.push({ from: station[0].id, to: station[1].id, kind: 'mechanical', condition: 'In hypothetical series configuration all train units must run; no unmodelled bypass.', evaluator: 'plant.ts' });
  }
  for (const zone of mine.zones) relationships.push({ from: 'scenario-clock', to: zone.id, kind: 'operational-schedule', condition: 'Configured daily shift must be active; no foregone-tonnage accumulation outside planned work.', evaluator: 'production.ts' });
  for (const route of mine.materialHandling?.routes ?? []) relationships.push({ from: route.id, to: 'mat-hoist', kind: 'capacity',
    condition: 'Primary or explicitly enabled shared alternate route capacity, common hoist and finite receiving inventory jointly bound transported ore.', evaluator: 'materialHandling.ts maximum flow / inventory ledger' });
  relationships.push({ from: 'scenario-switching-review', to: 'backup-distribution', kind: 'human-approval', condition: 'Scenario prerequisite only. Actual approval/authorisation cannot be determined by this demo.', evaluator: 'plant.ts engineering.switchingApproved' });
  return relationships;
}
