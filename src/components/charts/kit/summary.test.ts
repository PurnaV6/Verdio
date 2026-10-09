import { describe, expect, it } from "vitest";
import { formatCompact, formatFull } from "./format";
import { announce, canShow, PLANNING_RANGE_LABEL, summarise, tableRows, usableForecast, type ChartPoint } from "./summary";

const actual = (label: string, value: number): ChartPoint => ({ label, value });
const fc = (label: string, value: number): ChartPoint => ({ label, value, forecast: true, low: Math.round(value * 0.88), high: Math.round(value * 1.12) });

describe("formatFull and formatCompact", () => {
  it("formats currency in full and compact form", () => {
    expect(formatFull(152588, 'currency')).toBe('£152,588');
    expect(formatCompact(149000, 'currency')).toBe('£149k');
    expect(formatCompact(12345, 'currency')).toBe('£12.3k');
    expect(formatCompact(2_400_000, 'currency')).toBe('£2.4m');
    expect(formatCompact(640, 'currency')).toBe('£640');
  });
  it("keeps the sign outside the currency symbol", () => {
    expect(formatFull(-1234, 'currency')).toBe('-£1,234');
    expect(formatCompact(-2500, 'currency')).toBe('-£2.5k');
  });
  it("formats counts, percentages and non-finite values", () => {
    expect(formatFull(1234.6, 'count')).toBe('1,235');
    expect(formatFull(12.34, 'percentage')).toBe('12.3%');
    expect(formatFull(NaN, 'currency')).toBe('—');
    expect(formatCompact(Infinity, 'count')).toBe('—');
  });
  it("copes with huge values", () => {
    expect(formatCompact(3.2e12, 'currency')).toBe('£3200bn');
    expect(formatFull(1e15, 'count')).toContain('1,000,000,000,000,000');
  });
});

describe("canShow", () => {
  it("needs two points", () => {
    expect(canShow([], 2)).toBe(false);
    expect(canShow([5], 2)).toBe(false);
    expect(canShow([5, 6], 2)).toBe(true);
    expect(canShow([5], 1)).toBe(true);
  });
  it("rejects all-zero and NaN or infinite series", () => {
    expect(canShow([0, 0, 0])).toBe(false);
    expect(canShow([1, NaN])).toBe(false);
    expect(canShow([1, Infinity])).toBe(false);
  });
  it("allows negatives and a single zero among real values", () => {
    expect(canShow([-5, -2])).toBe(true);
    expect(canShow([0, 4])).toBe(true);
  });
});

describe("usableForecast", () => {
  it("keeps a normal forecast", () => {
    const f = [fc('Jan 26', 100), fc('Feb 26', 110)];
    expect(usableForecast(f)).toBe(f);
  });
  it("drops the engine's zero-valued fallback, empty input and non-finite points", () => {
    expect(usableForecast([{ label: 'Jan 26', value: 0, forecast: true, low: 0, high: 0 }])).toEqual([]);
    expect(usableForecast([])).toEqual([]);
    expect(usableForecast([fc('Jan 26', 100), fc('Feb 26', 0)])).toEqual([]);
    expect(usableForecast([fc('Jan 26', NaN)])).toEqual([]);
  });
});

describe("summarise", () => {
  it("describes a time series with a forecast", () => {
    const points = [actual('Jan 24', 100000), actual('Nov 25', 156500), actual('Dec 25', 149000), fc('Jan 26', 164000)];
    expect(summarise({ name: 'Monthly sales', points, format: 'currency' }))
      .toBe('Monthly sales Jan 24 to Dec 25: latest £149k, down 4.8%; forecast £164k in Jan 26');
  });
  it("names the end of a longer forecast", () => {
    const points = [actual('Jan 25', 10), actual('Feb 25', 12), fc('Mar 25', 13), fc('Apr 25', 14)];
    expect(summarise({ name: 'Orders', points, format: 'count' })).toBe('Orders Jan 25 to Feb 25: latest 12, up 20%; forecast 13 in Mar 25, 14 by Apr 25');
  });
  it("handles one point, no points, flat and zero-based changes", () => {
    expect(summarise({ name: 'Sales', points: [actual('Jan 25', 5)], format: 'count' })).toBe('Sales Jan 25 to Jan 25: latest 5');
    expect(summarise({ name: 'Sales', points: [], format: 'count' })).toBe('Sales: no data');
    expect(summarise({ name: 'S', points: [actual('a', 5), actual('b', 5)], format: 'count' })).toContain('unchanged');
    expect(summarise({ name: 'S', points: [actual('a', 0), actual('b', 5)], format: 'count' })).toBe('S a to b: latest 5');
  });
  it("handles negative values", () => {
    expect(summarise({ name: 'Profit', points: [actual('a', -100), actual('b', -50)], format: 'currency' })).toBe('Profit a to b: latest -£50, up 50%');
  });
  it("describes categories by highest and lowest", () => {
    const points = [actual('Jan', 5), actual('May', 20), actual('Feb', 2)];
    expect(summarise({ name: 'Sales by month', points, format: 'count', kind: 'category' })).toBe('Sales by month, 3 items: highest May 20, lowest Feb 2');
  });
  it("describes parts with shares", () => {
    const points = [actual('Active', 27), actual('Lapsing', 18)];
    expect(summarise({ name: 'Customer segments', points, format: 'count', kind: 'parts' })).toBe('Customer segments: 45 in total; Active 27 (60%), Lapsing 18 (40%)');
    expect(summarise({ name: 'X', points: [], format: 'count', kind: 'parts' })).toBe('X: no data');
  });
  it("never uses the word confidence", () => {
    const points = [actual('Jan', 5), fc('Feb', 6)];
    for (const kind of ['time', 'category', 'parts'] as const) {
      expect(summarise({ name: 'Sales', points, format: 'currency', kind }).toLowerCase()).not.toContain('confiden');
    }
    expect(PLANNING_RANGE_LABEL.toLowerCase()).not.toContain('confiden');
    expect(PLANNING_RANGE_LABEL).toBe('Planning range (±12% of the forecast), not a statistical interval');
  });
});

describe("announce", () => {
  it("reads an actual point as label and value", () => {
    expect(announce(actual('Mar 25', 152588), 'currency')).toBe('Mar 25, £152,588');
  });
  it("flags forecast points and names the planning range", () => {
    expect(announce(fc('Jan 26', 1000), 'currency')).toBe('Jan 26, forecast £1,000, planning range £880 to £1,120');
    expect(announce({ label: 'Jan 26', value: 5, forecast: true }, 'count')).toBe('Jan 26, forecast 5');
  });
});

describe("tableRows", () => {
  it("returns the same rows as the chart, flagging forecast rows", () => {
    const rows = tableRows([actual('Dec 25', 149000), fc('Jan 26', 164000)], 'currency');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ label: 'Dec 25', value: '£149,000', range: null, share: null, forecast: false });
    expect(rows[1].label).toBe('Jan 26 (forecast)');
    expect(rows[1].range).toBe('£144,320 to £183,680');
    expect(rows[1].forecast).toBe(true);
  });
  it("adds shares when asked", () => {
    const rows = tableRows([actual('A', 1), actual('B', 3)], 'count', { shares: true });
    expect(rows.map(r => r.share)).toEqual(['25%', '75%']);
  });
  it("is empty for no points and gives no share for a zero total", () => {
    expect(tableRows([], 'count')).toEqual([]);
    expect(tableRows([actual('A', 0)], 'count', { shares: true })[0].share).toBeNull();
  });
});
