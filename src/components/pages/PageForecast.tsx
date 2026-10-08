import { useState } from "react";
import { runForecast } from "../../lib/ml/forecastEngine";
import { labelForMeasure } from "../../lib/labels";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";
import { MetricCard } from "./MetricCard";
import { Figures, PageEmpty, PageHead } from "./PageParts";

export function PageForecast({ r }: { r: PipelineResult }) {
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'conservative'>('base');
  if (!r.ml.forecast) return <PageEmpty message="Forecasting isn't available." />;
  const ts = r.statistics.timeSeries.find(t => t.measureColumn === r.ml.forecast!.measureColumn);
  const forecast = runForecast(ts ?? { measureColumn: r.ml.forecast.measureColumn, dateColumn: '', points: [] }, scenario as any);
  const measureLabel = labelForMeasure(forecast.measureColumn);
  const chartData = [...(ts?.points.map(p => ({ period: p.label, historical: p.value, forecast: null })) || []), ...forecast.points.map(p => ({ period: p.periodLabel, historical: null, forecast: p.value }))];
  return (
    <div className="v2-view">
      <PageHead eyebrow="Predictions" title={`${measureLabel} forecast`}>Linear + Holt smoothing</PageHead>
      <div className="v2-seg" role="group" aria-label="Forecast scenario">{(['base', 'optimistic', 'conservative'] as const).map(s => <button key={s} type="button" aria-pressed={scenario === s} onClick={() => setScenario(s)}>{s}</button>)}</div>
      <section className="v2-panel" aria-label={`${measureLabel} forecast chart`}>
        <ChartRenderer chart={{ chartType: 'line', title: '', xKey: 'period', seriesKeys: ['historical', 'forecast'], data: chartData, formatValue: 'currency' } as any} />
      </section>
      <Figures label="Forecast figures">
        <MetricCard label="6-Period Projection" value={`£${forecast.points.reduce((s, p) => s + p.value, 0).toLocaleString('en-GB')}`} sub={`${scenario}`} />
        <MetricCard label="Monthly Trend" value={`${forecast.monthlyTrendPct >= 0 ? '+' : ''}${forecast.monthlyTrendPct}%`} tone={forecast.monthlyTrendPct >= 0 ? 'green' : 'red'} toneLabel={forecast.monthlyTrendPct >= 0 ? 'Rising' : 'Declining'} />
        <MetricCard label="Holt Next Period" value={`£${Math.round(forecast.holtNextPeriod).toLocaleString('en-GB')}`} />
      </Figures>
    </div>
  );
}
