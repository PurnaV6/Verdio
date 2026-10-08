import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";
import { PageEmpty, PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageSeasonality({ r }: { r: PipelineResult }) {
  const s = r.statistics.seasonality; if (!s) return <PageEmpty message="Seasonality not available." />;
  return <div className="v2-view"><PageHead eyebrow="Demand by day and month" title={pageLabel('seasonality')} /><div className="v2-chart-list"><section className="v2-chart-item"><ChartRenderer chart={{ chartType: 'bar', title: 'By Day of Week', xKey: 'label', yKey: 'value', data: s.byDayOfWeek, formatValue: 'currency' } as any} /></section><section className="v2-chart-item"><ChartRenderer chart={{ chartType: 'bar', title: 'By Month', xKey: 'label', yKey: 'value', data: s.byMonthOfYear, formatValue: 'currency' } as any} /></section></div></div>;
}
