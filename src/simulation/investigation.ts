import type { ScenarioOverride } from '../domain/types';
import { patchedScenario } from './engineeringStudies';
import { createBaselineScenario } from './scenarios';
import { inspectionCost, type DiagnosticReport, type HypothesisId, type Measurement } from './diagnostics';
export { investigate, MEASUREMENTS, inspectionCost } from './diagnostics';
export type { Measurement, DiagnosticObservation, DiagnosticReport, HypothesisId } from './diagnostics';

export type ChallengeDifficulty = 'beginner' | 'engineer' | 'advanced';
export const CHALLENGE_DIFFICULTIES = {
  beginner: { budget: 6, description: 'Guided brief, two core observations, quantified explanation and one tested alternative.' },
  engineer: { budget: 10, description: 'Four core observations; justify the cause, calculation, alternative and verification action.' },
  advanced: { budget: 12, description: 'Concurrent impairment; identify both contributors with independent evidence within a limited inspection budget.' },
};
export type ResolutionAction = 'verify-inflow' | 'review-loads' | 'verify-instrument' | 'inspect-discharge' | 'restore-and-monitor';
export const CHALLENGES: Array<{ id: string; title: string; patch: Partial<ScenarioOverride>; answer: HypothesisId;
  required: Measurement[]; explanation: string; calculation: 'balance' | 'capacity-margin' | 'level-residual' | 'head-residual' | 'delay';
  calculationMeasurements: Measurement[]; unit: string; action: ResolutionAction; hint: string }> = [
  { id: 'rising', title: '1 · Running pump, rising water', patch: { sumpOverrides: { 'smp-201': { inflowMultiplier: 2.5 } } }, answer: 'inflow', required: ['flow', 'inflow', 'head', 'power'], explanation: 'Compare total station inflow with actual withdrawal. A running pump and low individual flow alone do not identify the cause.', calculation: 'balance', calculationMeasurements: ['inflow'], unit: 'm³/h', action: 'verify-inflow', hint: 'Request flow and inflow. In the inflow row, observed minus comparison is the station accumulation rate.' },
  { id: 'backup', title: '2 · Backup generation cannot supply every load', patch: { engineering: { utilityAvailable: false, backupConnected: true, switchingApproved: true, backupCapacityKw: 180 } }, answer: 'power', required: ['load-margin', 'electrical-path', 'power', 'flow'], explanation: 'The finite source is allocated to critical motors and services in deterministic order. Compare allocated versus requested demand and individual motor reservations.', calculation: 'capacity-margin', calculationMeasurements: ['load-margin'], unit: 'kW', action: 'review-loads', hint: 'Request load-margin and electrical-path. A negative allocated-minus-requested margin identifies unsupplied demand.' },
  { id: 'sensors', title: '3 · Contradictory level evidence', patch: { engineering: { telemetryFaults: { 'sen-l-201': 'scaled' } } }, answer: 'instrumentation', required: ['level', 'independent-level', 'inflow', 'flow'], explanation: 'A disagreement needs independent verification. Neither freshness nor the model alone establishes the primary sensor as correct.', calculation: 'level-residual', calculationMeasurements: ['level', 'independent-level'], unit: 'm', action: 'verify-instrument', hint: 'Compare requested primary and independent levels. Report primary minus independent, then inspect scaling and timestamps.' },
  { id: 'larger', title: '4 · Larger nominal pump, constrained main', patch: { pumpOverrides: { 'pmp-201': { curveScale: 1.5 } }, engineering: { pipes: { 'smp-201': { diameterM: 0.12 } } } }, answer: 'resistance', required: ['pipe-diameter', 'flow', 'head', 'power'], explanation: 'A constrained system curve and motor reservation bound the duty. Increased nominal flow is not guaranteed delivered flow.', calculation: 'head-residual', calculationMeasurements: ['head'], unit: 'm', action: 'inspect-discharge', hint: 'Inspect bore, flow and head. Head observed minus reference is a counterfactual duty-head difference, not a constant-flow loss coefficient.' },
  { id: 'delayed', title: '5 · Access lost hours after disruption', patch: { feederOverrides: { 'fdr-02': { status: 'failed' } } }, answer: 'delayed', required: ['timeline', 'access', 'electrical-path', 'inflow'], explanation: 'Retained frames establish power loss before storage growth and water-induced closure. A simultaneous low-throughput snapshot is not enough.', calculation: 'delay', calculationMeasurements: ['timeline'], unit: 'h', action: 'restore-and-monitor', hint: 'Request timeline and access, then inspect replay. The delay is measured between retained outage and water-closure frames.' },
];

export function challengeDefinition(id: string, difficulty: ChallengeDifficulty) {
  const c = CHALLENGES.find(item => item.id === id);
  if (!c) throw new Error(`Unknown challenge ${id}`);
  const secondary: HypothesisId | null = difficulty === 'advanced' ? id === 'sensors' ? 'resistance' : 'wear' : null;
  const extra: Partial<ScenarioOverride> = secondary === 'wear' ? { pumpOverrides: { 'pmp-201': { health: 0.85 } } } :
    secondary === 'resistance' ? { engineering: { pipes: { 'smp-201': { diameterM: 0.12 } } } } : {};
  // Reuse the canonical nested override merger; no second hidden physical state.
  const patch = patchedScenario(patchedScenario(createBaselineScenario(0), c.patch), extra).overrides;
  const required = [...c.required.slice(0, difficulty === 'beginner' ? 2 : 4), ...(secondary === 'wear' ? ['condition' as const] : secondary === 'resistance' ? ['pipe-diameter' as const, 'head' as const] : [])];
  return { ...c, patch, required: [...new Set(required)], secondary, ...CHALLENGE_DIFFICULTIES[difficulty] };
}

export interface ChallengeReasoning {
  primaryEvidence: Measurement[]; secondary: HypothesisId | ''; secondaryEvidence: Measurement[];
  alternative: HypothesisId | ''; alternativeEvidence: Measurement[];
  calculation: string; calculationValue: number | null; action: ResolutionAction | '';
  explanation: string;
}
export const EMPTY_REASONING: ChallengeReasoning = { primaryEvidence: [], secondary: '', secondaryEvidence: [], alternative: '', alternativeEvidence: [], calculation: '', calculationValue: null, action: '', explanation: '' };

export function challengeScore(challengeId: string, difficulty: ChallengeDifficulty, requests: readonly Measurement[], answer: string,
  reasoning: ChallengeReasoning = EMPTY_REASONING, report?: DiagnosticReport) {
  const c = challengeDefinition(challengeId, difficulty);
  const unique = [...new Set(requests)];
  const usable = report?.measurements.filter(m => m.usable && m.observed !== null) ?? [];
  const have = (id: Measurement) => unique.includes(id) && usable.some(m => m.id === id);
  const spent = unique.reduce((sum, id) => sum + inspectionCost(id), 0);
  const missing = c.required.filter(id => !have(id));
  const evidencePoints = Math.round(25 * (c.required.length - missing.length) / c.required.length);
  const supports = (id: string, citations: Measurement[], min = 2) => {
    const h = report?.hypotheses.find(item => item.id === id);
    return !!h && new Set(citations.filter(m => have(m) && h.supporting.some(e => e.measurement === m))).size >= min;
  };
  const primary = answer === c.answer && supports(answer, reasoning.primaryEvidence);
  const secondary = c.secondary === null || reasoning.secondary === c.secondary && supports(c.secondary, reasoning.secondaryEvidence);
  const claimPoints = c.secondary ? (primary ? 15 : 0) + (secondary ? 10 : 0) : primary ? 25 : 0;
  const observation = (id: Measurement) => usable.find(m => m.id === id);
  const m = observation(c.calculationMeasurements[0]);
  const expectedCalculation = c.calculation === 'level-residual' ? m && observation('independent-level') ? m.observed! - observation('independent-level')!.observed! : null :
    c.calculation === 'delay' ? m?.observed ?? null : m?.residual ?? null;
  const calculationValid = c.calculationMeasurements.every(have) && reasoning.calculation === c.calculation &&
    expectedCalculation !== null && reasoning.calculationValue !== null && Number.isFinite(reasoning.calculationValue) &&
    Math.abs(reasoning.calculationValue - expectedCalculation) <= Math.max(0.01, Math.abs(expectedCalculation) * 0.02);
  const alternative = report?.hypotheses.find(h => h.id === reasoning.alternative);
  const testedAlternative = reasoning.alternative !== answer && reasoning.alternative !== c.secondary &&
    !!alternative && reasoning.alternativeEvidence.some(id => have(id) && alternative.contradicting.some(e => e.measurement === id)) && !alternative.support;
  const actionValid = reasoning.action === c.action && primary && secondary;
  const rubric = [
    { criterion: 'Independent usable evidence', points: evidencePoints, maximum: 25 },
    { criterion: 'Causal claims with supporting citations', points: claimPoints, maximum: 25 },
    { criterion: 'Quantified explanation (2% / 0.01 absolute tolerance)', points: calculationValid ? 25 : 0, maximum: 25 },
    { criterion: 'Tested competing hypothesis with contradicting evidence', points: testedAlternative ? 15 : 0, maximum: 15 },
    { criterion: 'Appropriate intervention / verification action', points: actionValid ? 10 : 0, maximum: 10 },
  ];
  const withinBudget = spent <= c.budget;
  return { score: withinBudget ? rubric.reduce((sum, r) => sum + r.points, 0) : 0, rubric, missing, spent, budget: c.budget,
    resolved: withinBudget && missing.length === 0 && primary && secondary && calculationValid && testedAlternative && actionValid,
    expectedCalculation, unit: c.unit,
    explanation: !withinBudget ? 'Inspection budget exceeded; restart with a discriminating measurement plan.' :
      missing.length ? 'Acquire the missing usable evidence; stale and missing observations cannot support this snapshot.' :
      primary && secondary && calculationValid && testedAlternative && actionValid ? c.explanation :
      'Cite supporting observations, quantify the mechanism, test a competing cause and choose an appropriate verification action. Requesting measurements alone does not establish a diagnosis.',
  };
}
