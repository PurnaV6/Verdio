import { bestColumnOfRole } from "./pickColumns";
import type { PipelineResult } from "../../types/pipeline";
import { salesSummary } from "./salesSummary";

/* ================================================================
   VERDIO — Revenue view (pure)
   Moved here from components/workspace/revenue.ts so that library code
   (the story engine) can use it without importing from components.
   components/workspace/revenue.ts re-exports it; behaviour is unchanged.
   ================================================================ */

/** Percentage change from the previous period; null when there is no earlier period to compare with (missing or zero). */
export function computeChangePct(latest: number, previous: number | undefined): number | null {
  return previous ? ((latest - previous) / Math.abs(previous)) * 100 : null;
}

export const NO_EARLIER_PERIOD = 'No earlier month to compare with';

/**
 * The connected-revenue headline. When it was summed from the same file the pipeline just analysed, the
 * pipeline's own Sales figure is used instead, so the headline total can never disagree with the monthly series.
 */
export function connectedRevenueOf(result: PipelineResult, revenueColumn: string | null): number | undefined {
  const metric=result.organization?.metrics?.find(item=>item.id==='connected-revenue');
  if(!metric) return undefined;
  const source=result.organization?.datasets?.find(dataset=>metric.sourceDatasetIds?.includes(dataset.id));
  return revenueColumn&&source&&source.fileName===result.source.fileName?salesSummary(result).salesTotal:metric.value;
}

export function getRevenueView(result: PipelineResult) {
  const revenueColumn=bestColumnOfRole(result.semantics.columns,'revenue');
  const connectedRevenue=connectedRevenueOf(result,revenueColumn);
  const total=connectedRevenue??(revenueColumn?salesSummary(result).salesTotal:0);
  const series=result.statistics.timeSeries.find(item=>item.measureColumn===revenueColumn)
    ?? result.statistics.timeSeries.find(item=>/revenue|sales|amount/i.test(item.measureColumn));
  const latest=series?.points.at(-1)?.value ?? 0;
  const changePct=computeChangePct(latest,series?.points.at(-2)?.value);
  const revenueForecast=result.ml.forecast && (!revenueColumn || result.ml.forecast.measureColumn===revenueColumn) ? result.ml.forecast : null;
  return {revenueColumn,connectedRevenue,total,series,latest,changePct,revenueForecast};
}
