import { useMemo, useState } from 'react';
import { Bell, BellRing, Check, Plus, Trash2 } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { Badge, Button, EmptyState, Field, KeyValue, Panel, Select, TableShell, Td, TextInput, Th, cx } from '../design-system';
import { useMineStore, type AlertRule } from '../store/mineStore';
import { formatTimestamp } from '../domain/units';

function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }

export function Alerts() {
  const rules = useMineStore(s => s.alertRules);
  const events = useMineStore(s => s.alertEvents);
  const mine = useMineStore(s => s.mine);
  const upsert = useMineStore(s => s.upsertAlertRule);
  const remove = useMineStore(s => s.removeAlertRule);
  const ack = useMineStore(s => s.acknowledgeAlert);
  const clear = useMineStore(s => s.clearAlerts);
  const [draft, setDraft] = useState<AlertRule>({ id: uid('rule'), name: 'High sump level', enabled: true, targetKind: 'sump', targetId: mine.sumps[0]?.id ?? '', metric: 'fillRatio', operator: '>=', threshold: 0.9, severity: 'warning' });

  const targets = draft.targetKind === 'sump' ? mine.sumps.map(s => ({ id: s.id, label: `${s.name} (${s.id})` })) : mine.sensors.map(s => ({ id: s.id, label: `${s.name} (${s.id})` }));
  const active = events.filter(e => !e.acknowledged);
  const recent = useMemo(() => events.slice(0, 100), [events]);

  return (
    <div>
      <ModuleHeader module={MODULE_BY_ID.alerts} actions={<Button size="sm" variant="outline" onClick={clear}>Clear events</Button>}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={active.length ? 'amber' : 'green'} dot>{active.length} active</Badge>
          <Badge tone="neutral">{rules.filter(r => r.enabled).length} rules enabled</Badge>
          <span className="text-2xs text-ink-500">Configurable alerting over live, replay, and gateway observations. Rules evaluate against canonical state (core calculations unchanged).</span>
        </div>
      </ModuleHeader>

      <div className="grid gap-2 xl:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Plus size={12} className="text-ink-500" />}>Create / update rule</PanelTitle>
            <div className="space-y-2 p-2">
              <Field label="Name"><TextInput value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Target type">
                  <Select value={draft.targetKind} onChange={e => { const v = e.target.value as any; setDraft({ ...draft, targetKind: v, targetId: (v==='sump'?mine.sumps[0]?.id:mine.sensors[0]?.id) ?? '', metric: v==='sump'?'fillRatio':'value' }); }}>
                    <option value="sump">Sump</option>
                    <option value="sensor">Sensor</option>
                  </Select>
                </Field>
                <Field label="Severity">
                  <Select value={draft.severity} onChange={e => setDraft({ ...draft, severity: e.target.value as any })}>
                    <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
                  </Select>
                </Field>
              </div>
              <Field label="Target">
                <Select value={draft.targetId} onChange={e => setDraft({ ...draft, targetId: e.target.value })}>
                  {targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Metric">
                  <Select value={draft.metric} onChange={e => setDraft({ ...draft, metric: e.target.value as any })}>
                    {draft.targetKind==='sump' ? (<><option value="fillRatio">Fill ratio</option><option value="levelM">Level (m)</option></>) : (<><option value="value">Value</option><option value="freshness">Freshness</option></>)}
                  </Select>
                </Field>
                <Field label="Op">
                  <Select value={draft.operator} onChange={e => setDraft({ ...draft, operator: e.target.value as any })}>
                    {['>','>=','<','<=','==','!='].map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
                <Field label="Threshold"><TextInput value={String(draft.threshold)} onChange={e => setDraft({ ...draft, threshold: e.target.value })} /></Field>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="primary" onClick={() => { upsert({ ...draft, id: draft.id || uid('rule'), threshold: draft.metric==='freshness'? draft.threshold : Number(draft.threshold) }); setDraft({ ...draft, id: uid('rule'), name: draft.name + ' (copy)' }); }}>Save rule</Button>
                <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink-400"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> Enabled</label>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{rules.length}</span>}>Rules</PanelTitle>
            {rules.length === 0 ? <EmptyState icon={<Bell size={18} />} title="No alert rules" detail="Create a rule to detect threshold, level, or data-quality conditions." /> : (
              <TableShell>
                <thead><tr><Th>Rule</Th><Th>Condition</Th><Th></Th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} className="hover:bg-ink-800/50">
                      <Td className="text-[10px]"><div className="flex items-center gap-1.5"><span className={cx('h-1.5 w-1.5 rounded-full', r.enabled ? 'bg-signal-green' : 'bg-ink-600')} />{r.name}</div><div className="text-[9px] text-ink-500">{r.severity}</div></Td>
                      <Td className="font-mono text-[9px] text-ink-400">{r.targetId} {r.metric} {r.operator} {String(r.threshold)}</Td>
                      <Td align="right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setDraft(r)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 size={12} /></Button></div></Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </div>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<BellRing size={12} className={active.length ? 'text-signal-amber' : 'text-ink-600'} />}>Alert events</PanelTitle>
            {recent.length === 0 ? <EmptyState icon={<BellRing size={18} />} title="No alerts yet" detail="Events appear here when enabled rules match live, replay, or gateway-derived state." /> : (
              <div className="divide-y divide-[color:var(--hairline)]">
                {recent.map(e => (
                  <div key={e.id} className={cx('flex items-start justify-between gap-2 px-3 py-2', !e.acknowledged && 'bg-ink-800/30')}>
                    <div>
                      <div className="flex items-center gap-1.5"><Badge tone={e.severity==='critical'?'red':e.severity==='warning'?'amber':'blue'}>{e.severity}</Badge><span className="text-[10.5px] text-ink-100">{e.name}</span>{e.acknowledged && <span className="font-mono text-[9px] text-ink-500">ack</span>}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-ink-400">{e.message}</div>
                      <div className="mt-0.5 text-[9px] text-ink-500">{formatTimestamp(e.atMs)} · t+{Math.round(e.atSimSec)}s · {e.targetId}</div>
                    </div>
                    {!e.acknowledged && <Button size="sm" variant="outline" onClick={() => ack(e.id)}><Check size={12} /> Ack</Button>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <PanelTitle>Notes</PanelTitle>
            <div className="space-y-1 p-2 text-2xs text-ink-500">
              <KeyValue label="Evaluation" value="On simulation ticks & observations (synthetic, pilot replay, live gateway)" />
              <KeyValue label="Supported" value="Sensor value/freshness, sump level/fill ratio thresholds" />
              <KeyValue label="Core impact" value="None — rules read canonical state only" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
