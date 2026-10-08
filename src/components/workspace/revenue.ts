import { bestColumnOfRole } from "../../lib/analysis/pickColumns";
import type { PipelineResult } from "../../types/pipeline";

/** Percentage change from the previous period; null when there is no earlier period to compare with (missing or zero). */
export function computeChangePct(latest: number, previous: number | undefined): number | null {
  return previous ? ((latest - previous) / Math.abs(previous)) * 100 : null;
}

export const NO_EARLIER_PERIOD = 'No earlier month to compare with';

export function getRevenueView(result: PipelineResult) {
  const revenueColumn=bestColumnOfRole(result.semantics.columns,'revenue');
  const connectedRevenue=result.organization?.metrics?.find(metric=>metric.id==='connected-revenue')?.value;
  const total=connectedRevenue??(revenueColumn?result.engineeredRows.reduce((sum,row)=>sum+(Number(row[revenueColumn])||0),0):0);
  const series=result.statistics.timeSeries.find(item=>item.measureColumn===revenueColumn)
    ?? result.statistics.timeSeries.find(item=>/revenue|sales|amount/i.test(item.measureColumn));
  const latest=series?.points.at(-1)?.value ?? 0;
  const changePct=computeChangePct(latest,series?.points.at(-2)?.value);
  const revenueForecast=result.ml.forecast && (!revenueColumn || result.ml.forecast.measureColumn===revenueColumn) ? result.ml.forecast : null;
  return {revenueColumn,connectedRevenue,total,series,latest,changePct,revenueForecast};
}
