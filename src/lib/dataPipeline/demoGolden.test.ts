import { describe, expect, it } from "vitest";
import { demoResult } from "../story/testkit";

/* The demo file is the reference every change to the pipeline is measured against.
   Nothing about a clean file (no blanks, zeros or negatives) may move. These values were
   taken from the pipeline before blank-aware reading was added. */

const MONTHLY: [string, number][] = [
  ['2024-01', 96324], ['2024-02', 118510], ['2024-03', 140569], ['2024-04', 133319], ['2024-05', 137718], ['2024-06', 117501],
  ['2024-07', 130568], ['2024-08', 119118], ['2024-09', 106547], ['2024-10', 90938], ['2024-11', 114068], ['2024-12', 140509],
  ['2025-01', 139805], ['2025-02', 154028], ['2025-03', 152588], ['2025-04', 139584], ['2025-05', 185091], ['2025-06', 151127],
  ['2025-07', 149646], ['2025-08', 170278], ['2025-09', 149249], ['2025-10', 150261], ['2025-11', 156446], ['2025-12', 148960],
];

describe("demo file golden values", () => {
  it("keeps every row and adds up to the same sales", async () => {
    const r = await demoResult();
    expect(r.source.rowCount).toBe(720);
    expect(r.engineeredRows).toHaveLength(720);
    const total = r.engineeredRows.reduce((sum, row) => sum + Number(row['Revenue']), 0);
    expect(total).toBe(3292752);
    const series = r.statistics.timeSeries[0];
    expect(series.measureColumn).toBe('Revenue');
    expect(series.points.reduce((sum, p) => sum + p.value, 0)).toBe(3292752);
  });

  it("pins the whole monthly series", async () => {
    const r = await demoResult();
    const points = r.statistics.timeSeries[0].points;
    expect(points.map(p => [p.periodKey, p.value])).toEqual(MONTHLY);
    expect(points.every(p => p.count === 30)).toBe(true);
  });

  it("pins the forecast, health, quality and risks", async () => {
    const r = await demoResult();
    const next = r.ml.forecast!.points[0];
    expect([next.value, next.low, next.high]).toEqual([163541, 143916, 183166]);
    expect(r.decision.health.total).toBe(95);
    expect(r.decision.health.pillars.map(p => p.score)).toEqual([25, 25, 25, 20]);
    expect(r.quality.overallScore).toBe(100);
    expect(r.decision.risks).toHaveLength(4);
  });

  it("pins the customer segments", async () => {
    const r = await demoResult();
    const segments = r.ml.segmentation!.segments;
    expect(segments).toHaveLength(145);
    const count = (label: string) => segments.filter(s => s.segment === label).length;
    expect(['champion', 'loyal', 'new', 'atRisk', 'lost'].map(count)).toEqual([46, 32, 22, 18, 27]);
  });

  it("cleans nothing, excludes nothing and invents nothing", async () => {
    const r = await demoResult();
    expect(r.cleaning.actions).toEqual([]);
    expect(r.cleaning.cellsImputed).toBe(0);
    expect(r.cleaning.rowsBefore).toBe(720);
    expect(r.cleaning.rowsAfter).toBe(720);
    const extra = r as unknown as { excludedRows?: unknown[]; returnRows?: unknown[] };
    expect(extra.excludedRows ?? []).toEqual([]);
    expect(extra.returnRows ?? []).toEqual([]);
  });
});
