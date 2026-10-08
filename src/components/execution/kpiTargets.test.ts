import { describe, expect, it } from "vitest";
import { buildKpiTargets, mergeSavedTargets } from "./kpiTargets";
import { computeHealthScore } from "../../lib/decision/healthScoreEngine";
import type { PipelineResult } from "../../types/pipeline";
import type { DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";

const quality: DataQualityReport = {
  overallScore: 88, completenessScore: 88, validityScore: 88, consistencyScore: 88, uniquenessScore: 88,
  duplicateRowPct: 0, columns: [], flags: [],
};

const growing: StatisticsResult = {
  numeric: [], categorical: [], correlations: [], seasonality: null,
  timeSeries: [{
    measureColumn: "revenue", dateColumn: "date",
    points: [100, 110, 120, 130].map((value, i) => ({ periodKey: `2024-0${i + 1}`, label: `M${i + 1}`, value, count: 1 })),
  }],
};

const noMl: MLResults = { forecast: null, anomalies: null, segmentation: null };

function result(forecastConfidence?: number): PipelineResult {
  const health = computeHealthScore(quality, growing, noMl);
  return {
    quality,
    decision: { health },
    _modelMeta: forecastConfidence === undefined ? {} : { forecast: { confidence: forecastConfidence } },
  } as unknown as PipelineResult;
}

describe("buildKpiTargets", () => {
  it("reports the real Performance Trend pillar score instead of a pillar that does not exist", () => {
    const r = result(0.9);
    const trendPillar = r.decision.health.pillars.find(p => p.name === "Performance Trend")!;
    const row = buildKpiTargets(r).find(t => t.id === "trend")!;

    expect(trendPillar.score).toBeGreaterThan(0);
    expect(row.label).toBe("Performance trend");
    expect(row.current).toBe(trendPillar.score);
    expect(row.unit).toBe(`/${trendPillar.max}`);
    expect(buildKpiTargets(r).some(t => /growth/i.test(t.label))).toBe(false);
  });

  it("names the forecast suitability score as model fit, not confidence", () => {
    const rows = buildKpiTargets(result(0.84));
    const row = rows.find(t => t.id === "modelfit")!;

    expect(row.label).toBe("Model fit");
    expect(row.current).toBe(84);
    expect(row.hint).toMatch(/not a measure of forecast accuracy/i);
    expect(rows.some(t => /confidence/i.test(t.label))).toBe(false);
  });

  it("omits model fit when no forecast model was selected", () => {
    expect(buildKpiTargets(result()).some(t => t.id === "modelfit")).toBe(false);
  });
});

describe("mergeSavedTargets", () => {
  it("keeps the user's edited target but takes the current value from the live analysis", () => {
    const defaults = buildKpiTargets(result(0.9));
    const saved = defaults.map(t => ({ ...t, current: 0, target: t.id === "health" ? 99 : t.target }));
    const merged = mergeSavedTargets(defaults, saved);

    expect(merged.find(t => t.id === "health")!.target).toBe(99);
    expect(merged.find(t => t.id === "health")!.current).toBe(defaults.find(t => t.id === "health")!.current);
  });

  it("drops retired rows that were saved under the old growth and confidence ids", () => {
    const defaults = buildKpiTargets(result(0.9));
    const saved = [
      { id: "growth", label: "Growth pillar", current: 0, target: 18, unit: "/25", direction: "up" as const },
      { id: "confidence", label: "Forecast confidence", current: 90, target: 98, unit: "%", direction: "up" as const },
    ];
    expect(mergeSavedTargets(defaults, saved).map(t => t.id)).toEqual(defaults.map(t => t.id));
  });

  it("returns the defaults when nothing is saved", () => {
    const defaults = buildKpiTargets(result(0.9));
    expect(mergeSavedTargets(defaults, undefined)).toBe(defaults);
  });
});
