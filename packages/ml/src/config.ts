import type { DeploymentConfig, OperationalMode } from '@mine-os/contracts';

/** Central, explicit configuration for ML/agent behavior. No hidden defaults that enable control. */
export interface MineOsMLConfig {
  deployment: DeploymentConfig;
  data: {
    adapters: Array<'snapshot-json' | 'csv-timeseries' | 'historian-export' | 'incident-records' | 'maintenance-records'>;
    storageUri?: string;
    onPremOnly: boolean;
    allowedSources: string[];
  };
  training: {
    stack: 'python-sklearn' | 'python-pytorch' | 'python-xgboost' | 'external';
    environment: 'local' | 'onprem' | 'cloud';
    runtimeEndpoint?: string;
    artifactStoreUri?: string;
    autoTrain: boolean; // must remain false unless explicitly enabled in controlled env
  };
  rag: {
    enabled: boolean;
    requireApprovedDocuments: boolean;
    indexUri?: string;
    embeddingProvider?: string;
  };
  evaluation: {
    requireBacktest: boolean;
    requireBaselineComparison: boolean;
    blockOnUnsupportedClaims: boolean;
  };
}

export const DEFAULT_CONFIG: MineOsMLConfig = {
  deployment: {
    mode: 'shadow_readonly',
    allowIndustrialWrites: false,
    allowControlActions: false,
    requirePolicyApproval: true,
    requireHumanValidation: true,
    mlAdvisoryOnly: true,
    deterministicAuthority: true,
    approvedSites: [],
    notes: [
      'Default shadow/read-only: recommendations require human validation and policy checks.',
      'No live industrial writes or control actions. ML outputs are advisory hypotheses.',
    ],
  },
  data: { adapters: ['snapshot-json'], onPremOnly: true, allowedSources: [] },
  training: { stack: 'external', environment: 'onprem', autoTrain: false },
  rag: { enabled: true, requireApprovedDocuments: true },
  evaluation: { requireBacktest: true, requireBaselineComparison: true, blockOnUnsupportedClaims: true },
};

export function assertSafeDeployment(config: MineOsMLConfig): string[] {
  const issues: string[] = [];
  if (config.deployment.allowIndustrialWrites) issues.push('Industrial writes are not permitted in current release.');
  if (config.deployment.allowControlActions) issues.push('Control actions are not permitted without separate safety/commissioning scope.');
  if (!config.deployment.mlAdvisoryOnly) issues.push('ML must remain advisory-only; deterministic/policy gates are authoritative.');
  return issues;
}

export function modeLabel(mode: OperationalMode): string {
  switch (mode) {
    case 'demo': return 'Demo (synthetic/simulated)';
    case 'shadow_readonly': return 'Shadow read-only (validated recommendations, no writes)';
    case 'decision_support': return 'Decision support (advisory, governed approvals)';
    case 'operational_gated': return 'Operational gated (policy/human-gated actions, no direct control writes)';
  }
}
