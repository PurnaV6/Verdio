import { describe, expect, it } from "vitest";
import { buildVerdioDecisions } from "./verdioDecisionEngine";
import type { DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";
import type { Recommendation } from "../../types/decision";
import type { SemanticIndex } from "../../types/semantic";

const quality: DataQualityReport = {
  overallScore: 90, completenessScore: 90, validityScore: 90, consistencyScore: 90, uniquenessScore: 90,
  duplicateRowPct: 0, columns: [], flags: [],
};
const stats: StatisticsResult = { numeric: [], categorical: [], correlations: [], timeSeries: [], seasonality: null };
const noMl: MLResults = { forecast: null, anomalies: null, segmentation: null };
const index = { best: (role: string) => (role === "revenue" ? { columnName: "revenue" } : undefined) } as unknown as SemanticIndex;
const rows = [{ revenue: 600 }, { revenue: 400 }];

function impactFor(title: string, ml: MLResults = noMl) {
  const rec: Recommendation = { title, desc: "x", impact: "medium", sourceColumns: [] };
  const out = buildVerdioDecisions({ risks: [], recommendations: [rec], ml, statistics: stats, quality, engineeredRows: rows, index });
  return { impact: out.rankedActions[0].financialImpact, summary: out.summary };
}

describe("financial impact basis text", () => {
  it("keeps the numbers and states the fixed 12% growth assumption", () => {
    const { impact } = impactFor("Accelerate growth");
    expect(impact.estimatedValue).toBe(120);
    expect(impact.basis).toMatch(/12%.*fixed planning assumption/);
  });

  it("keeps the numbers and states the fixed 5% default assumption", () => {
    const { impact } = impactFor("Improve data collection");
    expect(impact.estimatedValue).toBe(50);
    expect(impact.basis).toMatch(/5%.*fixed planning assumption/);
  });

  it("states the 15% fallback when there is no segmentation result", () => {
    const { impact } = impactFor("Re-engage 5 at-risk/lapsed customers");
    expect(impact.estimatedValue).toBe(150);
    expect(impact.basis).toMatch(/15%.*fixed planning assumption/);
  });

  it("calls the headline figure a planning estimate", () => {
    const { summary } = impactFor("Accelerate growth");
    expect(summary).toContain("planning estimate of £120");
    expect(summary).not.toContain("estimated impact");
  });
});
