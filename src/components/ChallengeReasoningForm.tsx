import { Field, Select, TextArea, TextInput } from '../design-system';
import type { ChallengeReasoning, ChallengeDifficulty, challengeDefinition } from '../simulation/investigation';
import type { DiagnosticReport, HypothesisId } from '../simulation/diagnostics';

export function ChallengeReasoningForm({ value, onChange, report, definition, difficulty }: {
  value: ChallengeReasoning; onChange: (v: ChallengeReasoning) => void; report: DiagnosticReport;
  definition: ReturnType<typeof challengeDefinition>; difficulty: ChallengeDifficulty;
}) {
  const update = (patch: Partial<ChallengeReasoning>) => onChange({ ...value, ...patch });
  const citations = (label: string, field: 'primaryEvidence' | 'secondaryEvidence' | 'alternativeEvidence') => <fieldset className="rounded border border-ink-700 p-3">
    <legend className="px-1 text-xs text-ink-200">{label}</legend>
    <div className="flex flex-wrap gap-3">{report.measurements.map(m => <label key={m.id} className="flex cursor-pointer items-center gap-2 text-xs text-ink-200">
      <input type="checkbox" aria-label={`${label} cite ${m.id}`} checked={value[field].includes(m.id)} disabled={!m.usable}
        onChange={e => update({ [field]: e.target.checked ? [...value[field], m.id] : value[field].filter(id => id !== m.id) })} />{m.id}{!m.usable && ' (unusable)'}
    </label>)}{report.measurements.length === 0 && <p className="text-xs text-ink-400">Request observations below before citing evidence.</p>}</div>
  </fieldset>;
  const options = <><option value="">Choose a hypothesis</option>{report.hypotheses.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}</>;
  return <div className="my-4 space-y-4" data-testid="challenge-reasoning">
    <h3 className="text-sm font-medium text-ink-100">Build your engineering argument</h3>
    {citations('Primary claim', 'primaryEvidence')}
    {difficulty === 'advanced' && <><Field label="Concurrent impairment"><Select value={value.secondary} onChange={e => update({ secondary: e.target.value as HypothesisId })}>{options}</Select></Field>{citations('Secondary claim', 'secondaryEvidence')}</>}
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Tested competing hypothesis"><Select value={value.alternative} onChange={e => update({ alternative: e.target.value as HypothesisId })}>{options}</Select></Field>
      <Field label="Quantitative mechanism"><Select value={value.calculation} onChange={e => update({ calculation: e.target.value })}><option value="">Choose calculation</option>
        <option value="balance">Station inflow − actual withdrawal (m³/h)</option><option value="capacity-margin">Allocated − requested site demand (kW)</option>
        <option value="level-residual">Primary − independent level (m)</option><option value="head-residual">Observed − reference duty head (m)</option><option value="delay">Outage-to-water-closure delay (h)</option></Select></Field>
    </div>
    {citations('Alternative test', 'alternativeEvidence')}
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={`Calculated result (${definition.unit})`} hint="Use your requested observations. Tolerance: 2% or 0.01 absolute, whichever is larger."><TextInput type="number" step="any" value={value.calculationValue ?? ''} onChange={e => update({ calculationValue: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
      <Field label="Intervention / verification proposal"><Select value={value.action} onChange={e => update({ action: e.target.value as ChallengeReasoning['action'] })}><option value="">Choose after diagnosis</option>
        <option value="verify-inflow">Verify inflow/routing and achieve non-positive storage balance</option><option value="review-loads">Review priorities and restore adequate motor allocations</option>
        <option value="verify-instrument">Verify calibration against independent levels and timestamps</option><option value="inspect-discharge">Inspect discharge path and recheck the achievable operating point</option>
        <option value="restore-and-monitor">Restore the supply path, draw down storage and verify access recovery</option></Select></Field>
    </div>
    <Field label="Engineering rationale for review" hint="Retained for human review; prose is not automatically graded by keywords or AI."><TextArea value={value.explanation} onChange={e => update({ explanation: e.target.value })} /></Field>
    <p className="text-xs text-ink-400">Citations must refer to usable observations from this snapshot. A correct answer without an evidenced mechanism cannot earn full credit.</p>
  </div>;
}
