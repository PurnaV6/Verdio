import { useMemo } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { ChartFrame } from "./ChartFrame";
import { ChartTip } from "./ChartTip";
import { bandPolygon, linePath, linearScale, nearestIndex, niceTicks, tickIndexes } from "./geometry";
import { pointerX } from "./hooks";
import { formatCompact, formatFull } from "./format";
import { announce, canShow, PLANNING_RANGE_LABEL, summarise, tableRows, usableForecast, type ChartPoint } from "./summary";

/* ================================================================
   VERDIO — TrendChart
   A line of actual values, an optional dashed forecast line and the
   fixed planning-range band around it. Only the values it is given
   are drawn: no smoothing, no interpolation, no padding.
   ================================================================ */

export interface TrendActual { label: string; value: number }
export interface TrendForecast { label: string; value: number; low: number; high: number }

export interface TrendChartProps {
  name: string;                  // "Monthly sales": used in the aria-label and table caption
  actual: TrendActual[];
  forecast?: TrendForecast[];    // runForecast points; dropped when the engine had nothing to forecast
  format?: ValueFormat;          // default 'currency'
  valueLabel?: string;           // table column heading, default "Value"
  periodLabel?: string;          // table first column heading, default "Month"
  title?: string;
  subtitle?: string;
}

const M = { r: 12, t: 16, b: 28 };

export function TrendChart({ name, actual, forecast = [], format = 'currency', valueLabel = 'Value', periodLabel = 'Month', title, subtitle }: TrendChartProps) {
  const points = useMemo<ChartPoint[]>(() => {
    const ahead = usableForecast(forecast.map(f => ({ label: f.label, value: f.value, low: f.low, high: f.high, forecast: true })));
    return [...actual.map(a => ({ label: a.label, value: a.value })), ...ahead];
  }, [actual, forecast]);
  const nActual = actual.length;
  const hasForecast = points.length > nActual;
  const available = canShow(actual.map(a => a.value));
  const label = useMemo(() => summarise({ name, points, format }), [name, points, format]);
  const rows = useMemo(() => tableRows(points, format), [points, format]);
  const keyOptions = useMemo(() => (hasForecast ? { series: [{ start: 0, end: nActual - 1 }, { start: nActual, end: points.length - 1 }] } : {}), [hasForecast, nActual, points.length]);

  const table = {
    caption: hasForecast ? `${name}. Forecast rows are marked (forecast). ${PLANNING_RANGE_LABEL}.` : name,
    headers: hasForecast ? [periodLabel, valueLabel, 'Planning range'] : [periodLabel, valueLabel],
    rows: rows.map(r => (hasForecast ? [r.label, r.value, r.range ?? ''] : [r.label, r.value])),
  };

  const legend = (
    <ul className="v2-kc-legend">
      <li><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><path d="M1 5H25" className="v2-kc-line" /></svg>Actual</li>
      {hasForecast && <li><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><path d="M1 5H25" className="v2-kc-line is-forecast" /></svg>Forecast (dashed line)</li>}
      {hasForecast && <li><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><rect x="1" y="1" width="24" height="8" className="v2-kc-band" /></svg>{PLANNING_RANGE_LABEL}</li>}
    </ul>
  );

  return (
    <ChartFrame title={title} subtitle={subtitle} label={label} available={available} count={points.length} keyOptions={keyOptions}
      announce={i => announce(points[i], format)} legend={legend} table={table}>
      {({ width, active, setActive }) => <TrendPlot points={points} nActual={nActual} format={format} width={width} active={active} setActive={setActive} />}
    </ChartFrame>
  );
}

function TrendPlot({ points, nActual, format, width, active, setActive }: { points: ChartPoint[]; nActual: number; format: ValueFormat; width: number; active: number | null; setActive: (i: number | null) => void }) {
  const height = width < 480 ? 220 : 250;
  const geo = useMemo(() => {
    const lows = points.map(p => p.low ?? p.value);
    const highs = points.map(p => p.high ?? p.value);
    const ticks = niceTicks(Math.min(...lows), Math.max(...highs), 5, true);
    const tickLabels = ticks.map(t => formatCompact(t, format));
    const left = Math.max(40, Math.ceil(Math.max(...tickLabels.map(s => s.length)) * 6.8) + 12);
    const n = points.length;
    const x = linearScale([0, Math.max(1, n - 1)], [left, width - M.r]);
    const y = linearScale([ticks[0], ticks[ticks.length - 1]], [height - M.b, M.t]);
    const xs = points.map((_, i) => x(i));
    const ys = points.map(p => y(p.value));
    const lastA = nActual - 1;
    const ahead = points.slice(nActual);
    const anchor = { x: xs[lastA], y: ys[lastA] };
    const actualD = linePath(points.slice(0, nActual).map((_, i) => ({ x: xs[i], y: ys[i] })));
    const forecastD = ahead.length ? linePath([anchor, ...ahead.map((_, j) => ({ x: xs[nActual + j], y: ys[nActual + j] }))]) : '';
    const band = ahead.length && ahead.every(p => p.low !== undefined && p.high !== undefined)
      ? bandPolygon([{ x: anchor.x, upper: anchor.y, lower: anchor.y }, ...ahead.map((p, j) => ({ x: xs[nActual + j], upper: y(p.high!), lower: y(p.low!) }))])
      : '';
    const labelAt = tickIndexes(n, Math.max(2, Math.floor((width - left - M.r) / 72)));
    return { ticks, tickLabels, left, y, xs, ys, actualD, forecastD, band, labelAt, anchor, lastLow: ahead.length ? y(ahead[ahead.length - 1].low ?? ahead[ahead.length - 1].value) : 0 };
  }, [points, nActual, format, width, height]);

  const hasForecast = points.length > nActual;
  const lastF = points.length - 1;
  const ap = active !== null ? points[active] : null;
  const compactLast = formatCompact(points[nActual - 1].value, format);

  return (
    <>
      <svg className="v2-kc-svg" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true"
        onPointerMove={e => { const i = nearestIndex(pointerX(e, width), geo.xs); if (i >= 0) setActive(i); }}>
        {geo.ticks.map((t, i) => (
          <g key={t}>
            <line className="v2-kc-grid" x1={geo.left} x2={width - M.r} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="v2-kc-axis" x={geo.left - 6} y={geo.y(t) + 4} textAnchor="end">{geo.tickLabels[i]}</text>
          </g>
        ))}
        {geo.labelAt.map(i => (
          <text key={i} className="v2-kc-axis" x={geo.xs[i]} y={height - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{points[i].label}</text>
        ))}
        {geo.band && <polygon className="v2-kc-band" points={geo.band} />}
        <path className="v2-kc-line" d={geo.actualD} />
        {geo.forecastD && <path className="v2-kc-line is-forecast" d={geo.forecastD} />}
        {hasForecast && points.slice(nActual).map((p, j) => <circle key={p.label} className="v2-kc-dot is-hollow" cx={geo.xs[nActual + j]} cy={geo.ys[nActual + j]} r={3} />)}
        <circle className="v2-kc-dot" cx={geo.anchor.x} cy={geo.anchor.y} r={4.5} />
        <text className="v2-kc-direct is-ink" x={geo.anchor.x - 8} y={geo.anchor.y - 12} textAnchor="end">{compactLast}</text>
        {hasForecast && <text className="v2-kc-direct" x={geo.xs[lastF]} y={Math.min(geo.lastLow + 16, height - M.b - 4)} textAnchor="end">forecast</text>}
        {ap && active !== null && (
          <>
            <line className="v2-kc-cross" x1={geo.xs[active]} x2={geo.xs[active]} y1={M.t} y2={height - M.b} />
            <circle className={`v2-kc-dot is-active${ap.forecast ? ' is-hollow' : ''}`} cx={geo.xs[active]} cy={geo.ys[active]} r={5.5} />
          </>
        )}
        <rect x={geo.left} y={M.t} width={Math.max(0, width - M.r - geo.left)} height={height - M.b - M.t} fill="transparent" />
      </svg>
      {ap && active !== null && (
        <ChartTip x={geo.xs[active]} width={width}>
          <b>{ap.forecast ? `${ap.label} (forecast)` : ap.label}</b>
          <span>{formatFull(ap.value, format)}</span>
          {ap.forecast && ap.low !== undefined && ap.high !== undefined && (
            <>
              <small>{PLANNING_RANGE_LABEL}</small>
              <span>{formatFull(ap.low, format)} to {formatFull(ap.high, format)}</span>
            </>
          )}
        </ChartTip>
      )}
    </>
  );
}
