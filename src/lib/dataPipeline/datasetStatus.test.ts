import { describe, expect, it } from "vitest";
import { computeDatasetStatus, pctText, STATUS_LABEL, STATUS_THRESHOLDS, READY_REASON } from "./datasetStatus";
import type { ColumnCleaning, CleaningReport, ExcludedReason } from "../../types/dataPipeline";
import type { PipelineResult } from "../../types/pipeline";
import type { BusinessRole, ColumnSemantics } from "../../types/semantic";

/* The status is read from fields the pipeline already records, so these tests build those fields by hand and
   probe every limit just under, at and just over. Whole-pipeline checks are in datasetStatus.pipeline.test.ts. */

const column = (name: string, businessRole: BusinessRole): ColumnSemantics =>
  ({ columnName: name, businessRole, confidence: 0.9, evidence: [], needsReview: false, alternatives: [] }) as unknown as ColumnSemantics;

const SEMANTICS = {
  columns: [column('Order Date', 'date'), column('Revenue', 'revenue'), column('Region', 'location'), column('Units', 'quantity')],
  warnings: [],
} as unknown as PipelineResult['semantics'];

function missing(name: string, role: string, before: number, rows: number, action: ColumnCleaning['action'], after = before): ColumnCleaning {
  return {
    name, role, missingBefore: before, missingBeforePct: (before / rows) * 100, missingAfter: after, missingAfterPct: (after / rows) * 100,
    action, actionText: '', calculated: 0, rowsLeftOut: 0, rowsLeftOutPct: 0, unreliable: before / rows > 0.4,
  };
}

interface Shape {
  rows?: number;
  excluded?: Partial<Record<ExcludedReason, number>>;
  columns?: ColumnCleaning[];
  calculated?: number;
  returns?: number;
  usable?: number;
  semantics?: PipelineResult['semantics'];
}

function status(shape: Shape = {}) {
  const rows = shape.rows ?? 100;
  const excluded = { zero_quantity: 0, zero_price: 0, zero_revenue: 0, missing_measure: 0, duplicate: 0, ...shape.excluded };
  const cleaning = {
    actions: [], rowsBefore: rows, rowsAfter: rows, cellsImputed: 0,
    columns: shape.columns ?? [], rowsExcluded: excluded, rowsCalculated: shape.calculated ?? 0,
    returns: { count: shape.returns ?? 0, total: 0 },
  } as CleaningReport;
  const left = excluded.zero_quantity + excluded.zero_price + excluded.zero_revenue + excluded.missing_measure + excluded.duplicate;
  return computeDatasetStatus({ cleaning, semantics: shape.semantics ?? SEMANTICS, analysisRowCount: shape.usable ?? rows - left - (shape.returns ?? 0) });
}

const ids = (s: ReturnType<typeof status>) => s.triggers.map(t => t.id);

describe("thresholds are named constants", () => {
  it("holds the approved limits", () => {
    expect(STATUS_THRESHOLDS).toEqual({
      datesBlankFromPct: 5, datesBlankOverPct: 20, rowsLeftOutFromPct: 2, rowsLeftOutOverPct: 10, descriptiveBlankOverPct: 40,
      calculatedRevenueOverPct: 25, negativeAmountsOverPct: 5, revenueBlankFromPct: 40, revenueBlankOverPct: 60, minUsableRows: 10, minSurvivingPct: 10,
    });
  });
});

describe("a file with nothing wrong is ready", () => {
  it("has no triggers and says so", () => {
    const s = status();
    expect(s.status).toBe('ready');
    expect(s.triggers).toEqual([]);
    expect(s.reasons).toEqual([READY_REASON]);
  });
});

describe("dates blank: 5 to 20 percent is a caveat, over 20 is incomplete", () => {
  const dates = (n: number) => status({ columns: [missing('Order Date', 'date', n, 100, 'left_blank')] });
  it("4 of 100 is fine", () => expect(dates(4).status).toBe('ready'));
  it("5 of 100 is a caveat (at the limit)", () => { expect(dates(5).status).toBe('caveats'); expect(ids(dates(5))).toEqual(['dates_blank_some']); });
  it("20 of 100 is still a caveat (at the limit)", () => expect(dates(20).status).toBe('caveats'));
  it("21 of 100 is incomplete", () => { expect(dates(21).status).toBe('incomplete'); expect(ids(dates(21))).toEqual(['dates_blank_many']); });
  it("is decided on the exact share, not the rounded one", () => {
    const s = status({ rows: 1000, columns: [missing('Order Date', 'date', 200, 1000, 'left_blank')] });
    expect(s.status).toBe('caveats');
    const over = status({ rows: 1000, columns: [missing('Order Date', 'date', 201, 1000, 'left_blank')] });
    expect(over.status).toBe('incomplete');
  });
});

describe("rows left out: 2 to 10 percent is a caveat, over 10 is incomplete", () => {
  const left = (n: number) => status({ excluded: { zero_quantity: n } });
  it("1 of 100 is fine", () => expect(left(1).status).toBe('ready'));
  it("2 of 100 is a caveat (at the limit)", () => { expect(left(2).status).toBe('caveats'); expect(ids(left(2))).toEqual(['rows_left_out_some']); });
  it("10 of 100 is still a caveat (at the limit)", () => expect(left(10).status).toBe('caveats'));
  it("11 of 100 is incomplete", () => { expect(left(11).status).toBe('incomplete'); expect(ids(left(11))).toEqual(['rows_left_out_many']); });
  it("counts zero price, zero revenue and blank amounts too", () => {
    expect(status({ excluded: { zero_price: 1, zero_revenue: 1 } }).status).toBe('caveats');
    expect(status({ excluded: { missing_measure: 2 } }).status).toBe('caveats');
  });
  it("does not count returns as left out", () => {
    const s = status({ returns: 8 });
    expect(ids(s)).toEqual(['negative_amounts']);
  });
  it("takes the share of the rows left after repeated rows are set aside", () => {
    // 10 repeated rows leave 90; 9 left out is exactly 10 percent of 90: a caveat. 10 left out is over.
    expect(status({ excluded: { duplicate: 10, zero_quantity: 9 } }).status).toBe('caveats');
    expect(status({ excluded: { duplicate: 10, zero_quantity: 10 } }).status).toBe('incomplete');
  });
  it("does not count the repeated rows themselves as left out", () => {
    expect(status({ excluded: { duplicate: 30 } }).status).toBe('ready');
  });
});

describe("a descriptive column over 40 percent blank is a caveat", () => {
  const region = (n: number) => status({ columns: [missing('Region', 'location', n, 100, 'shown_as_missing')] });
  it("40 of 100 is fine (at the limit)", () => expect(region(40).status).toBe('ready'));
  it("41 of 100 is a caveat", () => { expect(region(41).status).toBe('caveats'); expect(ids(region(41))).toEqual(['descriptive_blank']); });
  it("39 of 100 is fine", () => expect(region(39).status).toBe('ready'));
  it("ignores a measure column that is left blank", () => {
    expect(status({ columns: [missing('Units', 'quantity', 70, 100, 'left_blank')] }).status).toBe('ready');
  });
  it("lists every such column in one reason, with its own numbers", () => {
    const s = status({ columns: [missing('Region', 'location', 52, 100, 'shown_as_missing'), missing('Channel', 'category', 45, 100, 'shown_as_missing'), missing('Segment', 'category', 41, 100, 'shown_as_missing'), missing('Tier', 'category', 60, 100, 'shown_as_missing')] });
    expect(s.triggers).toHaveLength(1);
    expect(s.triggers[0].details?.map(d => d.column)).toEqual(['Tier', 'Region', 'Channel', 'Segment']);
    expect(s.reasons[0]).toContain('Tier 60% (60 of 100)');
    expect(s.reasons[0]).toContain('and 1 more');
  });
});

describe("revenue calculated on over 25 percent of rows is a caveat", () => {
  it("25 of 100 is fine (at the limit)", () => expect(status({ calculated: 25 }).status).toBe('ready'));
  it("26 of 100 is a caveat", () => { expect(status({ calculated: 26 }).status).toBe('caveats'); expect(ids(status({ calculated: 26 }))).toEqual(['revenue_calculated']); });
  it("24 of 100 is fine", () => expect(status({ calculated: 24 }).status).toBe('ready'));
});

describe("negative amounts over 5 percent of rows is a caveat", () => {
  it("5 of 100 is fine (at the limit)", () => expect(status({ returns: 5 }).status).toBe('ready'));
  it("6 of 100 is a caveat", () => { expect(status({ returns: 6 }).status).toBe('caveats'); expect(ids(status({ returns: 6 }))).toEqual(['negative_amounts']); });
  it("4 of 100 is fine", () => expect(status({ returns: 4 }).status).toBe('ready'));
});

describe("revenue blank after calculation: 40 to 60 percent is incomplete, over 60 is not compatible", () => {
  const revenue = (n: number) => status({ columns: [missing('Revenue', 'revenue', n + 5, 100, 'rows_left_out', n)] });
  it("39 of 100 is fine", () => expect(ids(revenue(39))).not.toContain('revenue_half_blank'));
  it("40 of 100 is incomplete (at the limit)", () => { expect(ids(revenue(40))).toContain('revenue_half_blank'); expect(revenue(40).status).toBe('incomplete'); });
  it("60 of 100 is still incomplete (at the limit)", () => { expect(ids(revenue(60))).toContain('revenue_half_blank'); expect(revenue(60).status).toBe('incomplete'); });
  it("61 of 100 is not compatible", () => { expect(ids(revenue(61))).toContain('revenue_mostly_blank'); expect(revenue(61).status).toBe('not_compatible'); });
  it("is measured after the calculation (missingAfter), not before", () => {
    const s = status({ columns: [missing('Revenue', 'revenue', 70, 100, 'calculated', 30)] });
    expect(ids(s)).not.toContain('revenue_mostly_blank');
    expect(ids(s)).not.toContain('revenue_half_blank');
  });
  it("says it in plain words with the numbers", () => {
    const s = status({ rows: 72, columns: [missing('Revenue', 'revenue', 34, 72, 'rows_left_out')] });
    expect(s.reasons).toContain('Revenue is blank on 47% of rows (34 of 72), so totals may understate sales.');
  });
});

describe("not compatible: no sales column, or too few rows", () => {
  it("no revenue column and no price x quantity", () => {
    const s = status({ semantics: { columns: [column('Order Date', 'date'), column('Region', 'location')], warnings: [] } as unknown as PipelineResult['semantics'] });
    expect(s.status).toBe('not_compatible');
    expect(ids(s)).toEqual(['no_sales_column']);
  });
  it("price and quantity together count as a sales amount", () => {
    const s = status({ semantics: { columns: [column('Price', 'price'), column('Units', 'quantity')], warnings: [] } as unknown as PipelineResult['semantics'] });
    expect(ids(s)).not.toContain('no_sales_column');
  });
  it("a price alone is not a sales amount", () => {
    const s = status({ semantics: { columns: [column('Price', 'price')], warnings: [] } as unknown as PipelineResult['semantics'] });
    expect(s.status).toBe('not_compatible');
  });
  it("9 usable rows is not compatible, 10 is not", () => {
    expect(ids(status({ rows: 9 }))).toEqual(['too_few_rows']);
    expect(status({ rows: 10 }).status).toBe('ready');
  });
  it("under 10 percent surviving is not compatible, exactly 10 is not", () => {
    expect(ids(status({ rows: 200, usable: 19 }))).toContain('too_few_rows');
    expect(ids(status({ rows: 200, usable: 20 }))).not.toContain('too_few_rows');
    expect(ids(status({ rows: 200, usable: 21 }))).not.toContain('too_few_rows');
  });
});

describe("the reasons list every trigger that fired", () => {
  it("lists them all, most serious first, each with its numbers", () => {
    const s = status({
      rows: 100, calculated: 30, returns: 6, excluded: { zero_quantity: 12, duplicate: 0 },
      columns: [missing('Order Date', 'date', 25, 100, 'left_blank'), missing('Revenue', 'revenue', 75, 100, 'rows_left_out', 65), missing('Region', 'location', 50, 100, 'shown_as_missing')],
    });
    expect(s.status).toBe('not_compatible');
    expect(ids(s)).toEqual(['revenue_mostly_blank', 'rows_left_out_many', 'dates_blank_many', 'descriptive_blank', 'revenue_calculated', 'negative_amounts']);
    expect(s.reasons).toHaveLength(s.triggers.length);
    s.triggers.forEach((trigger, i) => expect(s.reasons[i]).toBe(trigger.reason));
    expect(s.reasons[0]).toContain('65 of 100');
    expect(s.reasons[1]).toContain('12 of 100');
    expect(s.reasons[2]).toContain('25 of 100');
    expect(s.reasons[3]).toContain('50 of 100');
    expect(s.reasons[4]).toContain('30 of 100');
    expect(s.reasons[5]).toContain('6 of 100');
  });
  it("takes the highest severity as the status", () => {
    expect(status({ calculated: 30, columns: [missing('Order Date', 'date', 21, 100, 'left_blank')] }).status).toBe('incomplete');
    expect(status({ calculated: 30, returns: 6 }).status).toBe('caveats');
  });
  it("never uses a word the story engine bans", () => {
    const s = status({ calculated: 30, returns: 6, excluded: { zero_quantity: 12 }, columns: [missing('Order Date', 'date', 25, 100, 'left_blank')] });
    expect(s.reasons.join(' ')).not.toMatch(/because|recognised|typically|leverage|—|–/i);
  });
});

describe("status words", () => {
  it("has a plain label for each status", () => {
    expect(STATUS_LABEL).toEqual({ ready: 'Ready', caveats: 'Usable with caveats', incomplete: 'Incomplete', not_compatible: 'Not compatible' });
  });
  it("shows one decimal only when rounding would land on a limit", () => {
    expect(pctText(47, 100)).toBe('47%');
    expect(pctText(1004, 10000, [10])).toBe('10.0%');
    expect(pctText(10, 100, [10])).toBe('10%');
  });
});
