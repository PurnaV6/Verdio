import type { RawRow, DatasetProfile, CleaningAction, DuplicateRow, ExcludedReason, ExcludedRow, ReturnRow, CalculatedCell } from "../../types/dataPipeline";
import type { SemanticIndex } from "../../types/semantic";
import { classifyRow, excludedReasonText, type MeasureColumns } from "./salesRows";

/* ================================================================
   VERDIO — Role-aware steps
   Cleaning (cleanDataset.ts) only tidies structure. What may be
   calculated, left out or flagged depends on what each column MEANS,
   so these steps run after the semantic engine has assigned roles and
   before feature engineering.

   Nothing is ever filled in: no mean, no median, no most common value.
   A blank stays blank and is reported. What this does instead:
   • Revenue that is blank is calculated as price x quantity when both
     are present on that row. It comes from the file's own numbers, is
     written into the revenue column, and is counted and listed.
   • Rows with a zero or unusable sales amount are left out of sales
     totals, listed with their original row number and the reason. A row
     with a negative revenue or quantity is a return, summed apart.
   • An exact duplicate row is left out only when the file has a unique
     ID column. Otherwise it is kept and only flagged, because identical
     sale lines can be real.
   Rows are never deleted: every row stays in `rows`, and the ones that
   do not count are also listed in `excludedRows` / `returnRows`.
   ================================================================ */

/** How many rows are listed one by one in the report; counts are always complete. */
export const MAX_LISTED_ROWS = 200;
/** A column is "a unique ID" when at least this share of its values are distinct. */
const UNIQUE_KEY_MIN_RATIO = 0.9;

export interface RoleAwareResult {
  rows:          RawRow[];            // every kept row, calculated revenue written in
  analysisRows:  RawRow[];            // the rows that count toward sales (all rows when the file has no sales measure)
  calculated:    boolean[];           // parallel to analysisRows: revenue on that row was calculated
  excludedRows:  ExcludedRow[];
  returnRows:    ReturnRow[];
  actions:       CleaningAction[];
  measureColumns: MeasureColumns;
  calculatedCells: CalculatedCell[];  // the first calculated cells, with original row numbers
  calculatedCount: number;
  duplicateCount: number;
  duplicateHandling: 'excluded' | 'flagged' | null;
  duplicateRows: DuplicateRow[];
  keyColumn:     string | null;
}

/** The ID column that is unique per row (order, invoice or transaction ID), or null when the file has none. */
function findKeyColumn(rows: RawRow[], profile: DatasetProfile, index: SemanticIndex): string | null {
  const profileByName = new Map(profile.columns.map(c => [c.name, c]));
  for (const c of index.get('identifier')) {
    const cp = profileByName.get(c.columnName);
    if (!cp || cp.missingCount > 0 || !rows.length) continue;
    const distinct = new Set(rows.map(r => r[c.columnName])).size;
    if (distinct / rows.length >= UNIQUE_KEY_MIN_RATIO) return c.columnName;
  }
  return null;
}

export function applyRoleAwareSteps(rows: RawRow[], profile: DatasetProfile, index: SemanticIndex, sourceRows: number[]): RoleAwareResult {
  const measureColumns: MeasureColumns = {
    revenue: index.best('revenue')?.columnName ?? null,
    price: index.best('price')?.columnName ?? null,
    quantity: index.best('quantity')?.columnName ?? null,
  };
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const keyColumn = findKeyColumn(rows, profile, index);

  const outRows: RawRow[] = [];
  const analysisRows: RawRow[] = [];
  const calculated: boolean[] = [];
  const excludedRows: ExcludedRow[] = [];
  const returnRows: ReturnRow[] = [];
  const calculatedCells: CalculatedCell[] = [];
  const duplicateRows: DuplicateRow[] = [];
  const firstSeen = new Map<string, number>();
  const excludedCounts: Record<ExcludedReason, number> = { zero_quantity: 0, zero_price: 0, zero_revenue: 0, missing_measure: 0, duplicate: 0 };
  let calculatedCount = 0, duplicateCount = 0, returnTotal = 0;

  rows.forEach((original, i) => {
    const rowNumber = sourceRows[i] ?? i + 1;
    let row = original;

    const signature = headers.map(h => row[h]).join('\u0001');
    const earlier = firstSeen.get(signature);
    if (earlier === undefined) firstSeen.set(signature, rowNumber);
    else {
      duplicateCount++;
      if (duplicateRows.length < MAX_LISTED_ROWS) duplicateRows.push({ row: rowNumber, sameAs: earlier });
      if (keyColumn) {
        excludedCounts.duplicate++;
        excludedRows.push({ row: rowNumber, reason: 'duplicate', reasonText: excludedReasonText('duplicate', measureColumns, earlier), duplicateOf: earlier, values: row });
        outRows.push(row);
        return;
      }
    }

    const verdict = classifyRow(row, measureColumns);
    if (verdict.kind === 'sales' && verdict.calculated && measureColumns.revenue && verdict.value !== null) {
      row = { ...row, [measureColumns.revenue]: String(verdict.value) };
      calculatedCount++;
      if (calculatedCells.length < MAX_LISTED_ROWS) calculatedCells.push({ row: rowNumber, column: measureColumns.revenue, value: verdict.value });
    }
    outRows.push(row);

    if (verdict.kind === 'excluded') {
      excludedCounts[verdict.reason]++;
      excludedRows.push({ row: rowNumber, reason: verdict.reason, reasonText: excludedReasonText(verdict.reason, measureColumns), values: row });
    } else if (verdict.kind === 'return') {
      const amount = Math.abs(verdict.value ?? 0);
      returnTotal += amount;
      returnRows.push({ row: rowNumber, amount, values: row });
    } else {
      analysisRows.push(row);
      calculated.push(verdict.calculated);
    }
  });

  const actions: CleaningAction[] = [];
  const { revenue, price, quantity } = measureColumns;
  if (calculatedCount > 0 && revenue) {
    actions.push({ type: 'calculate_revenue', column: revenue, count: calculatedCount, detail: `Calculated ${revenue} as ${price} x ${quantity} for ${calculatedCount} ${calculatedCount === 1 ? 'row' : 'rows'} where ${revenue} was blank.` });
  }
  const reasonSentence: Record<ExcludedReason, string> = {
    zero_quantity: `${quantity} is 0`,
    zero_price: `${price} is 0`,
    zero_revenue: `${revenue ?? 'the sales amount'} is 0`,
    missing_measure: `${revenue ?? price ?? quantity} is blank or not a number`,
    duplicate: 'they repeat an earlier row with the same ID',
  };
  for (const reason of Object.keys(excludedCounts) as ExcludedReason[]) {
    const count = excludedCounts[reason];
    if (count === 0) continue;
    actions.push({ type: 'exclude_rows', count, detail: `Left ${count} ${count === 1 ? 'row' : 'rows'} out of sales totals because ${reasonSentence[reason]}. ${count === 1 ? 'It stays' : 'They stay'} in your data and ${count === 1 ? 'is' : 'are'} listed with the row number.` });
  }
  if (returnRows.length > 0) {
    actions.push({ type: 'flag_returns', count: returnRows.length, detail: `Found ${returnRows.length} ${returnRows.length === 1 ? 'return' : 'returns'} (negative revenue or quantity), worth ${Math.round(returnTotal * 100) / 100} in total. ${returnRows.length === 1 ? 'It is' : 'They are'} summed apart from sales.` });
  }
  if (duplicateCount > 0 && !keyColumn) {
    actions.push({ type: 'flag_possible_duplicates', count: duplicateCount, detail: `${duplicateCount} ${duplicateCount === 1 ? 'row exactly repeats' : 'rows exactly repeat'} an earlier row. The file has no unique order ID, so ${duplicateCount === 1 ? 'it is' : 'they are'} kept in the totals and flagged as possible duplicates.` });
  }

  return {
    rows: outRows, analysisRows, calculated, excludedRows, returnRows, actions, measureColumns,
    calculatedCells, calculatedCount, duplicateCount,
    duplicateHandling: duplicateCount === 0 ? null : keyColumn ? 'excluded' : 'flagged',
    duplicateRows, keyColumn,
  };
}
