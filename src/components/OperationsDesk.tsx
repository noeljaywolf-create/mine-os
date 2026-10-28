import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Panel } from '../design-system';
import type { PumpMode, Scenario } from '../domain/types';
import { recomputeWorld } from '../simulation/engine';
import { useActiveScenario, useContext, useDerived, useDisplayWorld, useForecasts, useIncidents } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

type Change = { kind: 'pump'; id: string; mode: PumpMode } | { kind: 'generator'; connected: boolean; approved: boolean; available: boolean; capacity: number };

/** A safe planning interface: changes are applied only to the synthetic scenario. */
export function OperationsDesk() {
  const ctx = useContext();
  const scenario = useActiveScenario();
  const world = useDisplayWorld();
  const forecasts = useForecasts();
  const derived = useDerived();
  const incidents = useIncidents();
  const can = useMineStore(s => s.can);
  const replay = useMineStore(s => s.replayActive);
  const setPumpMode = useMineStore(s => s.setPumpMode);
  const apply = useMineStore(s => s.applyEngineeringOverrides);
  const [change, setChange] = useState<Change | null>(null);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const settings = world.scenarioSnapshot?.engineering ?? scenario.overrides.engineering ?? {};

  const preview = useMemo(() => {
    if (!change) return null;
    const overrides = world.scenarioSnapshot ?? scenario.overrides;
    const updated: Scenario = { ...scenario, overrides: change.kind === 'pump'
      ? { ...overrides, pumpOverrides: { ...overrides.pumpOverrides, [change.id]: { ...overrides.pumpOverrides[change.id], mode: change.mode } } }
      : { ...overrides, engineering: { ...overrides.engineering, backupConnected: change.connected, switchingApproved: change.approved, generatorAvailable: change.available, backupCapacityKw: change.capacity } } };
    try { return { world: recomputeWorld(ctx, updated, world), error: '' }; }
    catch (error) { return { world: null, error: error instanceof Error ? error.message : 'Unable to calculate this change.' }; }
  }, [change, ctx, scenario, world]);
  const total = (states: typeof world.pumps, key: 'flowM3h' | 'powerKw') => Object.values(states).reduce((sum, p) => sum + p[key], 0);
  const pendingAllowed = change?.kind === 'pump'
    ? can(change.mode === 'running' ? 'pump.start' : change.mode === 'standby' ? 'pump.toggle-standby' : 'pump.stop')
    : can('scenario.edit-assumptions');
  const selectedPump = change?.kind === 'pump' ? preview?.world?.pumps[change.id] : null;
  const cannotStart = change?.kind === 'pump' && change.mode === 'running' && selectedPump && (selectedPump.unavailable || !selectedPump.powered || selectedPump.flowM3h <= 0);
  const exportSummary = () => {
    const lines = ['MINE OS — SIMULATION HANDOVER', `Scenario: ${scenario.name}`, `Simulation time: ${(world.clock.elapsedSec / 3600).toFixed(2)} hours`,
      'Synthetic estimates only. Not a live mine record or operating instruction.', '', 'WATER',
      ...ctx.mine.sumps.map(s => `${s.name}: ${world.sumps[s.id].levelM.toFixed(2)} m; ${(world.sumps[s.id].fillRatio * 100).toFixed(0)}% full`),
      '', 'PUMPS', ...ctx.mine.pumps.filter(p => p.installed !== false || settings.additionalStandby).map(p => `${p.name}: ${world.pumps[p.id].mode}; ${world.pumps[p.id].flowM3h.toFixed(1)} m³/h`),
      '', `Generator: ${settings.backupConnected ? 'connected' : 'disconnected'}; ${settings.generatorAvailable === false ? 'unavailable' : 'available'}; switching ${settings.switchingApproved ? 'approved in scenario' : 'not approved in scenario'}; ${settings.backupCapacityKw ?? 250} kW configured`,
      `Pumping power: ${total(world.pumps, 'powerKw').toFixed(1)} kW`, `Pumping energy since scenario start: ${Object.values(world.pumps).reduce((sum, p) => sum + (p.energyKwh ?? 0), 0).toFixed(1)} kWh`,
      `Estimated plant rate: ${derived.plantRateTph.toFixed(1)} t/h`, `Open simulated incidents: ${incidents.filter(i => i.state !== 'closed' && i.state !== 'resolved').length}`,
      '', 'SHIFT NOTES (entered locally)', note || 'No notes entered.', '', 'Assumptions: synthetic equipment, water and power inputs; no field calibration. Forecasts are estimates.'];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mine-os-simulation-handover.txt'; link.click(); URL.revokeObjectURL(url);
  };

  return <Panel className="mt-3">
    <div className="space-y-4 p-4 text-sm text-ink-200">
      <div><h2 className="text-base font-semibold text-ink-50">Operations desk</h2>
        <p className="mt-1 text-ink-300">Simulation only. These controls do not connect to or operate real equipment. Review changes before applying them.</p></div>
      {(scenario.isBaseline || replay) && <p className="text-signal-amber">{replay ? 'Leave replay to make changes.' : 'The baseline is protected. Create an editable scenario to make changes.'} <Link className="text-signal-cyanBright underline" to="/app/scenarios">Open scenarios</Link></p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Simulated pump controls"><h3 className="font-semibold text-ink-100">Pumps</h3>
          <div className="mt-2 space-y-2">{ctx.mine.pumps.filter(p => p.installed !== false || settings.additionalStandby).map(p => {
            const state = world.pumps[p.id];
            return <div key={p.id} className="rounded border border-ink-700 p-3">
              <div className="flex flex-wrap justify-between gap-2"><strong>{p.name}</strong><span>{state.mode} · {state.flowM3h.toFixed(1)} m³/h · {state.powerKw.toFixed(1)} kW</span></div>
              <div className="mt-2 flex flex-wrap gap-2">{(['running', 'standby', 'stopped'] as const).map(mode => <Button key={mode} size="xs" onClick={() => { setMessage(''); setChange({ kind: 'pump', id: p.id, mode }); }}>{mode === 'running' ? 'Preview start' : mode === 'stopped' ? 'Preview stop' : 'Preview standby'}</Button>)}</div>
            </div>;
          })}</div>
        </section>
        <div className="space-y-4"><section aria-label="Simulated generator controls"><h3 className="font-semibold text-ink-100">Backup generator</h3>
          <p className="mt-1 text-xs text-ink-300">The model uses backup only when it is available, connected and switching is approved. It does not model protection or safe switching.</p>
          <p className="mt-2">{settings.backupConnected ? 'Connected' : 'Disconnected'} · {settings.generatorAvailable === false ? 'Unavailable' : 'Available'} · {settings.backupCapacityKw ?? 250} kW configured</p>
          <Button size="xs" onClick={() => { setMessage(''); setChange({ kind: 'generator', connected: !!settings.backupConnected, approved: !!settings.switchingApproved, available: settings.generatorAvailable !== false, capacity: settings.backupCapacityKw ?? 250 }); }}>Preview generator settings</Button>
        </section>
        <section><h3 className="font-semibold text-ink-100">Water outlook</h3><p className="text-xs text-ink-300">Estimates use the current synthetic inputs; they are not guarantees.</p>
          <ul className="mt-2 space-y-1">{ctx.mine.sumps.map(s => <li key={s.id}>{s.name}: {world.sumps[s.id].levelM.toFixed(2)} m · {!forecasts?.[s.id] ? 'forecast loading' : !forecasts[s.id].points.length ? 'forecast unavailable' : forecasts[s.id].timeToCriticalHours != null ? `estimated critical level in ${forecasts[s.id].timeToCriticalHours!.toFixed(1)} h` : 'no critical level projected in the forecast window'}</li>)}</ul>
          <Link className="text-signal-cyanBright underline" to="/app/dewatering">See water forecasts and assumptions</Link>
        </section></div>
      </div>
      {change && <section aria-label="Preview simulation change" className="rounded border border-signal-cyan/50 bg-ink-900 p-3 space-y-2"><h3 className="font-semibold text-ink-100">Review before applying</h3>
        {change.kind === 'pump' ? <p>{ctx.mine.pumps.find(p => p.id === change.id)?.name}: set to {change.mode}.</p> : <div className="flex flex-wrap items-center gap-3">
          <label><input type="checkbox" checked={change.available} onChange={e => setChange({ ...change, available: e.target.checked })} /> Available</label>
          <label><input type="checkbox" checked={change.connected} onChange={e => setChange({ ...change, connected: e.target.checked })} /> Connected</label>
          <label><input type="checkbox" checked={change.approved} onChange={e => setChange({ ...change, approved: e.target.checked })} /> Switching approved in scenario</label>
          <label>Capacity (kW) <input className="w-24 rounded border border-ink-700 bg-ink-950 p-1" type="number" min="0" max="100000" value={change.capacity} onChange={e => setChange({ ...change, capacity: e.target.valueAsNumber })} /></label>
        </div>}
        {change.kind === 'generator' && change.connected && (!change.available || !change.approved) && <p className="text-signal-amber">Backup will not supply power until it is available and the switching prerequisite is set.</p>}
        {preview?.world && <p>Estimated pump output: {total(world.pumps, 'flowM3h').toFixed(1)} → {total(preview.world.pumps, 'flowM3h').toFixed(1)} m³/h · Pump power: {total(world.pumps, 'powerKw').toFixed(1)} → {total(preview.world.pumps, 'powerKw').toFixed(1)} kW. These are instantaneous estimates, not a future forecast.</p>}
        {preview?.error && <p className="text-signal-red">{preview.error}</p>}
        {cannotStart && <p className="text-signal-amber">The model cannot deliver flow for this start. Check pump availability, power and hydraulic conditions in the equipment view.</p>}
        <div className="flex gap-2"><Button size="xs" disabled={!preview?.world || !!cannotStart || !pendingAllowed || scenario.isBaseline || replay || (change.kind === 'generator' && (!Number.isFinite(change.capacity) || change.capacity < 0 || change.capacity > 100000))} onClick={() => {
          const result = change.kind === 'pump' ? setPumpMode(change.id, change.mode) : apply({ engineering: { backupConnected: change.connected, switchingApproved: change.approved, generatorAvailable: change.available, backupCapacityKw: change.capacity } });
          setMessage(result.message); if (result.ok) setChange(null);
        }}>Apply to simulation</Button><Button size="xs" onClick={() => setChange(null)}>Cancel</Button></div>
        {!pendingAllowed && <p className="text-signal-amber">Your demonstration role cannot apply this change.</p>}
      </section>}
      {message && <p role="status">{message}</p>}
      <section className="border-t border-ink-700 pt-3"><h3 className="font-semibold text-ink-100">Shift handover</h3><p className="text-xs text-ink-300">Notes stay on this screen until you leave. Download the summary to keep a copy; it is not an official shift record.</p>
        <label className="mt-2 block">Notes for the next shift<textarea className="mt-1 block w-full rounded border border-ink-700 bg-ink-950 p-2 text-ink-100" rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>
        <Button size="xs" disabled={!can('report.export')} onClick={exportSummary}>Download simulation summary</Button>
      </section>
      <nav aria-label="More planning tools" className="flex flex-wrap gap-4 border-t border-ink-700 pt-3 text-signal-cyanBright"><Link to="/app/scenarios">Compare scenarios</Link><Link to="/app/assets">Equipment condition</Link><Link to="/app/impact">Production impact</Link><Link to="/app/analytics">Reports and analysis</Link></nav>
    </div>
  </Panel>;
}
