import type { EChartsOption } from 'echarts';
import type { ForecastPoint, SumpSeverity, SumpThreshold } from '../domain/types';
import { CHART_COLORS, EChart, axisStyle, baseGrid, tooltipStyle } from './EChart';

/* -------------------------------------------------------------------------- */
/* Generic builders                                                           */
/* -------------------------------------------------------------------------- */

export function trendOption(args: {
  categories: Array<string | number>;
  series: Array<{ name: string; data: Array<number | null>; color: string; dashed?: boolean; area?: boolean; width?: number }>;
  yName?: string;
  yMin?: number;
  yMax?: number;
  markLines?: Array<{ y: number; label: string; color: string }>;
  legend?: boolean;
  xFormatter?: (value: number) => string;
}): EChartsOption {
  return {
    animationDuration: 240,
    grid: baseGrid({ top: args.legend ? 30 : 18, bottom: 26, left: 46, right: 16 }),
    legend: args.legend
      ? {
          top: 0,
          right: 0,
          itemWidth: 8,
          itemHeight: 8,
          icon: 'rect',
          textStyle: { color: CHART_COLORS.label, fontSize: 10 },
        }
      : undefined,
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(),
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(148,163,184,0.35)' } },
    },
    xAxis: {
      type: 'category',
      data: args.categories,
      boundaryGap: false,
      ...axisStyle(),
      splitLine: { show: false },
      axisLabel: {
        color: CHART_COLORS.label,
        fontSize: 10,
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        formatter: args.xFormatter ? (value: number | string) => args.xFormatter!(Number(value)) : undefined,
      },
    },
    yAxis: {
      type: 'value',
      name: args.yName,
      nameTextStyle: { color: CHART_COLORS.label, fontSize: 10 },
      min: args.yMin,
      max: args.yMax,
      scale: args.yMin === undefined,
      ...axisStyle(),
    },
    series: args.series.map((series) => ({
      name: series.name,
      type: 'line' as const,
      data: series.data,
      symbol: 'none',
      smooth: false,
      lineStyle: {
        color: series.color,
        width: series.width ?? 1.4,
        type: series.dashed ? ('dashed' as const) : ('solid' as const),
      },
      itemStyle: { color: series.color },
      areaStyle: series.area ? { color: series.color, opacity: 0.08 } : undefined,
      markLine: series === args.series[0] && args.markLines
        ? {
            silent: true,
            symbol: 'none',
            label: {
              color: CHART_COLORS.label,
              fontSize: 9,
              formatter: '{b}',
              position: 'insideEndTop',
            },
            lineStyle: { width: 1, type: 'dashed' as const },
            data: args.markLines.map((line) => ({
              yAxis: line.y,
              name: line.label,
              lineStyle: { color: line.color, type: 'dashed' as const },
              label: { color: line.color },
            })),
          }
        : undefined,
    })),
  };
}

export function barOption(args: {
  categories: string[];
  series: Array<{ name: string; data: number[]; color: string }>;
  yName?: string;
  horizontal?: boolean;
  stacked?: boolean;
  legend?: boolean;
  max?: number;
}): EChartsOption {
  const categoryAxis = {
    type: 'category' as const,
    data: args.categories,
    ...axisStyle(),
    splitLine: { show: false },
    axisLabel: {
      color: CHART_COLORS.label,
      fontSize: 10,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      interval: 0,
      overflow: 'truncate' as const,
      width: 92,
    },
  };
  const valueAxis = {
    type: 'value' as const,
    name: args.yName,
    max: args.max,
    nameTextStyle: { color: CHART_COLORS.label, fontSize: 10 },
    ...axisStyle(),
  };
  return {
    animationDuration: 240,
    grid: baseGrid({ top: args.legend ? 30 : 16, left: args.horizontal ? 96 : 46, right: 18, bottom: 28 }),
    legend: args.legend
      ? { top: 0, right: 0, itemWidth: 8, itemHeight: 8, icon: 'rect', textStyle: { color: CHART_COLORS.label, fontSize: 10 } }
      : undefined,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle() },
    xAxis: args.horizontal ? valueAxis : categoryAxis,
    yAxis: args.horizontal ? categoryAxis : valueAxis,
    series: args.series.map((series) => ({
      name: series.name,
      type: 'bar' as const,
      stack: args.stacked ? 'total' : undefined,
      data: series.data,
      barMaxWidth: 22,
      itemStyle: { color: series.color, opacity: 0.85 },
      emphasis: { itemStyle: { opacity: 1 } },
    })),
  };
}

export const SEVERITY_COLOR: Record<SumpSeverity, string> = {
  advisory: CHART_COLORS.cyan,
  warning: CHART_COLORS.amber,
  critical: CHART_COLORS.red,
};

export function forecastOption(args: {
  points: ForecastPoint[];
  thresholds: SumpThreshold[];
  horizonHours?: number;
  showBand?: boolean;
  color?: string;
}): EChartsOption {
  const categories = args.points.map((p) => p.tSec / 3600);
  const level = args.points.map((p) => Number(p.levelM.toFixed(3)));
  const low = args.points.map((p) => Number(p.levelLowM.toFixed(3)));
  const high = args.points.map((p) => Number(p.levelHighM.toFixed(3)));
  const band = high.map((h, i) => Number((h - low[i]).toFixed(3)));
  const color = args.color ?? CHART_COLORS.cyan;

  return {
    animationDuration: 240,
    grid: baseGrid({ top: 22, left: 46, right: 18, bottom: 30 }),
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(),
      formatter: (params: unknown) => {
        const list = params as Array<{ dataIndex: number }>;
        const index = list[0]?.dataIndex ?? 0;
        const point = args.points[index];
        if (!point) return '';
        return [
          `<div style="font-family:monospace;font-size:10px;color:#8494A6">T+${(point.tSec / 3600).toFixed(2)} h</div>`,
          `<div style="margin-top:4px">Level <b>${point.levelM.toFixed(2)} m</b></div>`,
          `<div>Band ${point.levelLowM.toFixed(2)} – ${point.levelHighM.toFixed(2)} m</div>`,
          `<div>In ${point.inflowM3h.toFixed(0)} / Out ${point.outflowM3h.toFixed(0)} m³/h</div>`,
        ].join('');
      },
    },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: false,
      ...axisStyle(),
      splitLine: { show: false },
      axisLabel: {
        color: CHART_COLORS.label,
        fontSize: 10,
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        formatter: (value: number | string) => `${Number(value).toFixed(0)}h`,
      },
    },
    yAxis: {
      type: 'value',
      name: 'm',
      nameTextStyle: { color: CHART_COLORS.label, fontSize: 10 },
      scale: true,
      ...axisStyle(),
    },
    series: [
      {
        name: 'band-base',
        type: 'line',
        data: low,
        stack: 'band',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        silent: true,
        z: 1,
      },
      {
        name: 'uncertainty',
        type: 'line',
        data: band,
        stack: 'band',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: args.showBand === false ? 0 : 0.14 },
        silent: true,
        z: 1,
      },
      {
        name: 'pessimistic',
        type: 'line',
        data: high,
        symbol: 'none',
        lineStyle: { color, width: 1, type: 'dashed', opacity: 0.5 },
        z: 2,
      },
      {
        name: 'central',
        type: 'line',
        data: level,
        symbol: 'none',
        lineStyle: { color, width: 1.8 },
        areaStyle: { color, opacity: 0.05 },
        z: 3,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { color: CHART_COLORS.label, fontSize: 9, position: 'insideEndTop', formatter: '{b}' },
          data: args.thresholds.map((threshold) => ({
            yAxis: threshold.levelM,
            name: threshold.label,
            lineStyle: { color: SEVERITY_COLOR[threshold.severity], type: 'dashed', width: 1 },
            label: { color: SEVERITY_COLOR[threshold.severity] },
          })),
        },
      },
    ],
  };
}

export function gaugeOption(args: {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  thresholds?: Array<{ value: number; color: string }>;
}): EChartsOption {
  return {
    animationDuration: 300,
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: args.max,
        progress: { show: true, width: 6, itemStyle: { color: args.color } },
        axisLine: {
          lineStyle: {
            width: 6,
            color: (args.thresholds ?? [{ value: args.max, color: 'rgba(148,163,184,0.18)' }]).map((t) => [t.value / args.max, t.color]),
          },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '32%'],
          color: CHART_COLORS.label,
          fontSize: 9,
          fontFamily: 'JetBrains Mono, Consolas, monospace',
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '-2%'],
          color: CHART_COLORS.text,
          fontSize: 20,
          fontFamily: 'JetBrains Mono, Consolas, monospace',
          formatter: (value: number) => `${value.toFixed(0)}`,
        },
        data: [{ value: args.value, name: `${args.label} · ${args.unit}` }],
      },
    ],
  };
}

export function heatmapOption(args: {
  xLabels: string[];
  yLabels: string[];
  data: Array<[number, number, number]>;
  max: number;
  unit: string;
}): EChartsOption {
  return {
    animationDuration: 240,
    grid: { top: 10, bottom: 40, left: 92, right: 20 },
    tooltip: {
      ...tooltipStyle(),
      formatter: (params: unknown) => {
        const p = params as { value: [number, number, number] };
        return `${args.yLabels[p.value[1]]} · ${args.xLabels[p.value[0]]}<br/><b>${p.value[2].toFixed(2)} ${args.unit}</b>`;
      },
    },
    xAxis: {
      type: 'category',
      data: args.xLabels,
      ...axisStyle(),
      splitLine: { show: false },
      axisLabel: { color: CHART_COLORS.label, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
    },
    yAxis: {
      type: 'category',
      data: args.yLabels,
      ...axisStyle(),
      splitLine: { show: false },
      axisLabel: { color: CHART_COLORS.label, fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: args.max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 80,
      textStyle: { color: CHART_COLORS.label, fontSize: 9 },
      inRange: { color: ['#0F1725', '#1F4E8C', '#2BB3D6', '#1E9E5A', '#D98A0B', '#D33F3F'] },
    },
    series: [
      {
        type: 'heatmap',
        data: args.data,
        itemStyle: { borderColor: '#070B12', borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: '#DCE3EA', borderWidth: 1 } },
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Wrappers                                                                   */
/* -------------------------------------------------------------------------- */

export function TrendChart(props: {
  categories: Array<string | number>;
  series: Array<{ name: string; data: Array<number | null>; color: string; dashed?: boolean; area?: boolean }>;
  yName?: string;
  yMin?: number;
  yMax?: number;
  markLines?: Array<{ y: number; label: string; color: string }>;
  legend?: boolean;
  height?: number;
  xFormatter?: (value: number) => string;
}) {
  const { height = 200, ...rest } = props;
  return <EChart option={trendOption(rest)} height={height} />;
}

export function ForecastChart(props: {
  points: ForecastPoint[];
  thresholds: SumpThreshold[];
  height?: number;
  color?: string;
  showBand?: boolean;
}) {
  return <EChart option={forecastOption(props)} height={props.height ?? 220} />;
}

export function BarChart(props: {
  categories: string[];
  series: Array<{ name: string; data: number[]; color: string }>;
  yName?: string;
  horizontal?: boolean;
  stacked?: boolean;
  legend?: boolean;
  max?: number;
  height?: number;
}) {
  const { height = 200, ...rest } = props;
  return <EChart option={barOption(rest)} height={height} />;
}

export function Gauge(props: {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  thresholds?: Array<{ value: number; color: string }>;
  height?: number;
}) {
  const { height = 140, ...rest } = props;
  return <EChart option={gaugeOption(rest)} height={height} />;
}

export function Heatmap(props: {
  xLabels: string[];
  yLabels: string[];
  data: Array<[number, number, number]>;
  max: number;
  unit: string;
  height?: number;
}) {
  return <EChart option={heatmapOption(props)} height={props.height ?? 220} />;
}

export { CHART_COLORS };
