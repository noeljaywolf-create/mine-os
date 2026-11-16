import type { PlaybookRule } from './rules';

export interface ScenarioExpectation {
  agentId?: string;
  flags?: string[]; // expected finding types/keywords
  minConfidence?: number;
}

export interface RegressionScenario {
  id: string;
  version: string;
  title: string;
  description: string;
  archetype: string;
  snapshot: any; // synthetic/recorded snapshot
  expectations: ScenarioExpectation[];
  tags: string[];
  provenance: Record<string, unknown>;
}

export interface ScenarioRunResult {
  scenarioId: string;
  atMs: number;
  passed: boolean;
  checks: Array<{ description: string; passed: boolean; detail?: string }>;
  agentSummaries: Array<{ agentId: string; summary: string; findings: number; conflicts: number }>;
}

export function checkScenarioResult(scenario: RegressionScenario, agentResults: Array<{ agentId: string; report: any }>): ScenarioRunResult {
  const checks: ScenarioRunResult['checks'] = [];
  for (const exp of scenario.expectations) {
    const res = exp.agentId ? agentResults.find(r => r.agentId === exp.agentId) : undefined;
    if (exp.agentId && !res) { checks.push({ description: `Agent ${exp.agentId} produced a result`, passed: false, detail: 'missing' }); continue; }
    const findingsText = JSON.stringify(res?.report?.findings || []).toLowerCase() + ' ' + String(res?.report?.summary || '').toLowerCase();
    for (const flag of (exp.flags || [])) {
      checks.push({ description: `${exp.agentId || 'any'} indicates ${flag}`, passed: findingsText.includes(flag.toLowerCase()), detail: flag });
    }
  }
  if (checks.length === 0) checks.push({ description: 'Scenario executed', passed: agentResults.length > 0, detail: `${agentResults.length} agent results` });
  return {
    scenarioId: scenario.id,
    atMs: Date.now(),
    passed: checks.every(c => c.passed),
    checks,
    agentSummaries: agentResults.map(r => ({ agentId: r.agentId, summary: r.report?.summary, findings: (r.report?.findings || []).length, conflicts: (r.report?.conflicts || []).length })),
  };
}

export const DEFAULT_SCENARIOS: RegressionScenario[] = [
  {
    id: 'scn-power-loss-dewatering', version: '1.0.0', title: 'Power loss impacts dewatering', archetype: 'power-loss-dewatering',
    description: 'Feeder loss -> insufficient supply vs demand -> reduced discharge and rising sump risk.',
    snapshot: { id: 'scn-snap-1', siteId: 'scenario-site', data: { feeders: { F1: { status: 'failed', supplyRatio: 0, availableKw: 0 } }, pumps: { P1: { mode: 'running', powerKw: 200, deliveredFlowM3h: 0, powered: false, status: 'blocked' }, P2: { mode: 'stopped', powerKw: 0, deliveredFlowM3h: 0, powered: false, status: 'offline' } }, sumps: { S1: { levelM: 8.5, fillRatio: 0.88, inflowM3h: 120, outflowM3h: 0, netM3h: 120, secondsToCritical: 7200, breach: { severity: 'warning', label: 'warning' } } }, zones: { Z1: { operatingRatio: 0.7, status: 'degraded', constrainedBy: 'sump:S1' } }, sensors: {}, assets: {} } },
    expectations: [{ agentId: 'power', flags: ['constrained', 'feeder'] }, { agentId: 'deepwater', flags: ['net'] }, { agentId: 'safety', flags: ['warning', 'flood'] }],
    tags: ['power', 'dewatering', 'cascade'], provenance: { source: 'grounded-archetype' }
  },
  {
    id: 'scn-pump-no-flow', version: '1.0.0', title: 'Pump running without effective flow', archetype: 'pump-degradation-failure',
    description: 'Running pump delivers negligible flow causing imbalance.',
    snapshot: { id: 'scn-snap-2', siteId: 'scenario-site', data: { feeders: { F1: { status: 'energised', supplyRatio: 1, availableKw: 500 } }, pumps: { P1: { mode: 'running', powerKw: 180, deliveredFlowM3h: 0, powered: true, status: 'degraded', condition: 0.55 } }, sumps: { S1: { levelM: 7.2, fillRatio: 0.72, inflowM3h: 80, outflowM3h: 0, netM3h: 80, secondsToCritical: 14400 } }, zones: { Z1: { operatingRatio: 0.9, status: 'degraded' } }, sensors: {}, assets: {} } },
    expectations: [{ agentId: 'deepwater', flags: ['negligible flow', 'delivery'] }, { agentId: 'maintenance', flags: ['concern'] }],
    tags: ['maintenance', 'dewatering'], provenance: { source: 'grounded-archetype' }
  },
  {
    id: 'scn-nominal', version: '1.0.0', title: 'Nominal stable operation', archetype: 'nominal',
    description: 'Adequate power, discharge exceeds/ balances inflow, zones unconstrained.',
    snapshot: { id: 'scn-snap-3', siteId: 'scenario-site', data: { feeders: { F1: { status: 'energised', supplyRatio: 1, availableKw: 600 } }, pumps: { P1: { mode: 'running', powerKw: 150, deliveredFlowM3h: 100, powered: true, status: 'operational', condition: 0.95 } }, sumps: { S1: { levelM: 4.0, fillRatio: 0.4, inflowM3h: 80, outflowM3h: 100, netM3h: -20, secondsToCritical: null } }, zones: { Z1: { operatingRatio: 1.0, status: 'operational' } }, sensors: { SEN1: { freshness: 'live' } }, assets: {} } },
    expectations: [{ agentId: 'power', flags: ['stable', 'margin'] }, { agentId: 'deepwater', flags: ['managed'] }],
    tags: ['nominal'], provenance: { source: 'grounded-archetype' }
  }
];
