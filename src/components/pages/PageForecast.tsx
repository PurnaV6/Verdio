import { useState } from "react";
import { runForecast } from "../../lib/ml/forecastEngine";
import { labelForMeasure } from "../../lib/labels";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";
import { MetricCard } from "./MetricCard";

export function PageForecast({ r }: { r: PipelineResult }) {
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'conservative'>('base');
  if (!r.ml.forecast) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">Forecasting isn't available.</div>;
  const ts = r.statistics.timeSeries.find(t => t.measureColumn === r.ml.forecast!.measureColumn);
  const forecast = runForecast(ts ?? { measureColumn: r.ml.forecast.measureColumn, dateColumn: '', points: [] }, scenario as any);
  const measureLabel = labelForMeasure(forecast.measureColumn);
  const chartData = [...(ts?.points.map(p => ({ period: p.label, historical: p.value, forecast: null })) || []), ...forecast.points.map(p => ({ period: p.periodLabel, historical: null, forecast: p.value }))];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[16px] border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4"><div><p className="text-[11px] font-bold tracking-widest text-slate-600">{measureLabel.toUpperCase()} FORECAST</p><p className="text-[11px] text-slate-400">Linear + Holt smoothing</p></div><div className="flex gap-1.5">{(['base', 'optimistic', 'conservative'] as const).map(s => <button key={s} onClick={() => setScenario(s)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${scenario === s ? 'bg-indigo-900 text-white border-indigo-900' : 'text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{s}</button>)}</div></div>
        <ChartRenderer chart={{ chartType: 'line', title: '', xKey: 'period', seriesKeys: ['historical', 'forecast'], data: chartData, formatValue: 'currency' } as any} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="6-Period Projection" value={`£${forecast.points.reduce((s, p) => s + p.value, 0).toLocaleString('en-GB')}`} sub={`${scenario}`} />
        <MetricCard label="Monthly Trend" value={`${forecast.monthlyTrendPct >= 0 ? '+' : ''}${forecast.monthlyTrendPct}%`} tone={forecast.monthlyTrendPct >= 0 ? 'green' : 'red'} />
        <MetricCard label="Holt Next Period" value={`£${Math.round(forecast.holtNextPeriod).toLocaleString('en-GB')}`} />
      </div>
    </div>
  );
}
