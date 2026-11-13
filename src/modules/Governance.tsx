import { Link } from 'react-router-dom';
import { Check, Lock, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import {
  Badge,
  Button,
  KeyValue,
  Notice,
  Panel,
  TableShell,
  Td,
  Th,
  cx,
} from '../design-system';
import { useActiveScenario, useRun } from '../store/hooks';
import { useMineStore } from '../store/mineStore';

import {
  CAPABILITY_LABELS,
  ROLES,
  ROLE_SIMULATOR_NOTICE,
  hasCapability,
  roleName,
} from '../domain/roles';
import { formatTimestamp } from '../domain/units';
import type { Capability } from '../domain/types';

const MATRIX: Capability[] = [
  'view.mission-control',
  'view.deepwater',
  'view.impact',
  'view.analytics',
  'view.integration',
  'scenario.edit-assumptions',
  'scenario.execute',
  'incident.execute-mitigation',
  'incident.close',
  'decision.record',
  'report.export',
  'settings.role',
];

export function Governance() {
  const role = useMineStore((s) => s.role);
  const setRole = useMineStore((s) => s.setRole);
  const mine = useMineStore((s) => s.mine);
  const scenario = useActiveScenario();
  const run = useRun();
  const operatingMode = useMineStore((s) => s.operatingMode);
  const setOperatingMode = useMineStore((s) => s.setOperatingMode);
  const controlIntents = useMineStore((s) => s.controlIntents);
  const dispatchControlIntent = useMineStore((s) => s.dispatchControlIntent);
  const pilot = useMineStore((s) => s.pilot);
  const now = formatTimestamp(run.world.clock.epochMs + run.world.clock.elapsedSec * 1000);

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.governance}
        actions={
          <Badge tone={operatingMode === 'operational' ? 'amber' : 'green'} dot>
            {operatingMode === 'operational' ? 'operational mode' : 'test / read-only mode'}
          </Badge>
        }
      >
        <span className="text-2xs text-ink-500">
          Safety, access, operating mode, and deployment readiness. Platform supports <strong>both</strong> test/read-only and operational workflows (configurable, audited).
        </span>
      </ModuleHeader>

      <div className="grid gap-2 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<ShieldAlert size={12} className="text-signal-amber" />}>Operating mode & control (both supported)</PanelTitle>
            <div className="space-y-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={operatingMode === 'test' ? 'green' : 'neutral'}>Test / Read-only</Badge>
                <Badge tone={operatingMode === 'operational' ? 'amber' : 'neutral'}>Operational</Badge>
                <span className="text-2xs text-ink-500">Current: <strong className="text-ink-200">{operatingMode}</strong></span>
              </div>
              <p className="text-2xs leading-relaxed text-ink-400">
                <strong>Test/read-only mode:</strong> for validation, pilots, and training — external control dispatch to gateways/devices is blocked; live data ingestion, replay, analytics, alerts, and in-app simulation/sandbox remain available. <br />
                <strong>Operational mode:</strong> enables authorized, audited control-intent dispatch to configured gateway control endpoints (if available). Requires approved procedures, permissions, and engineering/safety review. Browser does not directly command PLCs/OT devices.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant={operatingMode === 'test' ? 'primary' : 'outline'} onClick={() => setOperatingMode('test')}>Set Test / Read-only</Button>
                <Button size="sm" variant={operatingMode === 'operational' ? 'primary' : 'outline'} onClick={() => setOperatingMode('operational')}>Enable Operational</Button>
                <Button size="sm" variant="outline" onClick={() => dispatchControlIntent({ target: pilot.gatewayUrl || 'gateway', action: 'ping', payload: { source: 'governance-ui' } })}><Send size={12} /> Dispatch test intent</Button>
              </div>
              {controlIntents.length > 0 && (
                <div className="mt-1 max-h-40 overflow-auto rounded-[2px] border border-[color:var(--hairline)]">
                  <TableShell>
                    <thead><tr><Th>Time</Th><Th>Action</Th><Th>Target</Th><Th>Status</Th></tr></thead>
                    <tbody>
                      {controlIntents.slice(0, 8).map(i => (
                        <tr key={i.id}><Td className="font-mono text-[9px]">{formatTimestamp(i.atMs)}</Td><Td>{i.action}</Td><Td className="font-mono text-[9px]">{i.target}</Td><Td><Badge tone={i.status==='dispatched'?'green':i.status==='failed'?'red':i.status==='blocked-test-mode'?'amber':'neutral'}>{i.status}</Badge></Td></tr>
                      ))}
                    </tbody>
                  </TableShell>
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<ShieldAlert size={12} className="text-signal-amber" />}>Safety and scope boundaries</PanelTitle>
            <div className="grid gap-px bg-[color:var(--hairline)] sm:grid-cols-2">
              {[
                ['Mode-dependent control', 'In Test mode external control dispatch is blocked. In Operational mode, authorized intents can be dispatched to configured gateway endpoints with audit trail — never direct browser-to-PLC control.'],
                ['Live connections are pluggable', 'Read-only gateway/pilot connectors supported (HTTP contract). Protocol/device differences handled in gateway/config (device-agnostic). Direct OT writes require approved edge/gateway services.'],
                ['Synthetic + pilot data', 'Baseline is synthetic. Pilot/live data is used when loaded/connected; provenance and data quality must be validated per site.'],
                ['Forecasts require validation', 'Projections are model-based. Site deployment needs calibration, backtesting, engineering review, and safety case.'],
                ['Pilot access controls', 'Local sign-in/session and role-based capabilities are provided for pilot ops; enterprise SSO/IAM, centralized audit, and retention require server-side deployment.'],
                ['No certification claimed', 'No claim of functional safety, cyber certification, or regulatory compliance. Treat outputs as decision support pending validation.'],
              ].map(([title, body]) => (
                <div key={title} className="bg-ink-850 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-ink-100">
                    <ShieldCheck size={10} className="text-signal-cyanBright" /> {title}
                  </div>
                  <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{body}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">capability × role</span>}>
              Permission matrix
            </PanelTitle>
            <TableShell>
              <thead>
                <tr>
                  <Th>Capability</Th>
                  {ROLES.map((item) => (
                    <Th key={item.id} align="center" className="whitespace-nowrap px-2 text-[8px]">
                      {item.name.split(' ')[0]}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((capability) => (
                  <tr key={capability} className="hover:bg-ink-800/50">
                    <Td className="whitespace-nowrap text-[10px] text-ink-300">{CAPABILITY_LABELS[capability]}</Td>
                    {ROLES.map((item) => {
                      const allowed = hasCapability(item.id, capability);
                      return (
                        <Td key={item.id} align="center" className="px-2">
                          {allowed ? (
                            <Check size={11} className={cx('mx-auto', item.id === role ? 'text-signal-green' : 'text-ink-500')} />
                          ) : (
                            <Lock size={10} className="mx-auto text-ink-700" />
                          )}
                        </Td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <div className="border-t border-[color:var(--hairline)] px-3 py-2 text-2xs text-ink-500">
              Active role highlighted in green. {ROLE_SIMULATOR_NOTICE}
            </div>
          </Panel>

          <Panel>
            <PanelTitle right={<ShieldCheck size={12} className="text-signal-green" />}>Readiness & gap coverage</PanelTitle>
            <div className="grid gap-px bg-[color:var(--hairline)] md:grid-cols-2">
              <div className="bg-ink-850 px-3 py-2">
                <div className="label-micro mb-1 text-signal-green">Implemented / strengthened</div>
                <ul className="space-y-1 text-2xs leading-relaxed text-ink-400">
                  <li>· Canonical state, dependency/cascade twin, scenarios/replay, evidence-led incidents/decisions.</li>
                  <li>· Pluggable device-agnostic connectors (gateway/pilot), quick connect, saved profiles, tag/health visibility.</li>
                  <li>· Alerts/rules, local history/recording exports, report bundles, expert engineering configs & build profiles.</li>
                  <li>· Pilot auth/session + RBAC roles, <strong>test/read-only and operational modes</strong>, audited control-intent dispatch framework.</li>
                  <li>· Self-consistency checks and explicit uncertainty/provenance posture.</li>
                </ul>
              </div>
              <div className="bg-ink-850 px-3 py-2">
                <div className="label-micro mb-1 text-signal-amber">Still required for production scale</div>
                <ul className="space-y-1 text-2xs leading-relaxed text-ink-400">
                  <li>· Enterprise SSO/IAM, centralized immutable audit, retention/compliance, hardened secrets.</li>
                  <li>· Durable server-side TSDB/historian, HA storage, multi-site tenancy, APIs.</li>
                  <li>· Certified OT connectors/edge, network segmentation, cyber review, change management.</li>
                  <li>· Site calibration/validation (hydraulics, curves, sensors), V&V and safety case for any control path.</li>
                  <li>· Deep integrations: CMMS/EAM, FMS/dispatch, planning/scheduling, historian/BI ecosystems.</li>
                </ul>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">provenance</span>}>Data provenance & persistence</PanelTitle>
            <div className="px-3 py-2">
              <KeyValue label="Site" value={mine.name} mono={false} />
              <KeyValue label="Site id" value={mine.id} />
              <KeyValue label="Scenario" value={scenario.name} mono={false} />
              <KeyValue label="Scenario id" value={scenario.id} />
              <KeyValue label="Seed" value={String(scenario.seed)} />
              <KeyValue label="Sim clock" value={now} />
              <KeyValue label="Operating mode" value={operatingMode} />
              <KeyValue label="Pilot source" value={pilot.mode + (pilot.gatewayUrl ? ` (${pilot.gatewayUrl})` : '')} mono={false} />
              <KeyValue label="Engine" value="mine-os deterministic core (unchanged)" />
              <KeyValue label="Persistence" value="browser-local (session/profiles/rules/history/exports) + in-memory run state" mono={false} />
              <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                Configs, profiles, alert rules, auth session, and capped history are stored locally in-browser for pilot use; core run state remains in-memory unless exported. Live gateway connections use configured endpoints. For production: server-side storage, audit, retention, and identity are required.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Active role & access</PanelTitle>
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink-50">{roleName(role)}</span>
                <Badge tone="neutral">pilot session</Badge>
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-ink-400">{ROLES.find((item) => item.id === role)?.remit}</p>
              <div className="mt-2">
                <div className="label-micro mb-1">Withheld from this role</div>
                <div className="flex flex-wrap gap-1">
                  {ROLES.find((item) => item.id === role)?.restrictions.map((restriction) => (
                    <Badge key={restriction} tone="neutral">{restriction}</Badge>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                Pilot sign-in/session and role-based capabilities are active (local). You can switch roles for simulation of accountability views; production deployments should use enterprise identity, SSO, and centralized authorization/audit.
              </p>
              <button
                onClick={() => setRole('mechanical-engineer')}
                className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500 hover:text-signal-cyanBright"
              >
                switch to mechanical engineer →
              </button>
            </div>
          </Panel>

          <Notice tone="blue" title="Integration posture">
            Pluggable, device-agnostic connectors are supported (read-only ingestion; optional control-intent dispatch in Operational mode to configured gateway endpoints). See{' '}
            <Link to="/app/telemetry" className="underline decoration-ink-600 underline-offset-2 hover:text-signal-cyanBright">
              Telemetry &amp; Integrations
            </Link>{' '}and{' '}
            <Link to="/app/engineering-config" className="underline decoration-ink-600 underline-offset-2 hover:text-signal-cyanBright">
              Engineering Configurations &amp; Builds
            </Link>.
          </Notice>

          <Panel>
            <PanelTitle>Model honesty</PanelTitle>
            <div className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <p>Accuracy metrics in Analytics are self-consistency checks unless backed by validated pilot/site data.</p>
              <p>Where instrumentation is stale or low quality, confidence is reduced; gaps are not filled silently.</p>
              <p>Incidents carry evidence and hypotheses; causes require support. Recovery/impact estimates are scenario- and assumption-dependent.</p>
              <p>Core simulation/calculation logic remains stable across sensors/sites/protocols; differences belong in config, mappings, and adapters/gateway.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
