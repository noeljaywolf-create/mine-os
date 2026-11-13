import { Link } from 'react-router-dom';
import { FlaskConical, Radio, ShieldAlert } from 'lucide-react';
import { useMineStore } from '../store/mineStore';
import { useActiveScenario } from '../store/hooks';

export function SimulationBanner() {
  const mine = useMineStore((s) => s.mine);
  const scenario = useActiveScenario();
  const running = useMineStore((s) => s.running);
  const pilot = useMineStore((s) => s.pilot);
  const operatingMode = useMineStore((s) => s.operatingMode);

  const isLive = pilot.mode === 'live-gateway';
  const isReplay = pilot.mode === 'pilot-replay';
  const label = isLive ? 'Live data' : isReplay ? 'Pilot replay' : 'Simulation';
  const detail = isLive
    ? `Connected to gateway (${pilot.gatewayUrl || 'configured endpoint'}) · read-only ingestion · ${operatingMode === 'operational' ? 'operational intents enabled if authorized' : 'test/read-only mode'}`
    : isReplay
    ? 'Historical pilot dataset replay · read-only · validate mappings and backtest before decisions'
    : 'Deterministic synthetic model · no field connection · flows, levels and costs are modelled';

  return (
    <div className="flex shrink-0 items-center gap-3 overflow-hidden border-b border-signal-amber/25 bg-[#1a1408]/70 px-4 py-[5px]">
      <div className="flex shrink-0 items-center gap-1.5 text-signal-amber">
        {isLive ? <Radio size={12} /> : <FlaskConical size={12} />}
        <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="min-w-0 flex-1 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#c9a86a]" title={detail}>
        {detail}
      </div>
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8d7749]">
          Scenario · {scenario.name}
          {running ? ' · running' : ' · paused'}
        </span>
        <Link
          to="/app/governance"
          className="flex items-center gap-1 rounded-[2px] border border-signal-amber/40 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.12em] text-signal-amber hover:bg-signal-amber/10"
        >
          <ShieldAlert size={10} />
          Safety & mode
        </Link>
      </div>
      <span className="hidden shrink-0 font-mono text-[9px] text-[#6b5a37] lg:inline">
        {mine.geometryDisclaimer}
      </span>
    </div>
  );
}
