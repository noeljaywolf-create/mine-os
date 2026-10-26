import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cable, CircleSlash, Radio, ShieldQuestion } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import {
  Badge,
  Button,
  Notice,
  Panel,
  Select,
  TableShell,
  Td,
  Th,
  Toggle,
  cx,
} from '../design-system';
import { useActiveScenario, useCapabilities, useDerived, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import { formatDuration, formatTimestamp } from '../domain/units';

const CONNECTORS = [
  {
    id: 'historian-opcua',
    name: 'Historian / OPC-UA',
    direction: 'read',
    status: 'not connected',
    contract: 'Read-only subscription to level, flow and status tags. Timestamps normalised to UTC; quality code required.',
    requirement: 'Site network path, certificate exchange, tag allow-list and read-only service account.',
  },
  {
    id: 'cmms',
    name: 'Maintenance (CMMS)',
    direction: 'read',
    status: 'not connected',
    contract: 'Work order and asset condition export, keyed by site asset tag. No write-back in this demonstration.',
    requirement: 'Vendor API credentials and agreed asset-tag mapping.',
  },
  {
    id: 'weather',
    name: 'Surface weather',
    direction: 'read',
    status: 'not connected',
    contract: 'Rainfall intensity and forecast, used as an inflow lead indicator.',
    requirement: 'Approved provider subscription and site geolocation.',
  },
  {
    id: 'guardian',
    name: 'Recovery / response system',
    direction: 'write',
    status: 'blocked by policy',
    contract: 'Would emit recommendations only. This demonstration never commands plant or writes to a control system.',
    requirement: 'Separate safety case, human-in-the-loop design and operational approval. Out of scope here.',
  },
] as const;

export function Telemetry() {
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const capabilities = useCapabilities();
  const setSensorStale = useMineStore((s) => s.setSensorStale);
  const clock = useRun().world.clock;
  const scenario = useActiveScenario();
  const [kind, setKind] = useState<'all' | string>('all');
  const [freshness, setFreshness] = useState<'all' | string>('all');
  const [showContract, setShowContract] = useState(false);

  const editable = capabilities.can('scenario.edit-assumptions');
  const sensors = mine.sensors.filter((sensor) => {
    const state = derived.sensorStates[sensor.id];
    if (kind !== 'all' && sensor.kind !== kind) return false;
    if (freshness !== 'all' && state?.freshness !== freshness) return false;
    return true;
  });

  const counts = (['live', 'stale', 'expired', 'unavailable'] as const).map((key) => ({
    key,
    count: mine.sensors.filter((sensor) => derived.sensorStates[sensor.id]?.freshness === key).length,
  }));

  const contractSample = {
    source: 'mine-os.adapter',
    version: '0.1.0-demo',
    emittedAt: new Date(clock.epochMs + clock.elapsedSec * 1000).toISOString(),
    site: mine.id,
    readOnly: true,
    tags: mine.sensors.slice(0, 4).map((sensor) => ({
      tag: sensor.id,
      asset: sensor.assetId,
      unit: sensor.unit,
      quality: derived.sensorStates[sensor.id]?.freshness ?? 'unavailable',
      value: derived.sensorStates[sensor.id]?.lastValue ?? null,
      ageSec: Math.round(derived.sensorStates[sensor.id]?.ageSec ?? 0),
    })),
  };

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.telemetry}
        actions={
          <Button size="sm" variant="outline" onClick={() => setShowContract((value) => !value)}>
            <Cable size={11} /> {showContract ? 'Hide' : 'Show'} adapter contract
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.map((row) => (
            <Badge
              key={row.key}
              tone={row.key === 'live' ? 'green' : row.key === 'stale' ? 'amber' : row.key === 'expired' ? 'red' : 'neutral'}
              dot
            >
              {row.count} {row.key}
            </Badge>
          ))}
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">simulated tags only</span>
        </div>
      </ModuleHeader>
      <p className="my-2 text-xs"><Link to="/app/engineering?view=investigation" className="text-signal-cyanBright">Open sensor failure, scaling, delayed-sample and contradiction investigation →</Link></p>

      <div className="grid gap-2 xl:grid-cols-[1.5fr_1fr]">
        <Panel>
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2">
            <Select value={kind} onChange={(event) => setKind(event.target.value)} className="w-auto">
              <option value="all">all tag types</option>
              {[...new Set(mine.sensors.map((sensor) => sensor.kind))].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <Select value={freshness} onChange={(event) => setFreshness(event.target.value)} className="w-auto">
              <option value="all">any freshness</option>
              {['live', 'stale', 'expired', 'unavailable'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <span className="ml-auto font-mono text-[9px] text-ink-500">{sensors.length} tags</span>
            {!editable && <Badge tone="neutral">read-only for this role</Badge>}
          </div>
          <TableShell>
            <thead>
              <tr>
                <Th>Tag</Th>
                <Th>Asset</Th>
                <Th>Kind</Th>
                <Th align="right">Value</Th>
                <Th align="right">Age</Th>
                <Th align="right">Confidence</Th>
                <Th align="right">Link</Th>
                <Th align="right">Accuracy</Th>
                <Th align="right">Forced stale</Th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((sensor) => {
                const state = derived.sensorStates[sensor.id];
                const isForced = Boolean(scenario.overrides.sensorOverrides[sensor.id]?.stale);
                return (
                  <tr key={sensor.id} className="hover:bg-ink-800/50">
                    <Td>
                      <div className="text-[11px] text-ink-200">{sensor.name}</div>
                      <div className="font-mono text-[9px] text-ink-500">{sensor.id}</div>
                    </Td>
                    <Td className="font-mono text-[9.5px] text-ink-400">{sensor.assetId}</Td>
                    <Td className="text-2xs text-ink-400">{sensor.kind}</Td>
                    <Td align="right" className="num">
                      {state?.lastValue == null ? '—' : `${state.lastValue.toFixed(1)} ${sensor.unit}`}
                    </Td>
                    <Td align="right" className={cx('num', (state?.ageSec ?? 0) > sensor.stalenessThresholdSec ? 'text-signal-amber' : 'text-ink-300')}>
                      {formatDuration(state?.ageSec ?? 0)}
                    </Td>
                    <Td align="right" className="num">{((state?.confidence ?? 0) * 100).toFixed(0)}%</Td>
                    <Td align="right" className="num text-ink-400">{(sensor.linkQuality * 100).toFixed(0)}%</Td>
                    <Td align="right" className="num text-ink-400">±{sensor.accuracyPct.toFixed(1)}%</Td>
                    <Td align="right">
                      <div className="flex justify-end">
                        <Toggle
                          checked={isForced}
                          disabled={!editable}
                          onChange={(next) => setSensorStale(sensor.id, next)}
                          label={`Force ${sensor.name} stale`}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
          <div className="border-t border-[color:var(--hairline)] px-3 py-2 text-2xs leading-relaxed text-ink-500">
            Forcing a tag stale is a scenario intervention, not an integration feature. It demonstrates how the platform
            degrades its own confidence and widens forecast bands instead of inventing readings.
          </div>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<Radio size={11} className="text-ink-500" />}>Connectors</PanelTitle>
            <div className="divide-y divide-[color:var(--hairline)]">
              {CONNECTORS.map((connector) => (
                <div key={connector.id} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-ink-100">{connector.name}</span>
                    <Badge tone={connector.status === 'not connected' ? 'neutral' : 'red'}>{connector.status}</Badge>
                    <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-500">{connector.direction}</span>
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-ink-400">{connector.contract}</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{connector.requirement}</p>
                </div>
              ))}
            </div>
          </Panel>

          {showContract && (
            <Panel>
              <PanelTitle>Adapter contract (sample)</PanelTitle>
              <pre className="max-h-[280px] overflow-auto px-3 py-2 font-mono text-[9.5px] leading-relaxed text-ink-300">
{JSON.stringify(contractSample, null, 2)}
              </pre>
            </Panel>
          )}

          <Notice tone="blue" title="No operational connection" icon={<ShieldQuestion size={13} />}>
            This build contains no PLC, SCADA, historian or CMMS connection. Connector entries describe the contract a
            real deployment would need; they do not indicate a live integration.
          </Notice>

          <Panel>
            <PanelTitle right={<CircleSlash size={11} className="text-ink-500" />}>What is deliberately absent</PanelTitle>
            <ul className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <li>· No control writes, interlocks or trip logic.</li>
              <li>· No authentication provider; role switching is a demonstration aid.</li>
              <li>· No real site data, credentials or personal information.</li>
              <li>· No claim of cyber certification. A production deployment needs its own security case.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel className="mt-2">
        <PanelTitle>Sample freshness timeline</PanelTitle>
        <div className="flex flex-wrap gap-2 px-3 py-2">
          {mine.sensors.map((sensor) => {
            const state = derived.sensorStates[sensor.id];
            return (
              <div key={sensor.id} className="flex items-center gap-1 font-mono text-[8.5px] text-ink-500">
                <span
                  className={cx(
                    'h-2 w-2 rounded-[1px]',
                    state?.freshness === 'live'
                      ? 'bg-signal-green'
                      : state?.freshness === 'stale'
                        ? 'bg-signal-amber'
                        : state?.freshness === 'expired'
                          ? 'bg-signal-red'
                          : 'bg-ink-600',
                  )}
                />
                {sensor.id}
              </div>
            );
          })}
        </div>
        <div className="border-t border-[color:var(--hairline)] px-3 py-1.5 font-mono text-[8.5px] text-ink-500">
          last clock sample {formatTimestamp(clock.epochMs + clock.elapsedSec * 1000)} · simulated
        </div>
      </Panel>
    </div>
  );
}
