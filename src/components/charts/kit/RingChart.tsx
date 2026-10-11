import { useMemo, useState } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { ChartFrame } from "./ChartFrame";
import { formatCompact } from "./format";
import { arcPath, polar, ringSlices, sliceArcs, type RingItem, type RingRefusal } from "./ring";
import { summarise, tableRows, type ChartPoint } from "./summary";

/* ================================================================
   VERDIO — RingChart
   A ring for the parts of ONE whole (category share, customer
   segments, risks by level). Never for a time series. Up to six
   slices: the rest are grouped as "Other (n)" by ringSlices(). Every
   slice has a 1px ink outline, a percentage printed beside it when
   it is wide enough, and a row in the list with swatch, word, value
   and share. The centre says the total, or the slice in focus.
   ================================================================ */

export interface RingChartProps {
  name: string;                       // "Share of revenue by Product Category (Mar 25)": used in the aria-label and table caption
  items: RingItem[];                  // the parts, largest first reads best
  format?: ValueFormat;               // default 'currency'
  centreLabel: string;                // under the total in the centre: "in period", "customers"
  categoryLabel?: string;             // table first column heading, default "Category"
  valueLabel?: string;                // table value column heading, default "Value"
  selectedLabel?: string | null;      // controlled highlight (a slice label); leave undefined to let the chart hold it
  onSelect?: (label: string | null) => void;
  title?: string;
  subtitle?: string;
}

const REFUSED: Record<RingRefusal, string> = {
  invalid: 'Cannot show this chart: some values are not numbers',
  negative: 'Cannot show this chart as shares: a share of a whole cannot include negative values',
  empty: 'Cannot show this chart: every value is zero',
  single: 'Cannot show this chart: needs at least 2 parts to split',
};

const RING_VIEW = { width: 240, height: 200, cx: 120, cy: 100, outer: 66, inner: 42, lift: 6, label: 80 };
const LABEL_MIN_SHARE = 8;
const FILL_COUNT = 6;
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const clip = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function RingChart({ name, items, format = 'currency', centreLabel, categoryLabel = 'Category', valueLabel = 'Value', selectedLabel, onSelect, title, subtitle }: RingChartProps) {
  const plan = useMemo(() => ringSlices(items), [items]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = selectedLabel !== undefined ? selectedLabel : picked;
  const slices = plan.slices;
  const selected = current === null ? -1 : slices.findIndex(s => s.label === current);
  const points = useMemo<ChartPoint[]>(() => slices.map(s => ({ label: s.label, value: s.value })), [slices]);
  const rows = useMemo(() => tableRows(points, format, { shares: true }), [points, format]);
  const label = useMemo(() => {
    const base = summarise({ name, points, format, kind: 'parts' });
    return selected >= 0 ? `${base}. ${slices[selected].label} is highlighted` : base;
  }, [name, points, format, selected, slices]);

  function choose(index: number) {
    const next = index === selected ? null : slices[index].label;
    setPicked(next);
    onSelect?.(next);
  }

  const legend = (
    <ul className="v2-rg-legend">
      {rows.map((r, i) => (
        <li key={`${i}-${r.label}`} className={`v2-rg-row${i === selected ? ' is-selected' : ''}`} onClick={() => choose(i)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" className={`v2-rg-slice v2-rg-fill-${i % FILL_COUNT}`} /></svg>
          <span className="v2-rg-name">{r.label}</span>
          <span className="v2-rg-val">{r.value}</span>
          <span className="v2-rg-share">{r.share}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <ChartFrame className="v2-rg" title={title} subtitle={subtitle} label={label} available={plan.reason === null} unavailableMessage={plan.reason ? REFUSED[plan.reason] : undefined}
      count={slices.length} keyOptions={{ vertical: true }} onActivate={choose}
      announce={i => `${rows[i].label}, ${rows[i].value}, ${rows[i].share} of the total${i === selected ? ', highlighted' : ''}`}
      legend={legend}
      table={{ caption: name, headers: [categoryLabel, valueLabel, 'Share'], rows: rows.map(r => [r.label, r.value, r.share ?? '']) }}>
      {({ active, setActive }) => {
        const arcs = sliceArcs(slices.map(s => s.value));
        const focus = active !== null ? active : selected;
        const fs = focus >= 0 ? slices[focus] : null;
        const { cx, cy, outer, inner, lift } = RING_VIEW;
        return (
          <svg className="v2-rg-svg" viewBox={`0 0 ${RING_VIEW.width} ${RING_VIEW.height}`} width={RING_VIEW.width} height={RING_VIEW.height} aria-hidden="true">
            {arcs.map(a => {
              const raised = a.index === selected || a.index === active;
              return (
                <path key={a.index} d={arcPath(cx, cy, raised ? outer + lift : outer, inner, a.start, a.end)}
                  className={`v2-rg-slice v2-rg-fill-${a.index % FILL_COUNT}${a.index === selected ? ' is-selected' : ''}${a.index === active ? ' is-active' : ''}`}
                  onPointerEnter={() => setActive(a.index)} onClick={() => choose(a.index)} />
              );
            })}
            {arcs.map(a => {
              const share = (slices[a.index].value / plan.total) * 100;
              if (share < LABEL_MIN_SHARE) return null;
              const mid = (a.start + a.end) / 2;
              const p = polar(cx, cy, RING_VIEW.label, mid);
              const side = Math.sin(mid);
              return <text key={a.index} className="v2-rg-pct" x={p.x} y={p.y + 4} textAnchor={Math.abs(side) < 0.25 ? 'middle' : side > 0 ? 'start' : 'end'}>{pct(share)}</text>;
            })}
            <text className="v2-rg-centre" x={cx} y={cy + 1} textAnchor="middle">{formatCompact(fs ? fs.value : plan.total, format)}</text>
            <text className="v2-rg-centre-sub" x={cx} y={cy + 17} textAnchor="middle">{fs ? clip(fs.label) : clip(centreLabel)}</text>
          </svg>
        );
      }}
    </ChartFrame>
  );
}
