import type { ValueFormat } from "../../../types/analysis";
import { formatCompact, formatFull } from "./format";

/* ================================================================
   VERDIO — chart kit text
   Everything a chart says in words is generated here from its data:
   the aria-label, the live-region message, the table rows and the
   "cannot show" rule. Nothing is hand-written per chart.
   ================================================================ */

export const CANNOT_SHOW = 'Cannot show this chart: needs at least 2 months of data';
// The forecast engine adds a fixed 12% either side (forecastEngine.ts); it is not a statistical interval.
export const PLANNING_RANGE_LABEL = 'Planning range (±12% of the forecast), not a statistical interval';

export interface ChartPoint {
  label: string;
  value: number;
  forecast?: boolean;
  low?: number;
  high?: number;
}

export type SummaryKind = 'time' | 'category' | 'parts';

export interface SummaryInput {
  name: string;
  points: ChartPoint[];
  format: ValueFormat;
  kind?: SummaryKind;
}

// A chart needs at least `min` points, every value finite, and something other than zero to draw.
export function canShow(values: number[], min = 2): boolean {
  return values.length >= min && values.every(Number.isFinite) && values.some(v => v !== 0);
}

// runForecast returns zero-valued points (low and high 0) when the series is too short, and clamps at 0.
// A forecast with any £0 or non-finite point is treated as unavailable rather than drawn.
export function usableForecast(points: ChartPoint[]): ChartPoint[] {
  return points.length > 0 && points.every(p => Number.isFinite(p.value) && p.value !== 0) ? points : [];
}

const pct = (n: number) => Math.round(n * 10) / 10;

function timeSummary({ name, points, format }: SummaryInput): string {
  const actual = points.filter(p => !p.forecast);
  const ahead = points.filter(p => p.forecast);
  if (actual.length === 0) return `${name}: no data`;
  const first = actual[0];
  const last = actual[actual.length - 1];
  const prev = actual[actual.length - 2];
  let s = `${name} ${first.label} to ${last.label}: latest ${formatCompact(last.value, format)}`;
  if (prev && prev.value !== 0) {
    const change = pct(((last.value - prev.value) / Math.abs(prev.value)) * 100);
    s += change === 0 ? ', unchanged' : `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}%`;
  }
  if (ahead.length > 0) {
    const f0 = ahead[0];
    const fn = ahead[ahead.length - 1];
    s += `; forecast ${formatCompact(f0.value, format)} in ${f0.label}`;
    if (ahead.length > 1) s += `, ${formatCompact(fn.value, format)} by ${fn.label}`;
  }
  return s;
}

function categorySummary({ name, points, format }: SummaryInput): string {
  if (points.length === 0) return `${name}: no data`;
  let hi = points[0];
  let lo = points[0];
  for (const p of points) { if (p.value > hi.value) hi = p; if (p.value < lo.value) lo = p; }
  const n = points.length;
  return `${name}, ${n} ${n === 1 ? 'item' : 'items'}: highest ${hi.label} ${formatCompact(hi.value, format)}, lowest ${lo.label} ${formatCompact(lo.value, format)}`;
}

const MAX_PARTS_SPOKEN = 8;

function partsSummary({ name, points, format }: SummaryInput): string {
  const total = points.reduce((s, p) => s + (p.value > 0 ? p.value : 0), 0);
  if (points.length === 0 || total <= 0) return `${name}: no data`;
  const spoken = points.slice(0, MAX_PARTS_SPOKEN).map(p => `${p.label} ${formatCompact(p.value, format)} (${pct((Math.max(p.value, 0) / total) * 100)}%)`);
  const more = points.length - spoken.length;
  return `${name}: ${formatCompact(total, format)} in total; ${spoken.join(', ')}${more > 0 ? `, and ${more} more` : ''}`;
}

// The aria-label for a chart, e.g. "Monthly sales Jan 24 to Dec 25: latest £149k, down 4.8%; forecast £164k in Jan 26".
export function summarise(input: SummaryInput): string {
  switch (input.kind ?? 'time') {
    case 'category': return categorySummary(input);
    case 'parts':    return partsSummary(input);
    default:         return timeSummary(input);
  }
}

// What the live region says when a point becomes active, e.g. "Mar 25, £152,588".
export function announce(p: ChartPoint, format: ValueFormat): string {
  if (!p.forecast) return `${p.label}, ${formatFull(p.value, format)}`;
  const range = p.low !== undefined && p.high !== undefined ? `, planning range ${formatFull(p.low, format)} to ${formatFull(p.high, format)}` : '';
  return `${p.label}, forecast ${formatFull(p.value, format)}${range}`;
}

export interface TableRow {
  label: string;          // forecast rows end with "(forecast)"
  value: string;
  range: string | null;   // "£1,000 to £2,000" for forecast rows that carry low and high
  share: string | null;   // "40%" when shares are asked for
  forecast: boolean;
}

// The same rows the chart draws, as strings for a real table.
export function tableRows(points: ChartPoint[], format: ValueFormat, opts: { shares?: boolean } = {}): TableRow[] {
  const total = points.reduce((s, p) => s + (p.value > 0 ? p.value : 0), 0);
  return points.map(p => ({
    label: p.forecast ? `${p.label} (forecast)` : p.label,
    value: formatFull(p.value, format),
    range: p.forecast && p.low !== undefined && p.high !== undefined ? `${formatFull(p.low, format)} to ${formatFull(p.high, format)}` : null,
    share: opts.shares && total > 0 ? `${pct((Math.max(p.value, 0) / total) * 100)}%` : null,
    forecast: !!p.forecast,
  }));
}
