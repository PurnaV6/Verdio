import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";

export function PageSeasonality({ r }: { r: PipelineResult }) {
  const s = r.statistics.seasonality; if (!s) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">Seasonality not available.</div>;
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="bg-white rounded-[16px] border p-4"><ChartRenderer chart={{ chartType: 'bar', title: 'By Day of Week', xKey: 'label', yKey: 'value', data: s.byDayOfWeek, formatValue: 'currency' } as any} /></div><div className="bg-white rounded-[16px] border p-4"><ChartRenderer chart={{ chartType: 'bar', title: 'By Month', xKey: 'label', yKey: 'value', data: s.byMonthOfYear, formatValue: 'currency' } as any} /></div></div>;
}
