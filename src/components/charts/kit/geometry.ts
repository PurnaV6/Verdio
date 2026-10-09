/* ================================================================
   VERDIO — chart kit geometry
   Pure maths for the SVG charts: scales, ticks, paths, bars and the
   keyboard / pointer index model. No DOM, no React, so it is unit
   tested in the node environment (geometry.test.ts).
   ================================================================ */

export type Range = [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

// Maps a value from `domain` onto `range`. A flat domain (min === max) maps to the middle of the range.
export function linearScale(domain: Range, range: Range): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1v] = range;
  if (d0 === d1) return () => (r0 + r1v) / 2;
  const k = (r1v - r0) / (d1 - d0);
  return v => r0 + (v - d0) * k;
}

function niceNum(x: number, round: boolean): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

// Tick values on 1/2/5 steps that cover [min, max]. `includeZero` is for bars and anything drawn from a baseline.
// A flat range (min === max) is padded so there is always a span to draw.
export function niceTicks(min: number, max: number, count = 5, includeZero = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) {
    if (lo === 0) hi = 1;
    else { const pad = Math.abs(lo) * 0.1; lo -= pad; hi += pad; }
  }
  const slots = Math.max(1, Math.round(count) - 1);
  const step = niceNum(niceNum(hi - lo, false) / slots, true);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const n = Math.round((end - start) / step);
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) ticks.push(Number((start + i * step).toPrecision(12)));
  return ticks;
}

export interface XY { x: number; y: number | null }

const drawable = (p: XY) => p.y !== null && Number.isFinite(p.y) && Number.isFinite(p.x);

// SVG path data for a line. A null (or non-finite) y breaks the line into separate runs, so a gap is a gap.
// A run of one point becomes a zero-length segment, which draws as a dot under a round line cap.
export function linePath(points: XY[]): string {
  let d = '';
  let run = 0;
  let prev: XY | null = null;
  for (const p of points) {
    if (!drawable(p)) { if (run === 1 && prev) d += `L${r1(prev.x)} ${r1(prev.y!)}`; run = 0; prev = null; continue; }
    d += `${run === 0 ? (d ? ' M' : 'M') : ' L'}${r1(p.x)} ${r1(p.y!)}`;
    run++;
    prev = p;
  }
  if (run === 1 && prev) d += `L${r1(prev.x)} ${r1(prev.y!)}`;
  return d;
}

export interface BandPoint { x: number; upper: number; lower: number }

// `points` attribute for the band between an upper and a lower edge: along the top, back along the bottom.
// Needs two drawable points, otherwise there is no area and the result is empty.
export function bandPolygon(points: BandPoint[]): string {
  const ok = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.upper) && Number.isFinite(p.lower));
  if (ok.length < 2) return '';
  const top = ok.map(p => `${r1(p.x)},${r1(p.upper)}`);
  const bottom = ok.slice().reverse().map(p => `${r1(p.x)},${r1(p.lower)}`);
  return [...top, ...bottom].join(' ');
}

export interface BarRect { index: number; value: number; x: number; y: number; width: number; height: number }
export interface BarBox { x: number; y: number; width: number; height: number; domain: Range; gap?: number }

// One rectangle per finite value, grown from the zero line (up for positive, down for negative).
// `index` is the position in `values`, so a skipped null keeps the others aligned with their labels.
export function barRects(values: (number | null)[], box: BarBox): BarRect[] {
  const n = values.length;
  if (n === 0) return [];
  const band = box.width / n;
  const gap = Math.min(0.9, Math.max(0, box.gap ?? 0.28));
  const bw = band * (1 - gap);
  const y = linearScale(box.domain, [box.y + box.height, box.y]);
  const zero = y(Math.min(Math.max(0, box.domain[0]), box.domain[1]));
  const out: BarRect[] = [];
  values.forEach((v, index) => {
    if (v === null || !Number.isFinite(v)) return;
    const top = y(v);
    out.push({ index, value: v, x: r1(box.x + band * index + (band - bw) / 2), y: r1(Math.min(top, zero)), width: r1(bw), height: r1(Math.abs(zero - top)) });
  });
  return out;
}

export interface SegmentRect { index: number; value: number; x: number; width: number }

// Widths for a single stacked bar, proportional to value. Zero and negative parts take no width.
export function segmentRects(values: number[], width: number, gap = 2): SegmentRect[] {
  const total = values.reduce((s, v) => s + (v > 0 && Number.isFinite(v) ? v : 0), 0);
  if (total <= 0 || width <= 0) return [];
  const out: SegmentRect[] = [];
  let x = 0;
  values.forEach((v, index) => {
    if (!(v > 0) || !Number.isFinite(v)) return;
    const w = (width * v) / total;
    out.push({ index, value: v, x: r1(x), width: r1(Math.max(0, w - gap)) });
    x += w;
  });
  return out;
}

// Index of the x position nearest to `px`, or -1 when there is nothing to hit. Ties go to the lower index.
export function nearestIndex(px: number, xs: number[]): number {
  if (xs.length === 0 || !Number.isFinite(px)) return -1;
  let best = 0;
  let bestD = Math.abs(xs[0] - px);
  for (let i = 1; i < xs.length; i++) {
    const d = Math.abs(xs[i] - px);
    if (d < bestD) { best = i; bestD = d; }
  }
  return best;
}

// At most `max` evenly spread indexes out of `count`, always including the last, for thinning axis labels.
export function tickIndexes(count: number, max: number): number[] {
  if (count <= 0 || max <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  if (max === 1) return [count - 1];
  const out = new Set<number>();
  for (let i = 0; i < max; i++) out.add(Math.round((i * (count - 1)) / (max - 1)));
  return [...out];
}

export interface IndexRange { start: number; end: number }
export interface KeyOptions {
  series?: IndexRange[]; // index ranges of each series on a shared x axis: Up/Down switch between them
  vertical?: boolean;    // a vertical list of rows: Up/Down step like Left/Right
}

// One keyboard step. `current` is null when nothing is active; the result is null for Escape.
// Left/Right step by one, Home/End jump, Up/Down switch series (or step, for a vertical list). Other keys return `current`.
export function nextIndex(key: string, current: number | null, count: number, opts: KeyOptions = {}): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const cur = current === null ? 0 : Math.min(Math.max(current, 0), last);
  switch (key) {
    case 'Escape': return null;
    case 'Home': return 0;
    case 'End': return last;
    case 'ArrowLeft': return Math.max(0, cur - 1);
    case 'ArrowRight': return Math.min(last, cur + 1);
    case 'ArrowUp':
    case 'ArrowDown': {
      const up = key === 'ArrowUp';
      if (opts.vertical) return up ? Math.max(0, cur - 1) : Math.min(last, cur + 1);
      const ranges = opts.series;
      if (!ranges || ranges.length < 2) return current;
      const k = ranges.findIndex(r => cur >= r.start && cur <= r.end);
      if (k < 0) return current;
      // Up goes to the first point of the next series, Down to the last point of the previous one.
      if (up) return k + 1 < ranges.length ? ranges[k + 1].start : cur;
      return k > 0 ? ranges[k - 1].end : cur;
    }
    default: return current;
  }
}

// Left edge for a tooltip anchored at `anchorX`: to the right of the anchor, flipped to its left when it
// would overflow, and never outside [margin, containerWidth - tipWidth - margin].
export function tooltipLeft(anchorX: number, tipWidth: number, containerWidth: number, gap = 10, margin = 4): number {
  let left = anchorX + gap;
  if (left + tipWidth > containerWidth - margin) left = anchorX - gap - tipWidth;
  const maxLeft = Math.max(margin, containerWidth - tipWidth - margin);
  return Math.min(Math.max(left, margin), maxLeft);
}
