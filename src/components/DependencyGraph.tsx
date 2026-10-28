import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMineStore } from '../store/mineStore';
import { useDerived } from '../store/hooks';
import type { AssetId, AssetStatus, IndustrialSystem } from '../domain/types';
import { cx, toneForStatus, toneText } from '../design-system';

type AssetNodeData = {
  label: string;
  tag: string;
  kind: string;
  status: AssetStatus;
  impact: number;
  selected: boolean;
  dimmed: boolean;
  root: boolean;
};

type AssetNode = Node<AssetNodeData, 'asset'>;

const STATUS_STROKE: Record<AssetStatus, string> = {
  operational: '#1E9E5A',
  degraded: '#D98A0B',
  failed: '#D33F3F',
  blocked: '#D33F3F',
  exposed: '#D98A0B',
  standby: '#2BB3D6',
  offline: '#5A6779',
};

const STATUS_FILL: Record<AssetStatus, string> = {
  operational: 'rgba(30,158,90,0.08)',
  degraded: 'rgba(217,138,11,0.12)',
  failed: 'rgba(211,63,63,0.16)',
  blocked: 'rgba(211,63,63,0.16)',
  exposed: 'rgba(217,138,11,0.1)',
  standby: 'rgba(43,179,214,0.1)',
  offline: 'rgba(58,70,88,0.14)',
};

function AssetNodeView({ data }: NodeProps<AssetNode>) {
  return (
    <div
      className={cx(
        'min-h-[112px] w-[212px] rounded-md border bg-ink-850/95 px-3 py-2 shadow-panel transition-opacity',
        data.selected ? 'ring-1 ring-signal-cyanBright' : '',
        data.dimmed ? 'opacity-30' : 'opacity-100',
      )}
      style={{ borderColor: STATUS_STROKE[data.status], background: STATUS_FILL[data.status] }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-400">{data.kind}</span>
        {data.root && <span className="h-1.5 w-1.5 rounded-full bg-signal-red animate-pulse-soft" />}
      </div>
      <div className="mt-1 break-words text-xs leading-4 text-ink-50">{data.label}</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="num truncate text-[9px] text-ink-400">{data.tag}</span>
        <span className={cx('num text-[9px]', toneText(toneForStatus(data.status)))}>
          {(data.impact * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-ink-700">
        <div className="h-full" style={{ width: `${Math.min(100, data.impact * 100)}%`, background: STATUS_STROKE[data.status] }} />
      </div>
    </div>
  );
}

const nodeTypes = { asset: AssetNodeView };

export function DependencyGraph({
  systems,
  height = 460,
  selectedId,
  onSelect,
  focusId,
  showSensors = true,
  className,
}: {
  systems?: IndustrialSystem[];
  height?: number;
  selectedId?: AssetId | null;
  onSelect?: (assetId: AssetId) => void;
  focusId?: AssetId | null;
  showSensors?: boolean;
  className?: string;
}) {
  const mine = useMineStore((s) => s.mine);
  const derived = useDerived();
  const selection = useMineStore((s) => s.selection.assetId);
  const selectAsset = useMineStore((s) => s.selectAsset);

  const activeId = selectedId ?? selection;

  const { nodes, edges } = useMemo(() => {
    const visible = mine.assets.filter((asset) => {
      if (!showSensors && asset.kind === 'sensor') return false;
      if (systems && systems.length > 0 && !systems.includes(asset.system)) return false;
      return true;
    });
    const visibleIds = new Set(visible.map((asset) => asset.id));

    const rootIds = new Set(
      Object.values(derived.assetStates)
        .filter((state) => state.status === 'failed' || state.status === 'blocked')
        .flatMap((state) => state.causedBy),
    );

    const dimmed = new Set<AssetId>();
    if (focusId) {
      dimmed.add(focusId);
      for (const id of mine.assets.map((a) => a.id)) {
        if (id !== focusId) dimmed.add(id);
      }
      dimmed.delete(focusId);
      derived.assetStates[focusId]?.exposes.forEach((id) => dimmed.delete(id));
      const deps = mine.dependencies.filter((d) => d.to === focusId).map((d) => d.from);
      deps.forEach((id) => dimmed.delete(id));
    }

    // Presentation lanes are independent of surveyed/geographic coordinates.
    // Reserve positions using all assets so filters do not reshuffle the graph.
    const routeIds = new Set(mine.materialHandling?.routes.map(r => r.id));
    const laneFor = (asset: (typeof mine.assets)[number]) => {
      if (routeIds.has(asset.id)) return 4;
      if (asset.id === 'mat-hoist') return 5;
      return ({ feeder: 0, pump: 1, sump: 2, zone: 3, plant: 6, sensor: 7, level: 0, infrastructure: 6 } as const)[asset.kind];
    };
    const rows = Array<number>(8).fill(0);
    const positions = new Map(mine.assets.map(asset => {
      const lane = laneFor(asset);
      return [asset.id, { x: lane * 320, y: rows[lane]++ * 160 }];
    }));
    const flowNodes: AssetNode[] = visible.map((asset) => {
      const state = derived.assetStates[asset.id];
      return {
        id: asset.id,
        type: 'asset' as const,
        position: positions.get(asset.id)!,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: asset.name,
          tag: asset.tag,
          kind: asset.kind,
          status: state?.status ?? 'operational',
          impact: state?.effectiveness ?? 1,
          selected: activeId === asset.id,
          dimmed: dimmed.size > 0 && dimmed.has(asset.id),
          root: rootIds.has(asset.id) && (state?.status === 'failed' || state?.status === 'blocked'),
        },
        draggable: false,
        selectable: false,
      };
    });

    const flowEdges: Edge[] = mine.dependencies
      .filter((dep) => visibleIds.has(dep.from) && visibleIds.has(dep.to))
      .map((dep) => {
        const sourceState = derived.assetStates[dep.from];
        const targetState = derived.assetStates[dep.to];
        const failed = sourceState?.status === 'failed' || sourceState?.status === 'blocked';
        const degraded = sourceState?.status === 'degraded' || targetState?.status === 'degraded';
        const color = failed ? '#D33F3F' : degraded ? '#D98A0B' : dep.criticality >= 4 ? '#3A4658' : '#2C3748';
        const related = !focusId || dep.from === focusId || dep.to === focusId;
        return {
          id: dep.id,
          source: dep.from,
          target: dep.to,
          type: 'smoothstep',
          animated: failed,
          style: {
            stroke: color,
            strokeWidth: dep.criticality >= 4 ? 1.3 : 1,
            opacity: related ? (failed ? 0.95 : 0.7) : 0.15,
          },
          markerEnd: { type: 'arrowclosed' as const, width: 10, height: 10, color },
        };
      });

    return { nodes: flowNodes, edges: flowEdges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, derived, systems, activeId, focusId, showSensors]);

  return (
    <div className={cx('relative min-w-0 overflow-hidden', className)} style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.05, maxZoom: 1.1 }}
        minZoom={0.05}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_, node) => {
          selectAsset({ assetId: node.id });
          onSelect?.(node.id);
        }}
        className="bg-ink-950/40"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(148,163,184,0.16)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <div className="pointer-events-none absolute left-2 top-2 rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/80 px-2 py-1">
        <span className="label-micro text-ink-400">Equipment connections · use + to zoom · not a mine survey</span>
      </div>
    </div>
  );
}
