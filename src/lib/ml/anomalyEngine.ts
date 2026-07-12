import type { TimeSeriesSummary } from "../../types/statistics";
import type { AnomalyResult } from "../../types/ml";

/* ================================================================
   VERDIO — ML: Anomaly Detection
   Flags periods where the measure deviates more than 1.8 standard
   deviations from the series mean. Only call when detectCapabilities
   confirms 'anomaly_detection' is available.
   ================================================================ */

const Z_THRESHOLD = 1.8;

export function runAnomalyDetection(series: TimeSeriesSummary): AnomalyResult {
  const values = series.points.map(p => p.value);
  if (values.length < 3) return { measureColumn: series.measureColumn, points: [] };

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

  const points = series.points.map(p => {
    const zScore = std > 0 ? (p.value - mean) / std : 0;
    return {
      periodLabel: p.label,
      actual: Math.round(p.value),
      expected: Math.round(mean),
      zScore: Math.round(zScore * 10) / 10,
      isAnomaly: Math.abs(zScore) > Z_THRESHOLD,
    };
  });

  return { measureColumn: series.measureColumn, points };
}
