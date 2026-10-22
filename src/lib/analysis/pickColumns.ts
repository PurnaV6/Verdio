import type { EngineeredRow } from "../../types/features";
import type { ColumnSemantics } from "../../types/semantic";

/* ================================================================
   VERDIO — Column Picking Helpers
   Small shared logic for "which column plays this role" and "what's
   the primary numeric measure" — used by the Products page and the
   AI prompt builder so both agree on the same facts.
   ================================================================ */

export function bestColumnOfRole(semanticsColumns: ColumnSemantics[], role: string): string | null {
  const matches = semanticsColumns.filter(c => c.businessRole === role).sort((a, b) => b.confidence - a.confidence);
  return matches[0]?.columnName || null;
}

/** The one rule for "the sales measure": a computed transaction value, else revenue, else price, else quantity. */
export function pickPrimaryMeasure(hasTransactionValue: boolean, bestOfRole: (role: string) => string | null): string | null {
  if (hasTransactionValue) return '__transactionValue';
  return bestOfRole('revenue') || bestOfRole('price') || bestOfRole('quantity');
}

export function primaryMeasureColumn(semanticsColumns: ColumnSemantics[], engineeredRows: EngineeredRow[]): string | null {
  return pickPrimaryMeasure(engineeredRows.some(row => row['__transactionValue'] !== undefined), role => bestColumnOfRole(semanticsColumns, role));
}
