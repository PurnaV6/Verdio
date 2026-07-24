import { describe, expect, it } from "vitest";
import { computeHealthScore } from "./healthScoreEngine";
import type { DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult, TimePoint } from "../../types/statistics";
import type { MLResults } from "../../types/ml";

function quality(overallScore: number): DataQualityReport {
  return {
    issues: [],
    overallScore,
    completenessScore: overallScore,
    validityScore: overallScore,
    consistencyScore: overallScore,
    uniquenessScore: overallScore,
    duplicateRowPct: 0,
    columns: [],
    flags: [],
  };
}

function statisticsWithTimeSeries(values: number[]): StatisticsResult {
  const points: TimePoint[] = values.map((value, i) => ({
    periodKey: `2024-${String(i + 1).padStart(2, "0")}`,
    label: `Month ${i + 1}`,
    value,
    count: 1,
  }));
  return {
    numeric: [],
    categorical: [],
    correlations: [],
    timeSeries: points.length ? [{ measureColumn: "revenue", dateColumn: "date", points }] : [],
    seasonality: null,
  };
}

const emptyStatistics: StatisticsResult = { numeric: [], categorical: [], correlations: [], timeSeries: [], seasonality: null };
const emptyMl: MLResults = { forecast: null, anomalies: null, segmentation: null };

describe("computeHealthScore", () => {
  it("falls back to neutral pillar scores when no time series or segmentation data exists", () => {
    const result = computeHealthScore(quality(80), emptyStatistics, emptyMl);
    const trend = result.pillars.find(p => p.name === "Performance Trend")!;
    const customer = result.pillars.find(p => p.name === "Customer Strength")!;
    expect(trend.score).toBe(12);
    expect(customer.score).toBe(12);
  });

  it("scores the data quality pillar as a direct fraction of overallScore", () => {
    const result = computeHealthScore(quality(80), emptyStatistics, emptyMl);
    const dataQuality = result.pillars.find(p => p.name === "Data Quality")!;
    expect(dataQuality.score).toBe(20); // 80/100 * 25
  });

  it("rewards a rising time series with a higher trend score than a flat one", () => {
    const rising = computeHealthScore(quality(80), statisticsWithTimeSeries([100, 120, 150, 200]), emptyMl);
    const flat = computeHealthScore(quality(80), statisticsWithTimeSeries([100, 100, 100, 100]), emptyMl);
    const risingTrend = rising.pillars.find(p => p.name === "Performance Trend")!.score;
    const flatTrend = flat.pillars.find(p => p.name === "Performance Trend")!.score;
    expect(risingTrend).toBeGreaterThan(flatTrend);
  });

  it("penalises a volatile time series with a lower stability score than a steady one", () => {
    const volatile = computeHealthScore(quality(80), statisticsWithTimeSeries([50, 500, 20, 800, 10]), emptyMl);
    const steady = computeHealthScore(quality(80), statisticsWithTimeSeries([100, 102, 98, 101, 99]), emptyMl);
    const volatileStability = volatile.pillars.find(p => p.name === "Stability")!.score;
    const steadyStability = steady.pillars.find(p => p.name === "Stability")!.score;
    expect(volatileStability).toBeLessThan(steadyStability);
  });

  it("keeps every pillar within its 0-25 bound and the total within 0-100", () => {
    const extreme = computeHealthScore(quality(0), statisticsWithTimeSeries([1, 1000000]), emptyMl);
    for (const pillar of extreme.pillars) {
      expect(pillar.score).toBeGreaterThanOrEqual(0);
      expect(pillar.score).toBeLessThanOrEqual(25);
    }
    expect(extreme.total).toBeGreaterThanOrEqual(0);
    expect(extreme.total).toBeLessThanOrEqual(100);
  });

  it("gives champion-heavy segmentation a higher customer score than mostly one-off buyers", () => {
    const repeatHeavy: MLResults = {
      ...emptyMl,
      segmentation: {
        customerColumn: "customer", dateColumn: "date", measureColumn: "revenue",
        segments: [
          { id: "a", monetary: 500, frequency: 5, segment: "champion", rfmScore: 9 },
          { id: "b", monetary: 400, frequency: 4, segment: "loyal", rfmScore: 8 },
        ],
        churnRiskScore: 10, revenueAtRisk: 0,
      },
    };
    const oneOffHeavy: MLResults = {
      ...emptyMl,
      segmentation: {
        customerColumn: "customer", dateColumn: "date", measureColumn: "revenue",
        segments: [
          { id: "a", monetary: 500, frequency: 1, segment: "new", rfmScore: 3 },
          { id: "b", monetary: 400, frequency: 1, segment: "new", rfmScore: 3 },
        ],
        churnRiskScore: 60, revenueAtRisk: 400,
      },
    };
    const withRepeat = computeHealthScore(quality(80), emptyStatistics, repeatHeavy);
    const withOneOff = computeHealthScore(quality(80), emptyStatistics, oneOffHeavy);
    const repeatScore = withRepeat.pillars.find(p => p.name === "Customer Strength")!.score;
    const oneOffScore = withOneOff.pillars.find(p => p.name === "Customer Strength")!.score;
    expect(repeatScore).toBeGreaterThan(oneOffScore);
  });
});
