import { useMemo, useState } from 'react';
import { Badge, Button, KeyValue, Notice, Panel, Select, TableShell, Td, Th } from '../design-system';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { useMineStore, type AlertRule } from '../store/mineStore';
import { Settings2, Wrench, FileJson, CheckCircle2 } from 'lucide-react';

import dewateringExpert from '../../pilot-data/expert/dewatering-engineering.config.json';
import powerExpert from '../../pilot-data/expert/power-generator-engineering.config.json';
import commissioningBuild from '../../pilot-data/expert/commissioning-and-build-profile.json';

type ExpertProfile = any;
const PROFILES: { id: string; name: string; discipline: string; data: ExpertProfile }[] = [
  { id: 'dewatering', name: (dewateringExpert as any).profile?.name || 'Dewatering', discipline: (dewateringExpert as any).profile?.discipline || 'dewatering', data: dewateringExpert },
  { id: 'power', name: (powerExpert as any).profile?.name || 'Power/Generator', discipline: (powerExpert as any).profile?.discipline || 'electrical-power', data: powerExpert },
  { id: 'commissioning', name: (commissioningBuild as any).profile?.name || 'Commissioning & Builds', discipline: 'commissioning', data: commissioningBuild },
];

function uid(p: string) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }

function rulesFromProfile(profile: ExpertProfile, mine: any): AlertRule[] {
  const eng = profile?.engineering || {};
  const setpoints = eng.alertSetpoints || eng.operatingEnvelopes || {};
  const rules: AlertRule[] = [];
  // Generic sensor health rules
  const stale = setpoints.sensorStaleSec || eng.alertSetpoints?.sensorStaleSec;
  if (stale?.critical) {
    const s = mine.sensors[0];
    if (s) rules.push({ id: uid('rule'), name: `${profile.profile?.id || 'expert'}: sensor stale (critical)`, enabled: true, targetKind: 'sensor', targetId: s.id, metric: 'freshness', operator: '==', threshold: 'expired', severity: 'critical' });
  }
  // Sump envelopes
  const sumps = eng.operatingEnvelopes?.sumps || [];
  for (const env of sumps) {
    const target = mine.sumps.find((x: any) => x.id === env.assetId) || mine.sumps[0];
    if (!target) continue;
    if (typeof env.highHighTripAdvisoryPct === 'number') rules.push({ id: uid('rule'), name: `${target.name}: high-high level advisory`, enabled: true, targetKind: 'sump', targetId: target.id, metric: 'fillRatio', operator: '>=', threshold: env.highHighTripAdvisoryPct, severity: 'critical' });
    else if (typeof env.highAlarmPct === 'number') rules.push({ id: uid('rule'), name: `${target.name}: high level alarm`, enabled: true, targetKind: 'sump', targetId: target.id, metric: 'fillRatio', operator: '>=', threshold: env.highAlarmPct, severity: 'warning' });
    if (typeof env.lowLowNPSHProtectPct === 'number') rules.push({ id: uid('rule'), name: `${target.name}: low-low NPSH protect`, enabled: true, targetKind: 'sump', targetId: target.id, metric: 'fillRatio', operator: '<=', threshold: env.lowLowNPSHProtectPct, severity: 'warning' });
  }
  // Power/fuel envelopes
  const gens = eng.operatingEnvelopes?.generators || [];
  for (const g of gens) {
    const sensor = mine.sensors.find((x: any) => x.assetId === g.assetId) || mine.sensors.find((x: any) => x.kind === 'power');
    if (sensor && typeof g.overloadAlarmPct === 'number' && typeof g.ratedPowerKw === 'number') {
      rules.push({ id: uid('rule'), name: `${g.assetId}: overload advisory`, enabled: true, targetKind: 'sensor', targetId: sensor.id, metric: 'value', operator: '>=', threshold: +(g.ratedPowerKw * g.overloadAlarmPct / 100).toFixed(2), severity: 'warning' });
    }
  }
  return rules;
}

export function EngineeringConfig() {
  const mine = useMineStore(s => s.mine);
  const upsertAlertRule = useMineStore(s => s.upsertAlertRule);
  const setAssumption = useMineStore(s => s.setAssumption);
  const [selected, setSelected] = useState(PROFILES[0].id);
  const [msg, setMsg] = useState('');
  const profile = useMemo(() => PROFILES.find(p => p.id === selected)!, [selected]);
  const data = profile.data as any;
  const eng = data.engineering || {};
  const buildProfiles = (commissioningBuild as any).buildProfiles || {};
  const commissioning = (commissioningBuild as any).commissioningPlan || eng.commissioning || null;

  const applyAssumptions = () => {
    const a = data.assumptions || {};
    let n = 0;
    for (const [k, v] of Object.entries(a)) {
      if (typeof v === 'number') { setAssumption(k as any, v); n++; }
    }
    setMsg(`Applied ${n} numeric engineering assumptions from profile (core model unchanged; values treated as configuration inputs).`);
  };

  const generateAlertRules = () => {
    const rules = rulesFromProfile(data, mine);
    if (!rules.length) { setMsg('No mappable alert setpoints found in this profile for current assets/sensors. Use Alerts to configure manually.'); return; }
    rules.forEach(r => upsertAlertRule(r));
    setMsg(`Generated ${rules.length} expert alert rule(s) from profile (review and tune against site basis).`);
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${profile.id}-expert-config.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <ModuleHeader module={MODULE_BY_ID['engineering-config']}
        actions={<div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={exportConfig}><FileJson size={12} /> Export</Button></div>}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="blue">expert templates</Badge>
          <Badge tone="neutral">read-only/advisory</Badge>
          <span className="text-2xs text-ink-500">Professional configuration artifacts for dewatering, power/generators/monitors, commissioning, QA and build profiles. No core calculation changes.</span>
        </div>
      </ModuleHeader>

      {msg && <Notice tone="green" title="Configuration action" icon={<CheckCircle2 size={13} />}>{msg}</Notice>}

      <div className="grid gap-2 xl:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Settings2 size={12} className="text-ink-500" />}>Profile</PanelTitle>
            <div className="space-y-2 p-2">
              <Select value={selected} onChange={e => setSelected(e.target.value)}>
                {PROFILES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-1.5 text-2xs">
                <KeyValue label="ID" value={data.profile?.id || profile.id} />
                <KeyValue label="Discipline" value={data.profile?.discipline || profile.discipline} />
                <KeyValue label="Revision" value={data.profile?.revision || 'â€”'} />
                <KeyValue label="Status" value={data.profile?.status || 'template'} />
              </div>
              <p className="text-2xs text-ink-400">{data.profile?.basis || data.pilot?.notes || 'Expert engineering template. Validate all values against site data and approvals.'}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={applyAssumptions}>Apply assumptions</Button>
                <Button size="sm" variant="outline" onClick={generateAlertRules}>Generate alert rules</Button>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<Wrench size={12} className="text-ink-500" />}>Build profiles</PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {Object.entries(buildProfiles).map(([k, v]: any) => (
                <div key={k} className="px-3 py-2">
                  <div className="flex items-center gap-1.5"><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-200">{k}</span>{v.readOnlyEnforced && <Badge tone="green">read-only</Badge>}</div>
                  <div className="text-2xs text-ink-400">{v.purpose}</div>
                  <div className="mt-1 font-mono text-[9px] text-ink-500">{v.command ? `cmd: ${v.command}` : ''} {v.basePath ? `Â· base: ${v.basePath}` : ''} {v.artifact ? `Â· artifact: ${v.artifact}` : ''}</div>
                </div>
              ))}
              {!Object.keys(buildProfiles).length && <div className="px-3 py-2 text-2xs text-ink-500">Select commissioning/build profile to view build targets.</div>}
            </div>
          </Panel>
        </div>

        <div className="space-y-2">
          <Panel>
            <PanelTitle>Engineering design basis & envelopes</PanelTitle>
            <div className="space-y-2 p-2">
              {eng.designBasis && <><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">Design basis</div><pre className="max-h-40 overflow-auto rounded-[2px] border border-[color:var(--hairline)] bg-ink-950 p-2 font-mono text-[9.5px] text-ink-300">{JSON.stringify(eng.designBasis, null, 2)}</pre></>}
              {eng.operatingEnvelopes && <><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">Operating envelopes (setpoints/limits)</div><pre className="max-h-52 overflow-auto rounded-[2px] border border-[color:var(--hairline)] bg-ink-950 p-2 font-mono text-[9.5px] text-ink-300">{JSON.stringify(eng.operatingEnvelopes, null, 2)}</pre></>}
              {eng.derivedMetrics && <><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">Derived metrics (measured inputs + configured calc)</div><pre className="max-h-40 overflow-auto rounded-[2px] border border-[color:var(--hairline)] bg-ink-950 p-2 font-mono text-[9.5px] text-ink-300">{JSON.stringify(eng.derivedMetrics, null, 2)}</pre></>}
              {eng.costAssumptions && <div className="text-2xs text-ink-400">Cost assumptions: {JSON.stringify(eng.costAssumptions)} (template - configure per site)</div>}
              {!eng.designBasis && !eng.operatingEnvelopes && <div className="text-2xs text-ink-500">No engineering envelope data in this profile.</div>}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Commissioning, QA & data quality</PanelTitle>
            <div className="space-y-2 p-2 text-2xs text-ink-400">
              {commissioning?.phases && (
                <TableShell><thead><tr><Th>Phase</Th><Th>Objective</Th><Th>Exit criteria</Th></tr></thead><tbody>
                  {commissioning.phases.map((ph: any) => <tr key={ph.phase}><Td className="font-mono text-[9.5px] text-ink-300">{ph.phase}</Td><Td>{ph.objective}</Td><Td>{(ph.exitCriteria||[]).join('; ')}</Td></tr>)}
                </tbody></TableShell>
              )}
              {eng.dataQuality && <><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">Data quality rules</div><pre className="max-h-32 overflow-auto rounded-[2px] border border-[color:var(--hairline)] bg-ink-950 p-2 font-mono text-[9.5px] text-ink-300">{JSON.stringify(eng.dataQuality, null, 2)}</pre></>}
              {eng.commissioning?.requiredChecks && <ul className="list-disc space-y-1 pl-4">{eng.commissioning.requiredChecks.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>}
              {(commissioningBuild as any).configValidation?.rules && <><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500 mt-2">Config validation rules</div><ul className="list-disc space-y-1 pl-4">{(commissioningBuild as any).configValidation.rules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></>}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Raw profile (auditable)</PanelTitle>
            <pre className="max-h-[320px] overflow-auto px-3 py-2 font-mono text-[9.5px] leading-relaxed text-ink-300">{JSON.stringify(data, null, 2)}</pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}

