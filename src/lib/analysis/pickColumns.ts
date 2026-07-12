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

export function primaryMeasureColumn(semanticsColumns: ColumnSemantics[], engineeredRows: EngineeredRow[]): string | null {
  if (engineeredRows.some(row => row['__transactionValue'] !== undefined)) return '__transactionValue';
  return bestColumnOfRole(semanticsColumns, 'revenue') || bestColumnOfRole(semanticsColumns, 'price') || bestColumnOfRole(semanticsColumns, 'quantity');
}
