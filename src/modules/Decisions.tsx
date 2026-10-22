import { useMemo, useState } from 'react';
import { Download, FileText, Plus } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { EvidenceList } from '../components/EvidenceList';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  KeyValue,
  Panel,
  Select,
  TableShell,
  Td,
  TextArea,
  TextInput,
  Th,
  cx,
} from '../design-system';
import {
  useActiveScenario,
  useCapabilities,
  useComments,
  useDecisions,
  useForecasts,
  useIncidents,
  useRun,
} from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { formatTimestamp } from '../domain/units';
import type { EngineeringDecision } from '../domain/types';

const STATUS_TONE: Record<EngineeringDecision['status'], 'neutral' | 'green' | 'red' | 'amber'> = {
  proposed: 'amber',
  approved: 'green',
  rejected: 'red',
  superseded: 'neutral',
};

export function Decisions() {
  const decisions = useDecisions();
  const comments = useComments();
  const forecasts = useForecasts();
  const incidents = useIncidents();
  const capabilities = useCapabilities();
  const scenario = useActiveScenario();
  const run = useRun();
  const mine = useMineStore((s) => s.mine);
  const recordDecision = useMineStore((s) => s.recordDecision);
  const addComment = useMineStore((s) => s.addComment);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'all' | EngineeringDecision['status']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(decisions[0]?.id ?? null);
  const [sumpId, setSumpId] = useState(mine.sumps[1]?.id ?? mine.sumps[0].id);
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [rationale, setRationale] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [uncertainty, setUncertainty] = useState('Subject to forecast band and tag freshness.');
  const [commentBody, setCommentBody] = useState('');

  const visible = useMemo(
    () => decisions.filter((decision) => status === 'all' || decision.status === status),
    [decisions, status],
  );
  const selected = decisions.find((decision) => decision.id === selectedId) ?? visible[0] ?? null;
  const selectedComments = comments.filter((comment) => comment.decisionId === selected?.id);
  const topIncident = incidents[0];

  const evidence = [
    ...(forecasts[sumpId]?.evidence ?? []).slice(0, 2),
    ...(topIncident?.evidence ?? []).slice(0, 1),
  ];

  const reset = () => {
    setTitle('');
    setStatement('');
    setRationale('');
    setPrerequisites('');
  };

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.decisions}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!capabilities.can('report.export')}
              onClick={() => exportDecisions(decisions)}
            >
              <Download size={11} /> Export ledger
            </Button>
            <Button size="sm" variant="primary" disabled={!capabilities.can('decision.record')} onClick={() => setOpen(true)}>
              <Plus size={11} /> Record decision
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral" dot>{decisions.length} records</Badge>
          <Badge tone="neutral">{scenario.name}</Badge>
          <span className="text-2xs text-ink-500">
            Decisions capture the reasoning, assumptions and evidence — not just the outcome.
          </span>
          {!capabilities.can('decision.record') && <Badge tone="amber">read-only for this role</Badge>}
        </div>
      </ModuleHeader>

      <div className="grid gap-2 xl:grid-cols-[340px_1fr]">
        <Panel className="h-fit">
          <div className="flex items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2">
            <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-auto">
              <option value="all">all statuses</option>
              {(['proposed', 'approved', 'rejected', 'superseded'] as const).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <span className="ml-auto font-mono text-[9px] text-ink-500">{visible.length}</span>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={<FileText size={18} />}
              title="No decisions recorded"
              detail="Record a decision to preserve its alternatives, assumptions and evidence."
            />
          ) : (
            <div className="max-h-[620px] divide-y divide-[color:var(--hairline)] overflow-auto">
              {visible.map((decision) => (
                <button
                  key={decision.id}
                  onClick={() => setSelectedId(decision.id)}
                  className={cx('block w-full px-3 py-2 text-left hover:bg-ink-800/60', decision.id === selected?.id && 'bg-ink-800/80')}
                >
                  <div className="flex items-center gap-1.5">
                    <Badge tone={STATUS_TONE[decision.status]}>{decision.status}</Badge>
                    <span className="ml-auto font-mono text-[8.5px] text-ink-500">{formatTimestamp(decision.atMs)}</span>
                  </div>
                  <div className="mt-1 text-[11.5px] leading-snug text-ink-100">{decision.title}</div>
                  <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-ink-500">{decision.statement}</p>
                  <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-600">
                    {decision.author} · {decision.role}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-2">
          {!selected ? (
            <Panel>
              <EmptyState
                icon={<FileText size={20} />}
                title="Select a decision"
                detail="Every record shows the chosen option, the alternatives rejected, the assumptions relied on and the evidence that supported it."
              />
            </Panel>
          ) : (
            <>
              <Panel>
                <PanelTitle right={<Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>}>
                  {selected.title}
                </PanelTitle>
                <div className="grid gap-3 px-3 py-2.5 lg:grid-cols-[1fr_220px]">
                  <div>
                    <div className="label-micro mb-1">Statement</div>
                    <p className="text-[11.5px] leading-relaxed text-ink-200">{selected.statement}</p>
                    <div className="label-micro mb-1 mt-2">Rationale</div>
                    <p className="text-2xs leading-relaxed text-ink-400">{selected.rationale}</p>
                  </div>
                  <div>
                    <KeyValue label="Author" value={`${selected.author} · ${selected.role}`} mono={false} />
                    <KeyValue label="Recorded" value={formatTimestamp(selected.atMs)} />
                    <KeyValue label="Scenario" value={selected.scenarioId} />
                    <KeyValue label="Sim clock" value={`t+${(selected.atSimSec / 3600).toFixed(2)} h`} />
                    <KeyValue label="Evidence refs" value={String(selected.evidence.length)} />
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">the trail, not just the answer</span>}>
                  Options considered
                </PanelTitle>
                <TableShell>
                  <thead>
                    <tr>
                      <Th>Option</Th>
                      <Th>Summary</Th>
                      <Th>Prerequisites</Th>
                      <Th>Assumptions</Th>
                      <Th>Modelled outcome</Th>
                      <Th>Uncertainty</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.options.map((option) => (
                      <tr key={option.id} className={option.selected ? 'bg-signal-green/[0.04]' : undefined}>
                        <Td className="text-[11px] text-ink-100">{option.label}</Td>
                        <Td className="max-w-[240px] text-2xs text-ink-400">{option.summary}</Td>
                        <Td className="max-w-[180px] text-2xs text-ink-500">{option.prerequisites.join(' · ') || '—'}</Td>
                        <Td className="max-w-[180px] text-2xs text-ink-500">{option.assumptions.join(' · ') || '—'}</Td>
                        <Td className="text-2xs text-ink-300">
                          {Object.entries(option.outcome).map(([key, value]) => (
                            <div key={key} className="font-mono text-[9px]">{key}: {String(value)}</div>
                          ))}
                        </Td>
                        <Td className="max-w-[180px] text-2xs text-ink-500">{option.uncertainty}</Td>
                        <Td>{option.selected && <Badge tone="green">selected</Badge>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </Panel>

              <div className="grid gap-2 lg:grid-cols-2">
                <Panel>
                  <PanelTitle>Evidence</PanelTitle>
                  <div className="p-3">
                    <EvidenceList evidence={selected.evidence} />
                  </div>
                </Panel>

                <Panel>
                  <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{selectedComments.length}</span>}>
                    Engineering comments
                  </PanelTitle>
                  <div className="max-h-[220px] space-y-2 overflow-auto px-3 py-2">
                    {selectedComments.length === 0 && (
                      <p className="text-2xs text-ink-500">No comments yet. Comments are append-only and attributed to the active role.</p>
                    )}
                    {selectedComments.map((comment) => (
                      <div key={comment.id} className="rounded-[2px] border border-[color:var(--hairline)] px-2 py-1.5">
                        <div className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-500">
                          <span>{comment.author}</span>
                          <span>·</span>
                          <span>{comment.role}</span>
                          <span className="ml-auto">{formatTimestamp(comment.atMs)}</span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-300">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[color:var(--hairline)] p-2">
                    <Field label="Add a comment">
                      <TextArea
                        rows={2}
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder="State the engineering point, not a chat message."
                      />
                    </Field>
                    <div className="mt-1.5 flex justify-end">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!commentBody.trim() || !capabilities.can('incident.comment')}
                        onClick={() => {
                          addComment({ body: commentBody.trim(), decisionId: selected.id });
                          setCommentBody('');
                        }}
                      >
                        Append comment
                      </Button>
                    </div>
                  </div>
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record an engineering decision"
        width="640px"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!title.trim() || !statement.trim() || !rationale.trim()}
              onClick={() => {
                const option = {
                  id: 'opt-selected',
                  label: 'Proceed as stated',
                  summary: statement.trim(),
                  prerequisites: prerequisites.split(',').map((item) => item.trim()).filter(Boolean),
                  assumptions: [`Tariff ${scenario.overrides ? 'scenario' : 'base'}`, `Forecast horizon`, `Tag freshness`],
                  outcome: {
                    'time-to-critical': forecasts[sumpId]?.timeToCriticalHours == null ? 'none in horizon' : `${forecasts[sumpId].timeToCriticalHours!.toFixed(1)} h`,
                    'forecast confidence': `${((forecasts[sumpId]?.confidence ?? 0) * 100).toFixed(0)}%`,
                  },
                  uncertainty,
                  selected: true,
                };
                recordDecision({
                  title: title.trim(),
                  statement: statement.trim(),
                  rationale: rationale.trim(),
                  options: [
                    option,
                    {
                      id: 'opt-defer',
                      label: 'Defer and monitor',
                      summary: 'Take no plant action and continue observation within the current shift.',
                      prerequisites: ['Control-room watch'],
                      assumptions: ['Inflow does not step up'],
                      outcome: { 'time-to-critical': 'unchanged', exposure: 'unmitigated' },
                      uncertainty: 'Increases with every stale tag.',
                      selected: false,
                    },
                  ],
                  evidence,
                  status: 'proposed',
                });
                setOpen(false);
                reset();
              }}
            >
              Record decision
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Field label="Title">
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Stage standby pump before crew callout" />
          </Field>
          <Field label="Decision statement" hint="What is being decided, stated unambiguously.">
            <TextArea rows={2} value={statement} onChange={(event) => setStatement(event.target.value)} />
          </Field>
          <Field label="Rationale" hint="Why this option, given the alternatives.">
            <TextArea rows={2} value={rationale} onChange={(event) => setRationale(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Prerequisites" hint="Comma-separated">
              <TextInput value={prerequisites} onChange={(event) => setPrerequisites(event.target.value)} placeholder="Electrician available, pump healthy" />
            </Field>
            <Field label="Forecast basis">
              <Select value={sumpId} onChange={(event) => setSumpId(event.target.value)}>
                {mine.sumps.map((sump) => (
                  <option key={sump.id} value={sump.id}>{sump.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Uncertainty statement">
            <TextInput value={uncertainty} onChange={(event) => setUncertainty(event.target.value)} />
          </Field>
          <div className="rounded-[2px] border border-[color:var(--hairline)] px-2 py-1.5 text-2xs text-ink-500">
            {evidence.length} evidence reference{evidence.length === 1 ? '' : 's'} will be attached from the selected
            forecast and the most recent incident. Recorded against scenario <span className="font-mono text-ink-300">{scenario.id}</span> at{' '}
            {formatTimestamp(run.world.clock.epochMs + run.world.clock.elapsedSec * 1000)}.
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function exportDecisions(decisions: EngineeringDecision[]) {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), decisions }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kestrel-decision-ledger.json';
  link.click();
  URL.revokeObjectURL(url);
}
