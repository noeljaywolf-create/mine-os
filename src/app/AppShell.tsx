import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronRight,
  Cpu,
  ExternalLink,
  Gauge,
  Lock,
  Menu,
  Pause,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  SkipForward,
  X,
} from 'lucide-react';
import { useMineStore, SIM_SECONDS_PER_REAL_SECOND } from '../store/mineStore';
import { useActiveScenario, useCapabilities, useIncidents, useSimClock } from '../store/hooks';
import { Badge, Button, IconButton, Select, cx } from '../design-system';
import { AssetInspector } from '../components/AssetInspector';
import { SimulationBanner } from '../components/SimulationBanner';
import { Toasts } from '../components/Toasts';
import { MODULES, MODULE_GROUPS, moduleByPath } from './modules';
import { ROLES, ROLE_SIMULATOR_NOTICE } from '../domain/roles';
import { formatTimestamp } from '../domain/units';
import type { UserRole } from '../domain/types';

const SPEEDS = [1, 4, 16, 60];

export function AppShell() {
  const location = useLocation();
  const mine = useMineStore((s) => s.mine);
  const scenario = useActiveScenario();
  const scenarios = useMineStore((s) => s.scenarios);
  const switchScenario = useMineStore((s) => s.switchScenario);
  const running = useMineStore((s) => s.running);
  const speed = useMineStore((s) => s.speed);
  const setRunning = useMineStore((s) => s.setRunning);
  const setSpeed = useMineStore((s) => s.setSpeed);
  const stepOnce = useMineStore((s) => s.stepOnce);
  const resetActiveScenario = useMineStore((s) => s.resetActiveScenario);
  const selection = useMineStore((s) => s.selection);
  const role = useMineStore((s) => s.role);
  const setRole = useMineStore((s) => s.setRole);
  const setReplayIndex = useMineStore((s) => s.setReplayIndex);
  const incidents = useIncidents();
  const clock = useSimClock();
  const capabilities = useCapabilities();

  const [inspectorOpen, setInspectorOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  const [navOpen, setNavOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);

  const activeModule = moduleByPath(location.pathname);
  const openIncidents = useMemo(
    () => incidents.filter((i) => i.state !== 'closed' && i.state !== 'resolved').length,
    [incidents],
  );

  useEffect(() => {
    setNavOpen(false);
    setScenarioOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (selection.assetId) setInspectorOpen(true);
  }, [selection.assetId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, select, textarea, [role="button"], [contenteditable="true"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setRunning(!useMineStore.getState().running);
      }
      if (event.key === 'Escape') {
        setScenarioOpen(false);
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setRunning]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950 text-ink-100">
      <SimulationBanner />

      <header className="flex h-[50px] shrink-0 items-center gap-2 border-b border-[color:var(--hairline)] bg-ink-900/80 px-2.5">
        <IconButton label="Toggle navigation" onClick={() => setNavOpen((open) => !open)} className="lg:hidden">
          <Menu size={15} />
        </IconButton>

        <NavLink to="/app" className="flex shrink-0 items-center gap-2 pr-1">
          <span className="grid h-7 w-7 place-items-center rounded-[2px] border border-signal-cyan/40 bg-signal-cyan/10 font-mono text-[11px] font-semibold tracking-tight text-signal-cyanBright">
            MO
          </span>
          <span className="hidden leading-none sm:block">
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.28em] text-ink-100">Mine OS</span>
            <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-500">
              {mine.name} · {mine.location}
            </span>
          </span>
        </NavLink>

        <div className="mx-2 hidden h-6 w-px bg-[color:var(--hairline)] md:block" />

        <div className="hidden min-w-0 md:block">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-500">
            {activeModule.group} / {activeModule.label}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] text-ink-400">
            <span>{formatTimestamp(clock.atMs)}</span>
            <span className="text-ink-600">·</span>
            <span>T+{clock.elapsedSec < 3600 ? `${Math.floor(clock.elapsedSec / 60)}m` : `${(clock.elapsedSec / 3600).toFixed(2)}h`}</span>
            <span className="text-ink-600">·</span>
            <span className={running ? 'text-signal-green' : 'text-ink-500'}>
              {running ? `${speed}× live` : 'paused'}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden items-center rounded-[2px] border border-[color:var(--hairline)] bg-ink-950/60 p-0.5 md:flex">
            <button
              onClick={() => setRunning(!running)}
              className="flex items-center gap-1 rounded-[1px] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              title="Run or pause the deterministic simulation (Space)"
            >
              {running ? <Pause size={11} /> : <Play size={11} />}
              {running ? 'pause' : 'run'}
            </button>
            <button
              onClick={() => stepOnce()}
              className="flex items-center gap-1 rounded-[1px] px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-400 hover:bg-ink-800 hover:text-ink-50"
              title="Advance one simulation step"
            >
              <SkipForward size={11} />
            </button>
            <div className="mx-0.5 h-4 w-px bg-[color:var(--hairline)]" />
            {SPEEDS.map((option) => (
              <button
                key={option}
                onClick={() => setSpeed(option)}
                className={cx(
                  'rounded-[1px] px-1.5 py-1 font-mono text-[9.5px] tabular-nums',
                  speed === option ? 'bg-ink-700 text-ink-50' : 'text-ink-500 hover:text-ink-200',
                )}
              >
                {option}×
              </button>
            ))}
          </div>

          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScenarioOpen((open) => !open)}
              className="max-w-[200px]"
            >
              <span className="truncate">{scenario.name}</span>
              <ChevronRight size={11} className={cx('transition-transform', scenarioOpen && 'rotate-90')} />
            </Button>
            {scenarioOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setScenarioOpen(false)} />
                <div className="absolute right-0 z-40 mt-1 w-[320px] rounded-[2px] border border-ink-600 bg-ink-900 p-1.5 shadow-lift">
                  <div className="label-micro px-1.5 py-1">Scenario branches</div>
                  {scenarios.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        switchScenario(item.id);
                        setReplayIndex(null);
                        setScenarioOpen(false);
                      }}
                      className={cx(
                        'flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink-800',
                        item.id === scenario.id && 'bg-ink-800/70',
                      )}
                    >
                      <span
                        className={cx(
                          'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                          item.isBaseline ? 'bg-ink-400' : 'bg-signal-cyan',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-ink-100">{item.name}</span>
                        <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">
                          {item.isBaseline ? 'baseline · immutable' : `branch of ${item.parentId ?? 'baseline'}`}
                        </span>
                      </span>
                    </button>
                  ))}
                  <div className="mt-1 border-t border-[color:var(--hairline)] pt-1">
                    <NavLink
                      to="/app/scenarios"
                      className="flex items-center justify-between rounded-[2px] px-1.5 py-1.5 text-[11px] text-ink-300 hover:bg-ink-800 hover:text-ink-50"
                    >
                      Open Scenario Lab
                      <ChevronRight size={11} />
                    </NavLink>
                  </div>
                </div>
              </>
            )}
          </div>

          <Button size="sm" variant="ghost" onClick={() => resetActiveScenario()} title="Reset this scenario to its starting state">
            <RotateCcw size={11} />
          </Button>

          <div className="hidden items-center gap-1.5 rounded-[2px] border border-[color:var(--hairline)] px-1.5 py-1 xl:flex">
            <Gauge size={11} className="text-ink-500" />
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="!h-5 !border-0 !bg-transparent !px-0 !text-[10px]"
              aria-label="Role simulator"
            >
              {ROLES.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.title}
                </option>
              ))}
            </Select>
          </div>

          <IconButton label="Toggle inspector" onClick={() => setInspectorOpen((open) => !open)}>
            {inspectorOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </IconButton>

          <NavLink
            to="/"
            className="hidden items-center gap-1 rounded-[2px] px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500 hover:text-ink-200 sm:flex"
          >
            Public site <ExternalLink size={9} />
          </NavLink>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {navOpen && <div className="fixed inset-0 z-30 bg-ink-950/70 lg:hidden" onClick={() => setNavOpen(false)} />}

        <aside
          className={cx(
            'flex w-[212px] shrink-0 flex-col border-r border-[color:var(--hairline)] bg-ink-950/60',
            'fixed inset-y-0 left-0 z-40 pt-[24px] transition-transform lg:static lg:z-auto lg:translate-x-0 lg:pt-0',
            navOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 lg:hidden">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Navigation</span>
            <IconButton label="Close navigation" onClick={() => setNavOpen(false)}>
              <X size={14} />
            </IconButton>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {MODULE_GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <div className="label-micro px-2 pb-1">{group}</div>
                <div className="space-y-[1px]">
                  {MODULES.filter((module) => module.group === group).map((module) => {
                    const Icon = module.icon;
                    const allowed = capabilities.can(module.capability);
                    return (
                      <NavLink
                        key={module.id}
                        to={module.path}
                        end={module.path === '/app'}
                        className={({ isActive }) =>
                          cx(
                            'group relative flex items-center gap-2 rounded-[2px] px-2 py-[7px] text-[11.5px] transition-colors',
                            isActive
                              ? 'bg-ink-800 text-ink-50'
                              : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 bg-signal-cyan" />
                            )}
                            <Icon size={13} className={isActive ? 'text-signal-cyanBright' : 'text-ink-500 group-hover:text-ink-300'} />
                            <span className="truncate">{module.short}</span>
                            {module.id === 'incidents' && openIncidents > 0 && (
                              <span className="ml-auto rounded-[2px] bg-signal-red/20 px-1 font-mono text-[9px] text-signal-red">
                                {openIncidents}
                              </span>
                            )}
                            {!allowed && <Lock size={9} className="ml-auto text-ink-600" />}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-[color:var(--hairline)] px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Cpu size={11} className="text-ink-500" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500">Engine</span>
              <span className="ml-auto font-mono text-[9px] text-ink-400">v2.0 · deterministic</span>
            </div>
            <p className="mt-1 text-[9px] leading-snug text-ink-600">
              {SIM_SECONDS_PER_REAL_SECOND} sim-s per real-s at 1×. {ROLE_SIMULATOR_NOTICE}
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1560px] px-3 py-3 md:px-4 md:py-4">
            <Outlet />
          </div>
        </main>

        {inspectorOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-ink-950/60 xl:hidden" onClick={() => setInspectorOpen(false)} />
            <aside className="fixed inset-y-0 right-0 z-50 w-[336px] max-w-[90vw] border-l border-[color:var(--hairline)] bg-ink-900 shadow-lift xl:static xl:z-auto xl:w-[320px] xl:shadow-none">
              <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-3 py-1.5 xl:hidden">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400">Inspector</span>
                <IconButton label="Close inspector" onClick={() => setInspectorOpen(false)}>
                  <X size={13} />
                </IconButton>
              </div>
              <AssetInspector />
            </aside>
          </>
        )}
      </div>

      <Toasts />
      <div className="pointer-events-none fixed bottom-1 left-1 z-20 hidden items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-600 lg:flex">
        <Badge tone={scenario.isBaseline ? 'neutral' : 'cyan'} dot>
          {scenario.isBaseline ? 'baseline scenario' : 'branch scenario'}
        </Badge>
        <span>role: {capabilities.title}</span>
      </div>
    </div>
  );
}
