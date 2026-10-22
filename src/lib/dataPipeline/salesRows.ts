import { parseAmount } from "./profileDataset";

/* ================================================================
   VERDIO — Sales rows (pure)
   Which rows count toward sales, and blank-aware sums. A blank is
   skipped and never read as 0.
   ================================================================ */

type Cells = Record<string, unknown>;

/** Sum of a column over the rows that have a number in it. Blank, text and non-finite cells add nothing. */
export function sumColumn(rows: Cells[], column: string): number {
  let sum = 0;
  for (const row of rows) {
    const v = parseAmount(row[column]);
    if (v !== null) sum += v;
  }
  return sum;
}
