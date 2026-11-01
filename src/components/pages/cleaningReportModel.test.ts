import { describe, expect, it } from "vitest";
import { cleaningSummary, hasCleaningReport, OLDER_VERSION_MESSAGE, pctLabel, toCleaningReportView } from "./cleaningReportModel";
import { STATUS_LABEL } from "../../lib/dataPipeline/datasetStatus";
import { cloneResult, demoResult, resultFromCsv } from "../../lib/story/testkit";
import type { PipelineResult } from "../../types/pipeline";

/* The report is read off a real pipeline result, so the sentence can only say what the cleaning stage recorded. */

/** 31 rows: 1 repeated row, 1 zero quantity, 1 blank sales amount, 1 revenue calculated, 1 return of 200, 13 blank categories. */
function exampleCsv(): string {
  const lines = ['Order ID,Order Date,Product Category,Units,Unit Price,Revenue'];
  const row = (id: number, category: string, units: string, price: string, revenue: string) =>
    `O-${id},2024-${String(1 + (id % 12)).padStart(2, '0')}-${String(1 + (id % 27)).padStart(2, '0')},${category},${units},${price},${revenue}`;
  let id = 1;
  const category = () => (id <= 13 ? '' : ['Tools', 'Toys', 'Books'][id % 3]);
  for (; id <= 25; id += 1) lines.push(row(id, category(), '2', '15', '30'));
  lines.push(row(26, 'Books', '3', '20', ''));        // revenue blank: calculated as 60
  lines.push(row(27, 'Books', '0', '10', '0'));       // zero quantity
  lines.push(row(28, 'Tools', '', '', ''));           // nothing to total: blank sales amount
  lines.push(row(29, 'Toys', '-2', '100', '-200'));   // a return worth 200
  lines.push(row(30, 'Toys', '4', '10', '40'));
  lines.push(lines[lines.length - 1]);                // the same order again
  return lines.join('\n');
}

describe("cleaning summary", () => {
  it("writes the approved sentence from the result's own fields", async () => {
    const r = await resultFromCsv(exampleCsv());
    expect(cleaningSummary(r)).toBe(
      '31 rows read. 3 left out (1 duplicate, 1 zero quantity, 1 blank revenue). 1 revenue value calculated from price x quantity. 1 return worth 200 kept apart. 13 blank Product Category values shown as (Missing).',
    );
  });

  it("says plainly when nothing was left out", async () => {
    const r = await demoResult();
    expect(cleaningSummary(r)).toBe('720 rows read. No rows left out.');
  });

  it("uses singular and plural words correctly", async () => {
    const r = cloneResult(await demoResult());
    r.cleaning.rowsBefore = 1;
    r.cleaning.rowsExcluded = { zero_quantity: 2, zero_price: 0, zero_revenue: 0, missing_measure: 0, duplicate: 2 };
    r.cleaning.rowsCalculated = 3;
    r.cleaning.returns = { count: 2, total: 1234.5 };
    expect(cleaningSummary(r)).toBe('1 row read. 4 left out (2 duplicates, 2 zero quantity). 3 revenue values calculated from price x quantity. 2 returns worth 1,234.5 kept apart.');
  });

  it("caps the list of (Missing) columns", async () => {
    const r = cloneResult(await resultFromCsv(exampleCsv()));
    const template = r.cleaning.columns!.find(column => column.action === 'shown_as_missing')!;
    r.cleaning.columns = ['A', 'B', 'C', 'D', 'E'].map(name => ({ ...template, name }));
    const summary = cleaningSummary(r);
    expect(summary).toContain('13 blank C values shown as (Missing).');
    expect(summary).not.toContain('blank D values');
    expect(summary).toContain('Blanks in 2 more columns are also shown as (Missing).');
  });
});

describe("cleaning report view", () => {
  it("lists the columns with blanks before and after, what was done and the unreliable flag", async () => {
    const r = await resultFromCsv(exampleCsv());
    const view = toCleaningReportView(r);
    if (view.kind !== 'report') throw new Error('expected a report');
    const category = view.columns.find(column => column.name === 'Product Category')!;
    expect(category).toMatchObject({ before: '13 (41.9%)', after: '13 (41.9%)', leftOut: 'None', unreliable: true });
    expect(category.done).toBe('Left blank and shown as Missing in breakdowns.');
    const revenue = view.columns.find(column => column.name === 'Revenue')!;
    expect(revenue.done).toContain('Calculated from Unit Price x Units for 1 row.');
    expect(revenue.unreliable).toBe(false);
    expect(view.leftOutCount).toBe(3);
  });

  it("carries the dataset status and every reason", async () => {
    const r = await resultFromCsv(exampleCsv());
    const view = toCleaningReportView(r);
    if (view.kind !== 'report') throw new Error('expected a report');
    expect(view.status?.word).toBe(STATUS_LABEL[r.datasetStatus!.status]);
    expect(view.status?.reasons).toEqual(r.datasetStatus?.reasons);
  });

  it("shows quality before and after side by side", async () => {
    const r = await resultFromCsv(exampleCsv());
    const view = toCleaningReportView(r);
    if (view.kind !== 'report') throw new Error('expected a report');
    expect(view.quality.before).toMatchObject({ label: 'As uploaded', overall: r.quality.overallScore });
    expect(view.quality.after).toMatchObject({ label: 'Rows used for sales', overall: r.qualityAfter!.overallScore });
    expect(view.quality.before.areas.map(area => area.name)).toEqual(['Completeness', 'Validity', 'Consistency', 'Uniqueness']);
  });

  it("has nothing to list for the demo, and says so", async () => {
    const r = await demoResult();
    const view = toCleaningReportView(r);
    if (view.kind !== 'report') throw new Error('expected a report');
    expect(view.noBlanks).toBe(true);
    expect(view.status).toMatchObject({ word: 'Ready' });
    expect(view.quality.before.overall).toBe(100);
    expect(view.leftOutCount).toBe(0);
  });
});

describe("results saved by an older version", () => {
  async function older(): Promise<PipelineResult> {
    const r = cloneResult(await resultFromCsv(exampleCsv()));
    delete r.cleaning.columns;
    delete r.cleaning.rowsExcluded;
    delete r.cleaning.rowsCalculated;
    delete r.cleaning.returns;
    delete r.datasetStatus;
    delete r.qualityAfter;
    delete r.excludedRows;
    delete r.pipelineVersion;
    return r;
  }

  it("get the re-upload message and nothing else", async () => {
    const r = await older();
    expect(hasCleaningReport(r)).toBe(false);
    expect(toCleaningReportView(r)).toEqual({ kind: 'older', message: OLDER_VERSION_MESSAGE });
    expect(OLDER_VERSION_MESSAGE).toContain('analysed with an older version of Verd.io, re-upload to see the cleaning report');
  });

  it("still build a summary without throwing", async () => {
    expect(cleaningSummary(await older())).toMatch(/^31 rows read\./);
  });

  it("have a report but no after score or status when only those are missing", async () => {
    const r = cloneResult(await resultFromCsv(exampleCsv()));
    delete r.datasetStatus;
    delete r.qualityAfter;
    const view = toCleaningReportView(r);
    if (view.kind !== 'report') throw new Error('expected a report');
    expect(view.status).toBeNull();
    expect(view.quality.after).toBeNull();
  });
});

describe("percent labels", () => {
  it("drop a trailing .0", () => {
    expect(pctLabel(21)).toBe('21%');
    expect(pctLabel(20.5)).toBe('20.5%');
    expect(pctLabel(0)).toBe('0%');
  });
});
