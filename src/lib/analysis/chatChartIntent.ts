import type { PipelineResult } from "../../types/pipeline";
import type { ChartSpec } from "../../types/analysis";
import { buildBarChart } from "./buildChartSpecs";
import { computeCategoryBreakdown } from "./categoryBreakdown";
import { bestColumnOfRole, primaryMeasureColumn } from "./pickColumns";
import { labelForMeasure } from "../labels";

/* ================================================================
   VERDIO — Advisor Chat Chart Intent
   The Advisor is a text chat, but "show me the X graph" is a request
   for a visual, not prose. Rather than asking the LLM to describe a
   chart in words, detect this intent locally and render a real
   ChartSpec built from data we've already computed — faster, and
   guaranteed accurate since no model is involved.
   ================================================================ */

export interface ChartIntentResult { caption: string; chart: ChartSpec }

function yearlyChart(p: PipelineResult): ChartIntentResult | null {
  const ts = p.statistics.timeSeries[0];
  if (!ts || !ts.points.length) return null;
  const measureLabel = labelForMeasure(ts.measureColumn);
  const byYear = new Map<string, number>();
  for (const pt of ts.points) {
    const year = pt.periodKey.slice(0, 4);
    byYear.set(year, (byYear.get(year) || 0) + pt.value);
  }
  const data = Array.from(byYear.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, value]) => ({ year, value: Math.round(value * 100) / 100 }));
  if (data.length < 1) return null;
  return { caption: `Here's your yearly ${measureLabel} breakdown:`, chart: buildBarChart(`Yearly ${measureLabel}`, data, 'year', 'value', 'currency') };
}

function categoryChart(p: PipelineResult, role: 'product' | 'location', noun: string): ChartIntentResult | null {
  const col = bestColumnOfRole(p.semantics.columns, role);
  const measureCol = primaryMeasureColumn(p.semantics.columns, p.engineeredRows);
  if (!col || !measureCol) return null;
  const rows = computeCategoryBreakdown(p.engineeredRows, col, measureCol).slice(0, 8);
  if (!rows.length) return null;
  const measureLabel = labelForMeasure(measureCol);
  return {
    caption: `Here's ${measureLabel} by ${noun}:`,
    chart: buildBarChart(`${measureLabel} by ${col}`, rows.map(r => ({ label: r.label, value: r.value })), 'label', 'value', 'currency'),
  };
}

function fromAnalysisId(p: PipelineResult, id: string, caption: string): ChartIntentResult | null {
  const a = p.analyses.find(a => a.id === id);
  return a ? { caption, chart: a.chart } : null;
}

export function detectChartIntent(userMsg: string, p: PipelineResult): ChartIntentResult | null {
  const msg = userMsg.toLowerCase();
  const wantsVisual = /graph|chart|plot|visuali[sz]e|breakdown|show me|pie|bar chart/.test(msg);
  if (!wantsVisual) return null;

  if (/year/.test(msg)) { const r = yearlyChart(p); if (r) return r; }
  if (/month|trend|over time/.test(msg)) { const r = fromAnalysisId(p, 'trend', "Here's the trend over time:"); if (r) return r; }
  if (/forecast|predict|next (period|month|quarter)/.test(msg)) { const r = fromAnalysisId(p, 'forecast', "Here's the forecast:"); if (r) return r; }
  if (/product|category|item|sku/.test(msg)) { const r = categoryChart(p, 'product', 'product'); if (r) return r; }
  if (/market|country|region|location/.test(msg)) { const r = categoryChart(p, 'location', 'market'); if (r) return r; }
  if (/season/.test(msg)) {
    const s = p.statistics.seasonality;
    if (s) return { caption: `Here's the seasonality pattern by month:`, chart: buildBarChart(`${labelForMeasure(s.measureColumn)} by Month`, s.byMonthOfYear, 'label', 'value', 'currency') };
  }
  if (/customer|segment|rfm/.test(msg)) { const r = fromAnalysisId(p, 'segmentation', "Here's the customer segmentation:"); if (r) return r; }
  if (/anomal/.test(msg)) { const r = fromAnalysisId(p, 'anomalies', "Here are the detected anomalies:"); if (r) return r; }
  if (/distribut/.test(msg)) { const r = fromAnalysisId(p, 'distribution', "Here's the distribution:"); if (r) return r; }
  if (/correlat|relationship/.test(msg)) { const r = fromAnalysisId(p, 'correlation', "Here's the correlation:"); if (r) return r; }
  if (/concentrat/.test(msg)) { const r = fromAnalysisId(p, 'concentration', "Here's the concentration breakdown:"); if (r) return r; }

  // Generic measure words ("revenue graph", "sales chart", "income breakdown") with no
  // specific time granularity — default to the trend-over-time view, the most universally
  // useful answer to "show me the X graph" when X is just the measure name.
  if (/revenue|sales|income|profit|turnover|takings|money|performance/.test(msg)) {
    const r = fromAnalysisId(p, 'trend', "Here's the trend over time:");
    if (r) return r;
  }

  // Last resort: the person clearly wants SOME visual but nothing specific matched —
  // show the highest-ranked available analysis rather than falling through to a text
  // answer that can't actually deliver what was asked for.
  if (p.analyses.length) {
    const top = p.analyses[0];
    return { caption: `I wasn't sure exactly which chart you meant, so here's ${top.title.toLowerCase()} — ask me for a specific one (trend, forecast, products, markets, seasonality, customers, correlations) if you'd like something else:`, chart: top.chart };
  }

  return null;
}
