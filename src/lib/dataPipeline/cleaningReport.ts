import type { ColumnCleaning, DatasetProfile } from "../../types/dataPipeline";
import type { SemanticResult } from "../../types/semantic";
import type { RoleAwareResult } from "./roleAwareSteps";
import { parseAmount } from "./profileDataset";

/* ================================================================
   VERDIO — Cleaning report, per column
   For every column that has any missing value in the file as uploaded:
   how much was missing, what Verdio did, and what that cost the sales
   totals. Nothing is filled, so "what was done" is one of: left blank,
   shown as a (Missing) group, calculated from the file's own numbers,
   or the rows were left out of sales totals.
   ================================================================ */

/** A column is flagged unreliable when more than this share of it is missing. */
export const UNRELIABLE_MISSING_PCT = 40;

const MEASURE_ROLES = ['revenue', 'price', 'quantity'];
const GROUPING_ROLES = ['category', 'location', 'status', 'product', 'customer', 'employee'];
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildColumnReport(
  rawProfile: DatasetProfile, finalProfile: DatasetProfile, semantics: SemanticResult, steps: RoleAwareResult, totalRows: number,
): ColumnCleaning[] {
  const roleByName = new Map(semantics.columns.map(c => [c.columnName, c.businessRole as string]));
  const afterByName = new Map(finalProfile.columns.map(c => [c.name, c]));
  const { revenue, price, quantity } = steps.measureColumns;
  const missingMeasureRows = steps.excludedRows.filter(row => row.reason === 'missing_measure');
  const out: ColumnCleaning[] = [];

  for (const col of rawProfile.columns) {
    if (col.missingCount === 0) continue;
    const role = roleByName.get(col.name) ?? 'unknown';
    const after = afterByName.get(col.name);
    const missingAfter = after?.missingCount ?? col.missingCount;
    const missingAfterPct = after?.missingPct ?? col.missingPct;
    const isRevenue = col.name === revenue;
    const calculated = isRevenue ? steps.calculatedCount : 0;

    // Rows this column keeps out of sales totals: those whose sales amount is blank because of it.
    const decidesSales = isRevenue || (!revenue && (col.name === price || col.name === quantity));
    const rowsLeftOut = decidesSales ? missingMeasureRows.filter(row => parseAmount(row.values[col.name]) === null).length : 0;

    let action: ColumnCleaning['action'];
    let actionText: string;
    if (isRevenue && calculated > 0) {
      action = 'calculated';
      actionText = `Calculated from ${price} x ${quantity} for ${plural(calculated, 'row', 'rows')}.`
        + (rowsLeftOut > 0 ? ` ${plural(rowsLeftOut, 'row', 'rows')} still blank, left out of sales totals.` : '');
    } else if (rowsLeftOut > 0) {
      action = 'rows_left_out';
      actionText = `${plural(rowsLeftOut, 'row', 'rows')} left out of sales totals.`;
    } else if (MEASURE_ROLES.includes(role)) {
      action = 'left_blank';
      actionText = revenue && col.name !== revenue ? `Left blank. Rows still count because ${revenue} is present.` : 'Left blank.';
    } else if (role === 'cost') {
      action = 'left_blank';
      actionText = 'Left blank. Margin is not worked out for these rows.';
    } else if (GROUPING_ROLES.includes(role) || col.inferredType === 'string') {
      action = 'shown_as_missing';
      actionText = 'Left blank and shown as Missing in breakdowns.';
    } else {
      action = 'left_blank';
      actionText = 'Left blank. These rows are skipped wherever this column is used.';
    }

    out.push({
      name: col.name, role,
      missingBefore: col.missingCount, missingBeforePct: col.missingPct,
      missingAfter, missingAfterPct,
      action, actionText, calculated,
      rowsLeftOut, rowsLeftOutPct: pct(rowsLeftOut, totalRows),
      unreliable: col.missingPct > UNRELIABLE_MISSING_PCT,
    });
  }
  return out;
}
