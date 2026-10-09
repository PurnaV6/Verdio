import { useMemo } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { ChartFrame } from "./ChartFrame";
import { ChartTip } from "./ChartTip";
import { barRects, linearScale, nearestIndex, niceTicks, tickIndexes } from "./geometry";
import { pointerX } from "./hooks";
import { formatCompact, formatFull } from "./format";
import { announce, canShow, summarise, tableRows, type ChartPoint } from "./summary";

/* ================================================================
   VERDIO — BarChart
   Vertical bars from a zero baseline, for fixed-order categories
   (day of week, month of year). The highest bar is the darker fill
   and carries its value as a label, so it is never colour alone.
   ================================================================ */

export interface BarItem { label: string; value: number }

export interface BarChartProps {
  name: string;                  // "Sales by month of year"
  items: BarItem[];
  format?: ValueFormat;          // default 'currency'
  categoryLabel?: string;        // table first column heading, default "Category"
  valueLabel?: string;           // table value column heading, default "Value"
  highlightHighest?: boolean;    // default true
  title?: string;
  subtitle?: string;
}

const M = { r: 8, t: 22, b: 26 };

export function BarChart({ name, items, format = 'currency', categoryLabel = 'Category', valueLabel = 'Value', highlightHighest = true, title, subtitle }: BarChartProps) {
  const points = useMemo<ChartPoint[]>(() => items.map(i => ({ label: i.label, value: i.value })), [items]);
  const available = canShow(points.map(p => p.value));
  const label = useMemo(() => summarise({ name, points, format, kind: 'category' }), [name, points, format]);
  const rows = useMemo(() => tableRows(points, format), [points, format]);
  const top = useMemo(() => points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0), [points]);

  const legend = highlightHighest ? (
    <ul className="v2-kc-legend">
      <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" className="v2-kc-bar is-top" /></svg>Highest: {points[top]?.label}</li>
      <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" className="v2-kc-bar" /></svg>Others</li>
    </ul>
  ) : null;

  return (
    <ChartFrame title={title} subtitle={subtitle} label={label} available={available} count={points.length}
      announce={i => announce(points[i], format)} legend={legend}
      table={{ caption: name, headers: [categoryLabel, valueLabel], rows: rows.map(r => [r.label, r.value]) }}>
      {({ width, active, setActive }) => <BarPlot points={points} format={format} top={highlightHighest ? top : -1} width={width} active={active} setActive={setActive} />}
    </ChartFrame>
  );
}

function BarPlot({ points, format, top, width, active, setActive }: { points: ChartPoint[]; format: ValueFormat; top: number; width: number; active: number | null; setActive: (i: number | null) => void }) {
  const height = width < 480 ? 170 : 190;
  const geo = useMemo(() => {
    const values = points.map(p => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 5, true);
    const tickLabels = ticks.map(t => formatCompact(t, format));
    const left = Math.max(40, Math.ceil(Math.max(...tickLabels.map(s => s.length)) * 6.8) + 12);
    const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
    const rects = barRects(values, { x: left, y: M.t, width: width - left - M.r, height: height - M.t - M.b, domain });
    const centres = rects.map(r => r.x + r.width / 2);
    return { ticks, tickLabels, left, y: linearScale(domain, [height - M.b, M.t]), rects, centres, labelAt: tickIndexes(points.length, Math.max(2, Math.floor((width - left - M.r) / 44))) };
  }, [points, format, width, height]);

  const ap = active !== null ? points[active] : null;

  return (
    <>
      <svg className="v2-kc-svg" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true"
        onPointerMove={e => { const i = nearestIndex(pointerX(e, width), geo.centres); if (i >= 0) setActive(i); }}>
        {geo.ticks.map((t, i) => (
          <g key={t}>
            <line className="v2-kc-grid" x1={geo.left} x2={width - M.r} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="v2-kc-axis" x={geo.left - 6} y={geo.y(t) + 4} textAnchor="end">{geo.tickLabels[i]}</text>
          </g>
        ))}
        {geo.rects.map(r => (
          <rect key={r.index} className={`v2-kc-bar${r.index === top ? ' is-top' : ''}${r.index === active ? ' is-active' : ''}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={2} />
        ))}
        {geo.labelAt.map(i => <text key={i} className="v2-kc-axis" x={geo.centres[i]} y={height - 8} textAnchor="middle">{points[i].label}</text>)}
        {top >= 0 && geo.rects[top] && (
          <text className="v2-kc-direct is-ink" x={geo.centres[top]} y={points[top].value >= 0 ? geo.rects[top].y - 6 : geo.rects[top].y + geo.rects[top].height + 14} textAnchor="middle">{formatCompact(points[top].value, format)}</text>
        )}
      </svg>
      {ap && active !== null && (
        <ChartTip x={geo.centres[active]} width={width}>
          <b>{ap.label}</b>
          <span>{formatFull(ap.value, format)}</span>
        </ChartTip>
      )}
    </>
  );
}
