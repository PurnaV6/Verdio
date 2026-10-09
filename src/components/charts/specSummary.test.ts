import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../../types/analysis";
import { describeSpec } from "./specSummary";

const base = { title: 'Sales', formatValue: 'currency' } as const;

describe("describeSpec", () => {
  it("describes a line chart from its first series and keeps every series in the table", () => {
    const chart: ChartSpec = { ...base, chartType: 'line', xKey: 'period', seriesKeys: ['historical', 'forecast'], data: [
      { period: 'Jan 25', historical: 100, forecast: null }, { period: 'Feb 25', historical: 150, forecast: null }, { period: 'Mar 25', historical: null, forecast: 170 },
    ] };
    const d = describeSpec(chart)!;
    expect(d.label).toBe('Sales Jan 25 to Feb 25: latest £150, up 50%');
    expect(d.headers).toEqual(['period', 'historical', 'forecast']);
    expect(d.rows[2]).toEqual(['Mar 25', '', '£170']);
  });
  it("describes bars, horizontal bars and pies with the right category and value fields", () => {
    const data = [{ k: 'A', v: 30 }, { k: 'B', v: 10 }];
    expect(describeSpec({ ...base, chartType: 'bar', xKey: 'k', yKey: 'v', data })!.label).toBe('Sales, 2 items: highest A £30, lowest B £10');
    expect(describeSpec({ ...base, chartType: 'horizontal_bar', xKey: 'v', yKey: 'k', data })!.label).toBe('Sales, 2 items: highest A £30, lowest B £10');
    expect(describeSpec({ ...base, chartType: 'pie', xKey: 'k', yKey: 'v', data })!.label).toBe('Sales: £40 in total; A £30 (75%), B £10 (25%)');
  });
  it("describes a scatter plot by its axes and point count", () => {
    const d = describeSpec({ ...base, chartType: 'scatter', xKey: 'x', yKey: 'y', formatValue: 'plain', data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })!;
    expect(d.label).toBe('Sales: scatter plot of y against x, 2 points');
    expect(d.rows).toEqual([['1', '2'], ['3', '4']]);
  });
  it("names an untitled chart from its keys and copes with empty data", () => {
    const d = describeSpec({ title: '', chartType: 'bar', xKey: 'k', yKey: 'v', formatValue: 'count', data: [] })!;
    expect(d.label).toBe('v by k: no data');
    expect(d.rows).toEqual([]);
  });
  it("returns null for table specs", () => {
    expect(describeSpec({ ...base, chartType: 'table', data: [], columns: [] })).toBeNull();
  });
});
