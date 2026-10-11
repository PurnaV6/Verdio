import { describe, expect, it } from "vitest";
import { demoResult, resultFromCsv, salesCsv } from "../story/testkit";
import { CANNOT_COMPARE_HEADLINE, compareUploads, periodName, takeSnapshot } from "./uploadComparison";
import type { ChangeRow, UploadComparison, UploadSnapshot } from "./uploadComparison";

/* Real pipeline runs for the snapshot, plain objects for the edge cases. */

function changed(comparison: UploadComparison | null): Extract<UploadComparison, { kind: 'changed' }> {
  if (!comparison || comparison.kind !== 'changed') throw new Error(`expected a change list, got ${comparison?.kind ?? 'null'}`);
  return comparison;
}

function rowOf(comparison: Extract<UploadComparison, { kind: 'changed' }>, id: ChangeRow['id']): ChangeRow {
  const found = comparison.rows.find(item => item.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
}

function snapshot(overrides: Partial<UploadSnapshot> = {}): UploadSnapshot {
  return {
    fileName: 'before.csv', revenueColumn: 'Revenue', dateColumn: 'Order Date', totalSales: 40000,
    latestMonth: { key: '2024-06', value: 7000 }, monthKeys: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'],
    health: 70, quality: 85, risks: { total: 4, high: 1, medium: 2, low: 1 },
    customers: { total: 50, segments: { champion: 10, loyal: 15, new: 10, atRisk: 10, lost: 5 } },
    ...overrides,
  };
}

describe("takeSnapshot", () => {
  it("keeps names, totals and counts from the demo workspace and nothing row-level", async () => {
    const result = await demoResult();
    const kept = takeSnapshot(result);
    expect(kept.fileName).toBe(result.source.fileName);
    expect(kept.revenueColumn).toBe(result.semantics.columns.find(column => column.businessRole === 'revenue')?.columnName);
    expect(kept.dateColumn).toBe(result.statistics.timeSeries[0].dateColumn);
    expect(kept.monthKeys).toHaveLength(result.statistics.timeSeries[0].points.length);
    expect(kept.latestMonth?.key).toBe(result.statistics.timeSeries[0].points.at(-1)?.periodKey);
    expect(kept.health).toBe(result.decision.health.total);
    expect(kept.risks.total).toBe(result.decision.risks.length);
    expect(kept.risks.high + kept.risks.medium + kept.risks.low).toBe(kept.risks.total);
    expect(kept.customers?.total).toBe(result.ml.segmentation?.segments.length);
    expect(Object.keys(kept).sort()).toEqual(['customers', 'dateColumn', 'fileName', 'health', 'latestMonth', 'monthKeys', 'quality', 'revenueColumn', 'risks', 'totalSales']);
    // Small enough to hold in memory for a session: far smaller than the rows it summarises.
    expect(JSON.stringify(kept).length).toBeLessThan(2000);
  });
});

describe("compareUploads: no earlier snapshot", () => {
  it("returns null so the panel is not shown on a first upload", () => {
    expect(compareUploads(null, snapshot())).toBeNull();
  });
});

describe("compareUploads: identical file", () => {
  it("says nothing changed for the same demo file uploaded twice", async () => {
    const kept = takeSnapshot(await demoResult());
    const comparison = compareUploads(kept, kept);
    expect(comparison?.kind).toBe('same');
    if (comparison?.kind !== 'same') return;
    expect(comparison.headline).toBe('Nothing changed.');
    expect(comparison.detail).toContain(kept.fileName);
  });

  it("still says nothing changed when only the file name differs, and names both files", () => {
    const comparison = compareUploads(snapshot({ fileName: 'march.csv' }), snapshot({ fileName: 'march (copy).csv' }));
    expect(comparison).toMatchObject({ kind: 'same' });
    if (comparison?.kind === 'same') expect(comparison.detail).toBe('march (copy).csv gives the same numbers as march.csv, the file you uploaded before it.');
  });

  it("does not call a file with a different risk mix identical", () => {
    const comparison = changed(compareUploads(snapshot(), snapshot({ risks: { total: 4, high: 2, medium: 1, low: 1 } })));
    expect(rowOf(comparison, 'risks')).toMatchObject({ direction: 'same', word: 'Same number, different levels' });
  });
});

describe("compareUploads: files that do not measure the same thing", () => {
  it("refuses, with the reason, when the revenue columns differ", () => {
    const comparison = compareUploads(snapshot({ revenueColumn: 'Revenue' }), snapshot({ fileName: 'units.csv', revenueColumn: 'Units' }));
    expect(comparison).toEqual({
      kind: 'cannotCompare', previousFile: 'before.csv', currentFile: 'units.csv',
      headline: 'These files do not measure the same thing, so Verd.io cannot compare them.',
      reason: 'before.csv measures "Revenue" and units.csv measures "Units".',
    });
    expect(CANNOT_COMPARE_HEADLINE).toMatch(/do not measure the same thing, so Verd.io cannot compare them/);
  });

  it("refuses when either file has no sales column, and says which", () => {
    const missing = compareUploads(snapshot(), snapshot({ fileName: 'stock.csv', revenueColumn: null, totalSales: null }));
    expect(missing).toMatchObject({ kind: 'cannotCompare', reason: 'stock.csv has no sales column, and before.csv measures "Revenue".' });
    const neither = compareUploads(snapshot({ revenueColumn: null }), snapshot({ fileName: 'stock.csv', revenueColumn: null }));
    expect(neither).toMatchObject({ kind: 'cannotCompare', reason: 'Neither before.csv nor stock.csv has a sales column Verd.io could identify.' });
  });

  it("treats a column name that differs only in case or spacing as the same measure", () => {
    const comparison = compareUploads(snapshot(), snapshot({ fileName: 'after.csv', revenueColumn: ' revenue ', totalSales: 45000 }));
    expect(comparison?.kind).toBe('changed');
  });

  it("refuses for real files whose sales columns have different names", async () => {
    const revenue = await resultFromCsv(salesCsv({ months: 6 }), 'revenue.csv');
    const turnover = await resultFromCsv(salesCsv({ months: 6 }).replace('Revenue', 'Turnover'), 'turnover.csv');
    const comparison = compareUploads(takeSnapshot(revenue), takeSnapshot(turnover));
    expect(comparison?.kind).toBe('cannotCompare');
  });
});

describe("compareUploads: what changed", () => {
  it("words each figure with a glyph, a word and the numbers behind it", () => {
    const comparison = changed(compareUploads(snapshot(), snapshot({
      fileName: 'after.csv', totalSales: 46000, latestMonth: { key: '2024-06', value: 6500 },
      health: 76, quality: 85, risks: { total: 3, high: 0, medium: 2, low: 1 },
      customers: { total: 60, segments: { champion: 12, loyal: 20, new: 10, atRisk: 12, lost: 6 } },
    })));
    expect(comparison.headline).toBe('Compared with before.csv, the file you uploaded before this one.');
    expect(comparison.spanNote).toBeNull();
    expect(rowOf(comparison, 'sales')).toEqual({ id: 'sales', label: 'Total sales', direction: 'up', glyph: '↑', word: 'Up £6,000', detail: 'Now £46,000, was £40,000.' });
    expect(rowOf(comparison, 'latest')).toMatchObject({ label: 'Sales in June 2024', direction: 'down', glyph: '↓', word: 'Down £500', detail: 'Now £6,500, was £7,000.' });
    expect(rowOf(comparison, 'health')).toMatchObject({ direction: 'up', word: 'Up 6 points', detail: 'Now 76 out of 100, was 70 out of 100.' });
    expect(rowOf(comparison, 'quality')).toMatchObject({ direction: 'same', glyph: '=', word: 'No change' });
    expect(rowOf(comparison, 'risks')).toMatchObject({ direction: 'down', word: 'Down 1 risk', detail: 'Now 3 (0 high, 2 medium, 1 low), was 4 (1 high, 2 medium, 1 low).' });
    expect(rowOf(comparison, 'atRisk')).toMatchObject({ direction: 'up', word: 'Up 2 customers', detail: 'Now 12 of 60 customers, was 10 of 50 customers.' });
    expect(rowOf(comparison, 'months')).toMatchObject({ direction: 'same', word: 'No new months' });
  });

  it("counts new months added when the new file extends the old one, and flags the different span", () => {
    const longer = [...snapshot().monthKeys, '2024-07', '2024-08', '2024-09'];
    const comparison = changed(compareUploads(snapshot(), snapshot({
      fileName: 'after.csv', monthKeys: longer, latestMonth: { key: '2024-09', value: 9100 }, totalSales: 62000,
    })));
    expect(rowOf(comparison, 'months')).toEqual({
      id: 'months', label: 'New months added', direction: 'up', glyph: '↑', word: '3 new months',
      detail: 'Now January 2024 to September 2024, 9 months; was January 2024 to June 2024, 6 months.',
    });
    expect(rowOf(comparison, 'latest')).toMatchObject({
      label: 'Latest month', direction: 'up', word: 'Up £2,100', detail: 'September 2024 was £9,100, June 2024 was £7,000.',
    });
    expect(comparison.spanNote).toBe('The two files cover different months, so the totals are not like for like.');
  });

  it("does not invent a month count when the files cover different months", () => {
    const shifted = ['2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'];
    const comparison = changed(compareUploads(snapshot(), snapshot({ monthKeys: shifted, latestMonth: { key: '2024-09', value: 8000 } })));
    expect(rowOf(comparison, 'months')).toMatchObject({ direction: null, glyph: '', word: 'Different months' });
    expect(comparison.spanNote).not.toBeNull();
  });

  it("does not compare a figure one file does not have", () => {
    const comparison = changed(compareUploads(snapshot(), snapshot({ fileName: 'after.csv', customers: null, totalSales: 41000, health: 71 })));
    expect(rowOf(comparison, 'atRisk')).toEqual({
      id: 'atRisk', label: 'Customers at risk', direction: null, glyph: '', word: 'Not compared', detail: 'after.csv has no customer analysis.',
    });
    const noDates = changed(compareUploads(snapshot(), snapshot({ fileName: 'after.csv', latestMonth: null, monthKeys: [], dateColumn: null, totalSales: 41000 })));
    expect(rowOf(noDates, 'latest').direction).toBeNull();
    expect(rowOf(noDates, 'months')).toMatchObject({ direction: null, detail: 'after.csv has no dated sales.' });
    expect(noDates.spanNote).toBeNull();
  });

  it("compares two real files that measure the same thing, one with three more months", async () => {
    const earlier = takeSnapshot(await resultFromCsv(salesCsv({ months: 9 }), 'to-september.csv'));
    const later = takeSnapshot(await resultFromCsv(salesCsv({ months: 12 }), 'to-december.csv'));
    const comparison = changed(compareUploads(earlier, later));
    expect(rowOf(comparison, 'months')).toMatchObject({ direction: 'up', word: '3 new months' });
    expect(rowOf(comparison, 'sales').direction).toBe('up');
    expect(comparison.spanNote).not.toBeNull();
    expect(later.monthKeys.length - earlier.monthKeys.length).toBe(3);
  });
});

/** Every integer in a string, with thousands separators removed. */
function integersIn(text: string): number[] {
  return (text.replace(/(\d),(\d)/g, '$1$2').match(/\d+/g) ?? []).map(Number);
}

describe("compareUploads: every number is a snapshot value or a difference of two", () => {
  function allowed(previous: UploadSnapshot, current: UploadSnapshot): Set<number> {
    const pairs: [number, number][] = [
      [previous.totalSales ?? 0, current.totalSales ?? 0],
      [previous.latestMonth?.value ?? 0, current.latestMonth?.value ?? 0],
      [previous.health, current.health], [previous.quality, current.quality],
      [previous.risks.total, current.risks.total], [previous.monthKeys.length, current.monthKeys.length],
      [previous.customers?.segments.atRisk ?? 0, current.customers?.segments.atRisk ?? 0],
    ].map(([a, b]) => [Math.round(a), Math.round(b)]);
    const values = new Set<number>([100]);
    for (const [a, b] of pairs) { values.add(a); values.add(b); values.add(Math.abs(b - a)); }
    for (const side of [previous, current]) {
      values.add(Math.round(side.latestMonth?.value ?? 0));
      for (const key of ['total', 'high', 'medium', 'low'] as const) values.add(side.risks[key]);
      values.add(side.customers?.total ?? 0);
      for (const key of side.monthKeys) { values.add(Number(key.slice(0, 4))); }
    }
    return values;
  }

  function numbersShown(comparison: Extract<UploadComparison, { kind: 'changed' }>): number[] {
    return comparison.rows.flatMap(item => [
      // Month names carry a year and the file names are not numbers the panel computes.
      ...integersIn(item.word), ...integersIn(item.detail.replace(/\b[A-Z][a-z]+ \d{4}\b/g, month => month.replace(/\d{4}/, ''))),
    ]);
  }

  it("holds for two real files with different months and different customers", async () => {
    const earlier = takeSnapshot(await resultFromCsv(salesCsv({ months: 9, monthly: month => 1000 + month * 40 }), 'a.csv'));
    const later = takeSnapshot(await resultFromCsv(salesCsv({ months: 14, monthly: month => 1400 + month * 25 }), 'b.csv'));
    const comparison = changed(compareUploads(earlier, later));
    const ok = allowed(earlier, later);
    const stray = numbersShown(comparison).filter(value => !ok.has(value));
    expect(stray).toEqual([]);
    expect(numbersShown(comparison).length).toBeGreaterThan(10);
  });

  it("holds for the demo workspace against a shorter real file", async () => {
    const demo = takeSnapshot(await demoResult());
    const small = takeSnapshot(await resultFromCsv(salesCsv({ months: 6 }), 'small.csv'));
    const comparison = compareUploads(small, demo);
    if (comparison?.kind === 'cannotCompare') {
      // Different sales column names: nothing numeric is said at all.
      expect(integersIn(comparison.reason)).toEqual([]);
      return;
    }
    const ok = allowed(small, demo);
    expect(numbersShown(changed(comparison)).filter(value => !ok.has(value))).toEqual([]);
  });

  it("holds for the hand-made snapshots too", () => {
    const earlier = snapshot();
    const later = snapshot({
      totalSales: 47123.6, latestMonth: { key: '2024-09', value: 9100.4 }, health: 64, quality: 90,
      monthKeys: [...earlier.monthKeys, '2024-07', '2024-08', '2024-09'], risks: { total: 7, high: 2, medium: 3, low: 2 },
      customers: { total: 80, segments: { champion: 12, loyal: 30, new: 13, atRisk: 20, lost: 5 } },
    });
    const comparison = changed(compareUploads(earlier, later));
    const ok = allowed(earlier, later);
    expect(numbersShown(comparison).filter(value => !ok.has(value))).toEqual([]);
    expect(rowOf(comparison, 'sales').word).toBe(`Up £${(47124 - 40000).toLocaleString('en-GB')}`);
  });
});

describe("periodName", () => {
  it("spells a month key out and leaves anything else alone", () => {
    expect(periodName('2025-03')).toBe('March 2025');
    expect(periodName('2025-W10')).toBe('2025-W10');
  });
});
