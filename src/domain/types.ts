/**
 * MINE OS — canonical domain contracts.
 *
 * These types describe the industrial state that MINE OS reasons about. They are
 * deliberately transport-shaped (plain, serialisable data) so the exact same
 * structures can be produced by a mocked adapter today and by a real SCADA /
 * historian integration later (see `src/domain/contracts.ts`).
 *
 * ALL DATA IN THIS DEMONSTRATION IS SYNTHETIC.
 */

export type MineId = string;
export type LevelId = string;
export type ZoneId = string;
export type SumpId = string;
export type PumpId = string;
export type FeederId = string;
export type SensorId = string;
export type AssetId = string;
export type IncidentId = string;
export type ScenarioId = string;
export type ActionId = string;
export type DecisionId = string;
export type CommentId = string;
export type EventId = string;

export type LevelKind = 'surface' | 'upper' | 'middle' | 'lower';

export interface MineLevel {
  id: LevelId;
  name: string;
  kind: LevelKind;
  /** Depth below surface in metres (surface = 0). */
  depthM: number;
  /** Floor elevation in metres relative to mine datum (negative below surface). */
  elevationM: number;
  /** Synthetic geometry row on the 2D twin (explicitly not surveyed). */
  twinRow: number;
  description: string;
}

export interface ProductionZone {
  id: ZoneId;
  name: string;
  levelId: LevelId;
  /** Floor elevation of the zone relative to mine datum (m). */
  floorElevationM: number;
  /** Design throughput in tonnes per hour. */
  designRateTph: number;
  /** Orebody modelled as a synthetic polygon in twin space. */
  twinPolygon: Array<[number, number]>;
  /** Sumps whose water level governs whether this zone can operate. */
  governedBySumpIds: SumpId[];
  /** Sump whose water level defines the zone's own flooding elevation. */
  floodControlSumpId: SumpId;
  /** Share of mine production, used for exposure attribution. */
  productionSharePct: number;
}

export type SensorKind = 'level' | 'flow' | 'pressure' | 'vibration' | 'power' | 'temperature';
export type SensorUnit = 'm' | 'm3/h' | 'kPa' | 'mm/s' | 'kW' | 'degC';

export interface Sensor {
  id: SensorId;
  name: string;
  assetId: AssetId;
  kind: SensorKind;
  unit: SensorUnit;
  /** Seconds after which a sample is considered stale. */
  stalenessThresholdSec: number;
  /** Last time a valid sample was received (epoch ms). */
  lastSampleAtMs: number;
  /** Simulated sample rate in seconds. */
  samplePeriodSec: number;
  /** Quality of the communication link 0..1. */
  linkQuality: number;
  /** Nominal accuracy of the measurement. */
  accuracyPct: number;
  /** Twin position for the 2D map. */
  twinPosition: { x: number; y: number };
  /** True when the tag is configured but not yet producing valid data. */
  commissioned: boolean;
}

export type SensorFreshness = 'live' | 'stale' | 'expired' | 'unavailable';

export interface SensorState {
  freshness: SensorFreshness;
  lastValue: number | null;
  /** Seconds since last valid sample. */
  ageSec: number;
  /** 0..1 — how much the reading can be trusted, degraded by link quality and age. */
  confidence: number;
  note: string | null;
}

export type FeederStatus = 'energised' | 'degraded' | 'failed' | 'isolated' | 'maintenance';

export interface ElectricalFeeder {
  id: FeederId;
  name: string;
  /** Feeder route description. */
  route: string;
  voltageV: number;
  /** Firm kVA capability. */
  capacityKva: number;
  /** Present connected load in kW. */
  connectedLoadKw: number;
  status: FeederStatus;
  /** Synthetic segment geometry for the twin. */
  twinPolyline: Array<[number, number]>;
  /** Twin route label position. */
  twinLabelPosition: { x: number; y: number };
  /** Source of the feeder (substation bus). */
  sourceBus: string;
}

export type PumpMode = 'running' | 'standby' | 'stopped' | 'maintenance';

export interface Pump {
  id: PumpId;
  name: string;
  sumpId: SumpId;
  feederId: FeederId;
  /** Design point flow at rated head. */
  ratedFlowM3h: number;
  ratedHeadM: number;
  /** Current mechanical condition 0..1 (1 = new). */
  health: number;
  /** Wire-to-water efficiency 0..1. */
  efficiency: number;
  mode: PumpMode;
  /** Electrical demand at rated duty. */
  powerRequiredKw: number;
  /** Vertical lift the pump must achieve. */
  liftHeadM: number;
  twinPosition: { x: number; y: number };
  /** Free-text engineering notes surfaced in the asset profile. */
  notes: string;
  /** Commissioning year, used for age-based reliability narrative. */
  commissionedYear: number;
}

export type SumpSeverity = 'advisory' | 'warning' | 'critical';

export interface SumpThreshold {
  id: string;
  label: string;
  /** Water level above the sump floor in metres. */
  levelM: number;
  severity: SumpSeverity;
}

export interface Sump {
  id: SumpId;
  name: string;
  levelId: LevelId;
  /** Maximum stored volume before the sump is considered full. */
  capacityM3: number;
  /** Elevation of the sump floor relative to mine datum (m, negative underground). */
  floorElevationM: number;
  /** Plan area of the sump used for the volume/height relationship (m2). */
  areaM2: number;
  /** Modelled inflow at baseline conditions (m3/h). */
  baselineInflowM3h: number;
  /** Fraction of the sump capacity occupied at the start of a scenario. */
  initialFillRatio: number;
  /** Share of the baseline inflow attributed to surface rainfall (0..1). */
  rainfallSensitiveFraction: number;
  /** Elevation of the lowest production floor this sump protects (m, mine datum). */
  protectedElevationM: number;
  thresholds: SumpThreshold[];
  twinPolygon: Array<[number, number]>;
  twinPosition: { x: number; y: number };
}

export type AssetKind =
  | 'pump'
  | 'feeder'
  | 'sump'
  | 'sensor'
  | 'zone'
  | 'plant'
  | 'level'
  | 'infrastructure';

export type AssetStatus =
  | 'operational'
  | 'degraded'
  | 'failed'
  | 'blocked'
  | 'exposed'
  | 'standby'
  | 'offline';

export type IndustrialSystem =
  | 'dewatering'
  | 'electrical'
  | 'production'
  | 'processing'
  | 'ventilation'
  | 'infrastructure'
  | 'instrumentation';

export interface Asset {
  id: AssetId;
  name: string;
  kind: AssetKind;
  system: IndustrialSystem;
  levelId: LevelId | null;
  /** Tag identifier used by the SCADA concept layer. */
  tag: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  commissionedYear: number;
  /** Short engineering description. */
  description: string;
  /** Design limits shown in the asset profile. */
  operatingLimits: {
    maxLoadKw?: number;
    maxFlowM3h?: number;
    maxHeadM?: number;
    minFlowM3h?: number;
    dutyHoursPerDay?: number;
  };
  /** Technical attributes that vary by kind. */
  attributes: Record<string, string | number | boolean>;
  twinPosition: { x: number; y: number };
}

export type DependencyType =
  /** `from` provides power to `to`. Failure of `from` blocks `to`. */
  | 'powered_by'
  /** `from` (sump) holds water that `to` (pump) draws from. */
  | 'pumps_from'
  /** `from` (pump) discharges into `to`. */
  | 'drains_to'
  /** `from` (sensor) observes `to`. */
  | 'monitors'
  /** `from` supports the output of `to` (production zone / plant). */
  | 'supports'
  /** `from` feeds into `to` (route, level, riser). */
  | 'feeds';

export interface AssetDependency {
  id: string;
  from: AssetId;
  to: AssetId;
  type: DependencyType;
  /** Human-readable engineering justification. */
  rationale: string;
  /** Criticality 1 (low) .. 5 (safety critical). */
  criticality: 1 | 2 | 3 | 4 | 5;
}

export interface TelemetrySample {
  sensorId: SensorId;
  epochMs: number;
  value: number;
  unit: SensorUnit;
  quality: number;
}

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentState =
  | 'open'
  | 'acknowledged'
  | 'investigating'
  | 'mitigating'
  | 'resolved'
  | 'closed'
  | 'review';

export interface EvidenceRef {
  id: string;
  kind:
    | 'telemetry'
    | 'dependency'
    | 'calculation'
    | 'assumption'
    | 'event'
    | 'document'
    | 'decision'
    | 'maintenance';
  label: string;
  detail: string;
  /** Domain identifiers backing this evidence. */
  refs: string[];
  /** Simulation timestamp when the evidence was produced (epoch ms). */
  atMs: number;
}

export interface IncidentEvent {
  id: EventId;
  atMs: number;
  /** Simulation clock at the time of the event (seconds since scenario start). */
  atSimSec: number;
  type:
    | 'detected'
    | 'correlated'
    | 'acknowledged'
    | 'assigned'
    | 'noted'
    | 'mitigation-proposed'
    | 'mitigation-approved'
    | 'mitigation-executed'
    | 'escalated'
    | 'resolved'
    | 'closed'
    | 'review-opened'
    | 'status-change';
  actor: string;
  role: string;
  summary: string;
  detail: string;
  evidence: EvidenceRef[];
}

export interface Incident {
  id: IncidentId;
  reference: string;
  title: string;
  severity: IncidentSeverity;
  state: IncidentState;
  /** Asset that is the modelled root cause, if identified. */
  rootAssetId: AssetId | null;
  /** Assets whose modelled state changed as a consequence. */
  affectedAssetIds: AssetId[];
  /** Shared key used to correlate separate detections into one incident. */
  correlationKey: string;
  openedAtMs: number;
  openedAtSimSec: number;
  closedAtMs: number | null;
  owner: string | null;
  ownerRole: string | null;
  summary: string;
  /** Cause hypotheses with the evidence that supports them. */
  hypotheses: IncidentHypothesis[];
  events: IncidentEvent[];
  evidence: EvidenceRef[];
  /** Incident record this one was correlated into, if any. */
  correlatedInto?: IncidentId | null;
}

export interface IncidentHypothesis {
  id: string;
  statement: string;
  /** 0..1 modelled confidence, always accompanied by evidence. */
  confidence: number;
  supportingEvidence: EvidenceRef[];
  contradictingEvidence: EvidenceRef[];
  /** Alternative explanations that remain open. */
  alternatives: string[];
}

export type ActionKind =
  | 'acknowledge'
  | 'assign'
  | 'note'
  | 'propose-mitigation'
  | 'approve-mitigation'
  | 'execute-mitigation'
  | 'escalate'
  | 'resolve'
  | 'close'
  | 'open-review'
  | 'scenario-action'
  | 'asset-action'
  | 'decision';

export interface Action {
  id: ActionId;
  kind: ActionKind;
  title: string;
  description: string;
  actor: string;
  role: string;
  atMs: number;
  atSimSec: number;
  incidentId?: IncidentId;
  /** Scenario in which the action was taken. */
  scenarioId: ScenarioId;
  /** Set of domain changes applied by the action. */
  effects: ActionEffect[];
  evidence: EvidenceRef[];
}

export interface ActionEffect {
  kind: 'asset-status' | 'pump-mode' | 'assumption' | 'sump' | 'incident-state' | 'scenario';
  target: string;
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export type AssumptionKey =
  | 'valuePerTonneUSD'
  | 'operatingCostPerHourUSD'
  | 'fixedOverheadPerHourUSD'
  | 'inflowUncertaintyPct'
  | 'rainfallScenarioMultiplier'
  | 'forecastHorizonHours'
  | 'timeStepSeconds'
  | 'restartRampHours'
  | 'sensorConfidenceDiscount'
  | 'pumpDegradationPerHour'
  | 'crewCalloutCostUSD'
  | 'energyTariffUSDPerKwh';

export interface Assumptions {
  valuePerTonneUSD: number;
  operatingCostPerHourUSD: number;
  fixedOverheadPerHourUSD: number;
  inflowUncertaintyPct: number;
  rainfallScenarioMultiplier: number;
  forecastHorizonHours: number;
  timeStepSeconds: number;
  restartRampHours: number;
  sensorConfidenceDiscount: number;
  pumpDegradationPerHour: number;
  crewCalloutCostUSD: number;
  energyTariffUSDPerKwh: number;
}

export interface SimulationClock {
  /** Wall-clock epoch of the scenario start (ms). */
  epochMs: number;
  /** Elapsed simulated seconds. */
  elapsedSec: number;
  /** Step size in seconds. */
  stepSec: number;
  /** Nominal simulated seconds per real second. */
  rate: number;
  running: boolean;
}

export type ForecastPoint = {
  tSec: number;
  /** Central estimate of stored volume (m3). */
  volumeM3: number;
  /** Lower bound of the modelled uncertainty band (m3). */
  volumeLowM3: number;
  /** Upper bound of the modelled uncertainty band (m3). */
  volumeHighM3: number;
  /** Central estimate of water level (m above sump floor). */
  levelM: number;
  levelLowM: number;
  levelHighM: number;
  inflowM3h: number;
  outflowM3h: number;
};

export interface SumpForecast {
  sumpId: SumpId;
  points: ForecastPoint[];
  /** First time the central estimate crosses a threshold (seconds). */
  thresholdCrossings: Array<{
    thresholdId: string;
    label: string;
    severity: SumpSeverity;
    atSec: number | null;
    atMs: number | null;
    /** Time at which the upper bound of the band crosses — the pessimistic case. */
    pessimisticAtSec: number | null;
    /** Band width as a fraction of the central estimate at the horizon. */
    uncertaintyPct: number;
  }>;
  /** Hours until the central estimate reaches the first critical threshold. */
  timeToCriticalHours: number | null;
  /** Hours until the pessimistic band reaches the first critical threshold. */
  timeToCriticalPessimisticHours: number | null;
  /** Confidence in the forecast, degraded by stale sensors. */
  confidence: number;
  /** Sensors feeding this forecast and their freshness. */
  contributingSensors: Array<{ sensorId: SensorId; freshness: SensorFreshness; weight: number }>;
}

export interface RiskAssessment {
  id: string;
  targetId: string;
  targetKind: 'sump' | 'zone' | 'asset';
  score: number;
  severity: IncidentSeverity;
  drivers: Array<{
    label: string;
    contribution: number;
    evidence: EvidenceRef[];
  }>;
  mitigations: string[];
  confidence: number;
  generatedAtSimSec: number;
}

export type UserRole =
  | 'control-room-operator'
  | 'electrical-engineer'
  | 'mechanical-engineer'
  | 'dewatering-engineer'
  | 'mine-manager'
  | 'safety-officer'
  | 'executive-viewer';

export type Capability =
  | 'view.mission-control'
  | 'view.deepwater'
  | 'view.impact'
  | 'view.analytics'
  | 'view.finance'
  | 'view.integration'
  | 'asset.fail'
  | 'asset.restore'
  | 'pump.start'
  | 'pump.stop'
  | 'pump.toggle-standby'
  | 'scenario.create'
  | 'scenario.clone'
  | 'scenario.edit-assumptions'
  | 'scenario.execute'
  | 'incident.acknowledge'
  | 'incident.assign'
  | 'incident.comment'
  | 'incident.propose-mitigation'
  | 'incident.approve-mitigation'
  | 'incident.escalate'
  | 'incident.execute-mitigation'
  | 'incident.resolve'
  | 'incident.close'
  | 'incident.review'
  | 'decision.record'
  | 'report.export'
  | 'integration.configure'
  | 'settings.role';

export interface RoleDefinition {
  id: UserRole;
  name: string;
  title: string;
  /** What the role is accountable for, in engineering terms. */
  remit: string;
  /** Capabilities this role holds in the demonstration. */
  capabilities: Capability[];
  /** Capabilities deliberately withheld — shown in the role simulator. */
  restrictions: string[];
  /** Default landing module for the role. */
  defaultModule: string;
}

export interface EngineeringDecision {
  id: DecisionId;
  scenarioId: ScenarioId;
  title: string;
  statement: string;
  author: string;
  role: string;
  atMs: number;
  atSimSec: number;
  /** Alternatives that were considered. */
  options: Array<{
    id: string;
    label: string;
    summary: string;
    prerequisites: string[];
    assumptions: string[];
    /** Modelled outcome summary. */
    outcome: Record<string, string | number>;
    uncertainty: string;
    selected: boolean;
  }>;
  rationale: string;
  evidence: EvidenceRef[];
  status: 'proposed' | 'approved' | 'rejected' | 'superseded';
}

export interface ScenarioOverride {
  assetOverrides: Record<AssetId, Partial<AssetRuntimeState>>;
  pumpOverrides: Record<PumpId, Partial<Pick<Pump, 'mode' | 'health' | 'efficiency'>>>;
  feederOverrides: Record<FeederId, Partial<Pick<ElectricalFeeder, 'status'>>>;
  sumpOverrides: Record<SumpId, { inflowMultiplier?: number; volumeM3?: number }>;
  sensorOverrides: Record<SensorId, { stale?: boolean; offline?: boolean }>;
  assumptions: Partial<Assumptions>;
}

export interface AssetRuntimeState {
  /** Simulated operational status. */
  status: AssetStatus;
  /** Modelled reason the asset is not fully operational. */
  statusReason: string;
  /** 0..1 effective delivery of the asset's designed function. */
  effectiveness: number;
  /** Asset ids that explain the current status. */
  causedBy: AssetId[];
  /** Assets that are downstream and therefore exposed. */
  exposes: AssetId[];
  /** Confidence in the modelled state (reduced by stale instrumentation). */
  confidence: number;
}

export interface SumpRuntimeState {
  volumeM3: number;
  levelM: number;
  inflowM3h: number;
  outflowM3h: number;
  /** Fraction of sump capacity used (0..1). */
  fillRatio: number;
  /** Highest threshold currently breached. */
  breach: SumpThreshold | null;
  /** Time remaining until the critical threshold at current net flow (seconds). */
  secondsToCritical: number | null;
}

export interface PumpRuntimeState {
  mode: PumpMode;
  /** Modelled delivered flow (m3/h). */
  flowM3h: number;
  /** Flow the pump could deliver if fully commissioned (m3/h). */
  availableFlowM3h: number;
  /** Electrical demand (kW). */
  powerKw: number;
  powered: boolean;
  /** True when the pump is unavailable for dispatch. */
  unavailable: boolean;
  status: AssetStatus;
  statusReason: string;
  /** Hydraulic efficiency applied at the modelled duty. */
  dutyFactor: number;
}

export interface FeederRuntimeState {
  status: FeederStatus;
  connectedLoadKw: number;
  capacityKva: number;
  /** Power actually available to downstream assets (0..1 of demand). */
  supplyRatio: number;
  statusReason: string;
}

export interface ZoneRuntimeState {
  /** Tonnes per hour currently being produced. */
  rateTph: number;
  /** 0..1 of design throughput. */
  operatingRatio: number;
  status: AssetStatus;
  statusReason: string;
  /** Whether flooding or dewatering risk is currently restricting the zone. */
  constrainedBy: string | null;
  /** Hours of production lost so far in this scenario. */
  lostHours: number;
  lostTonnes: number;
  lostValueUSD: number;
}

export interface TelemetryPoint {
  epochMs: number;
  simSec: number;
  value: number;
}

export interface AssetTelemetrySeries {
  sensorId: SensorId;
  assetId: AssetId;
  unit: SensorUnit;
  points: TelemetryPoint[];
  freshness: SensorFreshness;
}

export interface EngineEvent {
  id: EventId;
  atSimSec: number;
  atMs: number;
  type:
    | 'asset-status-changed'
    | 'pump-mode-changed'
    | 'threshold-crossed'
    | 'incident-raised'
    | 'incident-updated'
    | 'sensor-stale'
    | 'scenario-event'
    | 'assumption-changed';
  summary: string;
  detail: string;
  assetId?: AssetId;
  incidentId?: IncidentId;
  severity?: IncidentSeverity;
  evidence: EvidenceRef[];
}

export interface WorldState {
  mineId: MineId;
  scenarioId: ScenarioId;
  clock: SimulationClock;
  assets: Record<AssetId, AssetRuntimeState>;
  sumps: Record<SumpId, SumpRuntimeState>;
  pumps: Record<PumpId, PumpRuntimeState>;
  feeders: Record<FeederId, FeederRuntimeState>;
  zones: Record<ZoneId, ZoneRuntimeState>;
  sensors: Record<SensorId, SensorState>;
  /** Rolling history for the charts (one entry per recorded step). */
  history: EngineEvent[];
  /** Simulation step counter. */
  step: number;
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  description: string;
  /** Parent scenario this was branched from; null for the baseline. */
  parentId: ScenarioId | null;
  /** True for the immutable reference scenario. */
  isBaseline: boolean;
  createdAtMs: number;
  createdBy: string;
  overrides: ScenarioOverride;
  /** Deterministic seed for stochastic inflow variation. */
  seed: number;
  /** Narrative of what the scenario is testing. */
  hypothesis: string;
  tags: string[];
}

export interface Comment {
  id: CommentId;
  scenarioId: ScenarioId;
  incidentId: IncidentId | null;
  author: string;
  role: string;
  atMs: number;
  body: string;
  /** Optional engineering decision this comment is attached to. */
  decisionId: DecisionId | null;
}

export interface ActivityEntry {
  id: string;
  atMs: number;
  atSimSec: number;
  actor: string;
  role: string;
  kind: 'action' | 'comment' | 'decision' | 'incident' | 'scenario' | 'role';
  summary: string;
  refs: string[];
}

export interface IntegrationTag {
  /** Source tag identifier. */
  tag: string;
  description: string;
  /** Canonical domain concept the tag maps onto. */
  mapsTo: string;
  /** Source unit string. */
  sourceUnit: string;
  /** Canonical unit after normalisation. */
  canonicalUnit: string;
  /** Conversion factor applied to reach canonical unit. */
  scale: number;
  deadband: number;
  scanRateMs: number;
  quality: 'good' | 'uncertain' | 'bad' | 'stale';
  lastValue: number;
  lastUpdateMs: number;
  /** Protocol the tag is transported over. */
  protocol: 'OPC UA' | 'Modbus TCP' | 'MQTT' | 'Historian' | 'PLC';
  /** OPC UA node id / Modbus register style address. */
  address: string;
  notes: string;
}

export interface IntegrationConnector {
  id: string;
  name: string;
  protocol: IntegrationTag['protocol'];
  vendor: string;
  endpoint: string;
  status: 'connected' | 'degraded' | 'disconnected' | 'mock-only';
  /** Simulated overall link quality 0..1. */
  linkQuality: number;
  /** Percentage of tags reporting good quality. */
  goodTagPct: number;
  lastPollMs: number | null;
  messageRatePerSec: number;
  tags: IntegrationTag[];
  diagnostics: Array<{
    id: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    detail: string;
  }>;
  /** Explicitly stated so the UI can never imply a live industrial connection. */
  mock: true;
}
