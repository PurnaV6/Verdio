import type { TimeSeriesSummary } from "../../types/statistics";
import type { ForecastResult, ForecastPoint } from "../../types/ml";

/* ================================================================
   VERDIO — ML: Forecasting
   Generalized from the retail-specific version in calculateMetrics.ts.
   Only call this when detectCapabilities confirms 'forecasting' is
   available (i.e. enough distinct time periods exist).
   ================================================================ */

function linReg(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function holtSmooth(values: number[]): number {
  if (values.length < 2) return values[0] || 0;
  const alpha = 0.4, beta = 0.3;
  let level = values[0], trend = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return Math.round(level + trend);
}

function nextPeriodLabels(lastPeriodKey: string, count: number): string[] {
  const [y, m] = lastPeriodKey.split('-').map(Number);
  const labels: string[] = [];
  let year = y, month = m;
  for (let i = 0; i < count; i++) {
    month++;
    if (month > 12) { month = 1; year++; }
    labels.push(new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }));
  }
  return labels;
}

export function runForecast(series: TimeSeriesSummary, scenario: 'base' | 'optimistic' | 'conservative' = 'base', horizon = 6): ForecastResult {
  const values = series.points.map(p => p.value);
  const lastKey = series.points[series.points.length - 1]?.periodKey || '2024-01';
  const labels = nextPeriodLabels(lastKey, horizon);

  if (values.length < 2) {
    return {
      measureColumn: series.measureColumn, scenario,
      points: labels.map(l => ({ periodLabel: l, value: 0, low: 0, high: 0 })),
      monthlyTrendPct: 0, holtNextPeriod: 0,
    };
  }

  const { slope, intercept } = linReg(values);
  const mult = scenario === 'optimistic' ? 1.15 : scenario === 'conservative' ? 0.85 : 1;
  const n = values.length;

  const points: ForecastPoint[] = labels.map((label, i) => {
    const base = Math.max(0, (intercept + slope * (n + i)) * mult);
    const ci = base * 0.12;
    return { periodLabel: label, value: Math.round(base), low: Math.round(base - ci), high: Math.round(base + ci) };
  });

  const last = values[values.length - 1] || 1;
  const monthlyTrendPct = Math.round((slope / last) * 1000) / 10;
  const holtNextPeriod = holtSmooth(values);

  return { measureColumn: series.measureColumn, scenario, points, monthlyTrendPct, holtNextPeriod: Math.max(points[0]?.value || 0, holtNextPeriod) };
}
