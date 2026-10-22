import type { Scenario } from '../domain/types';
import type { MineDefinition } from '../domain/mine';
import { cloneScenario, createBaselineScenario, emptyOverrides, type CloneOptions } from '../simulation/scenarios';

/**
 * Pre-built demonstration scenarios.
 *
 * These are ordinary scenarios created through the same clone path the user
 * uses. Nothing here is special-cased in the engine.
 */

export interface ScenarioTemplate {
  id: string;
  name: string;
  shortName: string;
  description: string;
  hypothesis: string;
  severity: 'reference' | 'high' | 'critical' | 'medium';
  build: (baseline: Scenario, mine: MineDefinition, nowMs: number) => CloneOptions;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'tpl-feeder-failure',
    name: 'Flagship — F-02 feeder failure',
    shortName: 'F-02 failure',
    description:
      'The central 11 kV feeder fails. All three middle-level pumps lose usable power, dewatering discharge collapses, and both middle sumps begin to fill against their thresholds.',
    hypothesis:
      'Loss of F-02 removes 100% of middle-level pumping. At baseline inflow the north sump reaches its critical threshold within hours, and the north orebody becomes production-constrained before any recovery action is taken.',
    severity: 'critical',
    build: (baseline, _mine, nowMs) => ({
      name: 'F-02 feeder failure',
      description:
        'Electrical feeder F-02 fails at scenario start. P-201, P-202 and P-203 are blocked, so middle-level dewatering is lost and the water balance drives both middle sumps upward.',
      hypothesis:
        'Loss of F-02 removes all middle-level pumping; the north sump reaches critical within the forecast horizon and the north orebody is constrained.',
      createdBy: 'Demonstration library',
      nowMs,
      seed: baseline.seed + 101,
      tags: ['flagship', 'electrical', 'cascade'],
      overrides: { feederOverrides: { 'fdr-02': { status: 'failed' } } },
    }),
  },
  {
    id: 'tpl-rainfall-pump-damage',
    name: 'High inflow with damaged P-203',
    shortName: 'Inflow + damage',
    description:
      'Sustained rainfall raises inflow across the middle level while P-203 is operating with a degraded impeller. The south sump loses both capacity and margin at the same time.',
    hypothesis:
      'Combined inflow and equipment degradation produce a faster south-sump rise than either condition alone, and the available standby capacity is not sufficient to hold level.',
    severity: 'high',
    build: (baseline, _mine, nowMs) => ({
      name: 'High inflow + damaged P-203',
      description:
        'Rainfall multiplier 2.2 on the middle level, P-203 health reduced to 45% with efficiency 0.58. South sump inflow rises while its only duty pump delivers roughly half of design flow.',
      hypothesis:
        'Inflow and pump degradation together overwhelm the south sump before the north sump becomes critical.',
      createdBy: 'Demonstration library',
      nowMs,
      seed: baseline.seed + 202,
      tags: ['hydrology', 'reliability'],
      overrides: {
        assumptions: { rainfallScenarioMultiplier: 2.2 },
        sumpOverrides: {
          'smp-202': { inflowMultiplier: 1.35 },
          'smp-201': { inflowMultiplier: 1.2 },
        },
        pumpOverrides: { 'pmp-203': { health: 0.45, efficiency: 0.58 } },
      },
    }),
  },
  {
    id: 'tpl-sensor-stale',
    name: 'Instrumentation loss — LT-2010',
    shortName: 'Sensor stale',
    description:
      'The north sump level transmitter stops reporting. The physical process is unchanged, but every forecast and diagnosis that depends on the tag must lose confidence instead of inventing certainty.',
    hypothesis:
      'With LT-2010 stale, the north sump forecast confidence falls sharply and its width grows, while the modelled physical water level remains unchanged. Operators should see reduced confidence, not a fabricated answer.',
    severity: 'medium',
    build: (baseline, _mine, nowMs) => ({
      name: 'Instrumentation loss — LT-2010',
      description:
        'Level transmitter LT-2010 (S-201) is marked stale for the whole scenario. Forecasts depending on it must declare reduced confidence.',
      hypothesis:
        'Lost instrumentation reduces confidence and widens the forecast band without changing the physical water balance.',
      createdBy: 'Demonstration library',
      nowMs,
      seed: baseline.seed + 303,
      tags: ['instrumentation', 'uncertainty'],
      overrides: { sensorOverrides: { 'sen-l-201': { stale: true } } },
    }),
  },
  {
    id: 'tpl-recovery-standby',
    name: 'Recovery — restore F-02 and start standby',
    shortName: 'Recovery plan',
    description:
      'The same F-02 failure, with an immediate recovery: feeder restored within the first modelled interval and P-202 started to rebuild margin. Used as the comparison branch against the failure.',
    hypothesis:
      'Restoring F-02 and starting the standby pump returns the north sump to a falling trajectory and prevents the north orebody from reaching a production constraint.',
    severity: 'reference',
    build: (baseline, _mine, nowMs) => ({
      name: 'Recovery — restore F-02 and start standby',
      description:
        'F-02 is restored and P-202 is started at scenario start. This is the modelled recovery case, not a claim that the intervention is feasible on a real site.',
      hypothesis:
        'Restored power plus standby capacity reverses the north sump trajectory before the critical threshold.',
      createdBy: 'Demonstration library',
      nowMs,
      seed: baseline.seed + 404,
      tags: ['recovery', 'intervention'],
      overrides: {
        feederOverrides: { 'fdr-02': { status: 'energised' } },
        pumpOverrides: { 'pmp-202': { mode: 'running' } },
      },
    }),
  },
];

export function buildLibrary(baseline: Scenario, mine: MineDefinition, nowMs: number): Scenario[] {
  return SCENARIO_TEMPLATES.map((template, index) => {
    const options = template.build(baseline, mine, nowMs);
    const scenario = cloneScenario(baseline, options);
    return {
      ...scenario,
      id: `scn-lib-${index + 1}`,
      tags: [...scenario.tags, `template:${template.id}`],
    };
  });
}

export function createBaseline(nowMs: number): Scenario {
  return { ...createBaselineScenario(nowMs), overrides: emptyOverrides() };
}
