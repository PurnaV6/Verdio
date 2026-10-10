import type { ChartSpec } from "../../types/analysis";
import { formatFull } from "./kit/format";
import { summarise, type ChartPoint } from "./kit/summary";

/* The generated aria-label and table for a Recharts chart (an arbitrary ChartSpec), built from its data with the
   same summarise() the SVG kit uses. Returns null for 'table' specs, which already are a table. */

export interface SpecDescription {
  label: string;
  caption: string;
  headers: string[];
  rows: string[][];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function points(chart: ChartSpec, labelKey: string, valueKey: string): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (const row of chart.data) if (num(row[valueKey])) out.push({ label: text(row[labelKey]), value: row[valueKey] });
  return out;
}

export function describeSpec(chart: ChartSpec): SpecDescription | null {
  const { chartType, data, formatValue: format } = chart;
  if (chartType === 'table') return null;
  const cell = (v: unknown) => (num(v) ? formatFull(v, format) : text(v));

  if (chartType === 'scatter') {
    const x = chart.xKey ?? 'x';
    const y = chart.yKey ?? 'y';
    const name = chart.title || `${y} against ${x}`;
    return { label: `${name}: scatter plot of ${y} against ${x}, ${data.length} points`, caption: name, headers: [x, y], rows: data.map(r => [cell(r[x]), cell(r[y])]) };
  }

  // Which row field is the category and which the value differs by chart type (horizontal bars swap them).
  let labelKey: string;
  let valueKeys: string[];
  switch (chartType) {
    case 'line': labelKey = chart.xKey ?? 'label'; valueKeys = chart.seriesKeys?.length ? chart.seriesKeys : ['value']; break;
    case 'horizontal_bar': labelKey = chart.yKey ?? 'label'; valueKeys = [chart.xKey ?? 'value']; break;
    case 'pie': labelKey = chart.xKey ?? 'label'; valueKeys = [chart.yKey ?? 'value']; break;
    default: labelKey = chart.xKey ?? 'label'; valueKeys = [chart.yKey ?? 'value'];
  }
  const name = chart.title || `${valueKeys[0]} by ${labelKey}`;
  const kind = chartType === 'line' ? 'time' : chartType === 'pie' ? 'parts' : 'category';
  // A multi-series line (historical + forecast) is summarised from its first series that has values.
  const main = valueKeys.map(k => points(chart, labelKey, k)).find(p => p.length > 0) ?? [];
  return {
    label: summarise({ name, points: main, format, kind }),
    caption: name,
    headers: [labelKey, ...valueKeys],
    rows: data.map(r => [text(r[labelKey]), ...valueKeys.map(k => cell(r[k]))]),
  };
}
