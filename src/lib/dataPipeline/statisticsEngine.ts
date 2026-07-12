import type { EngineeredRow } from "../../types/features";
import type { SemanticIndex, BusinessRole } from "../../types/semantic";
import type {
  StatisticsResult, NumericStatSummary, CategoryFrequency,
  CorrelationPair, CorrelationStrength, TimeSeriesSummary, TimePoint,
  SeasonalitySummary, SeasonalityPoint,
} from "../../types/statistics";

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ================================================================
   VERDIO — Stage 8: Statistics Engine
   Operates on the engineered rows (post feature-engineering) so it
   picks up derived columns like __transactionValue alongside any
   originally-detected numeric business-role columns.
   ================================================================ */

const NUMERIC_ROLES: BusinessRole[] = ['price', 'cost', 'revenue', 'quantity', 'percentage', 'inventory', 'duration'];
// Revenue-first priority order for picking the ONE primary measure — a "Total Amount"
// column must always win over a "Price per Unit" column when both exist, since summing
// a per-unit price across rows is meaningless while summing a total amount is not.
const MEASURE_PRIORITY: BusinessRole[] = ['revenue', 'price', 'cost', 'quantity', 'percentage', 'inventory', 'duration'];
const CATEGORY_ROLES: BusinessRole[] = ['category', 'product', 'location', 'status'];
const ENGINEERED_NUMERIC_KEYS = ['__transactionValue', '__margin', '__marginPct'];
const MAX_CORRELATION_PAIRS = 6;

function nums(rows: EngineeredRow[], col: string): number[] {
  return rows.map(r => Number(r[col])).filter(Number.isFinite);
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: number | null = null, bestCount = 1; // require at least 2 occurrences to call it a mode
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

function numericStat(column: string, values: number[]): NumericStatSummary | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr, upperFence = q3 + 1.5 * iqr;
  const outliers = values.filter(v => v < lowerFence || v > upperFence);

  return {
    column, count: values.length, mean: round2(mean), median: round2(median), mode: mode(values),
    q1: round2(q1), q3: round2(q3), stdDev: round2(stdDev), variance: round2(variance),
    min: Math.min(...values), max: Math.max(...values),
    outlierCount: outliers.length, outlierValues: outliers.slice(0, 10).map(round2),
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

function strengthOf(r: number): CorrelationStrength {
  const abs = Math.abs(r);
  if (abs < 0.1) return 'negligible';
  if (abs < 0.3) return 'weak';
  if (abs < 0.5) return 'moderate';
  if (abs < 0.7) return 'strong';
  return 'very_strong';
}

function computeSeasonality(rows: EngineeredRow[], index: SemanticIndex): SeasonalitySummary | null {
  const dateCol = index.best('date');
  if (!dateCol || !rows.some(r => r['__dayOfWeek'] !== undefined)) return null;

  const measureCol = ['__transactionValue', ...MEASURE_PRIORITY.flatMap(r => index.get(r).map(c => c.columnName))]
    .find(col => rows.some(r => r[col] !== undefined));
  if (!measureCol) return null;

  const dowSums = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  const monthSums = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));

  for (const row of rows) {
    const v = Number(row[measureCol]);
    if (!Number.isFinite(v)) continue;
    const dow = Number(row['__dayOfWeek']);
    const month = Number(row['__month']); // 1-12
    if (Number.isFinite(dow) && dow >= 0 && dow <= 6) { dowSums[dow].sum += v; dowSums[dow].count++; }
    if (Number.isFinite(month) && month >= 1 && month <= 12) { monthSums[month - 1].sum += v; monthSums[month - 1].count++; }
  }

  const byDayOfWeek: SeasonalityPoint[] = DOW_LABELS.map((label, i) => ({ label, value: round2(dowSums[i].sum), count: dowSums[i].count }));
  const byMonthOfYear: SeasonalityPoint[] = MONTH_LABELS.map((label, i) => ({ label, value: round2(monthSums[i].sum), count: monthSums[i].count }));

  return { measureColumn: measureCol, dateColumn: dateCol.columnName, byDayOfWeek, byMonthOfYear };
}

export function computeStatistics(rows: EngineeredRow[], index: SemanticIndex): StatisticsResult {
  if (!rows.length) return { numeric: [], categorical: [], correlations: [], timeSeries: [], seasonality: null };

  /* ── Numeric columns: business-role numerics + engineered numerics ── */
  const numericColumns = new Set<string>();
  for (const role of NUMERIC_ROLES) for (const c of index.get(role)) numericColumns.add(c.columnName);
  for (const k of ENGINEERED_NUMERIC_KEYS) if (rows.some(r => r[k] !== undefined)) numericColumns.add(k);

  const numeric: NumericStatSummary[] = [];
  for (const col of numericColumns) {
    const stat = numericStat(col, nums(rows, col));
    if (stat) numeric.push(stat);
  }

  /* ── Categorical frequency tables ── */
  const categorical: CategoryFrequency[] = [];
  for (const role of CATEGORY_ROLES) {
    for (const c of index.get(role)) {
      const values = rows.map(r => String(r[c.columnName] ?? '')).filter(v => v !== '');
      if (!values.length) continue;
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
      const frequencies = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count, pct: Math.round((count / values.length) * 1000) / 10 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      categorical.push({ column: c.columnName, totalRows: values.length, frequencies });
    }
  }

  /* ── Correlations between numeric column pairs ── */
  const correlations: CorrelationPair[] = [];
  const colList = Array.from(numericColumns).slice(0, MAX_CORRELATION_PAIRS);
  for (let i = 0; i < colList.length; i++) {
    for (let j = i + 1; j < colList.length; j++) {
      const a = nums(rows, colList[i]), b = nums(rows, colList[j]);
      if (a.length < 5 || b.length < 5) continue;
      const r = pearson(a, b);
      correlations.push({
        columnA: colList[i], columnB: colList[j], coefficient: round2(r),
        strength: strengthOf(r), direction: r > 0.05 ? 'positive' : r < -0.05 ? 'negative' : 'none',
      });
    }
  }

  /* ── Time series: group by __monthKey against the best available measure ── */
  const timeSeries: TimeSeriesSummary[] = [];
  const dateCol = index.best('date');
  if (dateCol && rows.some(r => r['__monthKey'] !== undefined)) {
    const measureCol = ['__transactionValue', ...MEASURE_PRIORITY.flatMap(r => index.get(r).map(c => c.columnName))]
      .find(col => rows.some(r => r[col] !== undefined));
    if (measureCol) {
      const byMonth = new Map<string, { sum: number; count: number; label: string }>();
      for (const row of rows) {
        const key = String(row['__monthKey'] ?? '');
        const v = Number(row[measureCol]);
        if (!key || !Number.isFinite(v)) continue;
        const entry = byMonth.get(key) || { sum: 0, count: 0, label: String(row['__monthLabel'] ?? key) };
        entry.sum += v; entry.count += 1;
        byMonth.set(key, entry);
      }
      const points: TimePoint[] = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periodKey, e]) => ({ periodKey, label: e.label, value: round2(e.sum), count: e.count }));
      if (points.length) timeSeries.push({ measureColumn: measureCol, dateColumn: dateCol.columnName, points });
    }
  }

  return { numeric, categorical, correlations, timeSeries, seasonality: computeSeasonality(rows, index) };
}
