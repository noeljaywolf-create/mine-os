import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EngineeringBasis } from './EngineeringBasis';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  CircleSlash,
  X,
} from 'lucide-react';
import { useMineStore } from '../store/mineStore';
import { useDerived, useActiveScenario, useRun, useCapabilities, useDisplayWorld } from '../store/hooks';
import {
  Badge,
  Button,
  IconButton,
  KeyValue,
  Progress,
  Range,
  Select,
  StatusBadge,
  cx,
  toneForStatus,
  toneText,
} from '../design-system';
import { Sparkline } from '../design-system';
import { EvidenceList } from './EvidenceList';
import {
  formatDurationHours,
  formatFlow,
  formatLevel,
  formatMoney,
  formatPower,
  formatTimestamp,
  formatVolume,
} from '../domain/units';
import type { EvidenceRef, PumpMode } from '../domain/types';

export function AssetInspector({ assetId, embedded }: { assetId?: string | null; embedded?: boolean }) {
  const selection = useMineStore((s) => s.selection.assetId);
  const id = assetId ?? selection;
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const run = useRun();
  const displayWorld = useDisplayWorld();
  const scenario = useActiveScenario();
  const capabilities = useCapabilities();
  const selectAsset = useMineStore((s) => s.selectAsset);
  const clearSelection = useMineStore((s) => s.clearSelection);
  const setPumpMode = useMineStore((s) => s.setPumpMode);
  const setPumpHealth = useMineStore((s) => s.setPumpHealth);
  const setFeederStatus = useMineStore((s) => s.setFeederStatus);
  const setSensorStale = useMineStore((s) => s.setSensorStale);
  const setSumpInflowMultiplier = useMineStore((s) => s.setSumpInflowMultiplier);

  const asset = mine.assets.find((a) => a.id === id);
  const state = asset ? derived.assetStates[asset.id] : undefined;
  const incidents = useMineStore((s) => s.runs[s.activeScenarioId].incidents);

  const relatedIncidents = useMemo(
    () => incidents.filter((incident) => incident.rootAssetId === id || incident.affectedAssetIds.includes(id ?? '')),
    [incidents, id],
  );

  const linkedSensors = useMemo(() => (id ? mine.sensors.filter((s) => s.assetId === id) : []), [mine.sensors, id]);
  const upstream = useMemo(() => (id ? mine.dependencies.filter((d) => d.to === id) : []), [mine.dependencies, id]);
  const downstream = useMemo(() => (id ? mine.dependencies.filter((d) => d.from === id) : []), [mine.dependencies, id]);
  const cascades = useMemo(
    () => (id ? derived.cascades.filter((c) => c.path.includes(id)) : []),
    [derived.cascades, id],
  );

  const evidence: EvidenceRef[] = useMemo(() => {
    if (!asset || !state) return [];
    const atMs = run.world.clock.epochMs + run.world.clock.elapsedSec * 1000;
    const items: EvidenceRef[] = [
      {
        id: `ev-state-${asset.id}`,
        kind: 'calculation',
        label: `${asset.name}: modelled state`,
        detail: `Status "${state.status}" at ${(state.effectiveness * 100).toFixed(0)}% effectiveness. ${state.statusReason}`,
        refs: [asset.id, ...state.causedBy],
        atMs,
      },
    ];
    for (const cascade of cascades.slice(0, 3)) {
      items.push({
        id: `ev-cas-${cascade.sourceId}-${cascade.targetId}-${cascade.depth}`,
        kind: 'dependency',
        label: `Dependency path ${cascade.path.join(' → ')}`,
        detail: `${cascade.via}: ${cascade.rationale} Downstream effect: ${cascade.effect}.`,
        refs: cascade.path,
        atMs,
      });
    }
    for (const sensor of linkedSensors) {
      const sensorState = derived.sensorStates[sensor.id];
      items.push({
        id: `ev-sen-${sensor.id}`,
        kind: 'telemetry',
        label: `${sensor.name}: ${sensorState?.freshness ?? 'unavailable'}`,
        detail: `Last value ${sensorState?.lastValue?.toFixed(2) ?? '—'} ${sensor.unit}; age ${(
          sensorState?.ageSec ?? 0
        ).toFixed(0)} s against a ${sensor.stalenessThresholdSec} s window. Confidence ${(
          (sensorState?.confidence ?? 0) * 100
        ).toFixed(0)}%.`,
        refs: [sensor.id],
        atMs,
      });
    }
    return items;
  }, [asset, state, cascades, linkedSensors, derived.sensorStates, run.world.clock]);

  if (!asset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <CircleSlash size={20} className="text-ink-600" />
        <div className="text-[12px] text-ink-300">No asset selected</div>
        <p className="text-2xs text-ink-500">
          Select an asset in any view. The selection follows you across modules so the same object is being discussed
          everywhere.
        </p>
      </div>
    );
  }

  const level = mine.levels.find((l) => l.id === asset.levelId);
  const pump = mine.pumps.find((p) => p.id === asset.id);
  const feeder = mine.feeders.find((f) => f.id === asset.id);
  const sump = mine.sumps.find((s) => s.id === asset.id);
  const zone = mine.zones.find((z) => z.id === asset.id);
  const pumpState = pump ? derived.pumpStates[pump.id] : undefined;
  const sumpState = sump ? displayWorld.sumps[sump.id] : undefined;
  const zoneState = zone ? displayWorld.zones[zone.id] : undefined;
  const immutable = scenario.isBaseline;

  const sensorsForAsset = linkedSensors;
  const primarySeries = sensorsForAsset.length > 0 ? run.telemetry[sensorsForAsset[0].id] ?? [] : [];

  return (
    <div className={cx('flex h-full flex-col', embedded ? '' : 'bg-ink-900/95')}>
      <div className="flex flex-wrap gap-2 p-2"><EngineeringBasis assetId={asset.id} />{pump && <Link to="/app/engineering?view=hydraulics" className="text-xs text-signal-cyanBright">Open interactive pump model →</Link>}</div>
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[color:var(--hairline)] px-3.5 py-3">
        <div className="min-w-0">
          <div className="label-micro">{asset.kind} · {asset.system}</div>
          <h2 className="mt-0.5 truncate text-[13.5px] font-medium text-ink-50">{asset.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-800 px-1 py-[1px] font-mono text-[9px] text-ink-300">
              {asset.tag}
            </span>
            <span className="font-mono text-[9px] text-ink-500">{level?.name ?? 'Surface'}</span>
          </div>
        </div>
        {!embedded && (
          <IconButton label="Close inspector" onClick={clearSelection}>
            <X size={14} />
          </IconButton>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-6">
        <div className="mt-3 flex items-center justify-between gap-2">
          <StatusBadge status={state?.status ?? 'operational'} />
          <span className={cx('num text-2xs', toneText(toneForStatus(state?.status ?? 'operational')))}>
            {(state?.effectiveness ?? 0) * 100 > 0 ? `${((state?.effectiveness ?? 0) * 100).toFixed(0)}% effective` : '0% effective'}
          </span>
        </div>
        <p className="mt-2 text-2xs leading-relaxed text-ink-300">{state?.statusReason}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="label-micro">State confidence</span>
          <Progress value={(state?.confidence ?? 0) * 100} tone={(state?.confidence ?? 0) > 0.75 ? 'green' : 'amber'} className="flex-1" />
          <span className="num text-[10px] text-ink-300">{((state?.confidence ?? 0) * 100).toFixed(0)}%</span>
        </div>

        {pump && pumpState && (
          <div className="mt-4">
            <div className="label-micro mb-1.5">Hydraulic duty</div>
            <KeyValue label="Delivered flow" value={formatFlow(pumpState.flowM3h)} />
            <KeyValue label="Available capability" value={formatFlow(pumpState.availableFlowM3h)} />
            <KeyValue label="Electrical demand" value={formatPower(pumpState.powerKw)} />
            <KeyValue label="Rated flow" value={formatFlow(pump.ratedFlowM3h)} />
            <KeyValue label="Rated head / lift" value={`${pump.ratedHeadM} m / ${pump.liftHeadM} m`} />
            <KeyValue label="Modelled health" value={`${(pump.health * 100).toFixed(0)}%`} tone={pump.health < 0.8 ? 'amber' : 'green'} />
            <KeyValue label="Efficiency" value={`${(pump.efficiency * 100).toFixed(0)}%`} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="label-micro mb-1">Duty mode</div>
                <Select
                  value={pumpState.mode}
                  disabled={immutable}
                  onChange={(event) => setPumpMode(pump.id, event.target.value as PumpMode)}
                >
                  <option value="running">running</option>
                  <option value="standby">standby</option>
                  <option value="stopped">stopped</option>
                  <option value="maintenance">maintenance</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Badge tone={pumpState.powered ? 'green' : 'red'} dot>
                  {pumpState.powered ? 'supply healthy' : 'no supply'}
                </Badge>
              </div>
            </div>
            {capabilities.can('asset.fail') && (
              <div className="mt-3">
                <Range
                  label="Modelled condition"
                  min={0.3}
                  max={1}
                  step={0.01}
                  value={pump.health}
                  disabled={immutable}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                  onChange={(value) => setPumpHealth(pump.id, value)}
                />
              </div>
            )}
            {immutable && (
              <p className="mt-2 text-2xs text-ink-500">
                Baseline is immutable. Branch the scenario to change duty or condition.
              </p>
            )}
          </div>
        )}

        {feeder && (
          <div className="mt-4">
            <div className="label-micro mb-1.5">Electrical supply</div>
            <KeyValue label="Feeder status" value={derived.feederStates[feeder.id]?.status ?? feeder.status} />
            <KeyValue label="Supply available" value={`${((derived.feederStates[feeder.id]?.supplyRatio ?? 0) * 100).toFixed(0)}%`} />
            <KeyValue label="Connected load" value={formatPower(derived.feederStates[feeder.id]?.connectedLoadKw ?? 0)} />
            <KeyValue label="Firm capacity" value={`${feeder.capacityKva} kVA @ ${feeder.voltageV / 1000} kV`} />
            <KeyValue label="Source bus" value={feeder.sourceBus} />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(['energised', 'degraded', 'failed', 'isolated'] as const).map((status) => (
                <Button
                  key={status}
                  size="xs"
                  variant={status === 'failed' ? 'danger' : status === 'energised' ? 'primary' : 'outline'}
                  disabled={immutable}
                  onClick={() => setFeederStatus(feeder.id, status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            {immutable && (
              <p className="mt-2 text-2xs text-ink-500">Branch the scenario to switch feeder state.</p>
            )}
          </div>
        )}

        {sump && sumpState && (
          <div className="mt-4">
            <div className="label-micro mb-1.5">Storage & water balance</div>
            <div className="mb-2">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="num text-[19px] text-ink-50">{formatLevel(sumpState.levelM)}</span>
                <span className="num text-2xs text-ink-400">
                  {((sumpState.levelM / (sump.capacityM3 / sump.areaM2)) * 100).toFixed(0)}% of depth
                </span>
              </div>
              <Progress value={sumpState.fillRatio * 100} tone={sumpState.breach?.severity === 'critical' ? 'red' : sumpState.breach ? 'amber' : 'cyan'} />
            </div>
            <KeyValue label="Stored volume" value={formatVolume(sumpState.volumeM3)} />
            <KeyValue label="Capacity" value={formatVolume(sump.capacityM3)} />
            <KeyValue label="Inflow" value={formatFlow(sumpState.inflowM3h)} />
            <KeyValue label="Discharge" value={formatFlow(sumpState.outflowM3h)} />
            <KeyValue
              label="Net"
              value={formatFlow(sumpState.inflowM3h - sumpState.outflowM3h)}
              tone={sumpState.inflowM3h - sumpState.outflowM3h > 0 ? 'amber' : 'green'}
            />
            <KeyValue
              label="Time to critical"
              value={sumpState.secondsToCritical === null ? 'Not projected' : formatDurationHours(sumpState.secondsToCritical / 3600)}
              tone="amber"
            />
            {capabilities.can('scenario.edit-assumptions') && (
              <div className="mt-3">
                <Range
                  label="Inflow multiplier"
                  min={0.4}
                  max={2.5}
                  step={0.05}
                  value={scenario.overrides.sumpOverrides[sump.id]?.inflowMultiplier ?? 1}
                  disabled={immutable}
                  format={(v) => `${v.toFixed(2)}×`}
                  onChange={(value) => setSumpInflowMultiplier(sump.id, value)}
                />
              </div>
            )}
          </div>
        )}

        {zone && zoneState && (
          <div className="mt-4">
            <div className="label-micro mb-1.5">Production</div>
            <KeyValue label="Current rate" value={`${zoneState.rateTph.toFixed(0)} t/h`} />
            <KeyValue label="Design rate" value={`${zone.designRateTph} t/h`} />
            <KeyValue label="Operating ratio" value={`${(zoneState.operatingRatio * 100).toFixed(0)}%`} />
            <KeyValue label="Lost hours" value={`${zoneState.lostHours.toFixed(2)} h`} />
            <KeyValue label="Lost tonnes" value={`${zoneState.lostTonnes.toFixed(0)} t`} />
            <KeyValue label="Lost value" value={formatMoney(zoneState.lostValueUSD)} />
          </div>
        )}

        {sensorsForAsset.length > 0 && (
          <div className="mt-4">
            <div className="label-micro mb-1.5">Instrumentation</div>
            <div className="space-y-1.5">
              {sensorsForAsset.map((sensor) => {
                const sensorState = derived.sensorStates[sensor.id];
                const series = run.telemetry[sensor.id] ?? [];
                const values = series.map((p) => p.value);
                return (
                  <div key={sensor.id} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-ink-200">{sensor.name}</span>
                      <Badge
                        tone={
                          sensorState?.freshness === 'live'
                            ? 'green'
                            : sensorState?.freshness === 'stale'
                              ? 'amber'
                              : 'red'
                        }
                      >
                        {sensorState?.freshness ?? 'unavailable'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <div>
                        <span className="num text-[14px] text-ink-50">
                          {sensorState?.lastValue != null ? sensorState.lastValue.toFixed(2) : '—'}
                        </span>{' '}
                        <span className="font-mono text-[9px] text-ink-400">{sensor.unit}</span>
                        <div className="font-mono text-[9px] text-ink-500">
                          age {(sensorState?.ageSec ?? 0).toFixed(0)} s / {sensor.stalenessThresholdSec} s
                        </div>
                      </div>
                      <Sparkline values={values.length > 1 ? values : [0, 0]} width={90} height={22} />
                    </div>
                    {capabilities.can('scenario.edit-assumptions') && (
                      <button
                        disabled={immutable}
                        onClick={() => setSensorStale(sensor.id, !(scenario.overrides.sensorOverrides[sensor.id]?.stale))}
                        className="mt-1 text-[9px] uppercase tracking-[0.12em] text-ink-400 hover:text-signal-cyanBright disabled:opacity-40"
                      >
                        {scenario.overrides.sensorOverrides[sensor.id]?.stale ? 'restore tag' : 'simulate stale tag'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {primarySeries.length > 1 && (
              <div className="mt-2 text-2xs text-ink-500">
                Latest sample {formatTimestamp(primarySeries[primarySeries.length - 1].epochMs)}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <div className="label-micro mb-1.5">Dependency chain</div>
          <div className="space-y-1">
            {upstream.length === 0 && downstream.length === 0 && (
              <div className="text-2xs text-ink-500">No modelled dependencies for this asset.</div>
            )}
            {upstream.map((dep) => (
              <button
                key={dep.id}
                onClick={() => selectAsset({ assetId: dep.from })}
                className="flex w-full items-center gap-1.5 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2 py-1 text-left hover:border-ink-500"
              >
                <ArrowUpRight size={11} className="text-ink-400" />
                <span className="truncate font-mono text-[10px] text-ink-300">{dep.from}</span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-ink-500">{dep.type}</span>
                <ChevronRight size={10} className="text-ink-600" />
              </button>
            ))}
            {downstream.map((dep) => (
              <button
                key={dep.id}
                onClick={() => selectAsset({ assetId: dep.to })}
                className="flex w-full items-center gap-1.5 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2 py-1 text-left hover:border-ink-500"
              >
                <ArrowDownRight size={11} className="text-ink-400" />
                <span className="truncate font-mono text-[10px] text-ink-300">{dep.to}</span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-ink-500">{dep.type}</span>
                <ChevronRight size={10} className="text-ink-600" />
              </button>
            ))}
          </div>
        </div>

        {relatedIncidents.length > 0 && (
          <div className="mt-4">
            <div className="label-micro mb-1.5">Linked incidents</div>
            <div className="space-y-1">
              {relatedIncidents.map((incident) => (
                <button
                  key={incident.id}
                  onClick={() => useMineStore.getState().selectAsset({ incidentId: incident.id })}
                  className="flex w-full items-center gap-2 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2 py-1.5 text-left hover:border-ink-500"
                >
                  <AlertTriangle size={11} className={incident.severity === 'critical' ? 'text-signal-red' : 'text-signal-amber'} />
                  <span className="truncate text-[11px] text-ink-200">{incident.title}</span>
                  <span className="ml-auto font-mono text-[9px] text-ink-500">{incident.reference}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="label-micro mb-1.5">Evidence</div>
          <EvidenceList evidence={evidence} compact max={3} />
        </div>

        <div className="mt-4">
          <div className="label-micro mb-1.5">Nameplate</div>
          <KeyValue label="Manufacturer" value={asset.manufacturer} mono={false} />
          <KeyValue label="Model" value={asset.model} mono={false} />
          <KeyValue label="Serial" value={asset.serialNumber} />
          <KeyValue label="Commissioned" value={String(asset.commissionedYear)} />
          <p className="mt-2 text-2xs leading-relaxed text-ink-400">{asset.description}</p>
        </div>
      </div>
    </div>
  );
}
