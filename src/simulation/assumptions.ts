import type { Assumptions } from '../domain/types';

/**
 * Default engineering assumptions.
 *
 * Every number here is illustrative and synthetic. They exist so that the
 * consequences of a modelled state change can be expressed in physical and
 * commercial terms, and so that a user can change them and immediately see the
 * effect. They are NOT site data and must be re-derived from real operating
 * data before any operational use.
 */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  valuePerTonneUSD: 78,
  operatingCostPerHourUSD: 4200,
  fixedOverheadPerHourUSD: 18500,
  inflowUncertaintyPct: 18,
  rainfallScenarioMultiplier: 1,
  forecastHorizonHours: 24,
  timeStepSeconds: 60,
  restartRampHours: 0.75,
  sensorConfidenceDiscount: 0.35,
  pumpDegradationPerHour: 0.0004,
  crewCalloutCostUSD: 2400,
  energyTariffUSDPerKwh: 0.14,
};

export const ASSUMPTION_LABELS: Record<keyof Assumptions, string> = {
  valuePerTonneUSD: 'Realised value per tonne (USD)',
  operatingCostPerHourUSD: 'Idle operating cost per hour (USD)',
  fixedOverheadPerHourUSD: 'Site fixed overhead per hour (USD)',
  inflowUncertaintyPct: 'Inflow uncertainty band (± %)',
  rainfallScenarioMultiplier: 'Rainfall / inflow scenario multiplier',
  forecastHorizonHours: 'Forecast horizon (hours)',
  timeStepSeconds: 'Simulation time step (seconds)',
  restartRampHours: 'Production restart ramp (hours)',
  sensorConfidenceDiscount: 'Confidence penalty for stale instrumentation',
  pumpDegradationPerHour: 'Pump degradation per operating hour',
  crewCalloutCostUSD: 'Crew call-out cost (USD)',
  energyTariffUSDPerKwh: 'Electrical tariff (USD per kWh)',
};

export const ASSUMPTION_DESCRIPTIONS: Record<keyof Assumptions, string> = {
  valuePerTonneUSD:
    'Illustrative realised value of a tonne of ore. Used to convert modelled production loss into an exposure figure.',
  operatingCostPerHourUSD:
    'Variable and standby cost that continues while production is restricted. Applied to restricted hours.',
  fixedOverheadPerHourUSD:
    'Unavoidable site cost over the event window. Reported separately because it is not a consequence of the disruption.',
  inflowUncertaintyPct:
    'Half-width of the modelled inflow band. The forecast band is produced by re-running the balance with inflow scaled by ± this value.',
  rainfallScenarioMultiplier:
    'Multiplier applied to the rainfall-sensitive portion of sump inflow. 1.0 is the modelled baseline.',
  forecastHorizonHours: 'How far ahead the deterministic water forecast projects.',
  timeStepSeconds: 'Integration step for the water balance. Smaller steps improve integration accuracy.',
  restartRampHours:
    'Time for a production zone to recover full throughput after the constraint is removed.',
  sensorConfidenceDiscount:
    'How much a stale sensor reduces the confidence of every forecast that depends on it.',
  pumpDegradationPerHour:
    'Incremental reduction of pump health per operating hour, used for reliability trend modelling.',
  crewCalloutCostUSD:
    'One-off cost of mobilising a response crew, applied when a mitigation is executed.',
  energyTariffUSDPerKwh:
    'Illustrative industrial tariff used to convert modelled pumping energy into a cost figure.',
};
