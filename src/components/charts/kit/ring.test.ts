import { describe, expect, it } from "vitest";
import { arcPath, canRing, polar, ringSlices, sliceArcs } from "./ring";

const item = (label: string, value: number) => ({ label, value });

describe('ringSlices', () => {
  it('keeps up to six parts as they are, in the order given', () => {
    const plan = ringSlices([item('A', 5), item('B', 3), item('C', 2)]);
    expect(plan.reason).toBeNull();
    expect(plan.total).toBe(10);
    expect(plan.slices.map(s => s.label)).toEqual(['A', 'B', 'C']);
    expect(plan.slices.every(s => s.grouped === 0)).toBe(true);
  });

  it('keeps exactly six parts', () => {
    const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((l, i) => item(l, 10 - i));
    expect(ringSlices(six).slices).toHaveLength(6);
  });

  it('groups everything past six into Other, keeping the five largest and the total', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l, i) => item(l, 80 - i * 10)); // 80 .. 10
    const plan = ringSlices(many);
    expect(plan.slices).toHaveLength(6);
    expect(plan.slices.map(s => s.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'Other (3)']);
    expect(plan.slices[5]).toMatchObject({ value: 30 + 20 + 10, grouped: 3 });
    expect(plan.slices.reduce((s, x) => s + x.value, 0)).toBe(plan.total);
  });

  it('keeps the original order of the parts it keeps when grouping', () => {
    const plan = ringSlices([item('Small', 1), item('Big', 100), item('Mid', 50), item('A', 40), item('B', 30), item('C', 20), item('D', 2)]);
    expect(plan.slices.map(s => s.label)).toEqual(['Big', 'Mid', 'A', 'B', 'C', 'Other (2)']);
  });

  it('drops zero parts', () => {
    const plan = ringSlices([item('A', 5), item('Z', 0), item('B', 5)]);
    expect(plan.slices.map(s => s.label)).toEqual(['A', 'B']);
  });

  it('refuses negative values', () => {
    expect(ringSlices([item('A', 5), item('B', -1)])).toMatchObject({ reason: 'negative', slices: [] });
  });

  it('refuses all-zero, empty and non-finite data', () => {
    expect(ringSlices([item('A', 0), item('B', 0)]).reason).toBe('empty');
    expect(ringSlices([]).reason).toBe('empty');
    expect(ringSlices([item('A', 1), item('B', Number.NaN)]).reason).toBe('invalid');
    expect(ringSlices([item('A', 1), item('B', Infinity)]).reason).toBe('invalid');
  });

  it('refuses a single part: one slice is not a split', () => {
    expect(ringSlices([item('A', 5)]).reason).toBe('single');
    expect(ringSlices([item('A', 5), item('B', 0)]).reason).toBe('single');
  });

  it('honours a smaller maximum', () => {
    const plan = ringSlices([item('A', 4), item('B', 3), item('C', 2), item('D', 1)], 3);
    expect(plan.slices.map(s => s.label)).toEqual(['A', 'B', 'Other (2)']);
  });
});

describe('canRing', () => {
  it('is true only for a drawable share of a whole', () => {
    expect(canRing([item('A', 1), item('B', 2)])).toBe(true);
    expect(canRing([item('A', 1)])).toBe(false);
    expect(canRing([item('A', 1), item('B', -2)])).toBe(false);
    expect(canRing([item('A', 0), item('B', 0)])).toBe(false);
  });
});

describe('sliceArcs', () => {
  it('covers a full turn in proportion to the values', () => {
    const arcs = sliceArcs([1, 1, 2]);
    expect(arcs).toHaveLength(3);
    expect(arcs[0].start).toBe(0);
    expect(arcs[0].end).toBeCloseTo(Math.PI / 2);
    expect(arcs[1].end).toBeCloseTo(Math.PI);
    expect(arcs[2].end).toBeCloseTo(Math.PI * 2);
    expect(arcs[2].start).toBe(arcs[1].end);
  });

  it('skips zero and negative values but keeps the index of the others', () => {
    expect(sliceArcs([0, 3, -1, 1]).map(a => a.index)).toEqual([1, 3]);
  });

  it('is empty when there is nothing to share', () => {
    expect(sliceArcs([0, 0])).toEqual([]);
    expect(sliceArcs([])).toEqual([]);
  });
});

describe('polar and arcPath', () => {
  it('starts at 12 o\'clock and runs clockwise', () => {
    expect(polar(100, 100, 50, 0)).toEqual({ x: 100, y: 50 });
    const right = polar(100, 100, 50, Math.PI / 2);
    expect(right.x).toBe(150);
    expect(right.y).toBeCloseTo(100);
    const bottom = polar(100, 100, 50, Math.PI);
    expect(bottom.x).toBeCloseTo(100);
    expect(bottom.y).toBe(150);
  });

  it('writes a ring segment with an outer and an inner arc', () => {
    const d = arcPath(100, 100, 50, 30, 0, Math.PI / 2);
    expect(d).toBe('M100 50A50 50 0 0 1 150 100L130 100A30 30 0 0 0 100 70Z');
  });

  it('sets the large-arc flag past a half turn', () => {
    expect(arcPath(100, 100, 50, 30, 0, Math.PI * 1.5)).toContain('A50 50 0 1 1');
  });

  it('writes a pie wedge when there is no inner radius', () => {
    expect(arcPath(100, 100, 50, 0, 0, Math.PI / 2)).toBe('M100 100L100 50A50 50 0 0 1 150 100Z');
  });

  it('keeps a whole-circle segment drawable', () => {
    const d = arcPath(100, 100, 50, 30, 0, Math.PI * 2);
    expect(d.startsWith('M100 50A50 50 0 1 1')).toBe(true);
    expect(d).not.toContain('NaN');
  });
});
