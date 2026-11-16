import type { GroundingDocument, DatasetManifest, DataSource } from '@mine-os/contracts';

/**
 * Internet/case-study grounding synthesized from deep research (retrieved 2026-11 context in this session).
 * Sources (provenance):
 * - MDPI Sustainability (2026): Assessing Mining-Related Water Impacts (Far West Rand, Ruhr, Wheal Jane, etc.) https://www.mdpi.com/2071-1050/18/4/1774
 * - PMC12031373 (2025): Proactive Maintenance of Pump Systems Operating in the Mining Industry—A Systematic Review https://pmc.ncbi.nlm.nih.gov/articles/PMC12031373/
 * - Seepex, Pumps&Systems, mine dewatering practice articles (operational factors: inflow, head, solids, standby, power)
 * These inform features, labels, scenarios and synthetic-grounded datasets; site-specific calibration still required.
 */

export const GROUNDING_DOCUMENTS: GroundingDocument[] = [
  {
    id: 'cs-mdpi-water-impacts-2026',
    title: 'Assessing Mining-Related Water Impacts: A Case Study-Based Systematic Review (selected cases)',
    url: 'https://www.mdpi.com/2071-1050/18/4/1774',
    sourceType: 'case_study',
    summary: 'Reviews dewatering-induced impacts and post-closure flooding across mine sites. Documents prolonged dewatering, large void volumes/pumping rates, subsidence/inundation risk if pumping stops (Ruhr), uncontrolled flooding/decant and contamination after pump cessation or failure (e.g. Wheal Jane 1992 spill ~50 ML/d decant event context), and dependence on continuous pumping/treatment.',
    extractedFacts: [
      'Sustained dewatering and pump operation are required to keep workings dry; cessation or failure leads to rising levels and potential uncontrolled overflow/flooding.',
      'Large-scale pumping can extend over long periods and large areas; loss of pumping creates widespread inundation/subsidence risks (Ruhr context).',
      'Post-closure rewatering of mine voids can take years to decades; uncontrolled flooding can overflow via shafts/adits/fractures into environment.',
      'Water management failures (pump stoppage, ownership/maintenance breakdown) have led to uncontrolled discharge/contamination events.',
    ],
    relevance: ['deepwater', 'safety', 'production', 'maintenance', 'engineering'],
    provenance: { retrievedVia: 'web-research', note: 'Public article; details summarized, not full-text extraction.' },
    retrievedAtMs: Date.now(),
  },
  {
    id: 'cs-pmc-pump-maintenance-2025',
    title: 'Proactive Maintenance of Pump Systems Operating in the Mining Industry—A Systematic Review',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12031373/',
    sourceType: 'paper',
    summary: 'Systematic review (88 papers) on mining pump maintenance: predictive/proactive maintenance, condition monitoring, diagnostics, dewatering system operation, reliability/efficiency optimization. Highlights harsh conditions, abrasive/corrosive media, unplanned downtime risks, and value of real-time monitoring (vibration, temperature, pressure, flow, power) and data-driven diagnostics.',
    extractedFacts: [
      'Pump failures and unplanned downtime disrupt operations, increase costs, and elevate safety risks, especially in underground dewatering.',
      'Condition indicators include vibration, temperature, pressure/flow deviations, power draw, leakage; degradation (wear, corrosion, cavitation, misalignment) precedes failure.',
      'Predictive/condition-based maintenance and real-time monitoring improve reliability and reduce downtime versus reactive approaches.',
      'Dewatering criticality requires high availability, redundancy/standby, and timely response to inefficiency or faults.',
    ],
    relevance: ['maintenance', 'engineering', 'deepwater', 'power'],
    provenance: { retrievedVia: 'web-research' },
    retrievedAtMs: Date.now(),
  },
  {
    id: 'cs-dewatering-practice-synthesis',
    title: 'Mine dewatering operational factors (industry synthesis)',
    sourceType: 'synthesis',
    summary: 'Operational guidance across dewatering sources: key factors include inflow rates, static head/lift, pipe sizing, solids/abrasion, pump selection (duty/standby), power reliability/backup, and maintenance access. Insufficient pumping capacity or failures lead to flooding, access issues, and production delays.',
    extractedFacts: [
      'Inflow exceeding discharge capacity causes sump level rise; time-to-threshold depends on net flow and storage geometry.',
      'Standby/redundant pumps and reliable power/backup are essential to manage peak inflow and failures.',
      'Variables affecting performance: inflow, head, distance, pipe condition, solids composition, pump condition/efficiency.',
      'Power outage or feeder loss removes pump capability unless backed by adequate supply; prioritization of critical dewatering loads matters.',
    ],
    relevance: ['deepwater', 'power', 'engineering', 'production', 'safety', 'maintenance'],
    provenance: { retrievedVia: 'web-research', sources: ['seepex', 'pumpsandsystems', 'general dewatering guidance'] },
    retrievedAtMs: Date.now(),
  },
];

export const CASE_STUDY_DATA_SOURCES: DataSource[] = GROUNDING_DOCUMENTS.map(d => ({
  id: d.id,
  kind: 'case_study',
  uri: d.url,
  description: d.summary,
  provenance: d.provenance,
  collectedAtMs: d.retrievedAtMs,
  quality: { type: 'secondary-synthesis', siteSpecific: false },
}));

export function buildGroundedDatasetManifest(version = '0.1.0'): DatasetManifest {
  return {
    id: 'mineos-grounded-scenarios',
    version,
    title: 'Grounded mining scenarios (case-study informed, synthetic/derived)',
    description: 'Scenario and feature/label specifications grounded in public mine dewatering, flooding, power-loss and pump-maintenance case studies/literature. Intended for bootstrapping, evaluation and calibration; must be supplemented with site data for deployment.',
    sources: CASE_STUDY_DATA_SOURCES,
    features: [
      { name: 'power.demand_kw', dtype: 'number', unit: 'kW' },
      { name: 'power.supply_kw', dtype: 'number', unit: 'kW' },
      { name: 'power.margin_kw', dtype: 'number', unit: 'kW' },
      { name: 'dewater.max_sump_fill_ratio', dtype: 'number' },
      { name: 'dewater.max_net_inflow_m3h', dtype: 'number', unit: 'm3/h' },
      { name: 'dewater.total_discharge_m3h', dtype: 'number', unit: 'm3/h' },
      { name: 'dewater.pumps_running', dtype: 'number' },
      { name: 'dewater.pumps_unavailable', dtype: 'number' },
      { name: 'production.min_zone_ratio', dtype: 'number' },
      { name: 'maintenance.pump_concerns', dtype: 'number' },
      { name: 'safety.critical_flood_flags', dtype: 'number' },
    ],
    labels: [
      { name: 'flood_risk_high', dtype: 'boolean', description: 'Sump breach/overflow or time-to-critical within critical horizon', horizon: '0-6h' },
      { name: 'power_constrained', dtype: 'boolean', description: 'Demand exceeds available supply for critical loads' },
      { name: 'production_restricted', dtype: 'boolean', description: 'One or more zones below safe/nominal throughput' },
      { name: 'pump_failure_likely', dtype: 'boolean', description: 'Degradation/condition indicators suggest elevated failure risk', horizon: 'shift-to-weeks' },
    ],
    recordCount: 0,
    createdAtMs: Date.now(),
    provenance: { grounding: GROUNDING_DOCUMENTS.map(d => d.id), note: 'Scaffold manifest; populate records from simulation backtests and curated case-study encodings.' },
  };
}

/** Scenario archetypes derived from case studies for data generation/evaluation. */
export const GROUNDED_SCENARIO_ARCHETYPES = [
  { id: 'power-loss-dewatering', description: 'Feeder/generator loss removes pump capacity -> sump rise -> access/production risk', agents: ['power', 'deepwater', 'production', 'safety'], indicators: ['negative/low margin', 'falling discharge', 'rising fill/net inflow', 'declining zone ratio'] },
  { id: 'pump-degradation-failure', description: 'Wear/blockage reduces delivered flow while running -> imbalance and rising levels', agents: ['maintenance', 'deepwater', 'engineering'], indicators: ['running no/low flow', 'low condition', 'efficiency/power deviation', 'net positive inflow'] },
  { id: 'inflow-surge', description: 'Influx (rainfall/ingress/event) exceeds available pumping -> threshold breach risk', agents: ['deepwater', 'safety', 'production'], indicators: ['high inflow', 'max net inflow', 'high fill/time-to-critical'] },
  { id: 'instrumentation-loss', description: 'Telemetry stale/expired reduces observability and confidence in decisions', agents: ['maintenance', 'safety', 'engineering'], indicators: ['stale sensors', 'uncertainty increase'] },
  { id: 'compound-cascade', description: 'Power fault + pump unavailability + inflow -> multi-domain impact (case-study pattern)', agents: ['power', 'deepwater', 'production', 'engineering', 'maintenance', 'safety'], indicators: ['multiple domain flags', 'conflicts', 'critical flood'] },
];
