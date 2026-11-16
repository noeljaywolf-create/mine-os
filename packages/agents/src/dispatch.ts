import type { TaskContract } from '@mine-os/contracts';
import type { AgentInput, AgentResult } from './types';
import { runPowerAgent } from './power';
import { runDeepWaterAgent } from './deepwater';
import { runProductionAgent } from './production';
import { runEngineeringAgent } from './engineering';
import { runMaintenanceAgent } from './maintenance';
import { runSafetyAgent } from './safety';
import { makeEvidence, makeReport } from './types';

export function runSpecialistAgent(task: TaskContract, input: AgentInput): AgentResult {
  switch (task.agentId) {
    case 'power': return runPowerAgent(task, input);
    case 'deepwater': return runDeepWaterAgent(task, input);
    case 'production': return runProductionAgent(task, input);
    case 'engineering': return runEngineeringAgent(task, input);
    case 'maintenance': return runMaintenanceAgent(task, input);
    case 'safety': return runSafetyAgent(task, input);
    default: {
      const ev = makeEvidence({ i: 1, task, kind: 'hypothesis', claim: `No implementation for agent ${task.agentId}`, confidence: 0, provenance: { error: 'unknown-agent' } });
      return {
        report: makeReport({ task, agentVersion: '0.0.0', summary: `Unknown agent: ${task.agentId}`, evidenceIds: [ev.id], uncertainties: ['Agent not implemented'], assumptions: [], recommendations: [], conflicts: [], findings: [] }),
        evidence: [ev],
      };
    }
  }
}
