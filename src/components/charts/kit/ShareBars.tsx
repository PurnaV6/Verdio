import { useMemo } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { ChartFrame } from "./ChartFrame";
import { formatCompact } from "./format";
import { canShow, summarise, tableRows, type ChartPoint } from "./summary";

/* ================================================================
   VERDIO — ShareBars
   Horizontal bars showing each item's share of the total, as rows of
   label, bar and "share, amount" text. The text is plain HTML so it
   stays 11px+ at any width; the largest share is the darker fill.
   ================================================================ */

export interface ShareItem { label: string; value: number }

export interface ShareBarsProps {
  name: string;                  // "Share of sales by category"
  items: ShareItem[];            // in the order to show them (largest first reads best)
  format?: ValueFormat;          // how the amount is written, default 'currency'
  categoryLabel?: string;        // table first column heading, default "Category"
  valueLabel?: string;           // table amount column heading, default "Value"
  title?: string;
  subtitle?: string;
}

const NO_VALUES = 'Cannot show this chart: needs at least 1 non-zero value';
const VERTICAL = { vertical: true } as const;

export function ShareBars({ name, items, format = 'currency', categoryLabel = 'Category', valueLabel = 'Value', title, subtitle }: ShareBarsProps) {
  const points = useMemo<ChartPoint[]>(() => items.map(i => ({ label: i.label, value: i.value })), [items]);
  const available = canShow(points.map(p => p.value), 1) && points.every(p => p.value >= 0);
  const label = useMemo(() => summarise({ name, points, format, kind: 'parts' }), [name, points, format]);
  const rows = useMemo(() => tableRows(points, format, { shares: true }), [points, format]);
  const total = useMemo(() => points.reduce((s, p) => s + p.value, 0), [points]);
  const top = useMemo(() => points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0), [points]);

  const legend = (
    <ul className="v2-kc-legend">
      <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" className="v2-kc-bar is-top" /></svg>Largest share: {points[top]?.label}</li>
      <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" className="v2-kc-bar" /></svg>Others</li>
    </ul>
  );

  return (
    <ChartFrame title={title} subtitle={subtitle} label={label} available={available} unavailableMessage={NO_VALUES} count={points.length} keyOptions={VERTICAL}
      announce={i => `${rows[i].label}, ${rows[i].share} of the total, ${rows[i].value}`} legend={legend}
      table={{ caption: name, headers: [categoryLabel, valueLabel, 'Share'], rows: rows.map(r => [r.label, r.value, r.share ?? '']) }}>
      {({ active, setActive }) => (
        <ul className="v2-kc-shares">
          {points.map((p, i) => {
            const share = total > 0 ? (p.value / total) * 100 : 0;
            return (
              <li key={p.label} className={`v2-kc-share${i === active ? ' is-active' : ''}`} onPointerEnter={() => setActive(i)}>
                <span className="v2-kc-share-label">{p.label}</span>
                <svg className="v2-kc-share-track" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
                  <rect className="v2-kc-track" x="0" y="0" width="100" height="12" />
                  <rect className={`v2-kc-bar${i === top ? ' is-top' : ''}`} x="0" y="0" width={Math.max(0, Math.min(100, share))} height="12" />
                </svg>
                <span className="v2-kc-share-val">{Math.round(share * 10) / 10}% <small>{formatCompact(p.value, format)}</small></span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartFrame>
  );
}
