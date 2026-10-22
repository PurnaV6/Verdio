import { describe, expect, it } from "vitest";
import { expectHealthy, resultFromCsv } from "../story/testkit";
import { buildStory } from "../story/buildStory";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageEvidence } from "../../components/governance/GovernancePages";
import { getRevenueView } from "../analysis/revenueView";
import { salesSummary } from "../analysis/salesSummary";
import { computeCategoryBreakdown } from "../analysis/categoryBreakdown";
import { buildSalesCube, findSliceDimensions, trendSlice, shareSlice, initialSlice } from "../analysis/slicing";
import { MISSING_LABEL } from "./missingGroup";
import { classifyRow } from "./salesRows";
import type { PipelineResult } from "../../types/pipeline";
import type { EngineeredRow } from "../../types/features";

/* The probe that found the bug: repeating revenues of 100, 120 and 140 with a share of Revenue left blank.
   The old pipeline filled the blanks with the column mean (120), so a third of the rows invented sales. */

const PRICES = [100, 120, 140];

function dateOf(i: number): string {
  return `2025-${String(1 + Math.floor(i / 12)).padStart(2, '0')}-${String(1 + (i % 12) * 2).padStart(2, '0')}`;
}

function revenueCsv(rows: number, blankAt: (i: number) => boolean): { csv: string; realSum: number; realCount: number } {
  const lines = ['Order ID,Order Date,Product,Revenue'];
  let realSum = 0, realCount = 0;
  for (let i = 0; i < rows; i += 1) {
    const blank = blankAt(i);
    if (!blank) { realSum += PRICES[i % 3]; realCount += 1; }
    lines.push([`O-${i}`, dateOf(i), ['Alpha', 'Beta', 'Gamma'][i % 3], blank ? '' : PRICES[i % 3]].join(','));
  }
  return { csv: lines.join('\n'), realSum, realCount };
}

describe.each([
  ['0% blank', (_i: number) => false],
  ['33% blank', (i: number) => i % 3 === 0],
  ['60% blank', (i: number) => i % 5 < 3],
])('Revenue with %s', (_label, blankAt) => {
  const rows = 72;
  const { csv, realSum, realCount } = revenueCsv(rows, blankAt);
  const blanks = rows - realCount;

  it('totals exactly the real values, with nothing invented', async () => {
    const r = await resultFromCsv(csv);
    expect(salesSummary(r).salesTotal).toBe(realSum);
    expect(getRevenueView(r).total).toBe(realSum);
    expect(r.statistics.timeSeries[0].points.reduce((sum, p) => sum + p.value, 0)).toBe(realSum);
    expect(r.cleaning.cellsImputed).toBe(0);
    expect(r.cleaning.actions.filter(a => a.type.startsWith('impute'))).toEqual([]);
    expect(new Set(r.engineeredRows.map(row => row['Revenue']))).toEqual(new Set(['100', '120', '140'].filter(v => realCount > 0 && r.engineeredRows.some(row => row['Revenue'] === v))));
  });

  it('counts only the non-blank rows in the series and the statistics', async () => {
    const r = await resultFromCsv(csv);
    expect(r.statistics.timeSeries[0].points.reduce((sum, p) => sum + p.count, 0)).toBe(realCount);
    expect(r.engineeredRows).toHaveLength(realCount);
    expect(r.analysisRowCount).toBe(realCount);
    expect(r.statistics.numeric.find(s => s.column === 'Revenue')?.count).toBe(realCount);
  });

  it('keeps every row in the data and lists the blank ones with their row number', async () => {
    const r = await resultFromCsv(csv);
    expect(r.source.rowCount).toBe(rows);
    expect(r.excludedRows).toHaveLength(blanks);
    for (const row of r.excludedRows ?? []) {
      expect(row.reason).toBe('missing_measure');
      expect(row.values['Revenue']).toBe('');
      expect(blankAt(row.row - 1)).toBe(true);
      expect(row.values['Order ID']).toBe(`O-${row.row - 1}`);
      expect(row.reasonText).toBe('Revenue is blank or not a number');
    }
    expect(r.cleaning.rowsExcluded?.missing_measure).toBe(blanks);
  });

  it('reports the blanks per column, before and after, and what was done', async () => {
    const r = await resultFromCsv(csv);
    const column = r.cleaning.columns?.find(c => c.name === 'Revenue');
    if (blanks === 0) { expect(column).toBeUndefined(); return; }
    expect(column).toMatchObject({
      role: 'revenue', missingBefore: blanks, missingAfter: blanks, action: 'rows_left_out',
      rowsLeftOut: blanks, calculated: 0, unreliable: blanks / rows > 0.4,
    });
    expect(column!.missingBeforePct).toBeCloseTo((blanks / rows) * 100, 1);
    expect(column!.rowsLeftOutPct).toBeCloseTo((blanks / rows) * 100, 1);
  });
});

describe('revenue calculated from price x quantity', () => {
  const lines = ['Order ID,Order Date,Unit Price,Quantity,Revenue'];
  for (let i = 0; i < 40; i += 1) {
    const blank = i % 4 === 0; // 10 blanks
    lines.push([`O-${i}`, dateOf(i), 10 + i, 1 + (i % 3), blank ? '' : (10 + i) * (1 + (i % 3))].join(','));
  }
  const expectedCalculated = Array.from({ length: 10 }, (_, k) => k * 4).map(i => (10 + i) * (1 + (i % 3)));
  const expectedTotal = Array.from({ length: 40 }, (_, i) => (10 + i) * (1 + (i % 3))).reduce((a, b) => a + b, 0);

  it('writes the calculated value into the revenue column, marks it and counts it', async () => {
    const r = await resultFromCsv(lines.join('\n'));
    expect(salesSummary(r).salesTotal).toBe(expectedTotal);
    expect(r.engineeredRows).toHaveLength(40);
    expect(r.excludedRows).toEqual([]);
    const marked = r.engineeredRows.filter(row => row['__revenueCalculated'] === true);
    expect(marked.map(row => Number(row['Revenue']))).toEqual(expectedCalculated);
    expect(r.cleaning.rowsCalculated).toBe(10);
    expect(salesSummary(r).calculatedCount).toBe(10);
    expect(r.cleaning.calculatedCells?.map(c => c.row)).toEqual(Array.from({ length: 10 }, (_, k) => k * 4 + 1));
  });

  it('records a plain cleaning action', async () => {
    const r = await resultFromCsv(lines.join('\n'));
    const action = r.cleaning.actions.find(a => a.type === 'calculate_revenue');
    expect(action).toMatchObject({ column: 'Revenue', count: 10, detail: 'Calculated Revenue as Unit Price x Quantity for 10 rows where Revenue was blank.' });
    expect(action!.detail).not.toContain('—');
    expect(r.cleaning.columns?.find(c => c.name === 'Revenue')).toMatchObject({ action: 'calculated', calculated: 10, missingBefore: 10, missingAfter: 0, rowsLeftOut: 0 });
  });

  it('leaves a blank revenue blank when the price or quantity is also blank', async () => {
    const csv = ['Order ID,Order Date,Unit Price,Quantity,Revenue', '1,2025-01-05,10,2,', '2,2025-01-06,,2,', '3,2025-01-07,10,,', '4,2025-01-08,10,2,20'].join('\n');
    const r = await resultFromCsv(csv);
    expect(r.engineeredRows.map(row => row['Order ID'])).toEqual(['1', '4']);
    expect(r.excludedRows?.map(row => [row.row, row.reason])).toEqual([[2, 'missing_measure'], [3, 'missing_measure']]);
    expect(salesSummary(r).salesTotal).toBe(40);
  });
});

describe('a file with no revenue column', () => {
  const csv = ['Order ID,Order Date,Unit Price,Quantity', '1,2025-01-05,10,2', '2,2025-01-06,,2', '3,2025-01-07,10,', '4,2025-02-08,5,4', '5,2025-02-09,5,1'].join('\n');

  it('never writes a 0 transaction value for a blank price or quantity', async () => {
    const r = await resultFromCsv(csv);
    expect(r.engineeredRows.map(row => row['__transactionValue'])).toEqual([20, 20, 5]);
    expect(r.engineeredRows.every(row => row['__transactionValue'] !== 0)).toBe(true);
    expect(r.excludedRows?.map(row => [row.row, row.reason])).toEqual([[2, 'missing_measure'], [3, 'missing_measure']]);
    expect(salesSummary(r)).toMatchObject({ measureColumn: '__transactionValue', salesTotal: 45 });
  });
});

describe('zero rows', () => {
  const csv = [
    'Order ID,Order Date,Unit Price,Quantity,Revenue',
    '1,2025-01-05,10,2,20',
    '2,2025-01-06,10,0,0',
    '3,2025-01-07,0,3,0',
    '4,2025-01-08,10,2,0',
    '5,2025-02-08,10,1,10',
    '6,2025-02-09,5,2,10',
  ].join('\n');

  it('leaves them out of every measure, keeps them in the data and lists each reason', async () => {
    const r = await resultFromCsv(csv);
    expect(r.source.rowCount).toBe(6);
    expect(r.engineeredRows.map(row => row['Order ID'])).toEqual(['1', '5', '6']);
    expect(r.excludedRows?.map(row => [row.row, row.reason, row.reasonText])).toEqual([
      [2, 'zero_quantity', 'Quantity is 0'],
      [3, 'zero_price', 'Unit Price is 0'],
      [4, 'zero_revenue', 'Revenue is 0'],
    ]);
    expect(r.excludedRows?.[0].values['Order ID']).toBe('2');
    expect(r.cleaning.rowsExcluded).toEqual({ zero_quantity: 1, zero_price: 1, zero_revenue: 1, missing_measure: 0, duplicate: 0 });
    const summary = salesSummary(r);
    expect(summary).toMatchObject({ salesTotal: 40, salesRows: 3, excludedCount: 3 });
    expect(summary.excluded).toEqual({ zero_quantity: 1, zero_price: 1, zero_revenue: 1, missing_measure: 0, duplicate: 0 });
    expect(r.statistics.timeSeries[0].points.map(p => [p.periodKey, p.value, p.count])).toEqual([['2025-01', 20, 1], ['2025-02', 20, 2]]);
    expect(r.cleaning.actions.filter(a => a.type === 'exclude_rows')).toHaveLength(3);
  });
});

describe('returns', () => {
  const csv = [
    'Order ID,Order Date,Quantity,Revenue',
    '1,2025-01-05,2,200',
    '2,2025-01-06,1,100',
    '3,2025-01-07,-1,-100',
    '4,2025-02-08,3,300',
    '5,2025-02-09,2,(50.50)',
  ].join('\n');

  it('keeps negative revenue or quantity out of sales and sums it separately', async () => {
    const r = await resultFromCsv(csv);
    const summary = salesSummary(r);
    expect(summary).toMatchObject({ salesTotal: 600, returnsTotal: 150.5, returnCount: 2, netTotal: 449.5 });
    expect(r.returnRows?.map(row => [row.row, row.amount])).toEqual([[3, 100], [5, 50.5]]);
    expect(r.engineeredRows.map(row => row['Order ID'])).toEqual(['1', '2', '4']);
    expect(r.cleaning.returns).toEqual({ count: 2, total: 150.5 });
    expect(r.statistics.timeSeries[0].points.map(p => [p.periodKey, p.value])).toEqual([['2025-01', 300], ['2025-02', 300]]);
    expect(r.ml.segmentation?.basis ?? 'Spend counts sales only. Returns are left out.').toContain('Returns are left out');
  });
});

describe('blank categories', () => {
  const lines = ['Order ID,Order Date,Region,Revenue'];
  let blankSum = 0, blankCount = 0, total = 0;
  for (let i = 0; i < 60; i += 1) {
    const blank = i % 10 < 3; // 30% blank
    const revenue = 100 + (i % 5) * 10;
    total += revenue;
    if (blank) { blankSum += revenue; blankCount += 1; }
    lines.push([`O-${i}`, dateOf(i), blank ? '' : ['London', 'North', 'South West'][i % 3], revenue].join(','));
  }
  const csv = lines.join('\n');

  it('changes no cell and fills nothing', async () => {
    const r = await resultFromCsv(csv);
    expect(r.cleaning.cellsImputed).toBe(0);
    expect(r.cleaning.actions.filter(a => a.type.startsWith('impute'))).toEqual([]);
    expect(r.engineeredRows.filter(row => row['Region'] === '')).toHaveLength(blankCount);
    expect(r.cleaning.columns?.find(c => c.name === 'Region')).toMatchObject({ missingBefore: blankCount, missingAfter: blankCount, action: 'shown_as_missing', unreliable: false });
  });

  it('shows a (Missing) group with the right sales and count in the category breakdown', async () => {
    const r = await resultFromCsv(csv);
    const breakdown = computeCategoryBreakdown(r.engineeredRows, 'Region', 'Revenue');
    const missing = breakdown.find(row => row.label === MISSING_LABEL);
    expect(missing).toMatchObject({ value: blankSum, count: blankCount });
    expect(breakdown.reduce((sum, row) => sum + row.value, 0)).toBe(total);
    expect(breakdown.reduce((sum, row) => sum + row.count, 0)).toBe(60);
  });

  it('shows the (Missing) group in the slicers, counted and summed', async () => {
    const r = await resultFromCsv(csv);
    const dims = findSliceDimensions(r.semantics.columns, r.engineeredRows);
    const region = dims.find(d => d.column === 'Region');
    expect(region?.values).toContain(MISSING_LABEL);
    const cube = buildSalesCube(r.engineeredRows, 'Revenue', dims);
    const dim = cube.dimensions.find(d => d.column === 'Region')!;
    expect(dim.whole.get(MISSING_LABEL)).toBe(blankSum);
    const slice = shareSlice(cube, initialSlice('Region'))!;
    expect(slice.items.find(item => item.label === MISSING_LABEL)).toMatchObject({ value: blankSum, rows: blankCount });
    expect(slice.total).toBe(total);
  });

  it('is flagged unreliable when over 40% of a column is blank', async () => {
    const heavy = ['Order ID,Order Date,Region,Revenue'];
    for (let i = 0; i < 30; i += 1) heavy.push([`O-${i}`, dateOf(i), i % 10 < 5 ? '' : ['London', 'North'][i % 2], 100].join(','));
    const r = await resultFromCsv(heavy.join('\n'));
    expect(r.cleaning.columns?.find(c => c.name === 'Region')).toMatchObject({ missingBefore: 15, missingBeforePct: 50, unreliable: true });
  });
});

describe('a blank measure is never filled and never a 0', () => {
  it('leaves blank price, quantity and cost cells blank, and skips them in margins', async () => {
    const csv = ['Order ID,Order Date,Unit Price,Quantity,Cost,Revenue', '1,2025-01-05,10,2,5,20', '2,2025-01-06,10,2,,20', '3,2025-01-07,,2,5,20', '4,2025-01-08,10,,5,20'].join('\n');
    const r = await resultFromCsv(csv);
    expect(r.cleaning.cellsImputed).toBe(0);
    expect(r.engineeredRows.map(row => row['Cost'])).toEqual(['5', '', '5', '5']);
    expect(r.engineeredRows.map(row => row['__margin'])).toEqual([15, undefined, 15, 15]);
    expect(r.engineeredRows.map(row => row['Unit Price'])).toEqual(['10', '10', '', '10']);
    expect(r.engineeredRows.map(row => row['Quantity'])).toEqual(['2', '2', '2', '']);
  });
});

describe('blank is never 0 in the pure helpers', () => {
  const rows: EngineeredRow[] = [
    { Product: 'A', Revenue: '10', __monthKey: '2025-01', __monthLabel: 'Jan 25' },
    { Product: 'A', Revenue: '', __monthKey: '2025-01', __monthLabel: 'Jan 25' },
    { Product: 'B', Revenue: '  ', __monthKey: '2025-02', __monthLabel: 'Feb 25' },
    { Product: 'B', Revenue: '30', __monthKey: '2025-02', __monthLabel: 'Feb 25' },
  ];

  it('slicing counts only the rows that hold a number', () => {
    const cube = buildSalesCube(rows, 'Revenue', [{ column: 'Product', role: 'product', values: ['A', 'B'] }]);
    expect(cube.months.map(m => [m.key, m.total, m.rows])).toEqual([['2025-01', 10, 1], ['2025-02', 30, 1]]);
    expect(cube.wholeTotal).toBe(40);
    expect(trendSlice(cube, initialSlice('Product')).rows).toBe(2);
  });

  it('category breakdown counts only the rows that hold a number', () => {
    const breakdown = computeCategoryBreakdown(rows, 'Product', 'Revenue');
    expect(breakdown).toEqual([{ label: 'B', value: 30, count: 1, pct: 75 }, { label: 'A', value: 10, count: 1, pct: 25 }]);
  });

  it('the row rule treats a blank as missing, never zero', () => {
    const cols = { revenue: 'Revenue' };
    expect(classifyRow({ Revenue: '' }, cols)).toEqual({ kind: 'excluded', reason: 'missing_measure' });
    expect(classifyRow({ Revenue: '0' }, cols)).toEqual({ kind: 'excluded', reason: 'zero_revenue' });
    expect(classifyRow({ Revenue: '-5' }, cols)).toEqual({ kind: 'return', value: -5 });
    expect(classifyRow({ Revenue: '5' }, cols)).toEqual({ kind: 'sales', value: 5, calculated: false });
    expect(classifyRow({ Revenue: '', P: '2', Q: '3' }, { revenue: 'Revenue', price: 'P', quantity: 'Q' })).toEqual({ kind: 'sales', value: 6, calculated: true });
  });
});

describe('duplicates', () => {
  const withKey = ['Order ID,Order Date,Region,Revenue', ...Array.from({ length: 20 }, (_, i) => `O-${i},${dateOf(i)},${['London', 'North'][i % 2]},100`), 'O-5,' + dateOf(5) + ',North,100'].join('\n');
  const withoutKey = ['Order Date,Region,Revenue', ...Array.from({ length: 20 }, (_, i) => `${dateOf(i)},${['London', 'North'][i % 2]},${100 + i}`), `${dateOf(5)},North,105`].join('\n');

  it('excludes and lists a repeated row when the file has a unique ID column', async () => {
    const r = await resultFromCsv(withKey);
    expect(r.source.rowCount).toBe(21);
    expect(r.engineeredRows).toHaveLength(20);
    expect(salesSummary(r).salesTotal).toBe(2000);
    expect(r.excludedRows).toEqual([expect.objectContaining({ row: 21, reason: 'duplicate', duplicateOf: 6, reasonText: 'Duplicate of row 6' })]);
    expect(r.cleaning).toMatchObject({ duplicateRowCount: 1, duplicateHandling: 'excluded', duplicateRows: [{ row: 21, sameAs: 6 }] });
    expect(r.cleaning.rowsExcluded?.duplicate).toBe(1);
    expect(r.cleaning.actions.some(a => a.type === 'remove_duplicate_rows')).toBe(false);
  });

  it('keeps a repeated row in the totals and only flags it when the file has no unique ID', async () => {
    const r = await resultFromCsv(withoutKey);
    expect(r.source.rowCount).toBe(21);
    expect(r.engineeredRows).toHaveLength(21);
    expect(r.excludedRows).toEqual([]);
    expect(salesSummary(r).salesTotal).toBe(Array.from({ length: 20 }, (_, i) => 100 + i).reduce((a, b) => a + b, 0) + 105);
    expect(r.cleaning).toMatchObject({ duplicateRowCount: 1, duplicateHandling: 'flagged', duplicateRows: [{ row: 21, sameAs: 6 }] });
    expect(r.cleaning.actions.find(a => a.type === 'flag_possible_duplicates')?.count).toBe(1);
  });
});

describe('results saved before these fields existed', () => {
  it('still summarise: no excluded rows, no returns, nothing calculated', async () => {
    const r: PipelineResult = await resultFromCsv(revenueCsv(24, () => false).csv);
    const old = { ...r, excludedRows: undefined, returnRows: undefined, cleaning: { actions: [], rowsBefore: 24, rowsAfter: 24, cellsImputed: 0 } };
    expect(salesSummary(old)).toMatchObject({ excludedCount: 0, returnCount: 0, returnsTotal: 0, calculatedCount: 0, salesTotal: salesSummary(r).salesTotal });
    expect(r.pipelineVersion).toBe(2);
  });
});

describe('the story says what was left out', () => {
  it('adds notes for left-out rows, returns and calculated revenue, each number backed by a fact', async () => {
    const csv = [
      'Order ID,Order Date,Unit Price,Quantity,Revenue',
      '1,2025-01-05,10,2,20', '2,2025-01-06,10,0,0', '3,2025-01-07,10,2,', '4,2025-02-08,10,-1,-10', '5,2025-02-09,10,3,30',
    ].join('\n');
    const r = await resultFromCsv(csv);
    const outcome = buildStory('quality', r, { teamMembers: 0, auditEvents: 0, today: new Date('2026-03-10T09:00:00Z') });
    expectHealthy(outcome, 'quality');
    if (outcome.kind !== 'story') throw new Error('expected a story');
    const notes = outcome.notes.join(' ');
    expect(notes).toContain('1 row with a zero, blank or unusable sales amount is left out of sales totals.');
    expect(notes).toContain('1 return worth £10 is counted apart from sales.');
    expect(notes).toContain('Revenue was calculated as price x quantity for 1 row where it was blank.');
  });
});

describe('rows with no date', () => {
  const csv = [
    'Order ID,Order Date,Revenue',
    '1,2025-01-05,100', '2,2025-01-06,100', '3,2025-02-05,100', '4,,200', '5,2025-02-09,100', '6,2025-03-09,100', '7,2025-03-10,100',
  ].join('\n');

  it('keeps them in the total, leaves them out of the series, and says so', async () => {
    const r = await resultFromCsv(csv);
    expect(salesSummary(r).salesTotal).toBe(800);
    expect(getRevenueView(r).total).toBe(800);
    expect(r.statistics.timeSeries[0].points.reduce((sum, p) => sum + p.value, 0)).toBe(600);
    expect(r.undatedRows).toMatchObject({ count: 1, value: 200, measureColumn: 'Revenue' });
    expect(r.undatedRows?.sentence).toBe('1 row has no date. It is counted in total sales but not in the monthly trend, forecast or seasonality (200).');
    expect(r.cleaning.undatedRows).toEqual(r.undatedRows);
    expect(r.cleaning.actions.find(a => a.type === 'flag_undated_rows')).toMatchObject({ count: 1, detail: r.undatedRows?.sentence });
  });

  it('mentions them in the quality story with the numbers registered as facts', async () => {
    const r = await resultFromCsv(csv);
    const outcome = buildStory('quality', r, { teamMembers: 0, auditEvents: 0, today: new Date('2026-03-10T09:00:00Z') });
    expectHealthy(outcome, 'quality');
    if (outcome.kind !== 'story') throw new Error('expected a story');
    expect(outcome.notes.join(' ')).toContain('1 row has no date. It is counted in total sales but not in the monthly trend, forecast or seasonality (£200).');
  });

  it('adds nothing when every row is dated', async () => {
    const r = await resultFromCsv(revenueCsv(24, () => false).csv);
    expect(r.undatedRows).toBeUndefined();
    expect(r.cleaning.actions.some(a => a.type === 'flag_undated_rows')).toBe(false);
  });
});

describe('a blank category is not a concentration risk', () => {
  function categoryCsv(blank: (i: number) => boolean, rows = 60): string {
    const lines = ['Order ID,Order Date,Product Category,Revenue'];
    for (let i = 0; i < rows; i += 1) lines.push([`O-${i}`, dateOf(i), blank(i) ? '' : ['Analytics', 'Advisory', 'Support'][i % 3], 100].join(','));
    return lines.join('\n');
  }

  it('judges concentration over named categories only and raises a separate data-quality finding', async () => {
    const r = await resultFromCsv(categoryCsv(i => i % 5 < 2)); // 40% blank
    const titles = r.decision.risks.map(risk => risk.title);
    expect(r.decision.risks.some(risk => risk.desc.includes('"(Missing)"'))).toBe(false);
    const finding = r.decision.risks.find(risk => risk.title.startsWith('Missing '));
    expect(finding).toMatchObject({ level: 'medium', title: 'Missing Product Category on 40% of Revenue', desc: '40% of Revenue has no Product Category. Fill in the column at the source so breakdowns by it add up.' });
    expect(titles.filter(t => /Concentration|Diversification/.test(t))).toHaveLength(1);
    expect(r.decision.recommendations.some(rec => rec.title === 'Fill in the blank Product Category values')).toBe(true);
  });

  it('raises no finding below 10% of revenue', async () => {
    const r = await resultFromCsv(categoryCsv(i => i % 20 === 0)); // 5% blank
    expect(r.decision.risks.some(risk => risk.title.startsWith('Missing '))).toBe(false);
  });
});

describe('the Governance page lists the rows left out', () => {
  const rowsCsv = ['Order ID,Order Date,Quantity,Revenue', ...Array.from({ length: 205 }, (_, i) => `${i},${dateOf(i % 60)},${i % 2 ? 0 : 1},${i % 2 ? 0 : 10}`)].join('\n');

  it('shows row number, reason and values, the first 200, then "and N more"', async () => {
    const r = await resultFromCsv(rowsCsv);
    expect(r.excludedRows).toHaveLength(102);
    const html = renderToStaticMarkup(createElement(PageEvidence, { r }));
    expect(html).toContain('Rows left out');
    expect(html).toContain('Quantity is 0');
    expect(html).toContain('Order ID: 1 ');
    expect(html).not.toContain('and 2 more');
  });

  it('truncates after 200 rows', async () => {
    const big = ['Order ID,Order Date,Quantity,Revenue', ...Array.from({ length: 450 }, (_, i) => `${i},${dateOf(i % 60)},0,0`), `x,${dateOf(1)},1,10`].join('\n');
    const r = await resultFromCsv(big);
    const html = renderToStaticMarkup(createElement(PageEvidence, { r }));
    expect(html).toContain('and 250 more');
  });

  it('shows no section when nothing was left out', async () => {
    const r = await resultFromCsv(revenueCsv(24, () => false).csv);
    expect(renderToStaticMarkup(createElement(PageEvidence, { r }))).not.toContain('Rows left out');
  });
});
