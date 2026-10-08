import { describe, expect, it } from "vitest";
import { computeChangePct, getRevenueView, NO_EARLIER_PERIOD } from "./revenue";
import type { PipelineResult } from "../../types/pipeline";

describe("computeChangePct", () => {
  it("returns the percentage movement when the previous period has a value", () => {
    expect(computeChangePct(110, 100)).toBeCloseTo(10);
    expect(computeChangePct(80, 100)).toBeCloseTo(-20);
  });

  it("returns null, not 0, when the previous period is zero", () => {
    expect(computeChangePct(500, 0)).toBeNull();
  });

  it("returns null when there is no earlier period", () => {
    expect(computeChangePct(500, undefined)).toBeNull();
  });

  it("still reports a genuine 0% movement as 0", () => {
    expect(computeChangePct(100, 100)).toBe(0);
  });
});

function result(values: number[]): PipelineResult {
  return {
    semantics: { columns: [{ columnName: "revenue", businessRole: "revenue", confidence: 0.9 }] },
    engineeredRows: [],
    organization: undefined,
    ml: { forecast: null, anomalies: null, segmentation: null },
    statistics: {
      timeSeries: [{
        measureColumn: "revenue", dateColumn: "date",
        points: values.map((value, i) => ({ periodKey: `2024-0${i + 1}`, label: `M${i + 1}`, value, count: 1 })),
      }],
    },
  } as unknown as PipelineResult;
}

describe("getRevenueView movement", () => {
  it("has no movement when the only earlier month is zero", () => {
    expect(getRevenueView(result([0, 250])).changePct).toBeNull();
  });

  it("has no movement for a single month", () => {
    expect(getRevenueView(result([250])).changePct).toBeNull();
  });

  it("reports movement between the last two months otherwise", () => {
    expect(getRevenueView(result([100, 125])).changePct).toBeCloseTo(25);
  });

  it("exposes the wording shown when no comparison is possible", () => {
    expect(NO_EARLIER_PERIOD).toBe("No earlier month to compare with");
  });
});
