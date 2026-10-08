import { CircleDollarSign, ShieldCheck, TrendingUp } from "lucide-react";
import type { ChartSpec } from "../../types/analysis";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "./lazy";
import { formatExecutiveCurrency } from "./format";
import { getRevenueView } from "./revenue";

export function ExecutiveRevenue({ result }: { result: PipelineResult }) {
  const revenue=getRevenueView(result);
  if(!revenue.revenueColumn&&!revenue.connectedRevenue)return <section className="executive-revenue-empty"><CircleDollarSign size={23}/><div><h2>Revenue data is not available</h2><p>Map a numeric sales or revenue field in Data Hub to activate this executive view.</p></div></section>;
  const chartData=[
    ...(revenue.series?.points.map(point=>({period:point.label,revenue:point.value,forecast:null}))??[]),
    ...(revenue.revenueForecast?.points.map(point=>({period:point.periodLabel,revenue:null,forecast:point.value}))??[]),
  ];
  const projected=revenue.revenueForecast?.holtNextPeriod??0;
  return <div className="executive-revenue-view">
    <section className="revenue-hero-card">
      <div><span>Recognised revenue</span><strong>{formatExecutiveCurrency(revenue.total)}</strong><p>{revenue.connectedRevenue!==undefined?'Reconciled across the connected sales source':`Calculated from ${revenue.revenueColumn}`}</p></div>
      <div className={`revenue-movement ${revenue.changePct>=0?'is-positive':'is-negative'}`}><TrendingUp size={17}/><span>{revenue.changePct>=0?'+':''}{revenue.changePct.toFixed(1)}%</span><small>latest period movement</small></div>
    </section>
    <section className="revenue-support-kpis">
      <article><span>Latest period</span><strong>{revenue.latest?formatExecutiveCurrency(revenue.latest):'Not available'}</strong><small>{revenue.series?.points.at(-1)?.label??'No dated revenue series'}</small></article>
      <article><span>Next-period outlook</span><strong>{projected?formatExecutiveCurrency(projected):'Not available'}</strong><small>{revenue.revenueForecast?'Holt-smoothed base forecast':'More history is required'}</small></article>
      <article><span>Revenue history</span><strong>{revenue.series?.points.length??0}<em> periods</em></strong><small>{revenue.series?'Available for trend review':'A date field was not detected'}</small></article>
    </section>
    {chartData.length>0?<section className="revenue-chart-panel"><div><span>Revenue performance</span><h2>Historical trend and forward outlook</h2><p>Actual recognised revenue is shown alongside the current modelled forecast.</p></div><ChartRenderer chart={{chartType:'line',title:'',xKey:'period',seriesKeys:['revenue','forecast'],data:chartData,formatValue:'currency'} as ChartSpec}/></section>:null}
    <section className="revenue-evidence"><ShieldCheck size={17}/><div><strong>Revenue evidence</strong><p>Values are derived from the active mapped revenue field. Forecasts are planning estimates and should be reviewed alongside pipeline, pricing and operational context.</p></div></section>
  </div>;
}
