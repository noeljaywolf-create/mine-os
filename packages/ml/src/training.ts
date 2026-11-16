import type { TrainingJobSpec } from '@mine-os/contracts';

/**
 * Training job templates/configs (scaffolding). Actual execution requires a training runtime (Python/sklearn/PyTorch)
 * and datasets; jobs are serialized, reproducible specs with seeds and provenance.
 */

export function createTrainingJob(spec: Omit<TrainingJobSpec, 'id' | 'createdAtMs'> & { id?: string }): TrainingJobSpec {
  return {
    id: spec.id ?? `train-${spec.modelId}-${Date.now()}`,
    createdAtMs: Date.now(),
    ...spec,
  };
}

export const AGENT_TRAINING_TARGETS: Record<string, Array<{ target: string; taskType: TrainingJobSpec['taskType']; description: string; suggestedLabels: string[] }>> = {
  power: [
    { target: 'power_constraint_risk', taskType: 'risk_scoring', description: 'Risk of supply-demand constraint or feeder loss impacting critical loads', suggestedLabels: ['constraint_event', 'load_shed', 'feeder_trip'] },
    { target: 'backup_sufficiency', taskType: 'classification', description: 'Whether backup/generation is sufficient under projected demand', suggestedLabels: ['backup_adequate'] },
  ],
  deepwater: [
    { target: 'sump_overflow_risk', taskType: 'risk_scoring', description: 'Risk of sump threshold breach/overflow within horizon', suggestedLabels: ['threshold_breach', 'overflow', 'time_to_critical_bucket'] },
    { target: 'inflow_forecast', taskType: 'forecast', description: 'Short-horizon inflow/outflow imbalance or level forecast', suggestedLabels: ['future_level_m', 'future_net_m3h'] },
    { target: 'pump_effectiveness', taskType: 'regression', description: 'Expected delivered flow/capability given condition and system state', suggestedLabels: ['delivered_flow_m3h'] },
  ],
  production: [
    { target: 'throughput_loss_risk', taskType: 'risk_scoring', description: 'Risk of production/access constraint or tonnage deferral', suggestedLabels: ['zone_restricted', 'deferred_tonnes'] },
  ],
  engineering: [
    { target: 'feasibility_violation', taskType: 'classification', description: 'Whether proposed/observed state violates feasibility constraints', suggestedLabels: ['infeasible', 'constraint_type'] },
  ],
  maintenance: [
    { target: 'pump_failure_risk', taskType: 'risk_scoring', description: 'Probability/risk of pump degradation or failure within horizon', suggestedLabels: ['failure_event', 'degradation_flag', 'rul_bucket'] },
    { target: 'anomaly_score', taskType: 'anomaly_detection', description: 'Anomaly in pump/system behavior vs healthy baseline', suggestedLabels: ['anomalous'] },
  ],
  safety: [
    { target: 'hazard_escalation_risk', taskType: 'risk_scoring', description: 'Risk of flooding/access hazard escalation requiring restrictions (advisory)', suggestedLabels: ['escalation', 'restriction_triggered'] },
  ],
};

export function defaultJobsForAgents(datasetIds: string[]): TrainingJobSpec[] {
  return Object.entries(AGENT_TRAINING_TARGETS).flatMap(([agentId, targets]) => targets.map(t => createTrainingJob({
    modelId: `${agentId}-${t.target}`,
    agentId,
    datasetIds,
    target: t.target,
    taskType: t.taskType,
    algorithm: 'baseline-rules', // placeholder until trained artifacts exist
    hyperparameters: {},
    evaluation: { primaryMetric: t.taskType === 'regression' || t.taskType === 'forecast' ? 'rmse' : 'f1', compareBaseline: true },
    seed: 42,
  })));
}
