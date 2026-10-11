import { describe, expect, it } from "vitest";
import { buildStory } from "../../lib/story";
import { demoResult } from "../../lib/story/testkit";
import type { ForecastResult } from "../../types/ml";
import { forecastAhead, moveReading, riskCounts, riskReading, segmentCounts, shareItems } from "./overviewModel";
import { getRevenueView } from "./revenue";

describe("moveReading", () => {
  it("words a fall and a rise with the one-decimal percentage and the earlier month", () => {
    expect(moveReading(-4.785, 'Nov 25')).toEqual({ tone: 'watch', word: 'Down 4.8%', vs: 'on Nov 25' });
    expect(moveReading(8.123, 'Feb 24')).toEqual({ tone: 'ok', word: 'Up 8.1%', vs: 'on Feb 24' });
  });
  it("calls a change that rounds to 0.0% level, never -0.0%", () => {
    expect(moveReading(0.04, 'Jan 25')).toEqual({ tone: 'ok', word: 'Level', vs: 'with Jan 25' });
    expect(moveReading(-0.04, 'Jan 25')).toEqual({ tone: 'ok', word: 'Level', vs: 'with Jan 25' });
  });
  it("returns null when there is no earlier month to compare with", () => {
    expect(moveReading(null, 'Jan 25')).toBeNull();
    expect(moveReading(5, undefined)).toBeNull();
    expect(moveReading(Number.NaN, 'Jan 25')).toBeNull();
  });
});

describe("risk reading and counts", () => {
  it("pairs every level with a state tone and a word", () => {
    expect(riskReading('high')).toEqual({ tone: 'risk', label: 'High risk' });
    expect(riskReading('medium')).toEqual({ tone: 'watch', label: 'Medium risk' });
    expect(riskReading('low')).toEqual({ tone: 'ok', label: 'Low risk' });
  });
  it("counts by level", () => {
    expect(riskCounts([{ level: 'medium' }, { level: 'low' }, { level: 'medium' }, { level: 'low' }])).toEqual({ total: 4, high: 0, medium: 2, low: 2 });
    expect(riskCounts([])).toEqual({ total: 0, high: 0, medium: 0, low: 0 });
  });
});

describe("shareItems", () => {
  const rows = (...values: number[]) => values.map((value, i) => ({ label: `C${i + 1}`, value }));

  it("lists every row when there are few", () => {
    expect(shareItems(rows(50, 30, 20))).toEqual(rows(50, 30, 20));
  });
  it("keeps the top rows and one remainder row so the shares add to the whole", () => {
    const input = rows(40, 20, 10, 10, 8, 6, 4, 2);
    const out = shareItems(input, 5);
    expect(out.slice(0, 5)).toEqual(input.slice(0, 5));
    expect(out[5]).toEqual({ label: 'All others (3)', value: 12 });
    expect(out.reduce((s, row) => s + row.value, 0)).toBe(input.reduce((s, row) => s + row.value, 0));
  });
  it("does not make a remainder row for a single leftover", () => {
    expect(shareItems(rows(10, 9, 8, 7, 6, 5), 5)).toHaveLength(6);
  });
  it("drops zero, negative and non-finite rows", () => {
    expect(shareItems(rows(10, 0, -3, Number.NaN))).toEqual([{ label: 'C1', value: 10 }]);
  });
});

describe("segmentCounts", () => {
  it("counts in a fixed order and leaves out empty segments", () => {
    const segments = ['lost', 'champion', 'atRisk', 'champion', 'new', 'lost'].map(segment => ({ segment: segment as 'lost' }));
    expect(segmentCounts(segments)).toEqual([
      { key: 'champion', label: 'Champion', value: 2 },
      { key: 'new', label: 'New', value: 1 },
      { key: 'atRisk', label: 'At risk', value: 1 },
      { key: 'lost', label: 'Lost', value: 2 },
    ]);
  });
});

describe("forecastAhead", () => {
  const forecast: ForecastResult = {
    measureColumn: 'Revenue', scenario: 'base', monthlyTrendPct: 1, holtNextPeriod: 100,
    points: [{ periodLabel: 'Jan 26', value: 100, low: 88, high: 112 }],
  };
  it("maps the forecast points for the same measure", () => {
    expect(forecastAhead('Revenue', forecast)).toEqual([{ label: 'Jan 26', value: 100, low: 88, high: 112 }]);
  });
  it("returns nothing for another measure, no series or no forecast", () => {
    expect(forecastAhead('Units', forecast)).toEqual([]);
    expect(forecastAhead(undefined, forecast)).toEqual([]);
    expect(forecastAhead('Revenue', null)).toEqual([]);
  });
});

describe("demo workspace: page values equal the story", () => {
  it("states the same sales, change and risk counts as the story and the pipeline", async () => {
    const r = await demoResult();
    const story = buildStory('overview', r);
    if (story.kind !== 'story') throw new Error('expected a story');
    const view = getRevenueView(r);
    const points = view.series!.points;

    expect(story.facts.latestSales.value).toBe(points.at(-1)!.value);
    const move = moveReading(view.changePct, points.at(-2)?.label);
    expect(move?.word).toBe('Down 4.8%');
    expect(story.happened).toContain(`${move!.word.toLowerCase()} on ${points.at(-2)!.label}`);
    expect(story.facts.health.value).toBe(r.decision.health.total);

    const counts = riskCounts(r.decision.risks);
    expect(counts).toEqual({ total: 4, high: 0, medium: 2, low: 2 });
    const segs = segmentCounts(r.ml.segmentation!.segments);
    expect(segs.map(s => s.value)).toEqual([46, 32, 22, 18, 27]);
    expect(segs.reduce((s, x) => s + x.value, 0)).toBe(r.ml.segmentation!.segments.length);
  });
});
