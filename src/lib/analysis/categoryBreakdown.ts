import type { EngineeredRow } from "../../types/features";
import type { CategoryBreakdownRow } from "../../types/statistics";
import { parseAmount } from "../dataPipeline/profileDataset";

/* ================================================================
   VERDIO — Category Breakdown
   Full ranked breakdown of a measure by category, including row
   counts and % share — richer than the simple aggregateByCategory
   used inline by chart generation, this backs table views like the
   Products & Markets page.
   ================================================================ */

/**
 * Total and row count of a measure per category label, in first-seen order. The one place that groups
 * a measure by category: a row with a blank label or a blank measure is skipped, never counted as 0.
 */
export function sumByCategory(rows: EngineeredRow[], categoryCol: string, measureCol: string): Map<string, { value: number; count: number }> {
  const sums = new Map<string, { value: number; count: number }>();
  for (const row of rows) {
    const label = String(row[categoryCol] ?? '').trim();
    const v = parseAmount(row[measureCol]);
    if (!label || v === null) continue;
    const entry = sums.get(label) || { value: 0, count: 0 };
    entry.value += v; entry.count += 1;
    sums.set(label, entry);
  }
  return sums;
}

export function computeCategoryBreakdown(rows: EngineeredRow[], categoryCol: string, measureCol: string): CategoryBreakdownRow[] {
  const sums = sumByCategory(rows, categoryCol, measureCol);
  const total = Array.from(sums.values()).reduce((s, e) => s + e.value, 0);
  return Array.from(sums.entries())
    .map(([label, e]) => ({ label, value: Math.round(e.value * 100) / 100, count: e.count, pct: total ? Math.round((e.value / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.value - a.value);
}
