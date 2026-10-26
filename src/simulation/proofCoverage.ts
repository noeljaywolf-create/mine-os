import type { MineDefinition } from '../domain/mine';
import type { EngineeringBasis } from '../domain/engineering';
import type { Scenario, WorldState } from '../domain/types';
import { engineeringBasis } from './engineeringEvidence';
import { challengeBasis, diagnosticBasis, forecastBasis, investmentBasis, recoveryBasis } from './analysisEvidence';

/** Inventory of every consequence family in this engineering increment.
 * Context-bound proofs must be opened against the actual computed study/report. */
export const ANALYSIS_PROOFS = [
  { id: 'analysis:recovery', label: 'Achieved recovery, exposure, resource/energy cost and revenue', source: 'engineeringStudies.ts / recovery.ts', screen: 'Intervention comparison', factory: recoveryBasis },
  { id: 'analysis:diagnostics', label: 'Observation residuals, hypotheses and restoration counterfactuals', source: 'diagnostics.ts', screen: 'Failure investigation / challenges', factory: diagnosticBasis },
  { id: 'analysis:challenge', label: 'Evidence, causal claims, dimensional explanation and scoring', source: 'investigation.ts', screen: 'Engineer challenges', factory: challengeBasis },
  { id: 'analysis:investment', label: 'Capital assumptions, operating cost and avoided deferred tonnes', source: 'engineeringStudies.ts', screen: 'Investment planning', factory: investmentBasis },
  { id: 'analysis:forecast', label: 'Forecast trajectories, sensitivity envelopes and threshold arrivals', source: 'forecast.ts / projection.ts', screen: 'Forecast', factory: forecastBasis },
];
const NUMERIC_FIELDS = {
  pumps: ['deliveredFlowM3h', 'averageInputPowerKw', 'energyCostUSD', 'condition', 'dischargeContributionM3h', 'energyKwh', 'flowM3h', 'availableFlowM3h', 'powerKw', 'dutyFactor'],
  sumps: ['volumeM3', 'levelM', 'inflowM3h', 'outflowM3h', 'fillRatio', 'secondsToCritical'],
  feeders: ['servicesAllocatedKw', 'allocatedKw', 'availableKw', 'connectedLoadKw', 'capacityKva', 'supplyRatio'],
  zones: ['recoveryRatio', 'rateTph', 'operatingRatio', 'lostHours', 'lostTonnes', 'lostValueUSD'],
  assets: ['effectiveness', 'confidence'],
  sensors: ['lastValue', 'ageSec', 'confidence'],
};
export function basisIssues(b: EngineeringBasis) {
  const issues: string[] = [];
  for (const key of ['title', 'quantity', 'equation', 'modelVersion', 'quality', 'sensitivity', 'validation'] as const) if (!b[key]?.trim()) issues.push(`Missing ${key}`);
  if (!b.assumptions.length || !b.limitations.length || !b.steps.length) issues.push('Missing assumptions, limitations or trace');
  for (const input of b.inputs) if (!input.name || !input.unit || !input.source || typeof input.value === 'number' && !Number.isFinite(input.value)) issues.push(`Invalid input provenance/value: ${input.name}`);
  if (b.equation === 'Unsupported') issues.push('No registered numerical capability');
  return issues;
}
export function proofCoverage(mine: MineDefinition, scenario: Scenario, world: WorldState) {
  const ids = [...mine.pumps, ...mine.sumps, ...mine.feeders, ...mine.zones, ...mine.sensors, ...(mine.materialHandling?.routes ?? [])].map(a => a.id);
  ids.push(mine.plant.id, ...(mine.materialHandling ? ['mat-hoist'] : []), 'site:water', 'site:power', 'site:energy', 'site:production', 'site:quality', 'site:dependencies');
  const rows = [...new Set(ids)].map(id => {
    const b = engineeringBasis(mine, scenario, world, id);
    const issues = basisIssues(b);
    return { id, label: b.quantity, source: 'engineeringEvidence.ts → canonical domain/solver/ledger', screen: 'Asset inspector / schematics / validation', status: issues.length ? 'Gap' : 'Traceable snapshot proof', issues };
  });
  const uncoveredNumericFields: string[] = [];
  for (const [group, fields] of Object.entries(NUMERIC_FIELDS)) {
    const records = world[group as keyof typeof NUMERIC_FIELDS];
    for (const [id, state] of Object.entries(records)) for (const [key, value] of Object.entries(state)) {
      if (typeof value === 'number' && !fields.includes(key)) uncoveredNumericFields.push(`${group}.${id}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(world)) if (typeof value === 'number' && !['step', 'oreBufferTonnes', 'plantProcessedTonnes', 'deferredTonnes', 'permanentLostTonnes'].includes(key)) uncoveredNumericFields.push(`world.${key}`);
  const nested: Array<[string, object | undefined, string[]]> = [
    ['waterLedger', world.waterLedger, ['durationSec', 'initialM3', 'finalM3', 'externalInM3', 'externalOutM3', 'overflowM3', 'residualM3']],
    ['waterTotals', world.waterTotals, ['initialM3', 'externalInM3', 'externalOutM3', 'overflowM3', 'residualM3']],
    ['materialLedger', world.materialLedger, ['initialBufferTonnes', 'producedTonnes', 'processedTonnes', 'finalBufferTonnes', 'capacityTonnes', 'deferredProcessingTonnes', 'heldAtFaceTonnes', 'residualTonnes']],
    ['materialFlow', world.materialFlow, ['totalTph']],
    ...Object.entries(world.pumps).map(([id, p]): [string, object | undefined, string[]] => [`pumps.${id}.hydraulic`, p.hydraulic, ['staticHeadM', 'unitHeadM', 'effectiveSpeedRatio', 'flowM3h', 'headM', 'frictionHeadM', 'minorHeadM', 'reynolds', 'frictionFactor', 'efficiency', 'hydraulicPowerKw', 'electricalPowerKw', 'residualM', 'iterations']]),
  ];
  for (const [path, record, fields] of nested) for (const [key, value] of Object.entries(record ?? {})) if (typeof value === 'number' && (!fields.includes(key) || !Number.isFinite(value))) uncoveredNumericFields.push(`${path}.${key}`);
  return { rows, analyses: ANALYSIS_PROOFS.map(({ factory, ...entry }) => ({ ...entry, status: typeof factory === 'function' ? 'Context-bound proof implemented' : 'Gap' })),
    uncoveredNumericFields, gaps: rows.filter(r => r.issues.length).length + uncoveredNumericFields.length,
    unsupported: ['Calibrated fault probability / permanent production loss', 'Motor amperes, fault currents, protection coordination and arc flash', 'Spatial 3D inundation, NPSH and transient hydraulics', 'Legacy reliability predictions without calibrated observations'],
    scope: 'All registered canonical pump/sump/feeder/zone/sensor/material/plant outputs, site ledgers and five study/evidence families. Non-numerical UI counts are metadata. This is implementation provenance, not field validation.' };
}
