import { useMemo, type ReactNode } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { ChartTable } from "./ChartFrame";
import { linePath, linearScale } from "./geometry";
import { canShow, summarise, tableRows } from "./summary";

/* ================================================================
   VERDIO — KpiTile
   A figure with an optional sparkline of the pipeline values behind
   it. The sparkline is a small chart in its own right (role="img",
   generated label, table); with fewer than 2 points, all zeros or a
   NaN it is simply left out and the tile keeps its figure.
   ================================================================ */

export interface KpiTileProps {
  label: string;                                  // "Sales"
  value: ReactNode;                               // the headline figure, already formatted
  sub?: ReactNode;                                // a line under the figure (a StateMark, a source tag)
  spark?: { label: string; value: number }[];     // the series behind the figure, oldest first
  sparkName?: string;                             // names the series in the aria-label, default: label
  format?: ValueFormat;                           // default 'currency'
}

const W = 180;
const H = 28;

export function KpiTile({ label, value, sub, spark = [], sparkName, format = 'currency' }: KpiTileProps) {
  const name = sparkName ?? label;
  const showSpark = canShow(spark.map(p => p.value));
  const geo = useMemo(() => {
    if (!showSpark) return null;
    const values = spark.map(p => p.value);
    const y = linearScale([Math.min(...values), Math.max(...values)], [H - 3, 3]);
    const x = linearScale([0, spark.length - 1], [1, W - 1]);
    return { d: linePath(spark.map((p, i) => ({ x: x(i), y: y(p.value) }))), label: summarise({ name, points: spark, format }), rows: tableRows(spark, format) };
  }, [showSpark, spark, name, format]);

  return (
    <div className="v2-kc-kpi">
      <p className="v2-kc-kpi-label">{label}</p>
      <p className="v2-kc-kpi-val">{value}</p>
      {sub && <div className="v2-kc-kpi-sub">{sub}</div>}
      {geo && (
        <>
          <svg className="v2-kc-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={H} width="100%" role="img" aria-label={geo.label}>
            <path className="v2-kc-line" d={geo.d} vectorEffect="non-scaling-stroke" />
          </svg>
          <ChartTable caption={name} headers={['Month', 'Value']} rows={geo.rows.map(r => [r.label, r.value])} />
        </>
      )}
    </div>
  );
}
