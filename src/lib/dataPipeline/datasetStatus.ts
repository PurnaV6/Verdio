import { bestColumnOfRole } from "../analysis/pickColumns";
import type { DatasetStatus, DatasetStatusKind, ExcludedReason, StatusTrigger } from "../../types/dataPipeline";
import type { PipelineResult } from "../../types/pipeline";

/* ================================================================
   VERDIO — Dataset status (pure)
   One word for how far a file's numbers can be trusted, and a plain
   reason for every check that fired. Nothing here changes a number:
   it only reads what the cleaning stage already recorded.

     ready          no check fired
     caveats        usable, with caveats
     incomplete     numbers shown, but the file is missing too much
     not_compatible Verd.io cannot give reliable sales figures

   The status is the highest severity of any trigger. The reasons list
   EVERY trigger that fired, each with its own numbers.
   ================================================================ */

/**
 * Every limit, in percent of rows unless the name says otherwise. A "from" limit includes its own value
 * ("5 to 20" means 5 up to and including 20); an "over" limit does not. Shares are compared as whole-number
 * ratios (count x 100 against limit x total), so a value exactly on a limit is never decided by rounding.
 */
export const STATUS_THRESHOLDS = {
  /** Dates blank: from 5 up to 20 is a caveat, over 20 is incomplete. */
  datesBlankFromPct: 5,
  datesBlankOverPct: 20,
  /** Rows left out of sales totals (zero or blank amounts, not duplicates, not returns): from 2 up to 10 is a caveat, over 10 is incomplete. */
  rowsLeftOutFromPct: 2,
  rowsLeftOutOverPct: 10,
  /** A descriptive column (category, region, product ...) blank on more than this is a caveat. */
  descriptiveBlankOverPct: 40,
  /** Revenue calculated from price x quantity on more than this share of rows is a caveat. */
  calculatedRevenueOverPct: 25,
  /** Negative amounts (returns) on more than this share of rows is a caveat. */
  negativeAmountsOverPct: 5,
  /** The revenue column, after the price x quantity calculation: from 40 up to 60 blank is incomplete, over 60 is not compatible. */
  revenueBlankFromPct: 40,
  revenueBlankOverPct: 60,
  /** Fewer usable rows than this, or fewer than this share of the rows surviving, is not compatible. */
  minUsableRows: 10,
  minSurvivingPct: 10,
} as const;

export const STATUS_LABEL: Record<DatasetStatusKind, string> = {
  ready: 'Ready',
  caveats: 'Usable with caveats',
  incomplete: 'Incomplete',
  not_compatible: 'Not compatible',
};

const RANK: Record<DatasetStatusKind, number> = { ready: 0, caveats: 1, incomplete: 2, not_compatible: 3 };

export const READY_REASON = 'No gap in this file is large enough to limit how far its numbers can be trusted.';

/** Exact share checks on whole numbers. */
export const atLeast = (count: number, total: number, pct: number) => total > 0 && count * 100 >= pct * total;
export const over = (count: number, total: number, pct: number) => total > 0 && count * 100 > pct * total;
const share = (count: number, total: number) => (total > 0 ? (count / total) * 100 : 0);

/** "47%": whole numbers, unless rounding would land on a limit the value is not exactly on, then one decimal. */
export function pctText(count: number, total: number, limits: readonly number[] = []): string {
  const pct = share(count, total);
  const whole = Math.round(pct);
  return limits.includes(whole) && whole !== pct ? `${pct.toFixed(1)}%` : `${whole}%`;
}

const n = (value: number) => value.toLocaleString('en-GB');
const rowsOf = (count: number, total: number) => `${n(count)} of ${n(total)} rows`;

type StatusInput = Pick<PipelineResult, 'cleaning' | 'semantics'> & Partial<Pick<PipelineResult, 'analysisRowCount'>>;

const ZERO_EXCLUDED: Record<ExcludedReason, number> = { zero_quantity: 0, zero_price: 0, zero_revenue: 0, missing_measure: 0, duplicate: 0 };

export function computeDatasetStatus(result: StatusInput): DatasetStatus {
  const T = STATUS_THRESHOLDS;
  const { cleaning, semantics } = result;
  const rows = cleaning.rowsBefore;
  const excluded = { ...ZERO_EXCLUDED, ...(cleaning.rowsExcluded ?? {}) };
  const columns = cleaning.columns ?? [];
  const triggers: StatusTrigger[] = [];
  const add = (trigger: StatusTrigger) => { triggers.push(trigger); };

  const revenue = bestColumnOfRole(semantics.columns, 'revenue');
  const price = bestColumnOfRole(semantics.columns, 'price');
  const quantity = bestColumnOfRole(semantics.columns, 'quantity');
  const dateColumn = bestColumnOfRole(semantics.columns, 'date');
  const columnReport = (name: string | null) => (name ? columns.find(column => column.name === name) : undefined);

  /* Rows left out, counted on the rows that remain once repeated rows are set aside. Returns are not left out. */
  const leftOut = excluded.zero_quantity + excluded.zero_price + excluded.zero_revenue + excluded.missing_measure;
  const afterRepeats = rows - excluded.duplicate;

  /* 1. Not compatible: no sales amount to total. */
  const hasSalesAmount = !!revenue || (!!price && !!quantity);
  if (!hasSalesAmount) {
    add({ id: 'no_sales_column', severity: 'not_compatible', count: 0, total: rows, pct: 0,
      reason: 'Verd.io cannot find a sales amount column in this file, so it cannot work out sales totals.' });
  }

  /* 2. The sales amount, blank after price x quantity was worked out. */
  let salesBlank = 0, salesBlankOf = rows;
  let salesLabel = 'Sales amount';
  if (revenue) { salesBlank = columnReport(revenue)?.missingAfter ?? 0; salesLabel = revenue; }
  else if (hasSalesAmount) { salesBlank = excluded.missing_measure; salesBlankOf = afterRepeats; }
  if (hasSalesAmount && over(salesBlank, salesBlankOf, T.revenueBlankOverPct)) {
    add({ id: 'revenue_mostly_blank', severity: 'not_compatible', column: salesLabel, count: salesBlank, total: salesBlankOf, pct: share(salesBlank, salesBlankOf),
      reason: `${salesLabel} is blank on ${pctText(salesBlank, salesBlankOf, [T.revenueBlankOverPct])} of rows (${n(salesBlank)} of ${n(salesBlankOf)}), too many for reliable sales totals.` });
  } else if (hasSalesAmount && atLeast(salesBlank, salesBlankOf, T.revenueBlankFromPct)) {
    add({ id: 'revenue_half_blank', severity: 'incomplete', column: salesLabel, count: salesBlank, total: salesBlankOf, pct: share(salesBlank, salesBlankOf),
      reason: `${salesLabel} is blank on ${pctText(salesBlank, salesBlankOf, [T.revenueBlankFromPct, T.revenueBlankOverPct])} of rows (${n(salesBlank)} of ${n(salesBlankOf)}), so totals may understate sales.` });
  }

  /* 3. Not compatible: too few rows can be used. */
  const usable = result.analysisRowCount ?? rows;
  if (usable < T.minUsableRows || usable * 100 < T.minSurvivingPct * rows) {
    add({ id: 'too_few_rows', severity: 'not_compatible', count: usable, total: rows, pct: share(usable, rows),
      reason: `Only ${rowsOf(usable, rows)} (${pctText(usable, rows)}) can be used for sales figures, too few to rely on.` });
  }

  /* 4. Rows left out of sales totals. */
  if (over(leftOut, afterRepeats, T.rowsLeftOutOverPct)) {
    add({ id: 'rows_left_out_many', severity: 'incomplete', count: leftOut, total: afterRepeats, pct: share(leftOut, afterRepeats),
      reason: `${rowsOf(leftOut, afterRepeats)} (${pctText(leftOut, afterRepeats, [T.rowsLeftOutOverPct])}) are left out of sales totals for a zero or blank amount, so totals cover only part of the file.` });
  } else if (atLeast(leftOut, afterRepeats, T.rowsLeftOutFromPct)) {
    add({ id: 'rows_left_out_some', severity: 'caveats', count: leftOut, total: afterRepeats, pct: share(leftOut, afterRepeats),
      reason: `${rowsOf(leftOut, afterRepeats)} (${pctText(leftOut, afterRepeats, [T.rowsLeftOutFromPct, T.rowsLeftOutOverPct])}) are left out of sales totals for a zero or blank amount.` });
  }

  /* 5. Dates blank. */
  const dates = columnReport(dateColumn);
  const datesBlank = dates?.missingBefore ?? 0;
  if (dateColumn && over(datesBlank, rows, T.datesBlankOverPct)) {
    add({ id: 'dates_blank_many', severity: 'incomplete', column: dateColumn, count: datesBlank, total: rows, pct: share(datesBlank, rows),
      reason: `${dateColumn} is blank on ${pctText(datesBlank, rows, [T.datesBlankOverPct])} of rows (${n(datesBlank)} of ${n(rows)}), so those rows are missing from the monthly trend, forecast and seasonality.` });
  } else if (dateColumn && atLeast(datesBlank, rows, T.datesBlankFromPct)) {
    add({ id: 'dates_blank_some', severity: 'caveats', column: dateColumn, count: datesBlank, total: rows, pct: share(datesBlank, rows),
      reason: `${dateColumn} is blank on ${pctText(datesBlank, rows, [T.datesBlankFromPct, T.datesBlankOverPct])} of rows (${n(datesBlank)} of ${n(rows)}), so those rows are missing from the monthly trend, forecast and seasonality.` });
  }

  /* 6. Descriptive columns with many blanks (shown as a "(Missing)" group in breakdowns). */
  const sparse = columns
    .filter(column => column.action === 'shown_as_missing' && column.role !== 'date' && column.name !== dateColumn && over(column.missingBefore, rows, T.descriptiveBlankOverPct))
    .sort((a, b) => b.missingBefore - a.missingBefore);
  if (sparse.length > 0) {
    const details = sparse.map(column => ({ column: column.name, count: column.missingBefore, total: rows, pct: share(column.missingBefore, rows) }));
    const listed = sparse.slice(0, 3);
    const text = (column: typeof sparse[number]) => `${column.name} ${pctText(column.missingBefore, rows, [T.descriptiveBlankOverPct])} (${n(column.missingBefore)} of ${n(rows)})`;
    const reason = sparse.length === 1
      ? `${listed[0].name} is blank on ${pctText(listed[0].missingBefore, rows, [T.descriptiveBlankOverPct])} of rows (${n(listed[0].missingBefore)} of ${n(rows)}), so breakdowns by it show a large (Missing) group.`
      : `${n(sparse.length)} descriptive columns have many blanks, so breakdowns by them show large (Missing) groups: ${listed.map(text).join(', ')}${sparse.length > listed.length ? ` and ${n(sparse.length - listed.length)} more` : ''}.`;
    add({ id: 'descriptive_blank', severity: 'caveats', count: sparse.length, total: rows, pct: details[0].pct, column: sparse[0].name, details, reason });
  }

  /* 7. Revenue calculated rather than read. */
  const calculated = cleaning.rowsCalculated ?? 0;
  if (over(calculated, rows, T.calculatedRevenueOverPct)) {
    add({ id: 'revenue_calculated', severity: 'caveats', count: calculated, total: rows, pct: share(calculated, rows),
      reason: `${salesLabel} was calculated as price x quantity on ${pctText(calculated, rows, [T.calculatedRevenueOverPct])} of rows (${n(calculated)} of ${n(rows)}), not read from the file.` });
  }

  /* 8. Negative amounts. */
  const negatives = cleaning.returns?.count ?? 0;
  if (over(negatives, rows, T.negativeAmountsOverPct)) {
    add({ id: 'negative_amounts', severity: 'caveats', count: negatives, total: rows, pct: share(negatives, rows),
      reason: `${rowsOf(negatives, rows)} (${pctText(negatives, rows, [T.negativeAmountsOverPct])}) have a negative amount or quantity. They are summed apart from sales.` });
  }

  const ordered = triggers
    .map((trigger, i) => ({ trigger, i }))
    .sort((a, b) => RANK[b.trigger.severity] - RANK[a.trigger.severity] || a.i - b.i)
    .map(item => item.trigger);
  const status: DatasetStatusKind = ordered[0]?.severity ?? 'ready';
  return { status, reasons: ordered.length ? ordered.map(trigger => trigger.reason) : [READY_REASON], triggers: ordered };
}
