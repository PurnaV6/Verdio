import { describe, expect, it } from "vitest";
import { bandPolygon, barRects, linePath, linearScale, nearestIndex, nextIndex, niceTicks, segmentRects, tickIndexes, tooltipLeft } from "./geometry";

describe("linearScale", () => {
  it("maps the domain onto the range, including an inverted range", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });
  it("handles negative domains", () => {
    const x = linearScale([-10, 10], [0, 100]);
    expect(x(-10)).toBe(0);
    expect(x(0)).toBe(50);
  });
  it("maps a flat domain to the middle of the range", () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });
  it("stays finite for huge values", () => {
    const y = linearScale([0, 1e15], [100, 0]);
    expect(y(5e14)).toBeCloseTo(50);
  });
});

describe("niceTicks", () => {
  it("uses 1/2/5 steps and covers the data", () => {
    const t = niceTicks(0, 187000, 5);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(187000);
    const steps = t.slice(1).map((v, i) => v - t[i]);
    expect(new Set(steps).size).toBe(1);
    expect([1, 2, 5]).toContain(steps[0] / 10 ** Math.floor(Math.log10(steps[0])));
  });
  it("includes zero when asked for, for bars", () => {
    const t = niceTicks(40, 90, 5, true);
    expect(t[0]).toBe(0);
    expect(niceTicks(40, 90, 5, false)[0]).toBeGreaterThan(0);
  });
  it("pads a flat range so there is a span", () => {
    const t = niceTicks(100, 100, 5);
    expect(t.length).toBeGreaterThan(1);
    expect(t[0]).toBeLessThanOrEqual(100);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(100);
    expect(niceTicks(0, 0, 5).length).toBeGreaterThan(1);
  });
  it("spans negatives through zero", () => {
    const t = niceTicks(-30, 70, 5);
    expect(t[0]).toBeLessThanOrEqual(-30);
    expect(t).toContain(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(70);
  });
  it("copes with huge and tiny values without float noise", () => {
    const big = niceTicks(0, 3.2e12, 5);
    expect(big[big.length - 1]).toBeGreaterThanOrEqual(3.2e12);
    expect(big.length).toBeLessThanOrEqual(10);
    const tiny = niceTicks(0, 0.3, 5);
    expect(tiny.every(v => v === Number(v.toFixed(10)))).toBe(true);
    expect(tiny[tiny.length - 1]).toBeGreaterThanOrEqual(0.3);
  });
  it("returns nothing for non-finite input", () => {
    expect(niceTicks(NaN, 5)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
  });
});

describe("linePath", () => {
  it("is empty for no points", () => {
    expect(linePath([])).toBe('');
  });
  it("draws one polyline for a continuous run", () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 5 }])).toBe('M0 10 L10 20 L20 5');
  });
  it("breaks the line at a null", () => {
    const d = linePath([{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: null }, { x: 30, y: 5 }, { x: 40, y: 6 }]);
    expect(d).toBe('M0 10 L10 20 M30 5 L40 6');
  });
  it("turns a single point into a zero-length segment so a round cap can draw it", () => {
    expect(linePath([{ x: 5, y: 7 }])).toBe('M5 7L5 7');
    expect(linePath([{ x: 0, y: 1 }, { x: 5, y: null }, { x: 10, y: 2 }, { x: 15, y: null }])).toBe('M0 1L0 1 M10 2L10 2');
  });
  it("treats NaN as a gap", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: NaN }, { x: 2, y: 3 }, { x: 3, y: 4 }])).toBe('M0 1L0 1 M2 3 L3 4');
  });
});

describe("bandPolygon", () => {
  it("runs along the upper edge then back along the lower edge", () => {
    expect(bandPolygon([{ x: 0, upper: 10, lower: 20 }, { x: 10, upper: 5, lower: 25 }])).toBe('0,10 10,5 10,25 0,20');
  });
  it("needs two drawable points", () => {
    expect(bandPolygon([])).toBe('');
    expect(bandPolygon([{ x: 0, upper: 1, lower: 2 }])).toBe('');
    expect(bandPolygon([{ x: 0, upper: 1, lower: 2 }, { x: 1, upper: NaN, lower: 2 }])).toBe('');
  });
});

describe("barRects", () => {
  const box = { x: 0, y: 0, width: 100, height: 100, domain: [0, 100] as [number, number] };
  it("returns nothing for no values", () => {
    expect(barRects([], box)).toEqual([]);
  });
  it("grows positive bars up from the baseline", () => {
    const [a, b] = barRects([50, 100], box);
    expect(a.y + a.height).toBe(100);
    expect(a.height).toBe(50);
    expect(b.height).toBe(100);
    expect(a.x).toBeLessThan(b.x);
  });
  it("grows negative bars down from the zero line", () => {
    const [neg, pos] = barRects([-20, 60], { ...box, domain: [-40, 80] });
    // zero sits at 2/3 of the way down a [-40, 80] domain
    expect(neg.y).toBeCloseTo(66.7, 0);
    expect(neg.height).toBeCloseTo(16.7, 0);
    expect(pos.y + pos.height).toBeCloseTo(66.7, 0);
  });
  it("skips nulls but keeps indexes aligned", () => {
    const rects = barRects([10, null, NaN, 30], box);
    expect(rects.map(r => r.index)).toEqual([0, 3]);
  });
  it("gives equal values equal heights and handles a flat domain", () => {
    const rects = barRects([5, 5], { ...box, domain: [5, 5] });
    expect(rects[0].height).toBe(rects[1].height);
  });
  it("stays finite for huge values", () => {
    const [r] = barRects([4e15], { ...box, domain: [0, 5e15] });
    expect(Number.isFinite(r.height)).toBe(true);
    expect(r.height).toBe(80);
  });
});

describe("segmentRects", () => {
  it("shares the width in proportion to value, minus the gap", () => {
    const s = segmentRects([1, 3], 100, 2);
    expect(s[0]).toMatchObject({ x: 0, width: 23 });
    expect(s[1]).toMatchObject({ x: 25, width: 73 });
  });
  it("is empty for no positive values and skips zero parts", () => {
    expect(segmentRects([], 100)).toEqual([]);
    expect(segmentRects([0, 0], 100)).toEqual([]);
    expect(segmentRects([0, 5], 100).map(r => r.index)).toEqual([1]);
  });
});

describe("nearestIndex", () => {
  it("finds the closest x and clamps outside the range", () => {
    const xs = [0, 10, 20, 30];
    expect(nearestIndex(4, xs)).toBe(0);
    expect(nearestIndex(6, xs)).toBe(1);
    expect(nearestIndex(-50, xs)).toBe(0);
    expect(nearestIndex(500, xs)).toBe(3);
  });
  it("sends a tie to the lower index", () => {
    expect(nearestIndex(5, [0, 10])).toBe(0);
  });
  it("handles empty input, one point and NaN", () => {
    expect(nearestIndex(5, [])).toBe(-1);
    expect(nearestIndex(5, [42])).toBe(0);
    expect(nearestIndex(NaN, [1, 2])).toBe(-1);
  });
});

describe("tickIndexes", () => {
  it("returns all indexes when they fit", () => {
    expect(tickIndexes(3, 5)).toEqual([0, 1, 2]);
  });
  it("thins evenly and keeps the first and last", () => {
    const t = tickIndexes(30, 4);
    expect(t).toEqual([0, 10, 19, 29]);
  });
  it("handles degenerate input", () => {
    expect(tickIndexes(0, 4)).toEqual([]);
    expect(tickIndexes(5, 0)).toEqual([]);
    expect(tickIndexes(5, 1)).toEqual([4]);
    expect(tickIndexes(1, 4)).toEqual([0]);
  });
});

describe("nextIndex", () => {
  it("selects the first point when nothing is active", () => {
    expect(nextIndex('ArrowRight', null, 5)).toBe(1);
    expect(nextIndex('Home', null, 5)).toBe(0);
  });
  it("steps, jumps and clamps", () => {
    expect(nextIndex('ArrowRight', 4, 5)).toBe(4);
    expect(nextIndex('ArrowLeft', 0, 5)).toBe(0);
    expect(nextIndex('ArrowLeft', 3, 5)).toBe(2);
    expect(nextIndex('End', 1, 5)).toBe(4);
    expect(nextIndex('Home', 3, 5)).toBe(0);
  });
  it("clears on Escape and ignores other keys", () => {
    expect(nextIndex('Escape', 2, 5)).toBeNull();
    expect(nextIndex('a', 2, 5)).toBe(2);
    expect(nextIndex('a', null, 5)).toBeNull();
  });
  it("returns null when there is nothing to step through", () => {
    expect(nextIndex('ArrowRight', null, 0)).toBeNull();
  });
  it("switches series with Up and Down", () => {
    const series = [{ start: 0, end: 3 }, { start: 4, end: 6 }];
    expect(nextIndex('ArrowUp', 2, 7, { series })).toBe(4);
    expect(nextIndex('ArrowUp', 5, 7, { series })).toBe(5);
    expect(nextIndex('ArrowDown', 5, 7, { series })).toBe(3);
    expect(nextIndex('ArrowDown', 1, 7, { series })).toBe(1);
  });
  it("does nothing on Up and Down with a single series", () => {
    expect(nextIndex('ArrowUp', 2, 5)).toBe(2);
    expect(nextIndex('ArrowDown', null, 5)).toBeNull();
  });
  it("steps rows with Up and Down in a vertical list", () => {
    expect(nextIndex('ArrowDown', 1, 5, { vertical: true })).toBe(2);
    expect(nextIndex('ArrowUp', 0, 5, { vertical: true })).toBe(0);
  });
});

describe("tooltipLeft", () => {
  it("sits to the right of the anchor when it fits", () => {
    expect(tooltipLeft(50, 100, 400)).toBe(60);
  });
  it("flips to the left near the right edge", () => {
    expect(tooltipLeft(380, 100, 400)).toBe(270);
  });
  it("never leaves the container, even when the tip is wider than half of it", () => {
    const left = tooltipLeft(160, 200, 320);
    expect(left).toBeGreaterThanOrEqual(4);
    expect(left + 200).toBeLessThanOrEqual(316);
  });
});
