import { useState } from "react";
import { runForecast } from "../../lib/ml/forecastEngine";
import { labelForMeasure } from "../../lib/labels";
import type { PipelineResult } from "../../types/pipeline";
import { TrendChart } from "../charts/kit";
import { MetricCard } from "./MetricCard";
import { Figures, PageEmpty, PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageForecast({ r }: { r: PipelineResult }) {
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'conservative'>('base');
  if (!r.ml.forecast) return <PageEmpty message="Forecasting isn't available." />;
  const ts = r.statistics.timeSeries.find(t => t.measureColumn === r.ml.forecast!.measureColumn);
  const forecast = runForecast(ts ?? { measureColumn: r.ml.forecast.measureColumn, dateColumn: '', points: [] }, scenario as any);
  const measureLabel = labelForMeasure(forecast.measureColumn);
  const actual = ts?.points.map(p => ({ label: p.label, value: p.value })) ?? [];
  const ahead = forecast.points.map(p => ({ label: p.periodLabel, value: p.value, low: p.low, high: p.high }));
  return (
    <div className="v2-view">
      <PageHead eyebrow={`${measureLabel} forecast`} title={pageLabel('forecast')}>Linear + Holt smoothing</PageHead>
      <div className="v2-seg" role="group" aria-label="Forecast scenario">{(['base', 'optimistic', 'conservative'] as const).map(s => <button key={s} type="button" aria-pressed={scenario === s} onClick={() => setScenario(s)}>{s}</button>)}</div>
      <section className="v2-panel" aria-label={`${measureLabel} forecast chart`}>
        <TrendChart name={`Monthly ${measureLabel.toLowerCase()}`} actual={actual} forecast={ahead} format="currency" valueLabel={measureLabel} />
      </section>
      <Figures label="Forecast figures">
        <MetricCard label="6-Period Projection" value={`£${forecast.points.reduce((s, p) => s + p.value, 0).toLocaleString('en-GB')}`} sub={`${scenario}`} />
        <MetricCard label="Monthly Trend" value={`${forecast.monthlyTrendPct >= 0 ? '+' : ''}${forecast.monthlyTrendPct}%`} tone={forecast.monthlyTrendPct >= 0 ? 'green' : 'red'} toneLabel={forecast.monthlyTrendPct >= 0 ? 'Rising' : 'Declining'} />
        <MetricCard label="Holt Next Period" value={`£${Math.round(forecast.holtNextPeriod).toLocaleString('en-GB')}`} />
      </Figures>
    </div>
  );
}
