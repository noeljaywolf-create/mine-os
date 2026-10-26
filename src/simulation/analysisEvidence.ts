import { MODEL_VERSION, type EngineeringBasis } from '../domain/engineering';
import type { Assumptions, SumpForecast } from '../domain/types';
import type { DiagnosticReport } from './diagnostics';
import type { challengeScore } from './investigation';
import type { evaluateStrategy } from './engineeringStudies';

type Study = ReturnType<typeof evaluateStrategy>;
const base: Pick<EngineeringBasis, 'modelVersion' | 'quality' | 'assumptions' | 'limitations' | 'validation' | 'sensitivity'> = {
  modelVersion: MODEL_VERSION, quality: 'Synthetic model outputs / explicitly requested inspections; no field observations or fault probabilities.',
  assumptions: ['Canonical simulation and displayed scenario inputs; synthetic equipment, geometry and costs.'],
  limitations: ['No certification, calibrated failure probability, or automatic operational approval.'],
  validation: 'Software fixtures and interaction tests; not field validation.',
  sensitivity: 'Inspect alternate inputs; result tolerances and sampled time resolution are stated below.',
};
export function recoveryBasis(result: Study, assumptions: Assumptions): EngineeringBasis {
  return { ...base, title: `${result.strategy.label} — achieved recovery and consequences`, quantity: 'Recovery time, estimated energy/response cost and production exposure',
    equation: 'trecovery = first sampled window with zones ≥ 95%, plant ≥ 95%, storage below warning and non-growing, sustained ≥ 900 s; cost = ΣΔenergyCost + response; exposure = ΔTdeferred × value/t',
    inputs: [
      { name: 'Achieved recovery onset', value: result.recovery.achievedAtHours ?? 'Not confirmed within horizon', unit: 'h from study start', source: 'recovery.ts achievedRecovery, actual projected frames' },
      { name: 'Recovery confirmed', value: result.recovery.confirmedAtHours ?? 'Not confirmed', unit: 'h from study start', source: 'End of sustained sampled recovery window' },
      { name: 'Time resolution', value: result.recovery.resolutionSec, unit: 's', source: 'Maximum projected frame spacing; no sub-step precision claim' },
      { name: 'Maximum confirmation sample gap', value: result.recovery.criteria.maxSampleGapSec, unit: 's', source: 'Explicit recovery-assessment policy; larger gaps reset confirmation' },
      { name: 'Pumping energy', value: result.energyKwh, unit: 'kWh', source: 'Difference of integrated pump energy counters' },
      { name: 'Response resource assumption', value: result.strategy.resourceCostUSD, unit: 'USD', source: 'Explicit candidate strategy assumption' },
      { name: 'Energy plus response cost', value: result.costUSD, unit: 'USD', source: 'Integrated pump tariff charges plus response resource assumption' },
      { name: 'Deferred processing', value: result.deferredTonnes, unit: 't', source: 'Canonical end minus start deferred-tonnes counters' },
      { name: 'Value per tonne', value: assumptions.valuePerTonneUSD, unit: 'USD/t', source: 'Effective study assumptions' },
      { name: 'Revenue exposure', value: result.revenueExposureUSD, unit: 'USD', source: 'Deferred tonnes × configured value per tonne; not permanent loss' },
      { name: 'Critical exposure', value: result.exposureHours, unit: 'h', source: 'Sampled critical-storage intervals over the common study horizon' },
    ], steps: [result.recovery.reason, `Horizon ${((result.end.clock.elapsedSec - result.frames[0].clock.elapsedSec) / 3600).toFixed(3)} h; ${result.frames.length} frames.`,
      ...result.peakLevels.map(p => `${p.sumpId}: peak ${p.levelM} m.`), ...result.violations.map(v => `Constraint: ${v}`),
      'Fastest ranking excludes baseline/no-action, infeasible and unconfirmed candidates. Ties use estimated cost, then stable candidate ID. Configured repair delay is not the recovery objective.'],
    sensitivity: 'Recovery is sampled and right-censored if unconfirmed. Compare ±20% inflow runs; restored electricity alone does not establish recovered throughput.' };
}
export function diagnosticBasis(report: DiagnosticReport): EngineeringBasis {
  return { ...base, title: 'Diagnostic evidence and counterfactual basis', quantity: 'Observation residuals, competing constraints and hypothetical capacity restoration',
    equation: 'residual = observed − comparison; ΔQrepair = Qsame solver, one constraint restored − Qcurrent; evidence dispositions are deterministic screening rules, not probabilities',
    inputs: [...report.modelInputs, ...report.measurements.flatMap(m => [
      { name: `${m.id} observation at T+${m.atSimSec}s`, value: m.observed ?? 'Missing / unsupported', unit: m.unit, source: m.source },
      { name: `${m.id} comparison`, value: m.expected ?? 'Unsupported', unit: m.unit, source: 'diagnostics.ts declared reference or independent inspection' },
      { name: `${m.id} residual`, value: m.residual ?? 'Indeterminate', unit: m.unit, source: `Observed minus comparison; usable for current snapshot: ${m.usable}` },
    ])], steps: [...report.hypotheses.flatMap(h => h.evidence.map(e => `${h.id}: ${e.disposition} (${e.measurement}) — ${e.detail}`)),
      ...report.counterfactuals.map(c => `${c.id}: ${c.status}, Q ${c.flowM3h} m³/h, ΔQ ${c.flowGainM3h} m³/h, input ${c.inputPowerKw} kW; changed inputs ${JSON.stringify(c.patch)}; ${c.source}`)],
    limitations: [...base.limitations, ...report.limitations], sensitivity: 'One-at-a-time restoration holds other impairments fixed. Little improvement may indicate a masked constraint, not healthy equipment.' };
}
export function challengeBasis(score: ReturnType<typeof challengeScore>): EngineeringBasis {
  return { ...base, title: 'Challenge assessment basis', quantity: 'Evidence-backed training rubric; not a competency certification',
    equation: 'score = usable evidence (25) + cited causal claims (25) + dimensional calculation (25) + tested alternative (15) + verification action (10); over-budget attempt = 0',
    inputs: [...score.rubric.map(r => ({ name: r.criterion, value: r.points, unit: `points / ${r.maximum}`, source: 'investigation.ts challengeScore, captured usable observations and structured learner reasoning' })),
      { name: 'Inspection effort', value: score.spent, unit: 'training effort points', source: 'Unique requested inspection IDs; independent level, condition and efficiency cost 2, others 1' },
      { name: 'Inspection budget', value: score.budget, unit: 'training effort points', source: 'Explicit difficulty configuration; not a real inspection cost' },
      { name: 'Reference calculation', value: score.expectedCalculation ?? 'Missing usable evidence', unit: score.unit, source: 'Captured observations used by this assessment' }],
    steps: [score.explanation, `Missing usable evidence: ${score.missing.join(', ') || 'none'}.`, 'Calculation tolerance max(0.01 unit, 2% of reference magnitude); prose is retained for review, not scored by keyword or an LLM.'],
    limitations: [...base.limitations, 'Client-side training scenario, not a secure exam. Evidence consistency and structured reasoning do not establish professional competence.'] };
}
export function investmentBasis(current: Study, proposed: Study, capitalUSD: number, assumptions: Assumptions): EngineeringBasis {
  return { ...recoveryBasis(proposed, assumptions),
    title: 'Hypothetical infrastructure investment basis', quantity: 'Capital assumption, operating expense and avoided deferred processing',
    equation: 'avoided deferred tonnes = current study deferred − proposed study deferred; capital = declared base × capital multiplier; operating cost = integrated energy/response cost',
    inputs: [
      { name: 'Current deferred processing', value: current.deferredTonnes, unit: 't', source: 'Current infrastructure projection at the same initial storage and horizon' },
      { name: 'Proposed deferred processing', value: proposed.deferredTonnes, unit: 't', source: 'Same canonical kernel with hypothetical infrastructure inputs' },
      { name: 'Avoided deferred processing', value: current.deferredTonnes - proposed.deferredTonnes, unit: 't', source: 'Current minus proposed; negative values indicate deterioration' },
      { name: 'Capital assumption', value: capitalUSD, unit: 'USD', source: 'Declared synthetic capital estimate × selected multiplier' },
      { name: 'Operating energy/response cost', value: proposed.costUSD, unit: 'USD', source: 'Matched-horizon integrated cost' },
    ], assumptions: [...base.assumptions, 'Common initial conditions and time horizon; no NPV, payback, supplier quotation or certified design claim.'] };
}
export function forecastBasis(forecast: SumpForecast): EngineeringBasis {
  const end = forecast.points.at(-1);
  return { ...base, title: `${forecast.sumpId} forecast and threshold arrivals`, quantity: 'Coupled storage trajectory and sampled/interpolated threshold crossings',
    equation: 'worldnext = canonical step(world, inputs, Δt); h = inverse stage-storage(V); tcross = interpolate first adjacent samples straddling threshold',
    inputs: [
      { name: 'Horizon', value: end?.tSec ?? 'No forecast points', unit: 's', source: 'Last canonical projection sample' },
      { name: 'Final central volume', value: end?.volumeM3 ?? 'Unavailable', unit: 'm³', source: 'Central coupled projection' },
      { name: 'Final low/high volume', value: end ? `${end.volumeLowM3} / ${end.volumeHighM3}` : 'Unavailable', unit: 'm³', source: 'Explicit inflow sensitivity envelope, not statistical confidence' },
      { name: 'Central critical arrival', value: forecast.timeToCriticalHours ?? 'Not crossed within horizon', unit: 'h', source: 'First modeled critical threshold crossing' },
      { name: 'Upper-envelope critical arrival', value: forecast.timeToCriticalPessimisticHours ?? 'Not crossed within horizon', unit: 'h', source: 'Upper inflow-envelope projection' },
      { name: 'Heuristic input-quality index', value: forecast.confidence, unit: 'index, not probability', source: 'Reported freshness/quality weighting in forecast.ts; not field calibration' },
    ], steps: [...forecast.thresholdCrossings.map(t => `${t.label}: central ${t.atSec ?? 'not reached'} s; upper envelope ${t.pessimisticAtSec ?? 'not reached'} s; relative band width ${t.uncertaintyPct}.`),
      ...forecast.contributingSensors.map(s => `${s.sensorId}: ${s.freshness}, input weight ${s.weight}.`)],
    sensitivity: 'Low/high trajectories are scenario envelopes, not confidence intervals. Null arrival means no crossing in this horizon, not no future exposure.',
    limitations: [...base.limitations, 'Interpolation and time stepping limit temporal precision. No specialist spatial flood routing.'] };
}
