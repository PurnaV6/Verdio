import { useMemo } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { ChartFrame } from "./ChartFrame";
import { ChartTip } from "./ChartTip";
import { nearestIndex, segmentRects } from "./geometry";
import { pointerX } from "./hooks";
import { formatFull } from "./format";
import { canShow, summarise, tableRows, type ChartPoint } from "./summary";

/* ================================================================
   VERDIO — StackedSegmentBar
   One bar split into parts (for example customer segments). Every
   segment has a 1px ink outline, its count printed above it when it
   is wide enough, and a legend entry with swatch, word and count.
   ================================================================ */

export interface Segment { label: string; value: number }

export interface StackedSegmentBarProps {
  name: string;                  // "Customer segments"
  segments: Segment[];
  format?: ValueFormat;          // default 'count'
  categoryLabel?: string;        // table first column heading, default "Segment"
  valueLabel?: string;           // table count column heading, default "Count"
  title?: string;
  subtitle?: string;
}

// Fills come from the tokens. The outline carries the edge where a fill is light, so none depends on colour alone.
const FILLS = [
  'var(--vc-accent)',
  'var(--vc-accent-2)',
  'var(--vc-muted)',
  'color-mix(in srgb, var(--vc-accent) 50%, var(--vc-ink))',
  'color-mix(in srgb, var(--vc-accent-2) 40%, var(--vc-panel))',
];
const NO_VALUES = 'Cannot show this chart: needs at least 1 non-zero value';
const BAR = { y: 24, h: 28 };

export function StackedSegmentBar({ name, segments, format = 'count', categoryLabel = 'Segment', valueLabel = 'Count', title, subtitle }: StackedSegmentBarProps) {
  const points = useMemo<ChartPoint[]>(() => segments.map(s => ({ label: s.label, value: s.value })), [segments]);
  const available = canShow(points.map(p => p.value), 1) && points.every(p => p.value >= 0);
  const label = useMemo(() => summarise({ name, points, format, kind: 'parts' }), [name, points, format]);
  const rows = useMemo(() => tableRows(points, format, { shares: true }), [points, format]);

  const legend = (
    <ul className="v2-kc-legend">
      {rows.map((r, i) => (
        <li key={r.label}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" className="v2-kc-seg" style={{ fill: FILLS[i % FILLS.length] }} /></svg>
          {r.label} {r.value} ({r.share})
        </li>
      ))}
    </ul>
  );

  return (
    <ChartFrame title={title} subtitle={subtitle} label={label} available={available} unavailableMessage={NO_VALUES} count={points.length} fallbackWidth={320}
      announce={i => `${rows[i].label}, ${rows[i].value}, ${rows[i].share} of the total`} legend={legend}
      table={{ caption: name, headers: [categoryLabel, valueLabel, 'Share'], rows: rows.map(r => [r.label, r.value, r.share ?? '']) }}>
      {({ width, active, setActive }) => <SegmentPlot points={points} format={format} width={width} active={active} setActive={setActive} />}
    </ChartFrame>
  );
}

function SegmentPlot({ points, format, width, active, setActive }: { points: ChartPoint[]; format: ValueFormat; width: number; active: number | null; setActive: (i: number | null) => void }) {
  const rects = useMemo(() => segmentRects(points.map(p => p.value), width, 2), [points, width]);
  const centres = rects.map(r => r.x + r.width / 2);
  const ap = active !== null ? points[active] : null;
  const activeRect = rects.find(r => r.index === active);

  return (
    <>
      <svg className="v2-kc-svg" viewBox={`0 0 ${width} ${BAR.y + BAR.h + 4}`} width="100%" height={BAR.y + BAR.h + 4} aria-hidden="true"
        onPointerMove={e => { const k = nearestIndex(pointerX(e, width), centres); if (k >= 0) setActive(rects[k].index); }}>
        {rects.map(r => (
          <g key={r.index}>
            <rect className={`v2-kc-seg${r.index === active ? ' is-active' : ''}`} x={r.x + 0.5} y={BAR.y} width={Math.max(0, r.width - 1)} height={BAR.h} rx={3} style={{ fill: FILLS[r.index % FILLS.length] }} />
            {r.width >= 30 && <text className="v2-kc-direct is-ink" x={r.x + r.width / 2} y={BAR.y - 8} textAnchor="middle">{formatFull(r.value, format)}</text>}
          </g>
        ))}
      </svg>
      {ap && activeRect && (
        <ChartTip x={activeRect.x + activeRect.width / 2} width={width}>
          <b>{ap.label}</b>
          <span>{formatFull(ap.value, format)}</span>
        </ChartTip>
      )}
    </>
  );
}
