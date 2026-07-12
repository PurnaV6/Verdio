/* ================================================================
   VERDIO — Measure Label Helper
   Internal engineered-feature keys (e.g. "__transactionValue") must
   never leak into user-facing text. Use this wherever a measure
   column name gets interpolated into a title, desc, or explanation.
   Raw keys are still fine for chart data keys / sourceColumns.
   ================================================================ */

const LABELS: Record<string, string> = {
  __transactionValue: 'Revenue',
  __margin: 'Margin',
  __marginPct: 'Margin %',
};

export function labelForMeasure(column: string): string {
  return LABELS[column] || column;
}
