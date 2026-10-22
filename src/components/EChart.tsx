import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { cx } from '../design-system';

echarts.use([
  LineChart,
  BarChart,
  GaugeChart,
  HeatmapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  VisualMapComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export const CHART_COLORS = {
  grid: 'rgba(148,163,184,0.12)',
  axis: '#5A6779',
  label: '#8494A6',
  text: '#DCE3EA',
  blue: '#2F6FEB',
  cyan: '#2BB3D6',
  cyanBright: '#4FD1E5',
  green: '#1E9E5A',
  amber: '#D98A0B',
  red: '#D33F3F',
  violet: '#7A5AF8',
  teal: '#1F9C93',
};

export function baseGrid(overrides?: Partial<{ top: number; bottom: number; left: number; right: number }>) {
  return {
    top: overrides?.top ?? 18,
    bottom: overrides?.bottom ?? 26,
    left: overrides?.left ?? 44,
    right: overrides?.right ?? 14,
    containLabel: false,
  };
}

export function axisStyle() {
  return {
    axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    axisTick: { show: false },
    axisLabel: { color: CHART_COLORS.label, fontSize: 10, fontFamily: 'JetBrains Mono, Consolas, monospace' },
    splitLine: { lineStyle: { color: CHART_COLORS.grid, type: 'dashed' as const } },
  };
}

export function tooltipStyle() {
  return {
    backgroundColor: '#0B1220',
    borderColor: 'rgba(148,163,184,0.26)',
    borderWidth: 1,
    padding: [8, 10] as [number, number],
    textStyle: { color: '#DCE3EA', fontSize: 11 },
    extraCssText: 'box-shadow: 0 18px 40px -20px rgba(0,0,0,0.9); border-radius: 2px;',
  };
}

export function EChart({
  option,
  height = 220,
  className,
  notMerge = true,
  onEvents,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  notMerge?: boolean;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const eventsRef = useRef(onEvents);
  eventsRef.current = onEvents;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, { notMerge });
    const handlers = eventsRef.current;
    if (handlers) {
      for (const [event, handler] of Object.entries(handlers)) chart.on(event, handler);
    }
    return () => {
      if (handlers) {
        for (const event of Object.keys(handlers)) chart.off(event);
      }
    };
  }, [option, notMerge]);

  return <div ref={ref} className={cx('w-full', className)} style={{ height }} role="img" />;
}
