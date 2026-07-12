import type { EngineeredRow } from "../../types/features";
import type { CategoryBreakdownRow } from "../../types/statistics";

/* ================================================================
   VERDIO — Category Breakdown
   Full ranked breakdown of a measure by category, including row
   counts and % share — richer than the simple aggregateByCategory
   used inline by chart generation, this backs table views like the
   Products & Markets page.
   ================================================================ */

export function computeCategoryBreakdown(rows: EngineeredRow[], categoryCol: string, measureCol: string): CategoryBreakdownRow[] {
  const sums = new Map<string, { value: number; count: number }>();
  for (const row of rows) {
    const label = String(row[categoryCol] ?? '').trim();
    const v = Number(row[measureCol]);
    if (!label || !Number.isFinite(v)) continue;
    const entry = sums.get(label) || { value: 0, count: 0 };
    entry.value += v; entry.count += 1;
    sums.set(label, entry);
  }
  const total = Array.from(sums.values()).reduce((s, e) => s + e.value, 0);
  return Array.from(sums.entries())
    .map(([label, e]) => ({ label, value: Math.round(e.value * 100) / 100, count: e.count, pct: total ? Math.round((e.value / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.value - a.value);
}
