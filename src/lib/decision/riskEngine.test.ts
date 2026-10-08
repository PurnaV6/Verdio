import { describe, expect, it } from "vitest";
import { detectRisks } from "./riskEngine";
import { runAnomalyDetection } from "../ml/anomalyEngine";
import type { CapabilityReport, DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";

const quality: DataQualityReport = {
  overallScore: 95, completenessScore: 95, validityScore: 95, consistencyScore: 95, uniquenessScore: 95,
  duplicateRowPct: 0, columns: [], flags: [],
};
const capabilities = { available: [], capabilities: [] } as unknown as CapabilityReport;

describe("anomaly risk wording", () => {
  const values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 10, 12];
  const series = {
    measureColumn: "revenue", dateColumn: "date",
    points: values.map((value, i) => ({ periodKey: `2024-${String(i + 1).padStart(2, "0")}`, label: `Month ${i + 1}`, value, count: 1 })),
  };
  const statistics: StatisticsResult = { numeric: [], categorical: [], correlations: [], timeSeries: [series], seasonality: null };
  const anomalies = runAnomalyDetection(series);
  const ml: MLResults = { forecast: null, anomalies, segmentation: null };

  it("compares flagged periods with the series mean, as the detection does", () => {
    const mean = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    expect(anomalies.points.filter(p => p.isAnomaly).every(p => p.expected === mean)).toBe(true);
  });

  it("describes the baseline as the average, not a trend", () => {
    const risk = detectRisks([], capabilities, statistics, quality, ml).find(r => r.title === "Unexplained Revenue Drops")!;
    expect(risk.desc).toContain("below the average");
    expect(risk.desc).not.toMatch(/trend would predict/);
  });
});
