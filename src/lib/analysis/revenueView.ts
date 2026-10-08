import { bestColumnOfRole } from "./pickColumns";
import type { PipelineResult } from "../../types/pipeline";

/* ================================================================
   VERDIO — Revenue view (pure)
   Moved here from components/workspace/revenue.ts so that library code
   (the story engine) can use it without importing from components.
   components/workspace/revenue.ts re-exports it; behaviour is unchanged.
   ================================================================ */

export function getRevenueView(result: PipelineResult) {
  const revenueColumn=bestColumnOfRole(result.semantics.columns,'revenue');
  const connectedRevenue=result.organization?.metrics?.find(metric=>metric.id==='connected-revenue')?.value;
  const total=connectedRevenue??(revenueColumn?result.engineeredRows.reduce((sum,row)=>sum+(Number(row[revenueColumn])||0),0):0);
  const series=result.statistics.timeSeries.find(item=>item.measureColumn===revenueColumn)
    ?? result.statistics.timeSeries.find(item=>/revenue|sales|amount/i.test(item.measureColumn));
  const latest=series?.points.at(-1)?.value ?? 0;
  const previous=series?.points.at(-2)?.value ?? 0;
  const changePct=previous?((latest-previous)/Math.abs(previous))*100:0;
  const revenueForecast=result.ml.forecast && (!revenueColumn || result.ml.forecast.measureColumn===revenueColumn) ? result.ml.forecast : null;
  return {revenueColumn,connectedRevenue,total,series,latest,changePct,revenueForecast};
}
