import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardList,
  Factory,
  FlaskConical,
  Mountain,
  Network,
  Radio,
  ShieldCheck,
  Siren,
  TrendingUp,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '../domain/types';

export type ModuleId =
  | 'engineering'
  | 'mission-control'
  | 'digital-twin'
  | 'dewatering'
  | 'impact'
  | 'incidents'
  | 'energy'
  | 'production'
  | 'scenarios'
  | 'forecast'
  | 'assets'
  | 'telemetry'
  | 'decisions'
  | 'analytics'
  | 'governance';

export interface ModuleDefinition {
  id: ModuleId;
  path: string;
  label: string;
  short: string;
  group: 'Operate' | 'Intelligence' | 'Engineering' | 'System';
  icon: LucideIcon;
  capability: Capability;
  description: string;
  product?: 'deepwater' | 'impact' | 'core';
}

export const MODULES: ModuleDefinition[] = [
  { id: 'engineering', path: '/app/engineering', label: 'Engineering Challenge & Resilience Lab', short: 'Engineering Lab',
    group: 'Engineering', icon: FlaskConical, capability: 'view.mission-control',
    description: 'Hydraulic curves, joint failures, traceable evidence, constrained recovery and engineering challenges.', product: 'core' },
  {
    id: 'mission-control',
    path: '/app',
    label: 'Mission Control',
    short: 'Mission Control',
    group: 'Operate',
    icon: Activity,
    capability: 'view.mission-control',
    description: 'One operating picture across water, power, production and response.',
    product: 'core',
  },
  {
    id: 'digital-twin',
    path: '/app/digital-twin',
    label: 'Digital Twin',
    short: 'Digital Twin',
    group: 'Operate',
    icon: Network,
    capability: 'view.mission-control',
    description: 'Dependency graph of the synthetic mine with cascading failure paths.',
    product: 'core',
  },
  {
    id: 'dewatering',
    path: '/app/dewatering',
    label: 'DeepWater Intelligence',
    short: 'DeepWater',
    group: 'Intelligence',
    icon: Waves,
    capability: 'view.deepwater',
    description: 'Sump water balance, forecast bands and pumping capability.',
    product: 'deepwater',
  },
  {
    id: 'impact',
    path: '/app/impact',
    label: 'Mine Impact Intelligence',
    short: 'Mine Impact',
    group: 'Intelligence',
    icon: Mountain,
    capability: 'view.impact',
    description: 'Translate physical water risk into production, cost and recovery exposure.',
    product: 'impact',
  },
  {
    id: 'incidents',
    path: '/app/incidents',
    label: 'Incident Command',
    short: 'Incidents',
    group: 'Operate',
    icon: Siren,
    capability: 'view.mission-control',
    description: 'Correlated incidents with evidence, hypotheses and audited workflow.',
    product: 'core',
  },
  {
    id: 'energy',
    path: '/app/energy',
    label: 'Energy & Power',
    short: 'Energy',
    group: 'Engineering',
    icon: Zap,
    capability: 'view.deepwater',
    description: 'Feeder capability, pump demand, specific energy and cost.',
    product: 'deepwater',
  },
  {
    id: 'production',
    path: '/app/production',
    label: 'Production Exposure',
    short: 'Production',
    group: 'Engineering',
    icon: Factory,
    capability: 'view.impact',
    description: 'Zone availability, throughput loss and value at risk.',
    product: 'impact',
  },
  {
    id: 'forecast',
    path: '/app/forecast',
    label: 'Forecast & Reliability',
    short: 'Forecast',
    group: 'Engineering',
    icon: TrendingUp,
    capability: 'view.analytics',
    description: 'Deterministic projections, sensitivity and deterioration trends.',
    product: 'deepwater',
  },
  {
    id: 'analytics',
    path: '/app/analytics',
    label: 'Engineering Analytics',
    short: 'Analytics',
    group: 'Engineering',
    icon: BarChart3,
    capability: 'view.analytics',
    description: 'Water balance, energy, reliability and model self-checks.',
    product: 'core',
  },
  {
    id: 'assets',
    path: '/app/assets',
    label: 'Asset Register',
    short: 'Assets',
    group: 'System',
    icon: Boxes,
    capability: 'view.mission-control',
    description: 'Every modelled asset with condition, dependencies and evidence.',
    product: 'core',
  },
  {
    id: 'scenarios',
    path: '/app/scenarios',
    label: 'Scenario Lab',
    short: 'Scenarios',
    group: 'System',
    icon: FlaskConical,
    capability: 'view.analytics',
    description: 'Branch, compare and replay engineering what-if cases.',
    product: 'core',
  },
  {
    id: 'decisions',
    path: '/app/decisions',
    label: 'Decision Ledger',
    short: 'Decisions',
    group: 'System',
    icon: ClipboardList,
    capability: 'view.analytics',
    description: 'The reasoning trail behind every intervention, with evidence.',
    product: 'core',
  },
  {
    id: 'telemetry',
    path: '/app/telemetry',
    label: 'Telemetry & Integrations',
    short: 'Telemetry',
    group: 'System',
    icon: Radio,
    capability: 'view.integration',
    description: 'Tag health, adapter contracts and what a real connection would require.',
    product: 'core',
  },
  {
    id: 'governance',
    path: '/app/governance',
    label: 'Governance & Safety',
    short: 'Governance',
    group: 'System',
    icon: ShieldCheck,
    capability: 'view.mission-control',
    description: 'Demonstration boundaries, role limits and deployment readiness.',
    product: 'core',
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleDefinition> = Object.fromEntries(
  MODULES.map((module) => [module.id, module]),
) as Record<ModuleId, ModuleDefinition>;

export const MODULE_GROUPS: Array<ModuleDefinition['group']> = ['Operate', 'Intelligence', 'Engineering', 'System'];

export function moduleByPath(pathname: string): ModuleDefinition {
  const exact = MODULES.find((module) => module.path === pathname);
  if (exact) return exact;
  const nested = [...MODULES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((module) => module.path !== '/app' && pathname.startsWith(module.path));
  return nested ?? MODULE_BY_ID['mission-control'];
}
