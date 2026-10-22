import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Send, UserCheck } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { EvidenceList } from '../components/EvidenceList';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Panel,
  Progress,
  SeverityBadge,
  Tabs,
  TextArea,
  TextInput,
  cx,
} from '../design-system';
import { useCapabilities, useComments, useIncidents } from '../store/hooks';
import { useMineStore } from '../store/mineStore';
import { formatTimestamp } from '../domain/units';
import type { ActionKind, IncidentState } from '../domain/types';

const ACTIONS: Array<{ kind: ActionKind; label: string; capability: string; states: IncidentState[] }> = [
  { kind: 'acknowledge', label: 'Acknowledge', capability: 'incident.acknowledge', states: ['open'] },
  { kind: 'assign', label: 'Assign', capability: 'incident.assign', states: ['open', 'acknowledged', 'investigating'] },
  { kind: 'propose-mitigation', label: 'Propose mitigation', capability: 'incident.propose-mitigation', states: ['acknowledged', 'investigating'] },
  { kind: 'approve-mitigation', label: 'Approve', capability: 'incident.approve-mitigation', states: ['mitigating'] },
  { kind: 'execute-mitigation', label: 'Execute', capability: 'incident.execute-mitigation', states: ['mitigating'] },
  { kind: 'escalate', label: 'Escalate', capability: 'incident.escalate', states: ['open', 'acknowledged', 'investigating', 'mitigating'] },
  { kind: 'resolve', label: 'Resolve', capability: 'incident.resolve', states: ['mitigating', 'investigating'] },
  { kind: 'close', label: 'Close', capability: 'incident.close', states: ['resolved'] },
  { kind: 'open-review', label: 'Open review', capability: 'incident.review', states: ['resolved', 'closed'] },
];

export function Incidents() {
  const incidents = useIncidents();
  const capabilities = useCapabilities();
  const selection = useMineStore((s) => s.selection.incidentId);
  const selectAsset = useMineStore((s) => s.selectAsset);
  const incidentAction = useMineStore((s) => s.incidentAction);
  const addComment = useMineStore((s) => s.addComment);
  const comments = useComments();
  const [filter, setFilter] = useState<'active' | 'all' | 'closed'>('active');
  const [tab, setTab] = useState<'summary' | 'evidence' | 'timeline' | 'comments'>('summary');
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState('D. Mensah');
  const [body, setBody] = useState('');

  const visible = useMemo(
    () =>
      incidents.filter((incident) => {
        if (filter === 'active') return incident.state !== 'closed';
        if (filter === 'closed') return incident.state === 'closed';
        return true;
      }),
    [incidents, filter],
  );

  const activeId = selection ?? visible[0]?.id ?? incidents[0]?.id ?? null;
  const incident = incidents.find((item) => item.id === activeId) ?? null;

  useEffect(() => {
    if (!selection && incidents[0]) selectAsset({ incidentId: incidents[0].id });
  }, [selection, incidents, selectAsset]);

  const incidentComments = comments.filter((comment) => comment.incidentId === activeId);
  const can = capabilities.can;

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.incidents}
        actions={
          <div className="flex items-center gap-1.5">
            {(['active', 'all', 'closed'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={cx(
                  'rounded-[2px] border px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em]',
                  filter === option
                    ? 'border-signal-cyan/50 bg-signal-cyan/10 text-signal-cyanBright'
                    : 'border-[color:var(--hairline)] text-ink-400 hover:text-ink-100',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{incidents.length} total</Badge>
          <Badge tone="amber">{incidents.filter((i) => i.state !== 'closed').length} open</Badge>
          <span className="text-2xs text-ink-500">
            Incidents are raised by the engine from threshold crossings and correlated asset states. Nothing is typed in
            as a scenario prop.
          </span>
        </div>
      </ModuleHeader>

      <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
        <Panel className="h-fit max-h-[calc(100vh-190px)] overflow-y-auto">
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{visible.length}</span>}>Queue</PanelTitle>
          {visible.length === 0 && (
            <EmptyState
              icon={<CheckCircle2 size={18} />}
              title="Queue clear"
              detail="No incidents match this filter. Run the simulation or branch a failure scenario to generate one."
            />
          )}
          <div className="divide-y divide-[color:var(--hairline)]">
            {visible.map((item) => (
              <button
                key={item.id}
                onClick={() => selectAsset({ incidentId: item.id, assetId: item.rootAssetId })}
                className={cx(
                  'block w-full px-3 py-2 text-left hover:bg-ink-800/60',
                  item.id === activeId && 'bg-ink-800/80',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <SeverityBadge severity={item.severity} />
                  <span className="ml-auto font-mono text-[8.5px] text-ink-500">{item.reference}</span>
                </div>
                <div className="mt-1 text-[11px] leading-snug text-ink-100">{item.title}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={cx('font-mono text-[8.5px] uppercase tracking-[0.1em]', 'text-ink-500')}>
                    {item.state}
                  </span>
                  <span className="ml-auto font-mono text-[8.5px] text-ink-600">
                    {new Date(item.openedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        {!incident ? (
          <Panel>
            <EmptyState title="No incident selected" detail="Select an incident from the queue to inspect its evidence and workflow." />
          </Panel>
        ) : (
          <div className="space-y-2">
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[color:var(--hairline)] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={incident.severity} />
                    <Badge tone={incident.state === 'resolved' || incident.state === 'closed' ? 'green' : incident.state === 'mitigating' || incident.state === 'investigating' ? 'amber' : 'neutral'}>{incident.state}</Badge>
                    <span className="font-mono text-[9px] text-ink-500">{incident.reference}</span>
                    <span className="font-mono text-[9px] text-ink-500">key {incident.correlationKey}</span>
                  </div>
                  <h2 className="mt-1 text-[15px] font-medium text-ink-50">{incident.title}</h2>
                  <p className="mt-0.5 max-w-[680px] text-[11px] leading-relaxed text-ink-300">{incident.summary}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {ACTIONS.filter((action) => action.states.includes(incident.state)).map((action) => {
                    const permitted = can(action.capability as never);
                    return (
                      <Button
                        key={action.kind}
                        size="xs"
                        variant={action.kind === 'resolve' || action.kind === 'execute-mitigation' ? 'primary' : 'outline'}
                        disabled={!permitted}
                        title={permitted ? undefined : 'Withheld from this role'}
                        onClick={() => {
                          if (action.kind === 'assign') setAssignOpen(true);
                          else incidentAction(incident.id, action.kind);
                        }}
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-px bg-[color:var(--hairline)] sm:grid-cols-4">
                <Meta label="Owner" value={incident.owner ?? 'Unassigned'} />
                <Meta label="Owner role" value={incident.ownerRole ?? '—'} />
                <Meta label="Root asset" value={incident.rootAssetId ?? 'Under investigation'} mono />
                <Meta label="Affected assets" value={`${incident.affectedAssetIds.length}`} />
              </div>

              <Tabs
                className="border-b border-[color:var(--hairline)] px-2 pt-1"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'summary', label: 'Hypotheses' },
                  { id: 'evidence', label: 'Evidence', count: incident.evidence.length },
                  { id: 'timeline', label: 'Timeline', count: incident.events.length },
                  { id: 'comments', label: 'Notes', count: incidentComments.length },
                ]}
              />

              <div className="p-3">
                {tab === 'summary' && (
                  <div className="space-y-2.5">
                    {incident.hypotheses.length === 0 && (
                      <EmptyState title="No hypotheses yet" detail="Evidence has not yet been correlated into a causal statement." icon={<AlertTriangle size={16} />} />
                    )}
                    {incident.hypotheses.map((hypothesis) => (
                      <div key={hypothesis.id} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11.5px] leading-snug text-ink-100">{hypothesis.statement}</p>
                          <span className={cx('num shrink-0 text-[11px]', hypothesis.confidence > 0.7 ? 'text-signal-green' : 'text-signal-amber')}>
                            {(hypothesis.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <Progress value={hypothesis.confidence * 100} tone={hypothesis.confidence > 0.7 ? 'green' : 'amber'} className="mt-1.5" />
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="label-micro mb-1">Supports</div>
                            <EvidenceList evidence={hypothesis.supportingEvidence} compact max={3} />
                          </div>
                          <div>
                            <div className="label-micro mb-1">Against / open</div>
                            {hypothesis.contradictingEvidence.length > 0 ? (
                              <EvidenceList evidence={hypothesis.contradictingEvidence} compact max={3} />
                            ) : (
                              <p className="text-2xs text-ink-500">No contradicting evidence recorded.</p>
                            )}
                            {hypothesis.alternatives.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {hypothesis.alternatives.map((alternative) => (
                                  <li key={alternative} className="text-2xs text-ink-400">· {alternative}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'evidence' && (
                  <div>
                    <p className="mb-2 text-2xs text-ink-500">
                      Every evidence item is traceable to a tag, dependency or model calculation. Click a reference to
                      jump back to the twin.
                    </p>
                    <EvidenceList evidence={incident.evidence} onSelectRef={(ref) => selectAsset({ assetId: ref })} />
                  </div>
                )}

                {tab === 'timeline' && (
                  <ol className="relative space-y-2.5 border-l border-[color:var(--hairline)] pl-4">
                    {incident.events.map((event) => (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full border border-ink-600 bg-ink-850" />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{event.type}</Badge>
                          <span className="font-mono text-[9px] text-ink-500">{formatTimestamp(event.atMs)}</span>
                          <span className="ml-auto font-mono text-[9px] text-ink-500">{event.actor} · {event.role}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-200">{event.summary}</div>
                        {event.detail && <p className="mt-0.5 text-2xs leading-relaxed text-ink-400">{event.detail}</p>}
                      </li>
                    ))}
                  </ol>
                )}

                {tab === 'comments' && (
                  <div className="space-y-2">
                    {incidentComments.length === 0 && (
                      <p className="text-2xs text-ink-500">No notes. Notes are attributed to the current simulated persona and role.</p>
                    )}
                    {incidentComments.map((comment) => (
                      <div key={comment.id} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-ink-200">{comment.author}</span>
                          <span className="font-mono text-[8.5px] text-ink-500">{comment.role}</span>
                          <span className="ml-auto font-mono text-[8.5px] text-ink-600">{formatTimestamp(comment.atMs)}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-ink-300">{comment.body}</p>
                      </div>
                    ))}
                    <Field label="Add a note" hint="Visible to every module and recorded against this incident.">
                      <TextArea
                        rows={3}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="State the observation, the evidence you used, and what you recommend."
                      />
                    </Field>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!body.trim() || !can('incident.comment')}
                        onClick={() => {
                          const result = addComment({ body: body.trim(), incidentId: incident.id });
                          if (result.ok) setBody('');
                        }}
                      >
                        <Send size={11} /> Record note
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{incidentComments.length} notes</span>}>
                Linked decisions &amp; notes
              </PanelTitle>
              <div className="grid gap-px bg-[color:var(--hairline)] md:grid-cols-2">
                <div className="bg-ink-850 px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-ink-400">
                    <Clock size={11} /> <span className="label-micro">Detection to acknowledgement</span>
                  </div>
                  <p className="text-2xs leading-relaxed text-ink-400">
                    Acknowledge is separated from investigation on purpose. The audit trail records who saw it, who owns
                    it and when a mitigation was proposed — even in this demonstration.
                  </p>
                </div>
                <div className="bg-ink-850 px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-ink-400">
                    <UserCheck size={11} /> <span className="label-micro">Separation of duty</span>
                  </div>
                  <p className="text-2xs leading-relaxed text-ink-400">
                    The current role is <span className="text-ink-100">{capabilities.title}</span>. Withheld actions stay
                    visible but disabled. Switching role is a demonstration control, not sign-in.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </div>

      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign incident owner"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (incident) incidentAction(incident.id, 'assign', { assignee });
                setAssignOpen(false);
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        <Field label="Owner" hint="A named person accountable for the next action.">
          <TextInput value={assignee} onChange={(event) => setAssignee(event.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-ink-850 px-3 py-2">
      <div className="label-micro">{label}</div>
      <div className={cx('mt-0.5 truncate text-[11px] text-ink-100', mono && 'font-mono text-[10px]')}>{value}</div>
    </div>
  );
}
