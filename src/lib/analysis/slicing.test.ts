import { beforeAll, describe, expect, it } from "vitest";
import type { EngineeredRow } from "../../types/features";
import type { ColumnSemantics } from "../../types/semantic";
import type { PipelineResult } from "../../types/pipeline";
import { demoResult } from "../story/testkit";
import { computeCategoryBreakdown } from "./categoryBreakdown";
import {
  ALL_PERIODS, buildSalesCube, describeSlice, findSliceDimensions, initialSlice, normaliseSlice, periodOptions, periodRange,
  selectionParts, shareSlice, trendSlice, type SalesCube, type SliceDimension,
} from "./slicing";

const col = (columnName: string, businessRole: ColumnSemantics['businessRole'], dataType: ColumnSemantics['dataType'] = 'string', confidence = 0.8): ColumnSemantics =>
  ({ columnName, businessRole, dataType, confidence, semanticType: 'category_label', evidence: [], needsReview: false, alternatives: [] });

const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthKey = (i: number) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const monthLabel = (i: number) => `${LABELS[i % 12]} ${String(2024 + Math.floor(i / 12)).slice(-2)}`;

/** `months` months, two rows each: Alpha and Beta, in the North or the South. Alpha = 100 + i, Beta = 10. */
function fakeRows(months: number): EngineeredRow[] {
  const rows: EngineeredRow[] = [];
  for (let i = 0; i < months; i++) {
    const base = { __monthKey: monthKey(i), __monthLabel: monthLabel(i) };
    rows.push({ ...base, Product: 'Alpha', Region: 'North', Revenue: String(100 + i) });
    rows.push({ ...base, Product: 'Beta', Region: 'South', Revenue: '10' });
  }
  return rows;
}

const DIMS: SliceDimension[] = [
  { column: 'Product', role: 'product', values: ['Alpha', 'Beta'] },
  { column: 'Region', role: 'region', values: ['North', 'South'] },
];

describe('findSliceDimensions', () => {
  const rows = fakeRows(6);

  it('offers product, category, region and channel columns with 2 to 30 values', () => {
    const columns = [col('Revenue', 'revenue', 'number'), col('Region', 'location'), col('Product', 'product'), col('Sales Channel', 'category'), col('Segment', 'category')];
    const withChannel = rows.map((r, i) => ({ ...r, 'Sales Channel': i % 2 ? 'Web' : 'Store', Segment: i % 3 ? 'SMB' : 'Enterprise' }));
    const dims = findSliceDimensions(columns, withChannel);
    expect(dims.map(d => [d.column, d.role])).toEqual([['Product', 'product'], ['Segment', 'category'], ['Region', 'region'], ['Sales Channel', 'channel']]);
    expect(dims[0].values).toEqual(['Alpha', 'Beta']);
  });

  it('leaves out numbers, dates, ids, one-value columns and columns with more than 30 values', () => {
    const many = Array.from({ length: 90 }, (_, i): EngineeredRow => ({ Product: `P${i % 31}`, Region: 'North', Customer: `C${i}`, Revenue: '1' }));
    const dims = findSliceDimensions([col('Product', 'product'), col('Region', 'location'), col('Customer', 'customer'), col('Revenue', 'revenue', 'number')], many);
    expect(dims).toEqual([]); // 31 values, one value, wrong role, a number
  });

  it('leaves out a column whose values are nearly unique', () => {
    const rowsU = Array.from({ length: 10 }, (_, i): EngineeredRow => ({ Product: `P${i}`, Revenue: '1' }));
    expect(findSliceDimensions([col('Product', 'product')], rowsU)).toEqual([]);
  });

  // Changed from "ignores blanks": a blank is no longer dropped, it is shown as its own (Missing) value.
  it('shows blanks as a (Missing) value instead of dropping them', () => {
    const r: EngineeredRow[] = [...fakeRows(3), { Product: '', Region: ' ', Revenue: '1' }];
    expect(findSliceDimensions([col('Product', 'product')], r)[0].values).toEqual(['(Missing)', 'Alpha', 'Beta']);
  });
});

describe('buildSalesCube', () => {
  const cube = buildSalesCube(fakeRows(24), 'Revenue', DIMS);

  it('sums months and values from the rows', () => {
    expect(cube.months).toHaveLength(24);
    expect(cube.months[0]).toEqual({ key: '2024-01', label: 'Jan 24', total: 110, rows: 2 });
    expect(cube.months[23].total).toBe(100 + 23 + 10);
    expect(cube.dimensions[0].values).toEqual(['Alpha', 'Beta']);
    expect(cube.dimensions[0].byMonth.get('Alpha')!.sums[5]).toBe(105);
    expect(cube.dimensions[0].whole.get('Beta')).toBe(240);
    expect(cube.wholeTotal).toBe(24 * 10 + (24 * 100 + 276));
  });

  it('keeps undated rows in the whole-file figures but out of the months', () => {
    const rows = [...fakeRows(3), { Product: 'Alpha', Region: 'North', Revenue: '1000' }];
    const c = buildSalesCube(rows, 'Revenue', DIMS);
    expect(c.months.reduce((s, m) => s + m.total, 0)).toBe(3 * 10 + 300 + 3);
    expect(c.dimensions[0].whole.get('Alpha')).toBe(300 + 3 + 1000);
    expect(shareSlice(c, initialSlice('Product'))!.items[0]).toMatchObject({ label: 'Alpha', value: 1303 });
  });

  it('skips rows with a non-numeric measure', () => {
    const rows = [...fakeRows(2), { __monthKey: '2024-01', __monthLabel: 'Jan 24', Product: 'Alpha', Region: 'North', Revenue: 'n/a' }];
    const c = buildSalesCube(rows, 'Revenue', DIMS);
    expect(c.months[0].rows).toBe(2);
  });

  it('is empty, not broken, for no rows', () => {
    const c = buildSalesCube([], 'Revenue', DIMS);
    expect(c.months).toEqual([]);
    expect(trendSlice(c, initialSlice('Product'))).toMatchObject({ points: [], empty: true });
    expect(describeSlice(c, initialSlice('Product'), String)).toMatch(/No dated/);
  });
});

describe('periods', () => {
  const months = Array.from({ length: 30 }, (_, i) => ({ key: monthKey(i) })); // Jan 24 to Jun 26

  it('offers all, the last 12 and 6, and each year with two or more months', () => {
    expect(periodOptions(months).map(o => o.label)).toEqual(['All 30 months', 'Last 12 months', 'Last 6 months', '2026 (6 months)', '2025', '2024']);
  });

  it('offers only "all" for a short single-year series', () => {
    expect(periodOptions(months.slice(0, 8)).map(o => o.value)).toEqual([ALL_PERIODS]);
  });

  it('maps a period to month indexes and falls back to all', () => {
    expect(periodRange(months, 'last-12')).toEqual({ start: 18, end: 29 });
    expect(periodRange(months, 'last-6')).toEqual({ start: 24, end: 29 });
    expect(periodRange(months, 'year-2025')).toEqual({ start: 12, end: 23 });
    expect(periodRange(months, 'year-1999')).toEqual({ start: 0, end: 29 });
    expect(periodRange(months, 'nonsense')).toEqual({ start: 0, end: 29 });
    expect(periodRange([], 'all')).toBeNull();
    expect(periodRange(months.slice(0, 3), 'last-12')).toEqual({ start: 0, end: 2 });
  });
});

describe('trendSlice', () => {
  const cube = buildSalesCube(fakeRows(24), 'Revenue', DIMS);
  const state = initialSlice('Product');

  it('shows every month by default and equals the month totals', () => {
    const t = trendSlice(cube, state);
    expect(t.points.map(p => p.value)).toEqual(cube.months.map(m => m.total));
    expect(t.total).toBe(cube.months.reduce((s, m) => s + m.total, 0));
    expect(t.coversLatest).toBe(true);
    expect(t.empty).toBe(false);
  });

  it('restricts to the period and says when it no longer reaches the latest month', () => {
    const y24 = trendSlice(cube, { ...state, period: 'year-2024' });
    expect(y24.points).toHaveLength(12);
    expect(y24.points[0].label).toBe('Jan 24');
    expect(y24.coversLatest).toBe(false);
    expect(trendSlice(cube, { ...state, period: 'last-6' }).coversLatest).toBe(true);
  });

  it('cuts to one value and keeps months with no rows as zero', () => {
    const t = trendSlice(cube, { ...state, value: 'Alpha' });
    expect(t.points[3]).toMatchObject({ label: 'Apr 24', value: 103, rows: 1 });
    const north = buildSalesCube(fakeRows(24).filter(r => !(r.Product === 'Alpha' && r.__monthKey === '2024-02')), 'Revenue', DIMS);
    const gap = trendSlice(north, { ...state, value: 'Alpha' });
    expect(gap.points[1]).toMatchObject({ label: 'Feb 24', value: 0, rows: 0 });
  });

  it('marks the chosen month and reports its value', () => {
    const t = trendSlice(cube, { ...state, month: '2025-03', value: 'Alpha' });
    expect(t.markedLabel).toBe('Mar 25');
    expect(t.markedValue).toBe(100 + 14);
  });

  it('says so when a value has no rows in the period', () => {
    const only24 = buildSalesCube(fakeRows(24).filter(r => !(r.Product === 'Beta' && r.__monthKey >= '2025-01')), 'Revenue', DIMS);
    const t = trendSlice(only24, { ...state, period: 'year-2025', value: 'Beta' });
    expect(t.empty).toBe(true);
    expect(t.total).toBe(0);
    expect(describeSlice(only24, { ...state, period: 'year-2025', value: 'Beta' }, n => `£${n}`)).toBe('No rows for Product: Beta, 2025. Choose another value or reset the slicers.');
  });
});

describe('shareSlice', () => {
  const cube = buildSalesCube(fakeRows(24), 'Revenue', DIMS);
  const state = initialSlice('Product');

  it('is the whole-file split by default', () => {
    const s = shareSlice(cube, state)!;
    expect(s.scope).toBe('file');
    expect(s.items.map(i => [i.label, i.value])).toEqual([['Alpha', 24 * 100 + 276], ['Beta', 240]]);
    expect(s.total).toBe(cube.wholeTotal);
  });

  it('follows the period and the month, and the parts add up to the total', () => {
    const p = shareSlice(cube, { ...state, period: 'last-12' })!;
    expect(p.scope).toBe('period');
    expect(p.total).toBe(trendSlice(cube, { ...state, period: 'last-12' }).total);
    const m = shareSlice(cube, { ...state, month: '2025-03' })!;
    expect(m.scope).toBe('month');
    expect(m.items.map(i => [i.label, i.value])).toEqual([['Alpha', 114], ['Beta', 10]]);
    expect(m.total).toBe(cube.months.find(x => x.key === '2025-03')!.total);
  });

  it('switches dimension', () => {
    const s = shareSlice(cube, { ...state, dimension: 'Region', month: '2024-01' })!;
    expect(s.items.map(i => [i.label, i.value])).toEqual([['North', 100], ['South', 10]]);
  });

  it('is null for an unknown dimension and leaves a month with no rows out of the cube', () => {
    expect(shareSlice(cube, { ...state, dimension: 'Nope' })).toBeNull();
    const sparse = buildSalesCube(fakeRows(14).filter(r => r.__monthKey !== '2024-05'), 'Revenue', DIMS);
    // 2024-05 has no rows, so it is not a month of the cube: the month slicer cannot offer it.
    expect(sparse.months.map(m => m.key)).not.toContain('2024-05');
  });
});

describe('normaliseSlice and selectionParts', () => {
  const cube = buildSalesCube(fakeRows(24), 'Revenue', DIMS);

  it('drops a month outside the period and a value outside the column', () => {
    const s = normaliseSlice(cube, { period: 'year-2025', month: '2024-03', dimension: 'Region', value: 'Alpha' }, 'Product');
    expect(s).toEqual({ period: 'year-2025', month: null, dimension: 'Region', value: null });
  });

  it('falls back for an unknown period and column', () => {
    expect(normaliseSlice(cube, { period: 'year-1999', month: null, dimension: 'Gone', value: 'x' }, 'Product')).toEqual({ period: 'all', month: null, dimension: 'Product', value: null });
  });

  it('keeps a valid choice', () => {
    const s = { period: 'last-12', month: '2025-03', dimension: 'Product', value: 'Alpha' };
    expect(normaliseSlice(cube, s, 'Product')).toEqual(s);
  });

  it('writes what is selected in words', () => {
    expect(selectionParts(cube, { period: 'all', month: null, dimension: 'Product', value: null })).toEqual([]);
    expect(selectionParts(cube, { period: 'last-12', month: '2025-03', dimension: 'Product', value: 'Alpha' })).toEqual(['Product: Alpha', 'Last 12 months', 'Mar 25']);
  });

  it('describes the selection with the figures', () => {
    const fmt = (n: number) => `£${n.toLocaleString('en-GB')}`;
    expect(describeSlice(cube, { period: 'all', month: null, dimension: 'Product', value: null }, fmt)).toMatch(/^All sales: £\d[\d,]* across 24 months, Jan 24 to Dec 25\.$/);
    const one = describeSlice(cube, { period: 'all', month: '2025-03', dimension: 'Product', value: 'Alpha' }, fmt);
    expect(one).toMatch(/^Product: Alpha, Mar 25\. Sales £114, \d+(\.\d)?% of the period \(Jan 24 to Dec 25: £[\d,]+\)\.$/);
  });
});

/* The demo file, through the real pipeline: every figure a slicer shows must equal the file's own totals. */
describe('against the demo pipeline result', () => {
  let r: PipelineResult;
  let cube: SalesCube;
  let dims: SliceDimension[];
  beforeAll(async () => {
    r = await demoResult();
    dims = findSliceDimensions(r.semantics.columns, r.engineeredRows);
    cube = buildSalesCube(r.engineeredRows, r.statistics.timeSeries[0].measureColumn, dims);
  });

  it('finds the demo file\'s dimensions', () => {
    expect(dims.map(d => d.column)).toEqual(['Product Category', 'Customer Segment', 'Region']);
  });

  it('has month totals equal to the statistics time series', () => {
    const series = r.statistics.timeSeries[0];
    expect(cube.months.map(m => [m.key, m.label, m.total])).toEqual(series.points.map(p => [p.periodKey, p.label, p.value]));
  });

  it('has a whole-file split equal to the category breakdown the Products page uses', () => {
    const state = initialSlice('Product Category');
    const split = shareSlice(cube, state)!;
    const breakdown = computeCategoryBreakdown(r.engineeredRows, 'Product Category', 'Revenue');
    expect(split.items.map(i => [i.label, i.value])).toEqual(breakdown.map(b => [b.label, b.value]));
  });

  it('adds a month\'s values up to the month total, for every dimension', () => {
    for (const dim of dims) {
      for (const month of cube.months) {
        const split = shareSlice(cube, { period: 'all', month: month.key, dimension: dim.column, value: null })!;
        expect(split.total).toBeCloseTo(month.total, 2);
      }
    }
  });

  it('adds a value\'s months up to its whole-file figure', () => {
    for (const dim of dims) {
      for (const value of dim.values) {
        const t = trendSlice(cube, { period: 'all', month: null, dimension: dim.column, value });
        expect(t.total).toBeCloseTo(cube.dimensions.find(d => d.column === dim.column)!.whole.get(value)!, 2);
      }
    }
  });

  it('makes the last 12 months equal the last 12 points of the series', () => {
    const series = r.statistics.timeSeries[0].points;
    const t = trendSlice(cube, { ...initialSlice('Product Category'), period: 'last-12' });
    expect(t.points.map(p => p.value)).toEqual(series.slice(-12).map(p => p.value));
  });

  it('does not change the result it reads', () => {
    const before = JSON.stringify(r.statistics) + JSON.stringify(r.decision.health) + JSON.stringify(r.ml.forecast);
    trendSlice(cube, { period: 'last-6', month: null, dimension: 'Region', value: 'North' });
    shareSlice(cube, { period: 'year-2025', month: null, dimension: 'Region', value: null });
    expect(JSON.stringify(r.statistics) + JSON.stringify(r.decision.health) + JSON.stringify(r.ml.forecast)).toBe(before);
  });
});
