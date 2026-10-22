import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  CircuitBoard,
  Droplets,
  Gauge,
  GitBranch,
  Layers,
  Network,
  ShieldAlert,
  Siren,
  TrendingDown,
  Waypoints,
  Zap,
} from 'lucide-react';

const PRODUCTS = [
  {
    name: 'DeepWater Intelligence',
    tag: 'Water risk',
    icon: Droplets,
    summary: 'Sump-by-sump water balance, deterministic forecasts and pumping capability — with uncertainty that widens honestly as tags degrade.',
    points: ['7–72 h level projections', 'Threshold crossings with bands', 'Pump, feeder and sensor dependency', 'Replayable branch comparison'],
  },
  {
    name: 'Mine Impact Intelligence',
    tag: 'Production exposure',
    icon: TrendingDown,
    summary: 'Translates physical water risk into zone availability, tonnes lost, energy cost and recovery time — before the shift feels it.',
    points: ['Zone throughput and lost value', 'Recovery ramp modelling', 'Energy and tariff exposure', 'Evidence-linked incidents'],
  },
];

const FAILURES = [
  {
    title: 'The graph is the missing layer',
    body: 'A pump trip is not a pump problem. It is a feeder, a sump, a level trend, a zone and a recovery plan. Most tools hold one of those facts at a time.',
    icon: Network,
  },
  {
    title: 'Confidence is usually hidden',
    body: 'A stale tag produces the same confident line as a healthy one. Operators deserve to see the evidence quality, not a polished guess.',
    icon: Gauge,
  },
  {
    title: 'Decisions leave no trail',
    body: 'The reasoning behind an intervention disappears into a shift handover. The next crew inherits the outcome without the assumptions.',
    icon: GitBranch,
  },
];

const FLOW = [
  { label: 'Signal', detail: 'Level, flow, power and status tags with quality codes.', icon: CircuitBoard },
  { label: 'Twin', detail: 'One dependency graph across water, power and production.', icon: Layers },
  { label: 'Forecast', detail: 'Deterministic projections with explicit uncertainty.', icon: WavesIcon },
  { label: 'Impact', detail: 'Translate physics into tonnes, cost and recovery.', icon: Boxes },
  { label: 'Decision', detail: 'Evidence-linked records that survive the shift.', icon: Waypoints },
];

const MODULES = [
  ['Mission Control', 'One operating picture'],
  ['Digital Twin', 'Dependency graph'],
  ['DeepWater', 'Water balance and forecast'],
  ['Mine Impact', 'Production and cost exposure'],
  ['Incident Command', 'Evidence and hypotheses'],
  ['Energy & Power', 'Feeder and pump demand'],
  ['Production', 'Zone availability'],
  ['Forecast', 'Projection and reliability'],
  ['Analytics', 'Model self-checks'],
  ['Asset Register', 'Condition and dependencies'],
  ['Scenario Lab', 'Branch, compare, replay'],
  ['Decision Ledger', 'Reasoning trail'],
  ['Telemetry', 'Tag health and contracts'],
  ['Governance', 'Boundaries and readiness'],
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-200">
      <header className="sticky top-0 z-20 border-b border-[color:var(--hairline)] bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-4 px-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-[2px] border border-signal-cyan/40 bg-signal-cyan/10">
              <Layers size={12} className="text-signal-cyanBright" />
            </span>
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-ink-50">MINE OS</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-4 md:flex">
            {[
              ['Platform', '#platform'],
              ['Products', '#products'],
              ['How it works', '#how'],
              ['Boundaries', '#boundaries'],
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-[11px] text-ink-400 transition-colors hover:text-ink-100">
                {label}
              </a>
            ))}
          </nav>
          <Link
            to="/app"
            className="ml-2 inline-flex h-7 items-center gap-1.5 rounded-[2px] bg-signal-cyan px-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-950 transition-colors hover:bg-signal-cyanBright"
          >
            Open demonstration <ArrowRight size={11} />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[color:var(--hairline)]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,#1c2636_1px,transparent_1px),linear-gradient(to_bottom,#1c2636_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="pointer-events-none absolute -right-32 top-[-120px] h-[420px] w-[420px] rounded-full bg-signal-cyan/[0.07] blur-3xl" />
          <div className="relative mx-auto grid max-w-[1180px] gap-10 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/60 px-2 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-green" />
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-400">
                  Operational intelligence for underground mining
                </span>
              </div>
              <h1 className="mt-5 max-w-[620px] text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink-50 lg:text-[52px]">
                The mine already tells you.
                <br />
                <span className="text-ink-400">MINE OS makes it legible.</span>
              </h1>
              <p className="mt-5 max-w-[560px] text-[13.5px] leading-relaxed text-ink-400">
                A connected operational picture for dewatering, power and production. One canonical model, one
                dependency graph, and a reasoning trail from signal to decision — built for the people who have to act
                on it.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/app"
                  className="inline-flex h-9 items-center gap-2 rounded-[2px] bg-signal-cyan px-4 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-950 transition-colors hover:bg-signal-cyanBright"
                >
                  Enter the demonstration <ArrowRight size={12} />
                </Link>
                <a
                  href="#how"
                  className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-ink-600 px-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-300 transition-colors hover:border-ink-400 hover:text-ink-100"
                >
                  See how it reasons
                </a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
                <span>14 connected modules</span>
                <span className="text-ink-700">/</span>
                <span>Synthetic site</span>
                <span className="text-ink-700">/</span>
                <span>No plant connection</span>
                <span className="text-ink-700">/</span>
                <span>Deterministic engine</span>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[3px] border border-[color:var(--hairline)] bg-ink-900/70 p-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
                <div className="flex items-center justify-between border-b border-[color:var(--hairline)] pb-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-500">Mission Control · illustrative</span>
                  <span className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-signal-green">
                    <span className="h-1.5 w-1.5 rounded-full bg-signal-green" /> sim
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[
                    ['S-201', '2.84 m', 'amber'],
                    ['S-202', '1.91 m', 'green'],
                    ['S-301', '3.42 m', 'red'],
                  ].map(([id, level, tone]) => (
                    <div key={id} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-850 px-2 py-1.5">
                      <div className="font-mono text-[8.5px] text-ink-500">{id}</div>
                      <div className="num mt-0.5 text-[15px] text-ink-50">{level}</div>
                      <div className={`mt-1 h-[2px] w-full ${tone === 'red' ? 'bg-signal-red' : tone === 'amber' ? 'bg-signal-amber' : 'bg-signal-green'}`} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded-[2px] border border-[color:var(--hairline)] bg-ink-850 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-500">Cascade</span>
                    <span className="font-mono text-[8.5px] text-signal-amber">3 links</span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {[
                      ['F-02 feeder', 'degraded', 'amber'],
                      ['P-201 duty pump', 'unavailable', 'red'],
                      ['S-201 level', 'rising 0.31 m/h', 'amber'],
                      ['Z-21 middle north', 'rate capped', 'amber'],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="flex items-center gap-1.5 font-mono text-[9px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${tone === 'red' ? 'bg-signal-red' : 'bg-signal-amber'}`} />
                        <span className="text-ink-300">{label}</span>
                        <span className="ml-auto text-ink-500">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-[2px] border border-signal-amber/25 bg-signal-amber/[0.06] px-2 py-1.5">
                  <ShieldAlert size={12} className="text-signal-amber" />
                  <span className="text-[9px] leading-snug text-ink-300">
                    Forecast confidence reduced: 1 level tag stale. Band widened, not filled.
                  </span>
                </div>
              </div>
              <div className="mt-2 text-right font-mono text-[8px] uppercase tracking-[0.14em] text-ink-600">
                schematic, synthetic data
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto max-w-[1180px] px-5 py-14">
            <div className="max-w-[640px]">
              <div className="label-micro text-signal-cyanBright">The platform position</div>
              <h2 className="mt-2 text-[26px] font-medium leading-tight tracking-[-0.015em] text-ink-50">
                Not another dashboard. A shared model of what is actually happening.
              </h2>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400">
                MINE OS exists in the gap between control systems and business reporting. It reads the physical state,
                keeps the dependency graph intact, and makes the consequences legible to the role that has to decide.
              </p>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {FAILURES.map((item) => (
                <div key={item.title} className="rounded-[3px] border border-[color:var(--hairline)] bg-ink-900/40 p-4">
                  <item.icon size={16} className="text-signal-cyan" />
                  <h3 className="mt-3 text-[12.5px] font-medium text-ink-100">{item.title}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="products" className="border-b border-[color:var(--hairline)] bg-ink-925/40">
          <div className="mx-auto max-w-[1180px] px-5 py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="label-micro text-signal-cyanBright">Two products, one truth</div>
                <h2 className="mt-2 text-[26px] font-medium tracking-[-0.015em] text-ink-50">DeepWater and Mine Impact</h2>
              </div>
              <p className="max-w-[380px] text-[11px] leading-relaxed text-ink-500">
                They share one engine and one scenario. A change in either is immediately visible in the other — that is
                the point.
              </p>
            </div>
            <div className="mt-7 grid gap-3 lg:grid-cols-2">
              {PRODUCTS.map((product) => (
                <div key={product.name} className="group rounded-[3px] border border-[color:var(--hairline)] bg-ink-900/60 p-5 transition-colors hover:border-ink-500/60">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-[2px] border border-signal-cyan/25 bg-signal-cyan/[0.07]">
                      <product.icon size={15} className="text-signal-cyanBright" />
                    </span>
                    <div>
                      <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-500">{product.tag}</div>
                      <h3 className="text-[14px] font-medium text-ink-50">{product.name}</h3>
                    </div>
                  </div>
                  <p className="mt-3 max-w-[460px] text-[11.5px] leading-relaxed text-ink-400">{product.summary}</p>
                  <div className="mt-4 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {product.points.map((point) => (
                      <div key={point} className="flex items-start gap-1.5 text-[10.5px] text-ink-300">
                        <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-signal-cyan" />
                        {point}
                      </div>
                    ))}
                  </div>
                  <Link
                    to={product.tag === 'Water risk' ? '/app/dewatering' : '/app/impact'}
                    className="mt-5 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500 transition-colors hover:text-signal-cyanBright"
                  >
                    Open module <ArrowRight size={10} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto max-w-[1180px] px-5 py-14">
            <div className="label-micro text-signal-cyanBright">How it reasons</div>
            <h2 className="mt-2 max-w-[620px] text-[26px] font-medium tracking-[-0.015em] text-ink-50">
              Signal to decision, without dropping the thread.
            </h2>
            <div className="mt-8 grid gap-px overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-[color:var(--hairline)] md:grid-cols-5">
              {FLOW.map((step, index) => (
                <div key={step.label} className="relative bg-ink-900 px-3 py-4">
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-600">0{index + 1}</div>
                  <step.icon size={15} className="mt-3 text-signal-cyan" />
                  <div className="mt-2 text-[11.5px] font-medium text-ink-100">{step.label}</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-500">{step.detail}</p>
                  {index < FLOW.length - 1 && (
                    <ArrowRight size={11} className="absolute -right-[6px] top-1/2 z-10 hidden -translate-y-1/2 text-ink-600 md:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-[color:var(--hairline)] bg-ink-925/40">
          <div className="mx-auto max-w-[1180px] px-5 py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="label-micro text-signal-cyanBright">The workspace</div>
                <h2 className="mt-2 text-[26px] font-medium tracking-[-0.015em] text-ink-50">Fourteen modules, one state</h2>
              </div>
              <div className="flex gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
                <span className="flex items-center gap-1"><Siren size={10} /> operate</span>
                <span className="flex items-center gap-1"><Droplets size={10} /> intelligence</span>
                <span className="flex items-center gap-1"><Zap size={10} /> engineering</span>
                <span className="flex items-center gap-1"><Boxes size={10} /> system</span>
              </div>
            </div>
            <div className="mt-7 grid gap-px overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-[color:var(--hairline)] sm:grid-cols-2 lg:grid-cols-4">
              {MODULES.map(([name, detail], index) => (
                <Link
                  key={name}
                  to="/app"
                  className="group bg-ink-900 px-3 py-3 transition-colors hover:bg-ink-850"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-ink-200 group-hover:text-ink-50">{name}</span>
                    <span className="font-mono text-[8px] text-ink-700">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="mt-0.5 text-[9.5px] text-ink-500">{detail}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="boundaries" className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-14 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="label-micro text-signal-amber">Stated plainly</div>
              <h2 className="mt-2 text-[26px] font-medium tracking-[-0.015em] text-ink-50">
                A demonstration that does not pretend to be a deployment.
              </h2>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
                Trust is built by being explicit about limits. This build is designed to show the reasoning architecture,
                not to imply operational readiness.
              </p>
              <Link
                to="/app/governance"
                className="mt-5 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500 hover:text-signal-cyanBright"
              >
                Read the governance module <ArrowRight size={10} />
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Synthetic site', 'Kestrel Ridge is fictional. Geometry and nameplates are constructed for demonstration.'],
                ['No control writes', 'The platform never commands plant. Every intervention is a modelled scenario input.'],
                ['No live integration', 'No historian, SCADA, PLC or CMMS connection exists in this build.'],
                ['Forecasts need review', 'Projections are deterministic model output and require engineering validation.'],
                ['Role switch is not auth', 'Permissions are demonstrated; identity and audit are not implemented.'],
                ['No certification', 'No functional-safety, cyber or regulatory certification is claimed.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-3 py-2.5">
                  <div className="text-[10.5px] text-ink-200">{title}</div>
                  <p className="mt-0.5 text-[9.5px] leading-relaxed text-ink-500">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,#1c2636_1px,transparent_1px),linear-gradient(to_bottom,#1c2636_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative mx-auto max-w-[1180px] px-5 py-16">
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-[3px] border border-signal-cyan/20 bg-signal-cyan/[0.035] px-6 py-7">
              <div>
                <h2 className="text-[22px] font-medium tracking-[-0.01em] text-ink-50">Walk the failure path yourself.</h2>
                <p className="mt-1.5 max-w-[520px] text-[11.5px] leading-relaxed text-ink-400">
                  Trip a feeder, watch the cascade reach the sump, the forecast, the production exposure and the incident
                  record. Then branch the scenario and compare.
                </p>
              </div>
              <Link
                to="/app"
                className="inline-flex h-9 items-center gap-2 rounded-[2px] bg-signal-cyan px-4 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-950 transition-colors hover:bg-signal-cyanBright"
              >
                Open MINE OS <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--hairline)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-5 py-5">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">MINE OS</span>
          <span className="text-[9.5px] text-ink-600">Demonstration build · synthetic data · not for operational use</span>
          <div className="ml-auto flex gap-3 font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-600">
            <Link to="/app/governance" className="hover:text-ink-300">Governance</Link>
            <Link to="/app/telemetry" className="hover:text-ink-300">Integrations</Link>
            <Link to="/app" className="hover:text-ink-300">Workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function WavesIcon({ size = 16, className }: { size?: number; className?: string }) {
  return <Droplets size={size} className={className} />;
}
