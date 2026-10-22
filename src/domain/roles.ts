import type { Capability, RoleDefinition, UserRole } from './types';

/**
 * Demonstration roles.
 *
 * These are NOT an authentication system. Selecting a role only changes what the
 * demonstration permits the operator to attempt, so the difference between an
 * electrical engineer and an executive viewer is visible and reviewable.
 */
export const ROLES: RoleDefinition[] = [
  {
    id: 'control-room-operator',
    name: 'Control Room Operator',
    title: 'Control Room · 24h Operations',
    remit:
      'Monitors the integrated operating picture, acknowledges emerging conditions, starts and stops plant within delegated limits and escalates to engineering.',
    capabilities: [
      'view.mission-control',
      'view.deepwater',
      'view.impact',
      'view.analytics',
      'asset.restore',
      'pump.start',
      'pump.stop',
      'pump.toggle-standby',
      'incident.acknowledge',
      'incident.assign',
      'incident.comment',
      'incident.propose-mitigation',
      'incident.execute-mitigation',
      'report.export',
    ],
    restrictions: [
      'Cannot fail or permanently disable plant.',
      'Cannot approve mitigation proposals.',
      'Cannot edit engineering assumptions.',
      'Cannot modify integration tag configuration.',
    ],
    defaultModule: 'mission-control',
  },
  {
    id: 'electrical-engineer',
    name: 'Electrical Engineer',
    title: 'Power Distribution & Protection',
    remit:
      'Owns feeder condition, protection events, load balance and the electrical root-cause hypotheses behind power-related disruption.',
    capabilities: [
      'view.mission-control',
      'view.impact',
      'view.analytics',
      'view.integration',
      'asset.fail',
      'asset.restore',
      'pump.start',
      'pump.stop',
      'pump.toggle-standby',
      'incident.acknowledge',
      'incident.assign',
      'incident.comment',
      'incident.propose-mitigation',
      'incident.approve-mitigation',
      'incident.execute-mitigation',
      'incident.resolve',
      'decision.record',
      'report.export',
      'integration.configure',
    ],
    restrictions: [
      'Cannot approve dewatering engineering assumptions without the Dewatering Engineer.',
      'Cannot close an incident while safety review is outstanding.',
    ],
    defaultModule: 'mine-impact',
  },
  {
    id: 'mechanical-engineer',
    name: 'Mechanical Engineer',
    title: 'Rotating Equipment & Reliability',
    remit:
      'Owns pump and plant condition, degradation modelling, duty selection, maintenance strategy and mechanical root-cause hypotheses.',
    capabilities: [
      'view.mission-control',
      'view.impact',
      'view.analytics',
      'asset.fail',
      'asset.restore',
      'pump.start',
      'pump.stop',
      'pump.toggle-standby',
      'incident.acknowledge',
      'incident.assign',
      'incident.comment',
      'incident.propose-mitigation',
      'incident.approve-mitigation',
      'incident.execute-mitigation',
      'incident.resolve',
      'decision.record',
      'report.export',
    ],
    restrictions: [
      'Cannot approve electrical switching actions.',
      'Cannot edit the financial assumptions set by the Mine Manager.',
    ],
    defaultModule: 'assets',
  },
  {
    id: 'dewatering-engineer',
    name: 'Dewatering Engineer',
    title: 'Hydrogeology & Dewatering',
    remit:
      'Owns the water balance, sump capacity, inflow modelling, pumping strategy and the engineering validation of every dewatering forecast.',
    capabilities: [
      'view.mission-control',
      'view.deepwater',
      'view.impact',
      'view.analytics',
      'view.finance',
      'asset.fail',
      'asset.restore',
      'pump.start',
      'pump.stop',
      'pump.toggle-standby',
      'scenario.create',
      'scenario.clone',
      'scenario.edit-assumptions',
      'scenario.execute',
      'incident.acknowledge',
      'incident.assign',
      'incident.comment',
      'incident.propose-mitigation',
      'incident.approve-mitigation',
      'incident.execute-mitigation',
      'incident.resolve',
      'decision.record',
      'report.export',
    ],
    restrictions: [
      'Cannot modify feeder protection settings.',
      'Cannot close a safety incident without the Safety Officer.',
    ],
    defaultModule: 'deepwater',
  },
  {
    id: 'mine-manager',
    name: 'Mine Manager',
    title: 'Site Leadership',
    remit:
      'Balances production continuity against engineered risk, approves mitigation plans, and owns the commercial consequences of operational decisions.',
    capabilities: [
      'view.mission-control',
      'view.deepwater',
      'view.impact',
      'view.analytics',
      'view.finance',
      'scenario.create',
      'scenario.clone',
      'scenario.edit-assumptions',
      'scenario.execute',
      'incident.acknowledge',
      'incident.assign',
      'incident.comment',
      'incident.propose-mitigation',
      'incident.approve-mitigation',
      'incident.execute-mitigation',
      'incident.resolve',
      'incident.close',
      'incident.review',
      'decision.record',
      'report.export',
    ],
    restrictions: ['Cannot directly change plant state outside an approved mitigation plan.'],
    defaultModule: 'mission-control',
  },
  {
    id: 'safety-officer',
    name: 'Safety Officer',
    title: 'Risk, Compliance & Assurance',
    remit:
      'Independent challenge on life-safety exposure, escalation of critical conditions, review of mitigation plans and closure assurance.',
    capabilities: [
      'view.mission-control',
      'view.deepwater',
      'view.impact',
      'view.analytics',
      'incident.acknowledge',
      'incident.assign',
      'incident.comment',
      'incident.propose-mitigation',
      'incident.approve-mitigation',
      'incident.escalate',
      'incident.resolve',
      'incident.close',
      'incident.review',
      'decision.record',
      'report.export',
    ],
    restrictions: [
      'Cannot approve production-continuity mitigations without engineering evidence.',
      'Cannot modify plant state.',
    ],
    defaultModule: 'incidents',
  },
  {
    id: 'executive-viewer',
    name: 'Executive Viewer',
    title: 'Board & Corporate',
    remit:
      'Reads the modelled situation, exposure and evidence. Cannot operate plant or approve mitigations in the demonstration.',
    capabilities: ['view.mission-control', 'view.analytics', 'view.finance', 'report.export'],
    restrictions: [
      'Read-only across the workspace.',
      'No operational or approval actions are available.',
    ],
    defaultModule: 'mission-control',
  },
];

export const ROLE_BY_ID: Record<UserRole, RoleDefinition> = ROLES.reduce(
  (acc, role) => {
    acc[role.id] = role;
    return acc;
  },
  {} as Record<UserRole, RoleDefinition>,
);

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return ROLE_BY_ID[role]?.capabilities.includes(capability) ?? false;
}

export function roleName(role: UserRole): string {
  return ROLE_BY_ID[role]?.name ?? role;
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'view.mission-control': 'Mission Control',
  'view.deepwater': 'DeepWater Intelligence',
  'view.impact': 'Mine Impact Intelligence',
  'view.analytics': 'Engineering Analytics',
  'view.finance': 'Financial exposure',
  'view.integration': 'Integration Studio',
  'asset.fail': 'Fail plant (simulated)',
  'asset.restore': 'Restore plant (simulated)',
  'pump.start': 'Start pump',
  'pump.stop': 'Stop pump',
  'pump.toggle-standby': 'Change pump duty',
  'scenario.create': 'Create scenario',
  'scenario.clone': 'Branch scenario',
  'scenario.edit-assumptions': 'Edit engineering assumptions',
  'scenario.execute': 'Execute scenario',
  'incident.acknowledge': 'Acknowledge incident',
  'incident.assign': 'Assign incident',
  'incident.comment': 'Comment on incident',
  'incident.propose-mitigation': 'Propose mitigation',
  'incident.approve-mitigation': 'Approve mitigation',
  'incident.escalate': 'Escalate incident',
  'incident.execute-mitigation': 'Execute mitigation',
  'incident.resolve': 'Resolve incident',
  'incident.close': 'Close incident',
  'incident.review': 'Open post-incident review',
  'decision.record': 'Record engineering decision',
  'report.export': 'Export reports & data',
  'integration.configure': 'Configure integration tags',
  'settings.role': 'Change demonstration role',
};

export const ROLE_SIMULATOR_NOTICE =
  'Role switching in this demonstration changes which actions the interface offers. It is not authentication, it grants no access to any real system, and it must not be presented as an authorisation control.';
