import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { EngineeringBasis } from '../components/EngineeringBasis';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import { BarChart, TrendChart } from '../components/charts';
import {
  Badge,
  Button,
  KeyValue,
  Metric,
  MetricCell,
  MetricGrid,
  Panel,
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useAnalytics, useAssumptions, useDerived, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import { formatFlow, formatMoney, formatPower } from '../domain/units';

export function Energy() {
  const mine = useMineStore((s) => s.mine);
  const analytics = useAnalytics();
  const assumptions = useAssumptions();
  const derived = useDerived();
  const run = useRun();
  const setFeederStatus = useMineStore((s) => s.setFeederStatus);
  const selectAsset = useMineStore((s) => s.selectAsset);

  const powerSensors = mine.sensors.filter((sensor) => sensor.kind === 'power');
  const historyLength = Math.min(...powerSensors.map((sensor) => (run.telemetry[sensor.id] ?? []).length));
  const categories =
    Number.isFinite(historyLength) && historyLength > 0
      ? (run.telemetry[powerSensors[0].id] ?? []).slice(-historyLength).map((point) => Number((point.simSec / 3600).toFixed(2)))
      : [];
  const loadSeries = categories.map((_, index) =>
    powerSensors.reduce((sum, sensor) => sum + ((run.telemetry[sensor.id] ?? [])[Math.max(0, (run.telemetry[sensor.id] ?? []).length - historyLength + index)]?.value ?? 0), 0),
  );

  const demandByFeeder = mine.feeders.map((feeder) => ({
    feeder,
    state: derived.feederStates[feeder.id],
    load: derived.feederStates[feeder.id]?.connectedLoadKw ?? 0,
    capacityKw: feeder.capacityKva * 0.9,
  }));

  const failedFeeders = demandByFeeder.filter((row) => row.state?.supplyRatio < 0.99);

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.energy}
        actions={
          <>
            <Link to="/app/engineering?view=resilience" className="text-[10px] text-signal-cyanBright">electrical single-line / backup simulator →</Link>
            <Link to="/app/dewatering" className="text-[10px] text-ink-400 hover:text-ink-100">pump duty →</Link>
            <Badge tone={failedFeeders.length ? 'red' : 'green'} dot>
              {failedFeeders.length ? `${failedFeeders.length} supply constraint${failedFeeders.length === 1 ? '' : 's'}` : 'all feeders supplying'}
            </Badge>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-500">
          <span>Pumping energy is computed as hydraulic work ÷ wire-to-water efficiency, then priced at the scenario tariff.</span>
          <span className="font-mono text-ink-400">tariff {formatMoney(assumptions.energyTariffUSDPerKwh)}/kWh</span>
        </div>
      </ModuleHeader>
      <div className="my-3 flex flex-wrap gap-2"><EngineeringBasis assetId="site:power" /><EngineeringBasis assetId="site:energy" /></div>

      <MetricGrid cols={5}>
        <MetricCell>
          <Metric label="Connected load" value={formatPower(demandByFeeder.reduce((sum, row) => sum + row.load, 0))} hint="all feeders" tone="neutral" />
        </MetricCell>
        <MetricCell>
          <Metric label="Pumping demand" value={formatPower(analytics.totalPowerKw)} hint={`${analytics.pumpPerformance.filter((row) => row.flowM3h > 0).length} pumps running`} tone="neutral" />
        </MetricCell>
        <MetricCell>
          <Metric label="Specific energy" value={`${analytics.energy.averageSpecificKwhPerM3.toFixed(3)}`} unit="kWh/m³" hint="instantaneous, running pumps" tone={analytics.energy.averageSpecificKwhPerM3 > 0.35 ? 'amber' : 'green'} />
        </MetricCell>
        <MetricCell>
          <Metric label="Energy consumed" value={`${analytics.energy.energyKwh.toFixed(0)}`} unit="kWh" hint="this scenario" tone="neutral" />
        </MetricCell>
        <MetricCell>
          <Metric label="Energy cost" value={formatMoney(analytics.energy.costUSD)} hint={`${analytics.elapsedHours.toFixed(2)} h elapsed`} tone="neutral" />
        </MetricCell>
      </MetricGrid>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">kW · logged telemetry</span>}>
            Feeder load vs firm capability
          </PanelTitle>
          <div className="p-2">
            <BarChart
              categories={demandByFeeder.map((row) => row.feeder.name.replace('Feeder ', 'F-'))}
              series={[
                { name: 'connected load', data: demandByFeeder.map((row) => Number(row.load.toFixed(0))), color: '#4f8ff7' },
                { name: 'firm capability', data: demandByFeeder.map((row) => Number(row.capacityKw.toFixed(0))), color: '#2a3a52' },
              ]}
              height={210}
              yName="kW"
              legend
            />
          </div>
          {categories.length > 1 && (
            <div className="border-t border-[color:var(--hairline)] p-2">
              <div className="label-micro mb-1">Total measured feeder power over scenario time (h)</div>
              <TrendChart
                categories={categories}
                series={[{ name: 'measured load', data: loadSeries.map((value) => Number(value.toFixed(1))), color: '#6fd3e6', area: true }]}
                height={150}
                yName="kW"
              />
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">interventions are role-gated</span>}>
            Feeder register
          </PanelTitle>
          <div className="divide-y divide-[color:var(--hairline)]">
            {demandByFeeder.map(({ feeder, state }) => (
              <div key={feeder.id} className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => selectAsset({ assetId: feeder.id })} className="text-[11.5px] text-ink-100 hover:text-signal-cyanBright">
                    {feeder.name}
                  </button>
                  <Badge tone={state?.supplyRatio === 1 ? 'green' : state?.supplyRatio === 0 ? 'red' : 'amber'}>
                    {state?.status ?? feeder.status}
                  </Badge>
                  <span className="ml-auto font-mono text-[9px] text-ink-500">{feeder.voltageV / 1000} kV</span>
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[9.5px] text-ink-400">
                  <span>supply {(state?.supplyRatio ?? 1) * 100 > 99 ? '100' : ((state?.supplyRatio ?? 0) * 100).toFixed(0)}%</span>
                  <span>{feeder.route}</span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="truncate text-[9px] text-ink-500">{state?.statusReason}</span>
                  <div className="ml-auto flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setFeederStatus(feeder.id, 'energised')} disabled={state?.status === 'energised'}>
                      restore
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setFeederStatus(feeder.id, 'failed')} disabled={state?.status === 'failed'}>
                      trip
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">per machine</span>}>Pump electrical performance</PanelTitle>
          <TableShell>
            <thead>
              <tr>
                <Th>Pump</Th>
                <Th>Sump</Th>
                <Th>Feeder</Th>
                <Th align="right">Flow</Th>
                <Th align="right">Power</Th>
                <Th align="right">kWh/m³</Th>
                <Th align="right">Energy</Th>
                <Th align="right">Cost</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {analytics.pumpPerformance.map((row) => {
                const energy = analytics.energy.byPump.find((item) => item.pumpId === row.pumpId);
                return (
                  <tr key={row.pumpId} className="hover:bg-ink-800/50">
                    <Td>
                      <button onClick={() => selectAsset({ assetId: row.pumpId })} className="text-left hover:text-signal-cyanBright">
                        {row.pumpName}
                      </button>
                    </Td>
                    <Td className="text-2xs text-ink-400">{row.sumpName}</Td>
                    <Td className="text-2xs text-ink-400">{row.feederName}</Td>
                    <Td align="right" className="num">{formatFlow(row.flowM3h)}</Td>
                    <Td align="right" className="num">{row.powerKw.toFixed(0)} kW</Td>
                    <Td align="right" className="num">{row.specificEnergyKwhPerM3 > 0 ? row.specificEnergyKwhPerM3.toFixed(3) : '—'}</Td>
                    <Td align="right" className="num">{row.energyKwh.toFixed(0)}</Td>
                    <Td align="right" className="num">{formatMoney(energy?.energyCostUSD ?? 0)}</Td>
                    <Td>
                      <span className={cx('font-mono text-[9px]', row.powered ? 'text-signal-green' : 'text-signal-red')}>
                        {row.powered ? row.mode : 'unpowered'}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Panel>

        <div className="space-y-2">
          <Panel>
            <PanelTitle>Cost of moving water</PanelTitle>
            <div className="px-3 py-2">
              <KeyValue label="Tariff" value={`${formatMoney(assumptions.energyTariffUSDPerKwh)} / kWh`} />
              <KeyValue label="Running demand" value={formatPower(analytics.energy.runningPowerKw)} />
              <KeyValue label="Energy to date" value={`${analytics.energy.energyKwh.toFixed(1)} kWh`} />
              <KeyValue label="Cost to date" value={formatMoney(analytics.energy.costUSD)} />
              <KeyValue label="Average specific energy" value={`${analytics.energy.averageSpecificKwhPerM3.toFixed(3)} kWh/m³`} />
            </div>
            <div className="border-t border-[color:var(--hairline)] px-3 py-2">
              <div className="label-micro mb-1">Top consumers</div>
              {[...analytics.energy.byPump]
                .sort((a, b) => b.energyKwh - a.energyKwh)
                .slice(0, 5)
                .map((row) => (
                  <div key={row.pumpId} className="flex items-center justify-between gap-2 py-0.5 font-mono text-[9.5px]">
                    <span className="text-ink-300">{row.pumpName}</span>
                    <span className="text-ink-400">{row.energyKwh.toFixed(0)} kWh · {formatMoney(row.energyCostUSD)}</span>
                  </div>
                ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Electrical dependency</PanelTitle>
            <div className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <p><Zap size={10} className="mr-1 inline text-signal-amber" /> A feeder trip reduces every downstream pump's supply ratio in the next model step.</p>
              <p>Pump flow is limited by head and health, then by available power. Tripping a feeder is therefore visible in sump level and production within seconds of simulated time.</p>
              <p className="text-ink-500">Specific energy rises when a pump degrades, which is the earliest economic signal of a mechanical problem.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
