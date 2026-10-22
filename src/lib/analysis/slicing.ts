import type { EngineeredRow } from "../../types/features";
import type { ColumnSemantics } from "../../types/semantic";
import { parseAmount } from "../dataPipeline/profileDataset";
import { groupLabel } from "../dataPipeline/missingGroup";

/* ================================================================
   VERDIO — Slicing (pure)
   Which columns of a file a chart can be cut by, and what a chart
   shows for a slicer state. Everything is summed from the file's own
   rows (engineeredRows); nothing here touches the forecast, the
   Health score or the risks. A slicer only chooses which actuals a
   chart or table shows.
   ================================================================ */

export type SliceRole = 'product' | 'category' | 'region' | 'channel';

export const MIN_SLICE_VALUES = 2;
export const MAX_SLICE_VALUES = 30;
/** A series gets a period slicer only when it has MORE periods than this. */
export const LONG_SERIES_PERIODS = 12;

const ROLE_ORDER: SliceRole[] = ['product', 'category', 'region', 'channel'];
const CHANNEL_NAME = /(^|[^a-z])(channel|source|medium)([^a-z]|$)/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SliceDimension {
  column: string;
  role: SliceRole;
  values: string[];            // distinct non-empty values, alphabetical
}

function sliceRoleOf(col: ColumnSemantics): SliceRole | null {
  if (col.dataType !== 'string') return null;
  const role = col.businessRole;
  if (CHANNEL_NAME.test(col.columnName) && (role === 'category' || role === 'status' || role === 'unknown')) return 'channel';
  if (role === 'product') return 'product';
  if (role === 'category') return 'category';
  if (role === 'location') return 'region';
  return null;
}

/**
 * The columns a chart can be cut by: product, category, region (location) and channel columns with
 * 2 to 30 distinct values, and on average at least two rows per value so an ID-like column is left out.
 * Ordered product, category, region, channel, then by how sure the column detection was.
 */
export function findSliceDimensions(columns: ColumnSemantics[], rows: EngineeredRow[]): SliceDimension[] {
  const out: { dim: SliceDimension; confidence: number }[] = [];
  for (const col of columns) {
    const role = sliceRoleOf(col);
    if (!role) continue;
    const seen = new Set<string>();
    let filled = 0;
    for (const row of rows) {
      const v = groupLabel(row[col.columnName]); // a blank is its own "(Missing)" value, never dropped
      filled += 1;
      seen.add(v);
      if (seen.size > MAX_SLICE_VALUES) break;
    }
    if (seen.size < MIN_SLICE_VALUES || seen.size > MAX_SLICE_VALUES || seen.size * 2 > filled) continue;
    out.push({ dim: { column: col.columnName, role, values: [...seen].sort((a, b) => a.localeCompare(b)) }, confidence: col.confidence });
  }
  return out
    .sort((a, b) => ROLE_ORDER.indexOf(a.dim.role) - ROLE_ORDER.indexOf(b.dim.role) || b.confidence - a.confidence)
    .map(item => item.dim);
}

/* ── The cube: month x dimension sums, computed once from the rows ── */

export interface CubeMonth { key: string; label: string; total: number; rows: number }

export interface CubeDimension {
  column: string;
  role: SliceRole;
  values: string[];                                          // largest first over the whole file
  whole: Map<string, number>;                                // every row with a value, dated or not
  byMonth: Map<string, { sums: number[]; rows: number[] }>;  // aligned with SalesCube.months
}

export interface SalesCube {
  measureColumn: string;
  months: CubeMonth[];                                       // oldest first, the same months statistics.timeSeries lists
  dimensions: CubeDimension[];
  wholeTotal: number;
}

/**
 * Sums `measureColumn` by month and by each dimension value. A row counts the way the statistics engine
 * counts it (a number in the measure cell, a blank is skipped; month from __monthKey), so the unsliced month totals equal timeSeries.
 */
export function buildSalesCube(rows: EngineeredRow[], measureColumn: string, dimensions: SliceDimension[]): SalesCube {
  const labels = new Map<string, string>();
  for (const row of rows) {
    const key = String(row['__monthKey'] ?? '');
    if (!key || labels.has(key) || parseAmount(row[measureColumn]) === null) continue;
    labels.set(key, String(row['__monthLabel'] ?? key));
  }
  const keys = [...labels.keys()].sort((a, b) => a.localeCompare(b));
  const index = new Map(keys.map((key, i) => [key, i]));
  const months: CubeMonth[] = keys.map(key => ({ key, label: labels.get(key)!, total: 0, rows: 0 }));
  const cubeDims: CubeDimension[] = dimensions.map(dim => ({ column: dim.column, role: dim.role, values: [], whole: new Map(), byMonth: new Map() }));
  let wholeTotal = 0;

  for (const row of rows) {
    const v = parseAmount(row[measureColumn]);
    if (v === null) continue;
    wholeTotal += v;
    const i = index.get(String(row['__monthKey'] ?? ''));
    if (i !== undefined) { months[i].total += v; months[i].rows += 1; }
    for (const dim of cubeDims) {
      const value = groupLabel(row[dim.column]);
      dim.whole.set(value, (dim.whole.get(value) ?? 0) + v);
      if (i === undefined) continue;
      let cell = dim.byMonth.get(value);
      if (!cell) { cell = { sums: new Array<number>(months.length).fill(0), rows: new Array<number>(months.length).fill(0) }; dim.byMonth.set(value, cell); }
      cell.sums[i] += v;
      cell.rows[i] += 1;
    }
  }

  for (const month of months) month.total = round2(month.total);
  for (const dim of cubeDims) {
    for (const [value, sum] of dim.whole) dim.whole.set(value, round2(sum));
    for (const cell of dim.byMonth.values()) cell.sums = cell.sums.map(round2);
    dim.values = [...dim.whole.keys()].sort((a, b) => dim.whole.get(b)! - dim.whole.get(a)! || a.localeCompare(b));
  }
  return { measureColumn, months, dimensions: cubeDims, wholeTotal: round2(wholeTotal) };
}

/* ── Slicer state ── */

export interface SliceState {
  period: string;               // 'all', 'last-12', 'last-6' or 'year-2025'
  month: string | null;         // a __monthKey inside the period, or none
  dimension: string | null;     // the column the shares are split by and the value belongs to
  value: string | null;         // one value of that column, or none
}

export const ALL_PERIODS = 'all';

export function initialSlice(dimension: string | null): SliceState {
  return { period: ALL_PERIODS, month: null, dimension, value: null };
}

export interface PeriodOption { value: string; label: string }

/** The periods worth offering: all, the last 12 and 6 months, and each year with at least two months. */
export function periodOptions(months: { key: string }[]): PeriodOption[] {
  const n = months.length;
  const out: PeriodOption[] = [{ value: ALL_PERIODS, label: `All ${n} months` }];
  if (n > LONG_SERIES_PERIODS) {
    out.push({ value: 'last-12', label: 'Last 12 months' }, { value: 'last-6', label: 'Last 6 months' });
  }
  const perYear = new Map<string, number>();
  for (const m of months) perYear.set(m.key.slice(0, 4), (perYear.get(m.key.slice(0, 4)) ?? 0) + 1);
  if (perYear.size > 1) {
    [...perYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).forEach(([year, count]) => {
      if (count >= 2) out.push({ value: `year-${year}`, label: count === 12 ? year : `${year} (${count} months)` });
    });
  }
  return out;
}

export interface IndexSpan { start: number; end: number }

/** Month indexes a period covers (inclusive). Unknown periods mean all; null when there are no months. */
export function periodRange(months: { key: string }[], period: string): IndexSpan | null {
  const n = months.length;
  if (n === 0) return null;
  const last = /^last-(\d+)$/.exec(period);
  if (last) return { start: Math.max(0, n - Number(last[1])), end: n - 1 };
  const year = /^year-(\d{4})$/.exec(period);
  if (year) {
    const hits = months.map((m, i) => (m.key.startsWith(year[1]) ? i : -1)).filter(i => i >= 0);
    if (hits.length) return { start: hits[0], end: hits[hits.length - 1] };
  }
  return { start: 0, end: n - 1 };
}

function dimensionOf(cube: SalesCube, column: string | null): CubeDimension | undefined {
  return column === null ? undefined : cube.dimensions.find(d => d.column === column);
}

/** Drops anything the cube cannot honour: an unknown period, a month outside the period, an unknown column or value. */
export function normaliseSlice(cube: SalesCube, state: SliceState, fallbackDimension: string | null): SliceState {
  const knownPeriod = periodOptions(cube.months).some(o => o.value === state.period);
  const period = knownPeriod ? state.period : ALL_PERIODS;
  const range = periodRange(cube.months, period);
  const monthIndex = state.month === null ? -1 : cube.months.findIndex(m => m.key === state.month);
  const month = range && monthIndex >= range.start && monthIndex <= range.end ? state.month : null;
  const dim = dimensionOf(cube, state.dimension) ?? dimensionOf(cube, fallbackDimension);
  const value = dim && state.value !== null && dim.values.includes(state.value) ? state.value : null;
  return { period, month, dimension: dim ? dim.column : null, value };
}

/* ── What a chart shows for a state ── */

export interface TrendSlicePoint { key: string; label: string; value: number; rows: number }

export interface TrendSlice {
  points: TrendSlicePoint[];          // the months in the period, cut to the value when one is chosen
  markedLabel: string | null;         // the chosen month, to mark on the line
  markedValue: number | null;
  total: number;
  rows: number;
  empty: boolean;                     // no rows at all for this cut in this period
  coversLatest: boolean;              // the period ends at the file's latest month, so a forecast still follows it
}

export function trendSlice(cube: SalesCube, state: SliceState): TrendSlice {
  const range = periodRange(cube.months, state.period);
  if (!range) return { points: [], markedLabel: null, markedValue: null, total: 0, rows: 0, empty: true, coversLatest: false };
  const cell = state.value !== null ? dimensionOf(cube, state.dimension)?.byMonth.get(state.value) : undefined;
  const cut = state.value !== null;
  const points: TrendSlicePoint[] = [];
  for (let i = range.start; i <= range.end; i++) {
    const m = cube.months[i];
    points.push({ key: m.key, label: m.label, value: cut ? (cell?.sums[i] ?? 0) : m.total, rows: cut ? (cell?.rows[i] ?? 0) : m.rows });
  }
  const marked = state.month === null ? undefined : points.find(p => p.key === state.month);
  const rows = points.reduce((s, p) => s + p.rows, 0);
  return {
    points,
    markedLabel: marked?.label ?? null,
    markedValue: marked?.value ?? null,
    total: round2(points.reduce((s, p) => s + p.value, 0)),
    rows,
    empty: rows === 0,
    coversLatest: range.end === cube.months.length - 1,
  };
}

export interface ShareSliceItem { label: string; value: number; rows: number }

export interface ShareSlice {
  items: ShareSliceItem[];            // one per value of the dimension, largest first
  scope: 'file' | 'period' | 'month';
  total: number;
  rows: number;
  empty: boolean;
}

/** The split of the measure across the dimension's values for the period, or for the chosen month. */
export function shareSlice(cube: SalesCube, state: SliceState): ShareSlice | null {
  const dim = dimensionOf(cube, state.dimension);
  if (!dim) return null;
  const range = periodRange(cube.months, state.period);
  const monthIndex = state.month === null ? -1 : cube.months.findIndex(m => m.key === state.month);
  const wholeFile = !!range && monthIndex < 0 && range.start === 0 && range.end === cube.months.length - 1;
  const scope: ShareSlice['scope'] = monthIndex >= 0 ? 'month' : wholeFile ? 'file' : 'period';
  const items = dim.values.map((label, k): ShareSliceItem & { k: number } => {
    const cell = dim.byMonth.get(label);
    let value = 0;
    let rows = 0;
    if (scope === 'file') {
      value = dim.whole.get(label) ?? 0;
      rows = cell ? cell.rows.reduce((s, r) => s + r, 0) : 0;
    } else if (cell && range) {
      const from = scope === 'month' ? monthIndex : range.start;
      const to = scope === 'month' ? monthIndex : range.end;
      for (let i = from; i <= to; i++) { value += cell.sums[i]; rows += cell.rows[i]; }
    }
    return { label, value: round2(value), rows, k };
  });
  items.sort((a, b) => b.value - a.value || a.k - b.k);
  const clean = items.map(({ label, value, rows }) => ({ label, value, rows }));
  const rows = clean.reduce((s, i) => s + i.rows, 0);
  return { items: clean, scope, total: round2(clean.reduce((s, i) => s + i.value, 0)), rows, empty: scope !== 'file' && rows === 0 };
}

/** What is selected, in words: ["Product Category: Advisory", "Last 12 months", "Mar 25"]. Empty when nothing is. */
export function selectionParts(cube: SalesCube, state: SliceState): string[] {
  const parts: string[] = [];
  if (state.value !== null && state.dimension !== null) parts.push(`${state.dimension}: ${state.value}`);
  const period = periodOptions(cube.months).find(o => o.value === state.period);
  if (period && state.period !== ALL_PERIODS) parts.push(period.label);
  const month = state.month === null ? undefined : cube.months.find(m => m.key === state.month);
  if (month) parts.push(month.label);
  return parts;
}

/** The sentence a screen reader hears when a slicer changes. `fmt` writes an amount, for example "£152,588". */
export function describeSlice(cube: SalesCube, state: SliceState, fmt: (n: number) => string, measureName = 'sales'): string {
  const parts = selectionParts(cube, state);
  const trend = trendSlice(cube, state);
  const what = parts.length ? parts.join(', ') : `All ${measureName}`;
  const measure = measureName.charAt(0).toUpperCase() + measureName.slice(1);
  const lead = parts.length ? `${what}. ${measure}` : `${what}:`;
  if (cube.months.length === 0) return `No dated ${measureName} in this file.`;
  if (trend.empty) return `No rows for ${what}. Choose another value or reset the slicers.`;
  const first = trend.points[0]?.label;
  const last = trend.points[trend.points.length - 1]?.label;
  const span = first === last ? first : `${first} to ${last}`;
  if (trend.markedLabel !== null && trend.markedValue !== null) {
    const share = trend.total > 0 ? `, ${Math.round((trend.markedValue / trend.total) * 1000) / 10}% of the period` : '';
    return `${lead} ${fmt(trend.markedValue)}${share} (${span}: ${fmt(trend.total)}).`;
  }
  const n = trend.points.length;
  return `${lead} ${fmt(trend.total)} across ${n} ${n === 1 ? 'month' : 'months'}, ${span}.`;
}
