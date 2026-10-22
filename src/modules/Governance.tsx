import { Link } from 'react-router-dom';
import { Check, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { MODULE_BY_ID } from '../app/modules';
import { ModuleHeader, PanelTitle } from '../components/ModuleHeader';
import {
  Badge,
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
  const now = formatTimestamp(run.world.clock.epochMs + run.world.clock.elapsedSec * 1000);

  return (
    <div>
      <ModuleHeader
        module={MODULE_BY_ID.governance}
        actions={
          <Badge tone="amber" dot>
            demonstration build
          </Badge>
        }
      >
        <span className="text-2xs text-ink-500">
          What this platform is, what it is deliberately not, and what a real deployment would still require.
        </span>
      </ModuleHeader>

      <div className="grid gap-2 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<ShieldAlert size={12} className="text-signal-amber" />}>Safety and scope boundaries</PanelTitle>
            <div className="grid gap-px bg-[color:var(--hairline)] sm:grid-cols-2">
              {[
                ['No control authority', 'The platform never commands pumps, feeders or interlocks. Recommendations require a human decision and an operational procedure.'],
                ['No live plant connection', 'No PLC, SCADA, historian or CMMS is connected. Telemetry is simulated from the canonical engine.'],
                ['Synthetic asset base', 'Kestrel Ridge is fictional. Geometry, nameplate values and incidents are constructed for demonstration.'],
                ['Forecasts require validation', 'Projections describe model behaviour. A site deployment needs engineering review, calibration and a safety case.'],
                ['Role switch is not login', 'Roles demonstrate permission boundaries. There is no identity provider, session or audit authentication.'],
                ['No certification claimed', 'This build makes no claim of functional safety, cyber certification or regulatory compliance.'],
              ].map(([title, body]) => (
                <div key={title} className="bg-ink-850 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-ink-100">
                    <X size={10} className="text-signal-red" /> {title}
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
            <PanelTitle right={<ShieldCheck size={12} className="text-signal-green" />}>Readiness</PanelTitle>
            <div className="grid gap-px bg-[color:var(--hairline)] md:grid-cols-2">
              <div className="bg-ink-850 px-3 py-2">
                <div className="label-micro mb-1 text-signal-green">Already demonstrated</div>
                <ul className="space-y-1 text-2xs leading-relaxed text-ink-400">
                  <li>· One canonical state feeding every module.</li>
                  <li>· Cross-system cascade from a single intervention.</li>
                  <li>· Evidence-linked incidents and engineering decisions.</li>
                  <li>· Role-scoped actions with explicit refusal.</li>
                  <li>· Deterministic scenarios and replay.</li>
                  <li>· Self-consistency checks surfaced to the operator.</li>
                </ul>
              </div>
              <div className="bg-ink-850 px-3 py-2">
                <div className="label-micro mb-1 text-signal-amber">Required for a pilot</div>
                <ul className="space-y-1 text-2xs leading-relaxed text-ink-400">
                  <li>· Site tag mapping and historian integration.</li>
                  <li>· Calibrated hydrology and pump curves.</li>
                  <li>· Authenticated identity, audit trail and retention policy.</li>
                  <li>· Change management and alarm rationalisation.</li>
                  <li>· Cyber security review and network segmentation.</li>
                  <li>· Independent engineering validation of forecasts.</li>
                </ul>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-2">
          <Panel>
            <PanelTitle right={<span className="font-mono text-[9px] text-ink-500">persisted nowhere</span>}>Data provenance</PanelTitle>
            <div className="px-3 py-2">
              <KeyValue label="Site" value={mine.name} mono={false} />
              <KeyValue label="Site id" value={mine.id} />
              <KeyValue label="Scenario" value={scenario.name} mono={false} />
              <KeyValue label="Scenario id" value={scenario.id} />
              <KeyValue label="Seed" value={String(scenario.seed)} />
              <KeyValue label="Sim clock" value={now} />
              <KeyValue label="Engine" value="mine-os deterministic core" />
              <KeyValue label="Persistence" value="in-memory only" />
              <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                All state lives in memory for this demonstration. A page refresh resets the simulation. Nothing is sent
                to a server, and no credentials or personal data are collected.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Active role</PanelTitle>
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink-50">{roleName(role)}</span>
                <Badge tone="neutral">demo identity</Badge>
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
                Switch roles in the top bar to inspect how the same failure is presented to a different accountability.
                The switch is not an authentication event.
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
            Connector contracts describe what a real deployment would require. They are not configured and cannot be
            configured from this demonstration. See{' '}
            <Link to="/app/telemetry" className="underline decoration-ink-600 underline-offset-2 hover:text-signal-cyanBright">
              Telemetry &amp; Integrations
            </Link>
            .
          </Notice>

          <Panel>
            <PanelTitle>Model honesty</PanelTitle>
            <div className="space-y-1.5 px-3 py-2 text-2xs leading-relaxed text-ink-400">
              <p>Accuracy metrics in Analytics are self-consistency checks. They are never labelled as field validation.</p>
              <p>Where instrumentation is stale, the platform widens uncertainty and lowers confidence. It does not fill gaps silently.</p>
              <p>Incidents carry competing hypotheses. A cause is not asserted until evidence supports it.</p>
              <p>Recovery estimates are scenario-dependent and shown with the assumption that produced them.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
