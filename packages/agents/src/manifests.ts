import type { AgentManifest } from '@mine-os/contracts';

export const AGENT_MANIFESTS: AgentManifest[] = [
  { id: 'power', name: 'Power Agent', domain: 'power', version: '0.1.0', description: 'Supply/runtime analysis, feeder and backup power implications.', tools: ['power.supply_analysis','power.runtime_projection'], inputs: ['snapshots.telemetry','snapshots.derived'], outputs: ['evidence','report'], deterministicPreferred: true },
  { id: 'deepwater', name: 'DeepWater Agent', domain: 'dewatering', version: '0.1.0', description: 'Pumping and inflow implications, sump/storage risk.', tools: ['water.balance','water.inflow_projection'], inputs: ['snapshots.telemetry','snapshots.derived'], outputs: ['evidence','report'], deterministicPreferred: true },
  { id: 'production', name: 'Production Agent', domain: 'production', version: '0.1.0', description: 'Production trade-offs and throughput/access impact.', tools: ['production.impact'], inputs: ['snapshots.derived'], outputs: ['evidence','report'], deterministicPreferred: true },
  { id: 'engineering', name: 'Engineering Agent', domain: 'engineering', version: '0.1.0', description: 'Equipment and network feasibility.', tools: ['engineering.feasibility'], inputs: ['snapshots.derived'], outputs: ['evidence','report'], deterministicPreferred: true },
  { id: 'maintenance', name: 'Maintenance Agent', domain: 'maintenance', version: '0.1.0', description: 'Faults, isolations and condition evidence.', tools: ['maintenance.condition'], inputs: ['snapshots.telemetry','decisions.history'], outputs: ['evidence','report'], deterministicPreferred: true },
  { id: 'safety', name: 'Safety Agent', domain: 'safety', version: '0.1.0', description: 'Interpretation of operating restrictions and safety constraints.', tools: ['safety.constraints'], inputs: ['policy','snapshots.derived'], outputs: ['evidence','report'], deterministicPreferred: true },
];

export function getAgentManifest(id: string) { return AGENT_MANIFESTS.find(a => a.id === id); }