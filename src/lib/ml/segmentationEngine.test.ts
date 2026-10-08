import { describe, expect, it } from "vitest";
import { runSegmentation } from "./segmentationEngine";
import { generateRecommendations } from "../decision/recommendationEngine";
import type { EngineeredRow } from "../../types/features";
import type { StatisticsResult } from "../../types/statistics";
import type { DataQualityReport } from "../../types/dataPipeline";
import type { MLResults } from "../../types/ml";

function order(customer: string, monthKey: string, amount = 100): EngineeredRow {
  return { customer, date: `${monthKey}-10`, revenue: amount, __monthKey: monthKey };
}

function monthKey(i: number) {
  return `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

const run = (rows: EngineeredRow[]) => runSegmentation(rows, "customer", "date", "revenue");

describe("runSegmentation customer count", () => {
  it("counts and segments every customer, not just the first 500", () => {
    const rows: EngineeredRow[] = [];
    for (let c = 0; c < 5000; c++) {
      rows.push(order(`C${c}`, monthKey(c % 12), 10 + (c % 50)));
      if (c % 3 === 0) rows.push(order(`C${c}`, monthKey((c + 5) % 12), 20));
    }
    const started = Date.now();
    const result = run(rows);
    const elapsed = Date.now() - started;

    expect(result.segments).toHaveLength(5000);
    expect(new Set(result.segments.map(s => s.id)).size).toBe(5000);
    expect(elapsed).toBeLessThan(2000);
  });

  it("returns no segments for no usable rows", () => {
    expect(run([]).segments).toEqual([]);
  });
});

describe("runSegmentation recency", () => {
  /* "oldBuyer" has a long active span but stopped in month 3; "newBuyer" has a short span and is current.
     Measured as tenure, oldBuyer would look the more recent customer. */
  function scenario() {
    const rows: EngineeredRow[] = [];
    for (let m = 0; m <= 3; m++) rows.push(order("oldBuyer", monthKey(m)));
    rows.push(order("newBuyer", monthKey(11)));
    rows.push(order("newBuyer", monthKey(11)));
    for (let c = 0; c < 10; c++) for (let m = 0; m < 12; m++) rows.push(order(`steady${c}`, monthKey(m)));
    return run(rows);
  }

  it("measures recency as months from the last activity to the end of the data", () => {
    const byId = new Map(scenario().segments.map(s => [s.id, s]));
    expect(byId.get("oldBuyer")!.recencyMonths).toBe(8);
    expect(byId.get("newBuyer")!.recencyMonths).toBe(0);
    expect(byId.get("steady0")!.recencyMonths).toBe(0);
  });

  it("treats a customer who stopped buying as at risk or lapsed, and a current customer as neither", () => {
    const byId = new Map(scenario().segments.map(s => [s.id, s]));
    expect(["atRisk", "lost"]).toContain(byId.get("oldBuyer")!.segment);
    expect(["atRisk", "lost"]).not.toContain(byId.get("newBuyer")!.segment);
    expect(["atRisk", "lost"]).not.toContain(byId.get("steady0")!.segment);
  });

  it("never flags a customer active in the final month, even when everyone shares the same recency", () => {
    const rows = [order("a", "2024-05"), order("b", "2024-05"), order("c", "2024-05")];
    const result = run(rows);
    expect(result.segments.every(s => s.recencyMonths === 0)).toBe(true);
    expect(result.segments.some(s => s.segment === "atRisk" || s.segment === "lost")).toBe(false);
  });

  it("splits quiet customers into at risk (stronger history) and lapsed (weaker history)", () => {
    const rows: EngineeredRow[] = [];
    for (let m = 0; m < 12; m++) rows.push(order("current", monthKey(m), 500));
    for (let m = 0; m < 6; m++) for (let k = 0; k < 2; k++) rows.push(order("quietBig", monthKey(m), 500));
    rows.push(order("quietSmall", monthKey(0), 1));
    for (let c = 0; c < 6; c++) for (let m = 0; m < 12; m++) rows.push(order(`filler${c}`, monthKey(m), 300));
    const byId = new Map(run(rows).segments.map(s => [s.id, s]));
    expect(byId.get("quietBig")!.segment).toBe("atRisk");
    expect(byId.get("quietSmall")!.segment).toBe("lost");
  });
});

describe("re-engagement recommendation text", () => {
  const stats: StatisticsResult = { numeric: [], categorical: [], correlations: [], timeSeries: [], seasonality: null };
  const quality: DataQualityReport = {
    overallScore: 90, completenessScore: 90, validityScore: 90, consistencyScore: 90, uniquenessScore: 90,
    duplicateRowPct: 0, columns: [], flags: [],
  };

  it("states only computed values and makes no outcome claim", () => {
    const rows: EngineeredRow[] = [];
    for (let m = 0; m < 12; m++) rows.push(order("current", monthKey(m), 500));
    for (let m = 0; m < 6; m++) for (let k = 0; k < 2; k++) rows.push(order("quietBig", monthKey(m), 500));
    rows.push(order("quietSmall", monthKey(0), 1));
    for (let c = 0; c < 6; c++) for (let m = 0; m < 12; m++) rows.push(order(`filler${c}`, monthKey(m), 300));
    const segmentation = run(rows);
    const ml: MLResults = { forecast: null, anomalies: null, segmentation };

    const recs = generateRecommendations([], stats, quality, ml);
    const rec = recs.find(r => r.title.startsWith("Re-engage"))!;
    expect(rec.title).toBe("Re-engage 2 at-risk/lapsed customers");
    expect(rec.desc).toContain("1 at risk, 1 lapsed");
    expect(rec.desc).toContain("at least 6 months");
    expect(rec.desc).not.toMatch(/typically|recovers|\d+\s?[–-]\s?\d+%|gone quiet/);
  });

  it("makes no unbacked retention-improvement claim in the loyalty recommendation", () => {
    const segmentation = run([order("a", "2024-01"), order("a", "2024-02"), order("b", "2024-02")]);
    const recs = generateRecommendations([], stats, quality, { forecast: null, anomalies: null, segmentation });
    const loyalty = recs.find(r => r.title.includes("loyalty"))!;
    expect(loyalty.desc).toContain("50% of them have bought more than once");
    expect(loyalty.desc).not.toMatch(/compound|15%/);
  });
});
