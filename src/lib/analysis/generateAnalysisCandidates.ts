import type { EngineeredRow } from "../../types/features";
import type { SemanticIndex, BusinessRole } from "../../types/semantic";
import type { CapabilityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";
import type { AnalysisCandidate, ValueFormat } from "../../types/analysis";
import { buildLineChart, buildBarChart, buildHorizontalBarChart, buildScatterChart, buildPieChart, buildTable } from "./buildChartSpecs";
import { labelForMeasure } from "../labels";

/* ================================================================
   VERDIO — Stage 9: Analysis Candidate Generation
   Two entry points: one built from the statistics engine's output
   (trend, comparison, distribution, correlation, concentration),
   and one built from ML results (forecast, anomaly, segmentation) —
   called separately by runDataPipeline once ML has run, then merged
   before ranking.
   ================================================================ */

function formatFor(role: BusinessRole | undefined): ValueFormat {
  if (role === 'revenue' || role === 'price' || role === 'cost') return 'currency';
  if (role === 'quantity' || role === 'inventory') return 'count';
  if (role === 'percentage') return 'percentage';
  return 'plain';
}

function roleOfColumn(index: SemanticIndex, columnName: string): BusinessRole | undefined {
  for (const role of Object.keys(index.byRole) as BusinessRole[]) {
    if (index.get(role).some(c => c.columnName === columnName)) return role;
  }
  return undefined;
}

function aggregateByCategory(rows: EngineeredRow[], categoryCol: string, measureCol: string): { label: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[categoryCol] ?? '').trim();
    const v = Number(row[measureCol]);
    if (!label || !Number.isFinite(v)) continue;
    sums.set(label, (sums.get(label) || 0) + v);
  }
  return Array.from(sums.entries()).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
}

function primaryMeasureColumn(rows: EngineeredRow[], index: SemanticIndex): string | null {
  if (rows.some(r => r['__transactionValue'] !== undefined)) return '__transactionValue';
  return index.best('revenue')?.columnName || index.best('price')?.columnName || index.best('quantity')?.columnName || null;
}

export function generateAnalysisCandidates(
  rows: EngineeredRow[],
  index: SemanticIndex,
  capabilities: CapabilityReport,
  statistics: StatisticsResult
): AnalysisCandidate[] {
  const out: AnalysisCandidate[] = [];
  const has = (t: string) => capabilities.available.find(c => c.type === t);

  /* ── Trend ── */
  const trend = has('trend_analysis');
  if (trend && statistics.timeSeries.length) {
    const ts = statistics.timeSeries[0];
    const role = roleOfColumn(index, ts.measureColumn);
    const measureLabel = labelForMeasure(ts.measureColumn);
    out.push({
      id: 'trend', capability: 'trend_analysis',
      title: `${measureLabel} Over Time`,
      explanation: `Monthly ${measureLabel} across ${ts.points.length} time periods.`,
      score: Math.round(trend.confidence * 100),
      chart: buildLineChart(`${measureLabel} Trend`, ts.points.map(p => ({ period: p.label, value: p.value })), 'period', ['value'], formatFor(role), `${ts.points.length} months`),
    });
  }

  /* ── Comparison ── */
  const comparison = has('comparison');
  if (comparison && comparison.columns.length === 2) {
    const [catCol, measureCol] = comparison.columns;
    const agg = aggregateByCategory(rows, catCol, measureCol).slice(0, 8);
    if (agg.length) {
      const role = roleOfColumn(index, measureCol);
      const measureLabel = labelForMeasure(measureCol);
      out.push({
        id: 'comparison', capability: 'comparison',
        title: `${measureLabel} by ${catCol}`,
        explanation: `Top ${agg.length} "${catCol}" values ranked by total "${measureLabel}".`,
        score: Math.round(comparison.confidence * 100),
        chart: buildHorizontalBarChart(`${measureLabel} by ${catCol}`, agg, 'label', 'value', formatFor(role)),
      });
    }
  }

  /* ── Distribution ── */
  const distribution = has('distribution');
  if (distribution && statistics.numeric.length) {
    const measureCol = primaryMeasureColumn(rows, index) || statistics.numeric[0].column;
    const stat = statistics.numeric.find(s => s.column === measureCol) || statistics.numeric[0];
    const values = rows.map(r => Number(r[stat.column])).filter(Number.isFinite);
    if (values.length >= 8) {
      const binCount = 6;
      const span = (stat.max - stat.min) || 1;
      const binSize = span / binCount;
      const bins = Array.from({ length: binCount }, (_, i) => ({
        label: `${Math.round(stat.min + i * binSize)}–${Math.round(stat.min + (i + 1) * binSize)}`,
        value: 0,
      }));
      for (const v of values) {
        const idx = Math.min(binCount - 1, Math.floor((v - stat.min) / binSize));
        bins[Math.max(0, idx)].value++;
      }
      const role = roleOfColumn(index, stat.column);
      const measureLabel = labelForMeasure(stat.column);
      out.push({
        id: 'distribution', capability: 'distribution',
        title: `Distribution of ${measureLabel}`,
        explanation: `${values.length} values grouped into ${binCount} bands. Median ${stat.median}, ${stat.outlierCount} outlier(s) detected.`,
        score: Math.round(distribution.confidence * 100),
        chart: buildBarChart(`Distribution of ${measureLabel}`, bins, 'label', 'value', 'count', formatFor(role) === 'currency' ? 'Value bands' : undefined),
      });
    }
  }

  /* ── Correlation ── */
  const correlation = has('correlation');
  if (correlation && statistics.correlations.length) {
    const best = [...statistics.correlations].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))[0];
    if (best && best.strength !== 'negligible') {
      const points = rows
        .map(r => ({ x: Number(r[best.columnA]), y: Number(r[best.columnB]) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice(0, 300);
      out.push({
        id: 'correlation', capability: 'correlation',
        title: `${best.columnA} vs ${best.columnB}`,
        explanation: `${best.strength.replace('_', ' ')} ${best.direction} relationship (r = ${best.coefficient}).`,
        score: Math.round(correlation.confidence * 100 * Math.abs(best.coefficient)),
        chart: buildScatterChart(`${best.columnA} vs ${best.columnB}`, points, 'x', 'y', `Pearson r = ${best.coefficient}`),
      });
    }
  }

  /* ── Concentration ── */
  const concentration = has('concentration_analysis');
  if (concentration && concentration.columns.length === 2) {
    const [catCol, measureCol] = concentration.columns;
    const agg = aggregateByCategory(rows, catCol, measureCol);
    const total = agg.reduce((s, a) => s + a.value, 0);
    if (agg.length && total > 0) {
      const top = agg.slice(0, 5);
      const otherValue = total - top.reduce((s, a) => s + a.value, 0);
      const data = [...top, ...(otherValue > 0 ? [{ label: 'Other', value: Math.round(otherValue * 100) / 100 }] : [])]
        .map(d => ({ ...d, pct: Math.round((d.value / total) * 1000) / 10 }));
      const role = roleOfColumn(index, measureCol);
      const measureLabel = labelForMeasure(measureCol);
      out.push({
        id: 'concentration', capability: 'concentration_analysis',
        title: `${measureLabel} Concentration by ${catCol}`,
        explanation: `Top "${catCol}" value is ${data[0]?.pct ?? 0}% of total ${measureLabel}.`,
        score: Math.round(concentration.confidence * 100),
        chart: buildPieChart(`${measureLabel} Concentration`, data, 'label', 'value', formatFor(role)),
      });
    }
  }

  return out;
}

export function generateMLAnalysisCandidates(capabilities: CapabilityReport, ml: MLResults, statistics: StatisticsResult): AnalysisCandidate[] {
  const out: AnalysisCandidate[] = [];
  const has = (t: string) => capabilities.available.find(c => c.type === t);

  const forecasting = has('forecasting');
  if (forecasting && ml.forecast) {
    const historical = statistics.timeSeries.find(ts => ts.measureColumn === ml.forecast!.measureColumn)?.points || [];
    const forecastLabel = labelForMeasure(ml.forecast.measureColumn);
    const data = [
      ...historical.map(p => ({ period: p.label, historical: p.value, forecast: null })),
      ...ml.forecast.points.map(p => ({ period: p.periodLabel, historical: null, forecast: p.value })),
    ];
    out.push({
      id: 'forecast', capability: 'forecasting',
      title: `${forecastLabel} Forecast`,
      explanation: `Regression + Holt smoothing forecast for the next ${ml.forecast.points.length} periods (${ml.forecast.scenario} scenario).`,
      score: Math.round(forecasting.confidence * 100),
      chart: buildLineChart(`${forecastLabel} Forecast`, data, 'period', ['historical', 'forecast'], 'currency'),
    });
  }

  const anomaly = has('anomaly_detection');
  if (anomaly && ml.anomalies && ml.anomalies.points.some(p => p.isAnomaly)) {
    const flagged = ml.anomalies.points.filter(p => p.isAnomaly);
    const anomalyLabel = labelForMeasure(ml.anomalies.measureColumn);
    out.push({
      id: 'anomalies', capability: 'anomaly_detection',
      title: `${anomalyLabel} Anomalies`,
      explanation: `${flagged.length} period(s) deviate more than 1.8 standard deviations from the expected trend.`,
      score: Math.round(anomaly.confidence * 100),
      chart: buildTable(`${anomalyLabel} Anomalies`, flagged.map(p => ({ period: p.periodLabel, actual: p.actual, expected: p.expected, zScore: p.zScore })),
        [{ key: 'period', label: 'Period' }, { key: 'actual', label: 'Actual', format: 'currency' }, { key: 'expected', label: 'Expected', format: 'currency' }, { key: 'zScore', label: 'Z-Score' }]),
    });
  }

  const segmentation = has('segmentation');
  if (segmentation && ml.segmentation) {
    const counts = new Map<string, number>();
    for (const s of ml.segmentation.segments) counts.set(s.segment, (counts.get(s.segment) || 0) + 1);
    const labelMap: Record<string, string> = { champion: 'Champions', loyal: 'Loyal', atRisk: 'At Risk', new: 'New', lost: 'Lapsed' };
    const data = Array.from(counts.entries()).map(([segment, count]) => ({ segment: labelMap[segment] || segment, count }));
    out.push({
      id: 'segmentation', capability: 'segmentation',
      title: 'Customer Segments (RFM)',
      explanation: `${ml.segmentation.segments.length} customers segmented by recency, frequency and monetary value. Churn risk score: ${ml.segmentation.churnRiskScore}/100.`,
      score: Math.round(segmentation.confidence * 100),
      chart: buildBarChart('Customer Segments', data, 'segment', 'count', 'count'),
    });
  }

  return out;
}
