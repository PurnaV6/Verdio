import { parseAmount } from "./profileDataset";
import type { ExcludedReason } from "../../types/dataPipeline";

/* ================================================================
   VERDIO — Sales rows (pure)
   Which rows count toward sales, and blank-aware sums. A blank is
   skipped and never read as 0. The same rule serves the pipeline and
   any path that reads rows without going through engineeredRows.
   ================================================================ */

type Cells = Record<string, unknown>;

/** The columns that decide whether a row is a sale. Any of them may be missing from a file. */
export interface MeasureColumns {
  revenue?:  string | null;
  price?:    string | null;
  quantity?: string | null;
}

export type RowClass =
  /** Counts toward sales. `value` is null only when the file has no revenue, price or quantity column at all. */
  | { kind: 'sales'; value: number | null; calculated: boolean }
  /** A negative revenue or quantity. `value` is the signed sales amount, or null when only the quantity is known. */
  | { kind: 'return'; value: number | null }
  /** Left out of every sales measure. */
  | { kind: 'excluded'; reason: Exclude<ExcludedReason, 'duplicate'> };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Decides what a row is. The sales amount is the revenue cell; when that is blank and both price and quantity
 * are numbers it is price x quantity (flagged `calculated`). Without a revenue column it is price x quantity,
 * else the price alone, else the quantity alone. A blank is never a 0.
 *  - negative sales amount or negative quantity: a return
 *  - zero quantity, zero price, then zero sales amount: excluded
 *  - no sales amount at all: excluded as missing_measure
 */
export function classifyRow(cells: Cells, cols: MeasureColumns): RowClass {
  const price = cols.price ? parseAmount(cells[cols.price]) : null;
  const qty = cols.quantity ? parseAmount(cells[cols.quantity]) : null;
  let value: number | null;
  let calculated = false;

  if (cols.revenue) {
    value = parseAmount(cells[cols.revenue]);
    if (value === null && price !== null && qty !== null) { value = round2(price * qty); calculated = true; }
  } else if (cols.price && cols.quantity) {
    value = price !== null && qty !== null ? round2(price * qty) : null;
  } else if (cols.price) {
    value = price;
  } else if (cols.quantity) {
    value = qty;
  } else {
    return { kind: 'sales', value: null, calculated: false };
  }

  if ((value !== null && value < 0) || (qty !== null && qty < 0)) return { kind: 'return', value };
  if (qty === 0) return { kind: 'excluded', reason: 'zero_quantity' };
  if (price === 0) return { kind: 'excluded', reason: 'zero_price' };
  if (value === 0) return { kind: 'excluded', reason: 'zero_revenue' };
  if (value === null) return { kind: 'excluded', reason: 'missing_measure' };
  return { kind: 'sales', value, calculated };
}

/** True when the row counts toward sales: not a return, not zero, not blank. */
export function isAnalysisRow(cells: Cells, cols: MeasureColumns): boolean {
  return classifyRow(cells, cols).kind === 'sales';
}

/** The sentence that says why a row is left out, in the file's own column names. */
export function excludedReasonText(reason: ExcludedReason, cols: MeasureColumns, duplicateOf?: number): string {
  switch (reason) {
    case 'zero_quantity': return `${cols.quantity ?? 'Quantity'} is 0`;
    case 'zero_price': return `${cols.price ?? 'Price'} is 0`;
    case 'zero_revenue': return `${cols.revenue ?? 'Sales amount'} is 0`;
    case 'missing_measure': return `${cols.revenue ?? cols.price ?? cols.quantity ?? 'Sales amount'} is blank or not a number`;
    case 'duplicate': return `Duplicate of row ${duplicateOf}`;
  }
}

/** Sum of a column over the rows that have a number in it. Blank, text and non-finite cells add nothing. */
export function sumColumn(rows: Cells[], column: string): number {
  let sum = 0;
  for (const row of rows) {
    const v = parseAmount(row[column]);
    if (v !== null) sum += v;
  }
  return sum;
}
