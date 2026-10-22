import { useMemo, useState } from 'react';
import { Download, Search, Wrench } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  Select,
  StatusBadge,
  TableShell,
  Td,
  TextInput,
  Th,
  cx,
} from '../design-system';
import { useCapabilities, useDerived } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import type { AssetStatus, IndustrialSystem } from '../domain/types';

const STATUSES: AssetStatus[] = ['operational', 'standby', 'degraded', 'blocked', 'exposed', 'failed', 'offline'];

export function Assets() {
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const capabilities = useCapabilities();
  const selection = useMineStore((s) => s.selection.assetId);
  const selectAsset = useMineStore((s) => s.selectAsset);
  const [search, setSearch] = useState('');
  const [system, setSystem] = useState<'all' | IndustrialSystem>('all');
  const [status, setStatus] = useState<'all' | AssetStatus>('all');

  const rows = useMemo(
    () =>
      mine.assets.filter((asset) => {
        const haystack = `${asset.name} ${asset.tag} ${asset.id} ${asset.system}`.toLowerCase();
        if (search && !haystack.includes(search.toLowerCase())) return false;
        if (system !== 'all' && asset.system !== system) return false;
        if (status !== 'all' && derived.assetStates[asset.id]?.status !== status) return false;
        return true;
      }),
    [mine.assets, derived.assetStates, search, system, status],
  );

  const byStatus = STATUSES.map((statusKey) => ({
    status: statusKey,
    count: mine.assets.filter((asset) => derived.assetStates[asset.id]?.status === statusKey).length,
  })).filter((row) => row.count > 0);

  const systems = [...new Set(mine.assets.map((asset) => asset.system))];

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.assets}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!capabilities.can('report.export')}
            onClick={() => exportJson('kestrel-asset-register.json', mine.assets.map((asset) => ({ ...asset, state: derived.assetStates[asset.id] })))}
          >
            <Download size={11} /> Export register
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {byStatus.map((row) => (
            <Badge
              key={row.status}
              tone={row.status === 'failed' || row.status === 'blocked' ? 'red' : row.status === 'degraded' || row.status === 'exposed' ? 'amber' : row.status === 'operational' ? 'green' : 'neutral'}
            >
              {row.count} {row.status}
            </Badge>
          ))}
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">{mine.assets.length} modelled assets</span>
        </div>
      </ModuleHeader>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-500" />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, tag or id…"
              className="!pl-7"
            />
          </div>
          <Select value={system} onChange={(event) => setSystem(event.target.value as typeof system)} className="w-auto">
            <option value="all">all systems</option>
            {systems.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-auto">
            <option value="all">any status</option>
            {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <span className="font-mono text-[9px] text-ink-500">{rows.length} shown</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<Wrench size={18} />} title="No matching assets" detail="Clear the filters to see the full register." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Asset</Th>
                <Th>Tag</Th>
                <Th>System</Th>
                <Th>Level</Th>
                <Th>Status</Th>
                <Th align="right">Effectiveness</Th>
                <Th align="right">Confidence</Th>
                <Th align="right">Deps</Th>
                <Th>State reason</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => {
                const state = derived.assetStates[asset.id];
                const level = mine.levels.find((item) => item.id === asset.levelId);
                const dependencyCount = mine.dependencies.filter((dep) => dep.from === asset.id || dep.to === asset.id).length;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => selectAsset({ assetId: asset.id })}
                    className={cx('cursor-pointer hover:bg-ink-800/60', asset.id === selection && 'bg-ink-800/80')}
                  >
                    <Td>
                      <div className="text-[11.5px] text-ink-100">{asset.name}</div>
                      <div className="font-mono text-[9px] text-ink-500">{asset.id}</div>
                    </Td>
                    <Td className="font-mono text-[10px] text-ink-400">{asset.tag}</Td>
                    <Td className="text-2xs text-ink-400">{asset.system}</Td>
                    <Td className="text-2xs text-ink-400">{level?.name ?? 'Surface'}</Td>
                    <Td><StatusBadge status={state?.status ?? 'operational'} /></Td>
                    <Td align="right" className={cx('num', (state?.effectiveness ?? 0) < 0.8 ? 'text-signal-amber' : 'text-ink-200')}>
                      {((state?.effectiveness ?? 0) * 100).toFixed(0)}%
                    </Td>
                    <Td align="right" className="num">{((state?.confidence ?? 0) * 100).toFixed(0)}%</Td>
                    <Td align="right" className="num">{dependencyCount}</Td>
                    <Td className="max-w-[260px] truncate text-2xs text-ink-400">{state?.statusReason}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        <Panel>
          <PanelTitle>Register integrity</PanelTitle>
          <div className="grid grid-cols-2 gap-px bg-[color:var(--hairline)] sm:grid-cols-3">
            {[
              ['Assets', mine.assets.length],
              ['Sensors', mine.sensors.length],
              ['Dependencies', mine.dependencies.length],
              ['Pumps', mine.pumps.length],
              ['Feeders', mine.feeders.length],
              ['Zones', mine.zones.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-ink-850 px-3 py-2">
                <div className="label-micro">{label}</div>
                <div className="num mt-0.5 text-[16px] text-ink-50">{value}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelTitle>Register notes</PanelTitle>
          <div className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
            <p>Every asset here is synthetic. Nameplate values are chosen to exercise engineering trade-offs, not to describe a real machine.</p>
            <p>Condition and state are modelled from dependencies, sensor freshness and scenario interventions. They are not read from a CMMS.</p>
            <p>Export contains the current synthetic register and derived state only. It contains no personal or operational data.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function exportJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
