import type { ChartSpec, ValueFormat } from "../../types/analysis";

/* ================================================================
   VERDIO — Chart Spec Builders
   Small, focused constructors. generateAnalysisCandidates.ts decides
   WHAT to show; this file only decides HOW to shape it into a spec
   the renderer understands.
   ================================================================ */

export function buildLineChart(title: string, data: Record<string, any>[], xKey: string, seriesKeys: string[], formatValue: ValueFormat, subtitle?: string): ChartSpec {
  return { chartType: 'line', title, subtitle, xKey, seriesKeys, data, formatValue };
}

export function buildBarChart(title: string, data: Record<string, any>[], xKey: string, yKey: string, formatValue: ValueFormat, subtitle?: string): ChartSpec {
  return { chartType: 'bar', title, subtitle, xKey, yKey, data, formatValue };
}

export function buildHorizontalBarChart(title: string, data: Record<string, any>[], xKey: string, yKey: string, formatValue: ValueFormat, subtitle?: string): ChartSpec {
  return { chartType: 'horizontal_bar', title, subtitle, xKey: yKey, yKey: xKey, data, formatValue };
}

export function buildScatterChart(title: string, data: Record<string, any>[], xKey: string, yKey: string, subtitle?: string): ChartSpec {
  return { chartType: 'scatter', title, subtitle, xKey, yKey, data, formatValue: 'plain' };
}

export function buildPieChart(title: string, data: Record<string, any>[], seriesKey: string, valueKey: string, formatValue: ValueFormat, subtitle?: string): ChartSpec {
  return { chartType: 'pie', title, subtitle, xKey: seriesKey, yKey: valueKey, data, formatValue };
}

export function buildTable(title: string, data: Record<string, any>[], columns: { key: string; label: string; format?: ValueFormat }[], subtitle?: string): ChartSpec {
  return { chartType: 'table', title, subtitle, data, columns, formatValue: 'plain' };
}
