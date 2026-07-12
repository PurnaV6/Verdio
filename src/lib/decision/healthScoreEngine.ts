import type { DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";
import type { HealthScore } from "../../types/decision";

/* ================================================================
   VERDIO — Decision: Health Score
   Four pillars, each scored 0–25. Falls back to a neutral mid-score
   on a pillar when the underlying data isn't available, rather than
   penalising a dataset for lacking a capability it was never going
   to have (e.g. no date column at all).
   ================================================================ */

export function computeHealthScore(quality: DataQualityReport, statistics: StatisticsResult, ml: MLResults): HealthScore {
  /* Trend pillar — growth of the primary time series, if one exists */
  let trendScore = 12; // neutral default
  const ts = statistics.timeSeries[0];
  if (ts && ts.points.length > 1) {
    const first = ts.points[0].value, last = ts.points[ts.points.length - 1].value;
    const growth = (last - first) / (first || 1);
    trendScore = Math.min(25, Math.max(0, 12 + growth * 25));
  }

  /* Customer strength pillar — repeat behaviour if segmentation ran, else neutral */
  let customerScore = 12;
  if (ml.segmentation && ml.segmentation.segments.length) {
    const repeatShare = ml.segmentation.segments.filter(s => s.frequency > 1).length / ml.segmentation.segments.length;
    customerScore = Math.min(25, Math.round(repeatShare * 25) + 5);
  }

  /* Data quality pillar — directly from the quality engine */
  const qualityScore = Math.round((quality.overallScore / 100) * 25);

  /* Stability pillar — coefficient of variation of the primary time series */
  let stabilityScore = 15;
  if (ts && ts.points.length > 2) {
    const values = ts.points.map(p => p.value);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const cv = mean ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) / mean : 0;
    stabilityScore = Math.min(25, Math.max(0, Math.round(25 - cv * 30)));
  }

  const total = Math.min(100, Math.max(0, Math.round(trendScore + customerScore + qualityScore + stabilityScore)));

  return {
    total,
    pillars: [
      { name: 'Performance Trend', score: Math.round(trendScore), max: 25, color: '#16A34A' },
      { name: 'Customer Strength', score: Math.round(customerScore), max: 25, color: '#DC2626' },
      { name: 'Data Quality',      score: qualityScore,             max: 25, color: '#2563EB' },
      { name: 'Stability',         score: Math.round(stabilityScore), max: 25, color: '#D97706' },
    ],
  };
}
