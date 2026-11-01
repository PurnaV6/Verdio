import { formatPounds, pluralise } from "../formatters";
import type { Ctx } from "../context";

/* ================================================================
   Notes about rows that do not count toward sales. Each number is
   recorded as a fact. Results saved before these fields existed have
   none, and give no notes.
   ================================================================ */

export function leftOutNotes(c: Ctx): string[] {
  const { f, r } = c;
  const notes: string[] = [];
  const excluded = r.cleaning.rowsExcluded;
  if (excluded) {
    const zeroOrBlank = excluded.zero_quantity + excluded.zero_price + excluded.zero_revenue + excluded.missing_measure;
    if (zeroOrBlank > 0) {
      const n = f.n('rowsLeftOutOfSales', zeroOrBlank, 'cleaning.rowsExcluded (zero, blank or unusable sales amounts)');
      notes.push(`${pluralise(n, 'row')} with a zero, blank or unusable sales amount ${n === 1 ? 'is' : 'are'} left out of sales totals. ${n === 1 ? 'It stays' : 'They stay'} in your data.`);
    }
    if (excluded.duplicate > 0) {
      const n = f.n('duplicateRowsLeftOut', excluded.duplicate, 'cleaning.rowsExcluded.duplicate');
      notes.push(`${pluralise(n, 'repeated row')} ${n === 1 ? 'is' : 'are'} left out of sales totals because the order ID repeats.`);
    }
  }
  if (r.cleaning.returns && r.cleaning.returns.count > 0) {
    const n = f.n('returnCount', r.cleaning.returns.count, 'cleaning.returns.count');
    const total = f.n('returnsTotal', Math.round(r.cleaning.returns.total), 'cleaning.returns.total (rounded)');
    notes.push(`${pluralise(n, 'return')} worth ${formatPounds(total)} ${n === 1 ? 'is' : 'are'} counted apart from sales.`);
  }
  if (r.cleaning.rowsCalculated && r.cleaning.rowsCalculated > 0) {
    const n = f.n('rowsCalculated', r.cleaning.rowsCalculated, 'cleaning.rowsCalculated');
    notes.push(`Revenue was calculated as price x quantity for ${pluralise(n, 'row')} where it was blank.`);
  }
  if (r.cleaning.duplicateHandling === 'flagged' && r.cleaning.duplicateRowCount) {
    const n = f.n('possibleDuplicates', r.cleaning.duplicateRowCount, 'cleaning.duplicateRowCount');
    notes.push(`${pluralise(n, 'row')} exactly ${n === 1 ? 'repeats' : 'repeat'} an earlier row. ${n === 1 ? 'It is' : 'They are'} kept in the totals and flagged as possible duplicates.`);
  }
  const undated = r.cleaning.undatedRows;
  if (undated && undated.count > 0) {
    const n = f.n('undatedRows', undated.count, 'cleaning.undatedRows.count');
    const value = f.n('undatedRowsValue', Math.round(undated.value), 'cleaning.undatedRows.value (rounded)');
    notes.push(`${pluralise(n, 'row')} ${n === 1 ? 'has' : 'have'} no date. ${n === 1 ? 'It is' : 'They are'} counted in total sales but not in the monthly trend, forecast or seasonality (${formatPounds(value)}).`);
  }
  return notes;
}
