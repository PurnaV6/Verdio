import type { EngineeredRow } from "../../types/features";
import type { TimeSeriesSummary } from "../../types/statistics";
import type { UndatedRows } from "../../types/dataPipeline";
import { parseAmount } from "./profileDataset";

/* ================================================================
   VERDIO — Undated rows
   A row with a sales amount but no usable date counts in total sales
   (the total never changes) yet has no month, so it is missing from the
   monthly trend, the forecast and seasonality. That gap is counted here
   so it is reported, never silent.
   ================================================================ */

export function undatedSentence(count: number, value: number): string {
  const amount = Math.round(value * 100) / 100;
  const shown = amount.toLocaleString('en-GB');
  return count === 1
    ? `1 row has no date. It is counted in total sales but not in the monthly trend, forecast or seasonality (${shown}).`
    : `${count.toLocaleString('en-GB')} rows have no date. They are counted in total sales but not in the monthly trend, forecast or seasonality (${shown}).`;
}

/** The rows that hold a sales amount but have no month, or null when there are none or the file has no monthly series. */
export function findUndatedRows(rows: EngineeredRow[], series: TimeSeriesSummary | undefined): UndatedRows | null {
  if (!series) return null;
  let count = 0, value = 0;
  for (const row of rows) {
    const v = parseAmount(row[series.measureColumn]);
    if (v === null || String(row['__monthKey'] ?? '') !== '') continue;
    count += 1;
    value += v;
  }
  if (count === 0) return null;
  const rounded = Math.round(value * 100) / 100;
  return { count, value: rounded, measureColumn: series.measureColumn, sentence: undatedSentence(count, rounded) };
}
