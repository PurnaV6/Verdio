import type { PipelineResult } from "../../types/pipeline";
import { computeCategoryBreakdown } from "./categoryBreakdown";
import { bestColumnOfRole, primaryMeasureColumn } from "./pickColumns";
import { labelForMeasure } from "../labels";

/* ================================================================
   VERDIO — Shared Fact Summaries
   Computes real, specific facts from the pipeline result (top
   product, top market, forecast, yearly rollup) so that ANY AI
   surface — executive summary, risk/rec narration, or the Advisor
   chat — can state actual answers instead of describing how the
   user would go compute them.
   ================================================================ */

export function buildTopMoversFact(p: PipelineResult): string {
  const measureCol = primaryMeasureColumn(p.semantics.columns, p.engineeredRows);
  if (!measureCol) return 'No monetary/quantity measure detected — no top product or market fact available.';

  const measureLabel = labelForMeasure(measureCol);
  const lines: string[] = [];

  const productCol = bestColumnOfRole(p.semantics.columns, 'product');
  if (productCol) {
    const top = computeCategoryBreakdown(p.engineeredRows, productCol, measureCol)[0];
    if (top) lines.push(`Best-selling product: "${top.label}" — ${measureLabel} ${top.value.toLocaleString('en-GB')} across ${top.count} orders (${top.pct}% of total).`);
  }
  const locationCol = bestColumnOfRole(p.semantics.columns, 'location');
  if (locationCol) {
    const top = computeCategoryBreakdown(p.engineeredRows, locationCol, measureCol)[0];
    if (top) lines.push(`Top market: "${top.label}" — ${measureLabel} ${top.value.toLocaleString('en-GB')} (${top.pct}% of total).`);
  }
  return lines.length ? lines.join('\n') : 'No product or market category column detected — no top mover fact available.';
}

export function buildPredictiveFact(p: PipelineResult): string {
  if (!p.ml.forecast) return 'Forecasting not available for this dataset.';
  const measureLabel = labelForMeasure(p.ml.forecast.measureColumn);
  const ts = p.statistics.timeSeries.find(t => t.measureColumn === p.ml.forecast!.measureColumn);
  const last = ts?.points[ts.points.length - 1]?.value;
  const next = p.ml.forecast.holtNextPeriod;
  const trendDesc = last ? `${next > last ? 'up' : next < last ? 'down' : 'flat'} from the most recent period (${Math.round(last).toLocaleString('en-GB')})` : '';
  return `Next-period forecast: ${Math.round(next).toLocaleString('en-GB')} for "${measureLabel}"${trendDesc ? ', trending ' + trendDesc : ''}. Monthly trend: ${p.ml.forecast.monthlyTrendPct >= 0 ? '+' : ''}${p.ml.forecast.monthlyTrendPct}% per period.`;
}

/* Aggregates the monthly time series (periodKey "YYYY-MM") up to yearly totals —
   used to answer requests like "yearly sales graph" with real numbers. */
export function buildYearlySummaryFact(p: PipelineResult): string {
  const ts = p.statistics.timeSeries[0];
  if (!ts || !ts.points.length) return 'No time-series data available for a yearly breakdown.';
  const measureLabel = labelForMeasure(ts.measureColumn);

  const byYear = new Map<string, number>();
  for (const pt of ts.points) {
    const year = pt.periodKey.slice(0, 4);
    byYear.set(year, (byYear.get(year) || 0) + pt.value);
  }
  const lines = Array.from(byYear.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, total]) => `${year}: ${Math.round(total).toLocaleString('en-GB')}`);

  return `Yearly ${measureLabel} totals:\n${lines.join('\n')}`;
}

/* Full-detail summary used by the Advisor chat — every risk/recommendation with its
   real description (not just a title), plus the computed facts above. */
export function buildAdvisorContext(p: PipelineResult): string {
  const risks = p.decision.risks.map(r => `- [${r.level}] ${r.title}: ${r.desc}`).join('\n') || 'None detected.';
  const recs  = p.decision.recommendations.map(r => `- [${r.impact}] ${r.title}: ${r.desc}`).join('\n') || 'None generated.';

  return `You are Verdio's AI business advisor, embedded in a live dashboard. You have DIRECT ACCESS to this dataset's actual computed results below — you are not describing a hypothetical analysis, you already have the real numbers and names. ALWAYS answer using the specific facts given here. NEVER respond with instructions for how the user could compute something themselves (e.g. never say "extract the X column and group by Y") — if the answer exists below, state it directly; if it genuinely isn't below, say so plainly and suggest which Verdio page would show it (Analyses, Products & Markets, Forecast, Customers, Seasonality).
Be direct, specific and numerate. Max 5 sentences unless the question needs a list. No markdown headers.

DATASET: ${p.source.fileName} | ${p.source.rowCount} rows | Health ${p.decision.health.total}/100 | Data quality ${p.quality.overallScore}/100
DETECTED COLUMN ROLES: ${p.semantics.columns.filter(c => c.businessRole !== 'unknown').map(c => `${c.columnName}=${c.businessRole}`).join(', ') || 'none confidently detected'}

TOP PRODUCT/MARKET FACTS:
${buildTopMoversFact(p)}

FORECAST:
${buildPredictiveFact(p)}

YEARLY BREAKDOWN:
${buildYearlySummaryFact(p)}

ALL RISKS DETECTED:
${risks}

ALL RECOMMENDATIONS:
${recs}`;
}
