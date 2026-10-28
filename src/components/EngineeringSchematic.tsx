import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '../design-system';
import type { MineDefinition } from '../domain/mine';
import type { WorldState } from '../domain/types';

export type TwinView = 'section' | 'electrical' | 'hydraulic' | 'material';
const W = 240;
const H = 128;
const INFO: Record<TwinView, { title: string; description: string }> = {
  section: { title: 'Underground level schematic', description: 'Each level has a dedicated lane. Storage bars show computed fill; equipment and production access are grouped by level.' },
  electrical: { title: 'Electrical distribution schematic', description: 'Read top to bottom: sources, distribution bus, feeders, then motor loads. This is an active-power budget, not an AC load-flow model.' },
  hydraulic: { title: 'Hydraulic station schematic', description: 'Read left to right: storage, pump train, then receiving boundary. Separate station lanes show the configured series or parallel arrangement.' },
  material: { title: 'Ore movement schematic', description: 'Read left to right: zones, routes, shared hoist, finite inventory, and processing. Connections show eligible paths; route cards show allocated totals.' },
};

export function EngineeringSchematic({ view, mine, world, selection, related, onSelect }: {
  view: TwinView; mine: MineDefinition; world: WorldState; selection: string | null;
  related: Set<string | null>; onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'diagram' | 'width' | 'manual'>('manual');
  const [recenter, setRecenter] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const marker = `flow-${useId().replace(/:/g, '')}`;
  const settings = world.scenarioSnapshot?.engineering ?? {};
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewportSize(previous => previous.width === element.clientWidth && previous.height === element.clientHeight
        ? previous : { width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const color = (id: string) => {
    if (selection === id) return '#6fd3e6';
    const status = world.assets[id]?.status;
    if (status === 'failed' || status === 'blocked') return '#f28b8b';
    if (status === 'degraded' || status === 'exposed') return '#edbd70';
    return related.has(id) ? '#6fd3e6' : '#8298ae';
  };
  const card = (id: string, x: number, y: number, label: string, detail: string, options: {
    status?: string; fill?: number; selectable?: boolean;
  } = {}) => {
    const interactive = options.selectable !== false;
    return <g key={id} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Select ${label}` : undefined} aria-pressed={interactive ? selection === id : undefined}
      className={interactive ? 'schematic-asset cursor-pointer' : undefined}
      onClick={interactive ? () => onSelect(id) : undefined}
      onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); } } : undefined}>
      <rect data-schematic-node={id} x={x} y={y} width={W} height={H} rx={8} fill={selection === id ? '#142d3b' : '#111c28'} stroke={color(id)} strokeWidth={selection === id ? 3 : related.has(id) ? 2 : 1} />
      <foreignObject x={x} y={y} width={W} height={H - (options.fill === undefined ? 0 : 12)} pointerEvents="none">
        <div style={{ display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'space-between', padding: 12, boxSizing: 'border-box', gap: 4 }}>
          <div style={{ color: '#ecf4ff', fontSize: 13, lineHeight: '18px', fontWeight: 600, overflowWrap: 'anywhere' }}>{label}</div>
          <div style={{ color: '#b7c7d6', fontSize: 12, lineHeight: '17px', overflowWrap: 'anywhere' }}>{detail}</div>
          <div style={{ color: color(id), fontSize: 10, lineHeight: '14px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{options.status ?? world.assets[id]?.status ?? 'Model boundary'}</div>
        </div>
      </foreignObject>
      {options.fill !== undefined && <><rect x={x + 12} y={y + H - 13} width={W - 24} height={5} rx={2} fill="#263746" />
        <rect x={x + 12} y={y + H - 13} width={(W - 24) * Math.min(1, Math.max(0, options.fill))} height={5} rx={2} fill="#6fd3e6" /></>}
    </g>;
  };
  const wire = (key: string, d: string, active = true, flow = false) => <path key={key} d={d} fill="none" stroke={active ? '#68c8d8' : '#53677a'} strokeWidth={active ? 2 : 1.5}
    strokeDasharray={flow && active ? '8 6' : active ? undefined : '5 5'} markerEnd={`url(#${marker})`} className={flow && active ? 'schematic-flow' : undefined} />;
  const caption = (x: number, y: number, text: string) => <text x={x} y={y} fill="#b7c7d6" fontSize={12} fontWeight={500}>{text}</text>;
  let width = 1100;
  let height = 640;
  let drawing: ReactNode;

  if (view === 'section') {
    const levels = mine.levels.filter(l => mine.sumps.some(s => s.levelId === l.id) || mine.zones.some(z => z.levelId === l.id));
    const rows = levels.map(level => {
      const sumps = mine.sumps.filter(s => s.levelId === level.id);
      const zones = mine.zones.filter(z => z.levelId === level.id);
      const pumpRows = Math.max(1, ...sumps.map(s => Math.ceil(mine.pumps.filter(p => p.sumpId === s.id).length / 2)));
      return { level, sumps, zones, pumpRows, height: 256 + pumpRows * 160 + (zones.length ? 188 : 0) };
    });
    width = Math.max(1100, 180 + Math.max(1, ...rows.map(r => r.sumps.length)) * 580,
      190 + Math.max(0, ...rows.map(r => r.zones.length - 1)) * 290 + W);
    height = 32 + rows.reduce((total, r) => total + r.height, 0);
    let top = 16;
    drawing = <><path d={`M98 48V${height - 40}`} stroke="#40566c" strokeWidth={8} />{rows.map(row => {
      const y = top; top += row.height;
      const zoneY = y + 276 + row.pumpRows * 160;
      return <g key={row.level.id}>
        <rect x={120} y={y + 8} width={width - 144} height={row.height - 24} rx={12} fill="#0d1722" stroke="#233446" />
        <path d={`M98 ${y + 46}H${width - 40}`} stroke="#354b60" strokeWidth={2} />
        <circle cx={98} cy={y + 46} r={7} fill="#8ca7bd" />
        {caption(144, y + 34, `${row.level.name} · ${row.level.depthM} m below surface`)}
        {row.sumps.map((s, i) => {
          const x = 150 + i * 580;
          const pumps = mine.pumps.filter(p => p.sumpId === s.id);
          return <g key={s.id}>
            {wire(`stem-${s.id}`, `M${x + W / 2} ${y + 196}V${y + 220}`, world.sumps[s.id].outflowM3h > 0)}
            {pumps.map((p, j) => wire(`link-${p.id}`, j === 0 ? `M${x + W / 2} ${y + 220}V${y + 248}` : `M${x + W / 2} ${y + 220}H${x + (j % 2) * 270 - 16}V${y + 232 + Math.floor(j / 2) * 160}H${x + (j % 2) * 270 + W / 2}V${y + 248 + Math.floor(j / 2) * 160}`, world.pumps[p.id].flowM3h > 0))}
            {card(s.id, x, y + 68, s.name, `${world.sumps[s.id].volumeM3.toFixed(0)} m³ · stage ${world.sumps[s.id].levelM.toFixed(2)} m`, { fill: world.sumps[s.id].fillRatio, status: world.sumps[s.id].breach?.label ?? 'Below operating thresholds' })}
            {pumps.map((p, j) => card(p.id, x + (j % 2) * 270, y + 248 + Math.floor(j / 2) * 160, p.name, `${world.pumps[p.id].flowM3h.toFixed(1)} m³/h · ${world.pumps[p.id].mode}`))}
          </g>;
        })}
        {row.zones.length > 0 && <>{caption(150, zoneY - 14, 'Production / access — governed by modeled storage thresholds')}
          {row.zones.map((z, i) => card(z.id, 150 + i * 290, zoneY, z.name, `${world.zones[z.id].rateTph.toFixed(1)} t/h · ${z.governedBySumpIds.join(', ')}`))}</>}
      </g>;
    })}</>;
  } else if (view === 'electrical') {
    width = Math.max(1100, mine.feeders.length * 340 + 80);
    height = 450 + Math.max(1, ...mine.feeders.map(f => mine.pumps.filter(p => p.feederId === f.id).length)) * 160;
    const backup = !!settings.backupConnected && !!settings.switchingApproved && settings.generatorAvailable !== false;
    drawing = <>
      {wire('utility', `M180 218H${width - 70}M270 176V218`, settings.utilityAvailable !== false)}
      {wire('backup', 'M710 176V218', backup)}
      {card('utility-boundary', 150, 48, 'Incoming utility / SS-1', '2000 kW source budget', { selectable: false, status: settings.utilityAvailable === false ? 'Unavailable' : 'Available' })}
      {card('generator-boundary', 590, 48, 'Backup generator', `${settings.backupCapacityKw ?? 250} kW configured capacity`, { selectable: false, status: settings.generatorAvailable === false ? 'Unavailable' : backup ? 'Connection prerequisite set' : 'Disconnected / review needed' })}
      {mine.feeders.map((f, i) => {
        const x = 60 + i * 340;
        const pumps = mine.pumps.filter(p => p.feederId === f.id);
        const state = world.feeders[f.id];
        return <g key={f.id}>
          {wire(`bus-${f.id}`, `M${x + W / 2} 218V266`, state.supplyRatio > 0)}
          {pumps.length > 0 && wire(`motor-trunk-${f.id}`, `M${x + W / 2} 394V416H${x - 24}V${510 + (pumps.length - 1) * 160}`, state.supplyRatio > 0)}
          {pumps.map((p, j) => wire(`motor-${p.id}`, `M${x - 24} ${510 + j * 160}H${x}`, world.pumps[p.id].powered))}
          {card(f.id, x, 266, f.name, `${(state.allocatedKw ?? 0).toFixed(0)} / ${(state.availableKw ?? 0).toFixed(0)} kW allocated / available`)}
          {caption(x, 442, 'Motor loads')}
          {pumps.map((p, j) => card(p.id, x, 446 + j * 160, p.name, `${world.pumps[p.id].powerKw.toFixed(1)} kW · ${world.pumps[p.id].mode}`, { status: world.pumps[p.id].powered ? 'Supply allocated' : 'No motor allocation' }))}
        </g>;
      })}
    </>;
  } else if (view === 'hydraulic') {
    const rows = mine.sumps.map(s => ({ sump: s, pumps: mine.pumps.filter(p => p.sumpId === s.id && (p.installed !== false || settings.additionalStandby)) }));
    height = 24 + rows.reduce((sum, r) => sum + Math.max(1, r.pumps.length) * 160 + 100, 0);
    let top = 16;
    drawing = <>{rows.map(({ sump: s, pumps }) => {
      const y = top; const rowHeight = Math.max(1, pumps.length) * 160 + 100; top += rowHeight;
      const series = settings.pipes?.[s.id]?.configuration === 'series';
      const sourceY = series ? y + 66 : y + 66 + Math.max(0, pumps.length - 1) * 80;
      const destinationY = series ? y + 66 + Math.max(0, pumps.length - 1) * 160 : sourceY;
      const q = world.sumps[s.id].outflowM3h;
      const destination = settings.pipes?.[s.id]?.destinationSumpId;
      const targetName = mine.sumps.find(item => item.id === destination)?.name ?? 'Intermediate reservoir boundary';
      return <g key={s.id}>
        <rect x={16} y={y} width={1068} height={rowHeight - 20} rx={12} fill="#0d1722" stroke="#233446" />
        {caption(40, y + 30, `${s.name} · ${series ? 'Series train' : 'Parallel station'} · delivered ${q.toFixed(1)} m³/h`)}
        {!series && pumps.length > 0 && <>
          {wire(`suction-trunk-${s.id}`, `M280 ${sourceY + H / 2}H340M340 ${y + 130}V${y + 130 + (pumps.length - 1) * 160}`, q > 0)}
          {wire(`discharge-trunk-${s.id}`, `M740 ${y + 130}V${y + 130 + (pumps.length - 1) * 160}M740 ${destinationY + H / 2}H810`, q > 0, true)}
        </>}
        {pumps.map((p, j) => series ? <g key={`paths-${p.id}`}>
          {j === 0 ? wire(`in-${p.id}`, `M280 ${sourceY + H / 2}H410`, q > 0, true) : wire(`series-${p.id}`, `M530 ${y + 66 + (j - 1) * 160 + H}V${y + 66 + j * 160}`, q > 0, true)}
          {j === pumps.length - 1 && wire(`out-${p.id}`, `M650 ${destinationY + H / 2}H810`, q > 0, true)}
        </g> : <g key={`paths-${p.id}`}>
          {wire(`in-${p.id}`, `M340 ${y + 130 + j * 160}H410`, world.pumps[p.id].flowM3h > 0, true)}
          {wire(`out-${p.id}`, `M650 ${y + 130 + j * 160}H740`, world.pumps[p.id].flowM3h > 0, true)}
        </g>)}
        {card(s.id, 40, sourceY, s.name, `${world.sumps[s.id].volumeM3.toFixed(0)} m³ · ${world.sumps[s.id].levelM.toFixed(2)} m stage`, { fill: world.sumps[s.id].fillRatio })}
        {pumps.map((p, j) => card(p.id, 410, y + 66 + j * 160, p.name, `${world.pumps[p.id].flowM3h.toFixed(1)} m³/h · ${world.pumps[p.id].hydraulic?.status === 'solved' ? `${world.pumps[p.id].hydraulic!.headM.toFixed(1)} m head` : 'head unavailable'}`, { status: world.pumps[p.id].hydraulic?.status ?? 'Unavailable' }))}
        {card(`boundary-${s.id}`, 810, destinationY, targetName, `${q.toFixed(1)} m³/h delivered`, { selectable: false, status: destination ? 'Explicit inter-sump transfer' : 'Model receiving boundary' })}
      </g>;
    })}</>;
  } else {
    width = 1680;
    height = Math.max(680, 100 + Math.max(0, mine.zones.length - 1) * 250 + H + 40,
      100 + Math.max(0, (mine.materialHandling?.routes.length ?? 0) - 1) * 190 + H + 40);
    const center = 296;
    const routes = mine.materialHandling?.routes ?? [];
    drawing = <>
      {['Mining zones', 'Transport routes', 'Common handling', 'Finite inventory', 'Processing'].map((label, i) => <g key={label}>{caption(40 + i * 330, 38, label)}</g>)}
      {routes.flatMap((r, i) => r.zoneIds.map(zoneId => {
        const j = mine.zones.findIndex(z => z.id === zoneId);
        if (j < 0) return null;
        return wire(`${r.id}-${zoneId}`, `M280 ${164 + j * 250}H${310 + i * 12}V${164 + i * 190}H370`, (world.materialFlow?.routeFlowsTph[r.id] ?? 0) > 0);
      }))}
      {routes.map((r, i) => wire(`hoist-${r.id}`, `M610 ${164 + i * 190}H${650 + i * 12}V${center + H / 2}H700`, (world.materialFlow?.routeFlowsTph[r.id] ?? 0) > 0))}
      {wire('inventory', `M940 ${center + H / 2}H1030`, (world.materialFlow?.totalTph ?? 0) > 0, true)}
      {wire('processing', `M1270 ${center + H / 2}H1360`, (world.assets[mine.plant.id]?.effectiveness ?? 0) > 0)}
      {mine.zones.map((z, i) => card(z.id, 40, 100 + i * 250, z.name, `${world.zones[z.id].rateTph.toFixed(1)} t/h available throughput`))}
      {routes.map((r, i) => card(r.id, 370, 100 + i * 190, r.name, `${(world.materialFlow?.routeFlowsTph[r.id] ?? 0).toFixed(1)} t/h · capacity ${settings.materialRoutes?.[r.id]?.capacityTph ?? r.capacityTph} t/h`, { status: (settings.materialRoutes?.[r.id]?.available ?? r.defaultAvailable) ? r.alternative ? 'Shared alternate enabled' : 'Primary route available' : 'Route unavailable' }))}
      {card('mat-hoist', 700, center, 'Common hoist / ore handling', `${(world.materialFlow?.totalTph ?? 0).toFixed(1)} t/h routed · capacity ${settings.hoistAvailable === false ? 0 : settings.hoistCapacityTph ?? mine.materialHandling?.hoistCapacityTph ?? 0} t/h`)}
      {card('inventory-boundary', 1030, center, 'Ore buffer', `${(world.oreBufferTonnes ?? 0).toFixed(1)} / ${settings.oreBufferCapacityTonnes ?? mine.materialHandling?.bufferCapacityTonnes ?? 0} t stored`, { selectable: false, status: 'Finite receiving inventory' })}
      {card(mine.plant.id, 1360, center, mine.plant.name, `${(world.deferredTonnes ?? 0).toFixed(1)} t processing deferred`)}
    </>;
  }

  const fitWidth = Math.max(0.05, (viewportSize.width - 48) / width);
  const fitDiagram = Math.max(0.05, Math.min(fitWidth, (viewportSize.height - 48) / height, 1));
  const scale = mode === 'diagram' ? fitDiagram : mode === 'width' ? fitWidth : zoom;
  const stageWidth = Math.max(viewportSize.width, width * scale + 48);
  const stageHeight = Math.max(viewportSize.height, height * scale + 48);
  const changeZoom = (factor: number) => {
    const element = viewport.current; const drawingBounds = svg.current?.getBoundingClientRect();
    if (element && drawingBounds && drawingBounds.width > 0 && drawingBounds.height > 0) {
      const bounds = element.getBoundingClientRect();
      anchor.current = {
        x: (bounds.left + element.clientLeft + element.clientWidth / 2 - drawingBounds.left) / drawingBounds.width,
        y: (bounds.top + element.clientTop + element.clientHeight / 2 - drawingBounds.top) / drawingBounds.height,
      };
    }
    setZoom(Math.max(0.05, Math.min(3, scale * factor))); setMode('manual');
  };
  const fitView = (target: 'diagram' | 'width') => { anchor.current = null; setMode(target); setRecenter(v => v + 1); };
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // At readable zoom, begin on a real card instead of the middle of a tall,
    // potentially empty canvas. Explicit fit modes still center the whole drawing.
    const firstNode = svg.current?.querySelector<SVGRectElement>('[data-schematic-node]');
    const initialCenter = mode === 'manual' && firstNode
      ? { x: (firstNode.x.baseVal.value + firstNode.width.baseVal.value / 2) / width,
        y: (firstNode.y.baseVal.value + firstNode.height.baseVal.value / 2) / height }
      : { x: 0.5, y: 0.5 };
    const center = anchor.current ?? initialCenter;
    element.scrollTo({
      left: (stageWidth - width * scale) / 2 + center.x * width * scale - element.clientWidth / 2,
      top: (stageHeight - height * scale) / 2 + center.y * height * scale - element.clientHeight / 2,
      behavior: 'instant',
    });
    anchor.current = null;
  }, [scale, stageWidth, stageHeight, width, height, mode, recenter, viewportSize.width, viewportSize.height, view]);

  return <section className="mt-4 min-w-0" aria-label={INFO[view].title}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-y border-ink-700/70 bg-ink-900/50 px-3 py-3">
      <div className="min-w-0 max-w-xl"><h3 className="text-sm font-semibold text-ink-100">{INFO[view].title}</h3><p className="mt-1 text-xs leading-relaxed text-ink-300">{INFO[view].description}</p></div>
      <div role="group" aria-label="Schematic zoom controls" className="flex flex-wrap items-center gap-1">
        <Button size="xs" aria-label="Zoom out schematic" disabled={scale <= 0.050001} onClick={() => changeZoom(1 / 1.25)}><Minus size={14} /></Button>
        <output aria-label="Schematic zoom level" className="min-w-[44px] text-center font-mono text-xs text-ink-200">{Math.round(scale * 100)}%</output>
        <Button size="xs" aria-label="Zoom in schematic" disabled={scale >= 2.999999} onClick={() => changeZoom(1.25)}><Plus size={14} /></Button>
        <Button size="xs" aria-pressed={mode === 'diagram'} onClick={() => fitView('diagram')}><Maximize2 size={13} /> Fit diagram</Button>
        <Button size="xs" aria-pressed={mode === 'width'} onClick={() => fitView('width')}>Fit width</Button>
        <Button size="xs" onClick={() => { anchor.current = null; setMode('manual'); setZoom(1); setRecenter(v => v + 1); }}><RotateCcw size={13} /> Reset</Button>
      </div>
    </div>
    <div ref={viewport} data-testid="schematic-viewport" tabIndex={0} role="region" aria-label="Scrollable engineering drawing" className="schematic-viewport h-[clamp(320px,62vh,640px)] min-w-0 overflow-auto rounded-b-lg border border-ink-700 bg-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-cyan">
      <div data-testid="schematic-stage" className="grid place-items-center" style={{ width: stageWidth, height: stageHeight }}>
      <svg ref={svg} data-testid="engineering-schematic" viewBox={`0 0 ${width} ${height}`} width={width * scale} height={height * scale}
        role="group" aria-label={`${view} schematic. Synthetic geometry; select an asset to inspect its relationships.`} className="block max-w-none shrink-0">
        <defs><marker id={marker} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#8ba6ba" /></marker></defs>
        {drawing}
      </svg>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-3 text-xs text-ink-300">
      <p>Reset opens at the first asset · Fit diagram centers the overview · scroll to explore details</p>
      <div className="flex flex-wrap gap-3"><span className="text-signal-cyanBright">Cyan: selected / linked</span><span className="text-signal-red">Red: failed / blocked</span><span className="text-signal-amber">Amber: constrained</span></div>
    </div>
  </section>;
}
