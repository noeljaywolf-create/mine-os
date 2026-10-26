import { useMemo, useState } from 'react';
import { GitBranch, History, RotateCcw, Trash2 } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import {
  Badge,
  Button,
  Dialog,
  Field,
  KeyValue,
  Notice,
  Panel,
  Progress,
  Range,
  Select,
  TableShell,
  Td,
  TextInput,
  TextArea,
  Th,
  cx,
} from '../design-system';
import {
  useActiveScenario,
  useAssumptions,
  useCapabilities,
  useDisplayWorld,
  useForecasts,
  useRun,
  useDerived,
} from '../store/hooks';
import { useMineStore as useStore } from '../store/mineStore';
import { deriveState, mergeAssumptions } from '../simulation/engine';
import { forecastAllSumps, storageForecastDivergence } from '../simulation/forecast';
import { pumpingTotals } from '../simulation/plant';
import { formatDurationHours, formatFlow, formatLevel, formatMoney, formatPower } from '../domain/units';
import type { FeederStatus, PumpMode } from '../domain/types';

export function Scenarios() {
  const store = useStore();
  const mine = store.mine;
  const scenarios = store.scenarios;
  const scenario = useActiveScenario();
  const assumptions = useAssumptions();
  const forecasts = useForecasts();
  const capabilities = useCapabilities();
  const displayWorld = useDisplayWorld();
  const run = useRun();
  const derived = useDerived();
  const totals = pumpingTotals(mine, derived.pumpStates);
  const createBranch = useStore((s) => s.createScenarioBranch);
  const switchScenario = useStore((s) => s.switchScenario);
  const resetScenario = useStore((s) => s.resetActiveScenario);
  const setAssumption = useStore((s) => s.setAssumption);
  const setPumpHealth = useStore((s) => s.setPumpHealth);
  const setPumpMode = useStore((s) => s.setPumpMode);
  const setFeederStatus = useStore((s) => s.setFeederStatus);
  const setSumpInflow = useStore((s) => s.setSumpInflowMultiplier);
  const restoreAll = useStore((s) => s.restoreAllDeviations);
  const setReplayIndex = useStore((s) => s.setReplayIndex);
  const updateMeta = useStore((s) => s.updateScenarioMeta);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [pumpId, setPumpId] = useState(mine.pumps[0].id);

  const baseline = scenarios.find((item) => item.isBaseline)!;
  const baselineRun = store.runs[baseline.id];
  const baselineForecasts = useMemo(() => {
    const baseCtx = {
      mine,
      graph: store.graph,
      assumptions: mergeAssumptions(store.baseAssumptions, baseline.overrides.assumptions),
    };
    return forecastAllSumps({
      ctx: baseCtx,
      scenario: baseline,
      world: baselineRun.world,
      derived: deriveState(baseCtx, baseline, baselineRun.world),
    });
  }, [mine, store.graph, store.baseAssumptions, baseline, baselineRun.world]);

  const editable = !scenario.isBaseline && capabilities.can('scenario.edit-assumptions');
  const pump = mine.pumps.find((item) => item.id === pumpId)!;
  const pumpState = derived.pumpStates[pumpId];
  const pumpOverrideHealth = scenario.overrides.pumpOverrides[pumpId]?.health ?? pump.health;
  const replayFrame = run.frames[store.replayIndex];

  const resetForm = () => {
    setName('');
    setDescription('');
    setHypothesis('');
  };

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.scenarios}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => resetScenario()} title="Reset the active scenario to its starting state">
              <RotateCcw size={11} /> Reset run
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!capabilities.can('scenario.clone')}
              onClick={() => setCreateOpen(true)}
            >
              <GitBranch size={11} /> Branch scenario
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={scenario.isBaseline ? 'neutral' : 'cyan'} dot>
            {scenario.isBaseline ? 'baseline · immutable' : 'branch · editable'}
          </Badge>
          <Badge tone="neutral">seed {scenario.seed}</Badge>
          <Badge tone="neutral">{scenario.overrides.assumptions ? Object.keys(scenario.overrides.assumptions).length : 0} assumption overrides</Badge>
          <span className="text-2xs text-ink-500">A branch copies the parent's overrides and diverges from this point.</span>
        </div>
      </ModuleHeader>

      <div className="grid gap-2 xl:grid-cols-[250px_1fr]">
        <Panel className="h-fit">
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">{scenarios.length}</span>}>Branches</PanelTitle>
          <div className="divide-y divide-[color:var(--hairline)]">
            {scenarios.map((item) => (
              <button
                key={item.id}
                onClick={() => switchScenario(item.id)}
                className={cx(
                  'block w-full px-3 py-2 text-left hover:bg-ink-800/60',
                  item.id === scenario.id && 'bg-ink-800/80',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cx('h-1.5 w-1.5 rounded-full', item.isBaseline ? 'bg-ink-400' : 'bg-signal-cyan')} />
                  <span className="truncate text-[11.5px] text-ink-100">{item.name}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-ink-500">{item.hypothesis}</p>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-600">
                  <span>{item.tags.join(' · ')}</span>
                  <span className="ml-auto">{item.createdBy}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-[color:var(--hairline)] px-3 py-2 text-2xs leading-relaxed text-ink-500">
            Baseline is protected. Any attempt to edit it is refused with a toast rather than silently ignored.
          </div>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle
              right={
                <>
                  <Button size="xs" variant="ghost" onClick={() => resetScenario()}>
                    <RotateCcw size={10} /> reset
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => restoreAll()} disabled={!editable}>
                    <Trash2 size={10} /> clear deviations
                  </Button>
                </>
              }
            >
              Active branch · {scenario.name}
            </PanelTitle>
            <div className="grid gap-3 px-3 py-2.5 md:grid-cols-[1fr_220px]">
              <div>
                <Field label="Hypothesis" hint="What engineering question is this branch answering?">
                  <TextArea
                    rows={2}
                    value={scenario.hypothesis}
                    disabled={!editable}
                    onChange={(event) => updateMeta(scenario.id, { hypothesis: event.target.value })}
                  />
                </Field>
                <Field label="Description" className="mt-2">
                  <TextInput
                    value={scenario.description}
                    disabled={!editable}
                    onChange={(event) => updateMeta(scenario.id, { description: event.target.value })}
                  />
                </Field>
              </div>
              <div>
                <KeyValue label="Branch id" value={scenario.id} />
                <KeyValue label="Parent" value={scenario.parentId ?? 'reference'} />
                <KeyValue label="Created by" value={scenario.createdBy} mono={false} />
                <KeyValue label="Run steps" value={String(run.world.clock.stepSec)} />
                <KeyValue label="Frames retained" value={String(run.frames.length)} />
              </div>
            </div>
            {!editable && (
              <div className="border-t border-[color:var(--hairline)] px-3 py-2">
                <Notice tone="neutral">
                  {scenario.isBaseline
                    ? 'This is the immutable reference branch. Create a branch to change assumptions or plant state.'
                    : 'Your current role can inspect but not edit scenarios.'}
                </Notice>
              </div>
            )}
          </Panel>

          <div className="grid gap-2 lg:grid-cols-2">
            <Panel>
              <PanelTitle>Assumptions</PanelTitle>
              <div className="space-y-2.5 px-3 py-2.5">
                <Range
                  label="Energy tariff"
                  min={0.04}
                  max={0.4}
                  step={0.005}
                  value={assumptions.energyTariffUSDPerKwh}
                  disabled={!editable}
                  format={(value) => `${formatMoney(value)}/kWh`}
                  onChange={(value) => setAssumption('energyTariffUSDPerKwh', value)}
                />
                <Range
                  label="Realised value per tonne"
                  min={20}
                  max={140}
                  step={1}
                  value={assumptions.valuePerTonneUSD}
                  disabled={!editable}
                  format={(value) => formatMoney(value)}
                  onChange={(value) => setAssumption('valuePerTonneUSD', value)}
                />
                <Range
                  label="Inflow uncertainty"
                  min={5}
                  max={60}
                  step={1}
                  value={assumptions.inflowUncertaintyPct}
                  disabled={!editable}
                  format={(value) => `${value.toFixed(0)}%`}
                  onChange={(value) => setAssumption('inflowUncertaintyPct', value)}
                />
                <Range
                  label="Restart ramp"
                  min={0}
                  max={8}
                  step={0.5}
                  value={assumptions.restartRampHours}
                  disabled={!editable}
                  format={(value) => `${value.toFixed(1)} h`}
                  onChange={(value) => setAssumption('restartRampHours', value)}
                />
                <Range
                  label="Forecast horizon"
                  min={6}
                  max={72}
                  step={1}
                  value={assumptions.forecastHorizonHours}
                  disabled={!editable}
                  format={(value) => `${value.toFixed(0)} h`}
                  onChange={(value) => setAssumption('forecastHorizonHours', value)}
                />
                <p className="text-2xs leading-relaxed text-ink-500">
                  Assumptions are scenario-scoped. The engine re-derives forecasts immediately; nothing is cached across
                  branches.
                </p>
              </div>
            </Panel>

            <Panel>
              <PanelTitle>Plant interventions</PanelTitle>
              <div className="space-y-2 px-3 py-2.5">
                <Field label="Machine">
                  <Select value={pumpId} onChange={(event) => setPumpId(event.target.value)}>
                    {mine.pumps.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['running', 'standby', 'stopped', 'maintenance'] as PumpMode[]).map((mode) => (
                    <Button
                      key={mode}
                      size="xs"
                      variant={pumpState?.mode === mode ? 'primary' : 'outline'}
                      disabled={!editable}
                      onClick={() => setPumpMode(pumpId, mode)}
                    >
                      {mode}
                    </Button>
                  ))}
                </div>
                <Range
                  label="Mechanical condition"
                  min={0.3}
                  max={1}
                  step={0.01}
                  value={pumpOverrideHealth}
                  disabled={!editable}
                  format={(value) => `${(value * 100).toFixed(0)}%`}
                  onChange={(value) => setPumpHealth(pumpId, value)}
                />
                <div className="border-t border-[color:var(--hairline)] pt-2">
                  <div className="label-micro mb-1">Feeder state</div>
                  <div className="grid grid-cols-2 gap-1">
                    {mine.feeders.map((feeder) => (
                      <div key={feeder.id} className="rounded-[2px] border border-[color:var(--hairline)] px-1.5 py-1">
                        <div className="font-mono text-[9px] text-ink-400">{feeder.name}</div>
                        <Select
                          className="!h-6 !text-[10px]"
                          value={store.getDerived().feederStates[feeder.id]?.status ?? feeder.status}
                          disabled={!editable}
                          onChange={(event) => setFeederStatus(feeder.id, event.target.value as FeederStatus)}
                        >
                          {(['energised', 'degraded', 'failed', 'isolated', 'maintenance'] as FeederStatus[]).map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">active vs baseline reference</span>}>
              Forecast comparison
            </PanelTitle>
            <TableShell>
              <thead>
                <tr>
                  <Th>Sump</Th>
                  <Th align="right">Active level</Th>
                  <Th align="right">Baseline level</Th>
                  <Th align="right">Δ level</Th>
                  <Th align="right">Active critical</Th>
                  <Th align="right">Baseline critical</Th>
                  <Th align="right">Δ hours</Th>
                  <Th align="right">Confidence</Th>
                </tr>
              </thead>
              <tbody>
                {mine.sumps.map((sump) => {
                  const active = forecasts[sump.id];
                  const base = baselineForecasts[sump.id];
                  const deltaLevel = (active.points.at(-1)?.levelM ?? 0) - (base.points.at(-1)?.levelM ?? 0);
                  const deltaHours =
                    active.timeToCriticalHours != null && base.timeToCriticalHours != null
                      ? active.timeToCriticalHours - base.timeToCriticalHours
                      : null;
                  return (
                    <tr key={sump.id} className="hover:bg-ink-800/50">
                      <Td>{sump.name}</Td>
                      <Td align="right" className="num">{formatLevel(active.points.at(-1)?.levelM ?? 0)}</Td>
                      <Td align="right" className="num text-ink-400">{formatLevel(base.points.at(-1)?.levelM ?? 0)}</Td>
                      <Td align="right" className={cx('num', deltaLevel > 0 ? 'text-signal-amber' : 'text-signal-green')}>
                        {deltaLevel >= 0 ? '+' : ''}{deltaLevel.toFixed(2)} m
                      </Td>
                      <Td align="right" className="num">{active.timeToCriticalHours == null ? '—' : formatDurationHours(active.timeToCriticalHours)}</Td>
                      <Td align="right" className="num text-ink-400">{base.timeToCriticalHours == null ? '—' : formatDurationHours(base.timeToCriticalHours)}</Td>
                      <Td align="right" className={cx('num', deltaHours != null && deltaHours < 0 ? 'text-signal-red' : 'text-ink-300')}>
                        {deltaHours == null ? '—' : `${deltaHours >= 0 ? '+' : ''}${deltaHours.toFixed(1)} h`}
                      </Td>
                      <Td align="right" className="num">{(active.confidence * 100).toFixed(0)}%</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
            <div className="grid gap-px border-t border-[color:var(--hairline)] bg-[color:var(--hairline)] sm:grid-cols-3">
              {mine.sumps.map((sump) => (
                <div key={sump.id} className="bg-ink-850 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-ink-400">{sump.name} inflow</span>
                    <span className="num text-[10px] text-ink-200">
                      {(scenario.overrides.sumpOverrides[sump.id]?.inflowMultiplier ?? 1).toFixed(2)}×
                    </span>
                  </div>
                  <Range
                    label=""
                    min={0.4}
                    max={2.5}
                    step={0.05}
                    value={scenario.overrides.sumpOverrides[sump.id]?.inflowMultiplier ?? 1}
                    disabled={!editable}
                    format={(value) => `${value.toFixed(2)}×`}
                    onChange={(value) => setSumpInflow(sump.id, value)}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-2 lg:grid-cols-2">
            <Panel>
              <PanelTitle right={<History size={11} className="text-ink-500" />}>Replay</PanelTitle>
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge tone={store.replayActive ? 'amber' : 'neutral'}>{store.replayActive ? 'replaying' : 'live'}</Badge>
                  <span className="font-mono text-[9.5px] text-ink-500">
                    frame {Math.min(store.replayIndex + 1, run.frames.length)} / {run.frames.length}
                  </span>
                  <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setReplayIndex(null)}>
                    return live
                  </Button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, run.frames.length - 1)}
                  value={Math.min(store.replayIndex, Math.max(0, run.frames.length - 1))}
                  onChange={(event) => setReplayIndex(Number(event.target.value))}
                  className="mt-2 w-full accent-[#6fd3e6]"
                />
                <div className="mt-1 grid grid-cols-2 gap-2 font-mono text-[9.5px] text-ink-400">
                  <span>frame level {formatLevel(replayFrame?.world.sumps[mine.sumps[0].id]?.levelM ?? displayWorld.sumps[mine.sumps[0].id]?.levelM ?? 0)}</span>
                  <span className="text-right">frame t+{(replayFrame?.simSec ?? 0).toFixed(0)} s</span>
                </div>
                <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                  Replay is a read-only lens over retained frames. Interventions are disabled while replaying, so an
                  audit walkthrough cannot mutate the branch.
                </p>
              </div>
            </Panel>

            <Panel>
              <PanelTitle>Branch economics</PanelTitle>
              <div className="px-3 py-2.5">
                <KeyValue label="Wet-running power" value={formatPower(totals.wetPowerKw)} />
                <KeyValue label="Total station duty" value={formatFlow(totals.stationFlowM3h)} />
                <KeyValue label="Tariff" value={`${formatMoney(assumptions.energyTariffUSDPerKwh)}/kWh`} />
                <KeyValue label="Value per tonne" value={formatMoney(assumptions.valuePerTonneUSD)} />
                <KeyValue label="Crew callout" value={formatMoney(assumptions.crewCalloutCostUSD)} />
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between font-mono text-[9px] text-ink-500">
                    <span>horizon storage difference / nominal capacity</span>
                    <span>
                      {storageForecastDivergence(mine, baselineForecasts, forecasts).toFixed(2)}%
                    </span>
                  </div>
                  <Progress value={storageForecastDivergence(mine, baselineForecasts, forecasts)} tone="cyan" />
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Branch the active scenario"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!name.trim() || !hypothesis.trim()}
              onClick={() => {
                createBranch({
                  name: name.trim(),
                  description: description.trim() || 'Branch created in Scenario Lab.',
                  hypothesis: hypothesis.trim(),
                });
                setCreateOpen(false);
                resetForm();
              }}
            >
              Create branch
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Feeder 02 trip during wet shift" />
          </Field>
          <Field label="Description">
            <TextInput value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short context for the branch" />
          </Field>
          <Field label="Hypothesis" hint="State the engineering question. This becomes the branch's audit header.">
            <TextArea rows={3} value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} placeholder="If F-02 trips while S-201 inflow is 1.4×, does the zone flood before standby pumping can be dispatched?" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
