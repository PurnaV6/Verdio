/* ================================================================
   VERDIO — ring chart maths
   Which parts a ring may show (shares of a whole only), how the
   remainder is grouped, and the arc geometry. Pure: no DOM, no React,
   unit tested in the node environment (ring.test.ts).
   ================================================================ */

export const MAX_RING_SLICES = 6;
export const MIN_RING_SLICES = 2;

export interface RingItem { label: string; value: number }
export interface RingSlice extends RingItem { grouped: number }   // grouped: how many items an "Other" slice stands for, else 0

// Why a ring is refused: a negative or non-finite value is not a share, nothing positive has no whole, and one part is no split.
export type RingRefusal = 'invalid' | 'negative' | 'empty' | 'single';

export interface RingPlan {
  slices: RingSlice[];
  total: number;
  reason: RingRefusal | null;     // null when a ring can be drawn
}

/**
 * The slices of a ring from raw parts: zero parts are dropped, and when more than `max` remain the
 * largest max - 1 are kept and the rest become one "Other (n)" slice, so the shares still add up to the whole.
 * Refuses (reason set, no slices) for negative or non-finite values, an all-zero whole, or fewer than two parts.
 */
export function ringSlices(items: RingItem[], max = MAX_RING_SLICES): RingPlan {
  const refuse = (reason: RingRefusal): RingPlan => ({ slices: [], total: 0, reason });
  if (items.some(i => !Number.isFinite(i.value))) return refuse('invalid');
  if (items.some(i => i.value < 0)) return refuse('negative');
  const positive = items.filter(i => i.value > 0);
  const total = positive.reduce((s, i) => s + i.value, 0);
  if (positive.length === 0 || total <= 0) return refuse('empty');
  if (positive.length < MIN_RING_SLICES) return refuse('single');
  if (positive.length <= max) return { slices: positive.map(i => ({ ...i, grouped: 0 })), total, reason: null };
  const ranked = positive.map((item, order) => ({ item, order })).sort((a, b) => b.item.value - a.item.value || a.order - b.order);
  const keep = ranked.slice(0, max - 1).sort((a, b) => a.order - b.order).map(r => r.item);
  const rest = ranked.slice(max - 1);
  const other: RingSlice = { label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.item.value, 0), grouped: rest.length };
  return { slices: [...keep.map(i => ({ ...i, grouped: 0 })), other], total, reason: null };
}

/** True when these parts can be drawn as a ring: shares of a whole, none negative, not all zero, at least two. */
export function canRing(items: RingItem[]): boolean {
  return ringSlices(items).reason === null;
}

export interface Arc { index: number; start: number; end: number }   // radians, clockwise from 12 o'clock

/** The arc each positive value covers around a full turn. */
export function sliceArcs(values: number[]): Arc[] {
  const total = values.reduce((s, v) => s + (v > 0 && Number.isFinite(v) ? v : 0), 0);
  if (total <= 0) return [];
  const out: Arc[] = [];
  let a = 0;
  values.forEach((v, index) => {
    if (!(v > 0) || !Number.isFinite(v)) return;
    const end = a + (v / total) * Math.PI * 2;
    out.push({ index, start: a, end });
    a = end;
  });
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// A point at `angle` (clockwise from 12 o'clock) on a circle.
export function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: r2(cx + radius * Math.sin(angle)), y: r2(cy - radius * Math.cos(angle)) };
}

/** SVG path for a ring segment between two radii. A segment that would close the circle is trimmed by a hair so it still draws. */
export function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  const full = Math.PI * 2;
  const to = Math.min(end, start + full - 0.0001);
  const large = to - start > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, outer, start);
  const o1 = polar(cx, cy, outer, to);
  if (inner <= 0) return `M${cx} ${cy}L${o0.x} ${o0.y}A${outer} ${outer} 0 ${large} 1 ${o1.x} ${o1.y}Z`;
  const i1 = polar(cx, cy, inner, to);
  const i0 = polar(cx, cy, inner, start);
  return `M${o0.x} ${o0.y}A${outer} ${outer} 0 ${large} 1 ${o1.x} ${o1.y}L${i1.x} ${i1.y}A${inner} ${inner} 0 ${large} 0 ${i0.x} ${i0.y}Z`;
}
