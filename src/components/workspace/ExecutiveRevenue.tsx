import { CircleDollarSign } from "lucide-react";
import type { ChartSpec } from "../../types/analysis";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "./lazy";
import { StateMark } from "./StateMark";
import { formatExecutiveCurrency } from "./format";
import { getRevenueView, NO_EARLIER_PERIOD } from "./revenue";

export function ExecutiveRevenue({ result }: { result: PipelineResult }) {
  const revenue=getRevenueView(result);
  if(!revenue.revenueColumn&&!revenue.connectedRevenue)return <section className="v2-empty"><CircleDollarSign size={22} aria-hidden="true"/><div><h2>Revenue data is not available</h2><p>Map a numeric sales or revenue field in Data Hub to activate this executive view.</p></div></section>;
  const chartData=[
    ...(revenue.series?.points.map(point=>({period:point.label,revenue:point.value,forecast:null}))??[]),
    ...(revenue.revenueForecast?.points.map(point=>({period:point.periodLabel,revenue:null,forecast:point.value}))??[]),
  ];
  const projected=revenue.revenueForecast?.holtNextPeriod??0;
  const change=revenue.changePct;
  const movement=change===null?null:`${change>=0?'+':''}${change.toFixed(1)}%`;
  return <div className="v2-revenue">
    <section className="v2-rev-hero" aria-label="Recognised revenue">
      <div>
        <p className="v2-eyebrow">Recognised revenue</p>
        <p className="v2-rev-fig">{formatExecutiveCurrency(revenue.total)}</p>
        <p className="v2-tag">{revenue.connectedRevenue!==undefined?<><b>connected sales source</b> · reconciled across the connected sales source</>:<><b>{revenue.revenueColumn}</b> · calculated from the mapped revenue field</>}</p>
      </div>
      <div className="v2-rev-move">
        <p className="v2-eyebrow">Latest period movement</p>
        {change===null?<p className="v2-tag">{NO_EARLIER_PERIOD}</p>:<><p className="v2-rev-delta">{movement}</p>
        <StateMark tone={change<0?'watch':'ok'} label={change>0?'Rising':change<0?'Declining':'Flat'}/></>}
      </div>
    </section>
    <div className="v2-table-wrap">
      <table className="v2-table">
        <caption>Revenue figures</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col" className="num">Value</th><th scope="col">Source</th></tr></thead>
        <tbody>
          <tr><th scope="row">Latest period</th><td className="num">{revenue.latest?formatExecutiveCurrency(revenue.latest):'Not available'}</td><td className="v2-tag">{revenue.series?.points.at(-1)?.label??'No dated revenue series'}</td></tr>
          <tr><th scope="row">Next-period outlook</th><td className="num">{projected?formatExecutiveCurrency(projected):'Not available'}</td><td className="v2-tag">{revenue.revenueForecast?'Holt-smoothed base forecast':'More history is required'}</td></tr>
          <tr><th scope="row">Revenue history</th><td className="num">{revenue.series?.points.length??0}<span className="v2-unit"> periods</span></td><td className="v2-tag">{revenue.series?'Available for trend review':'A date field was not detected'}</td></tr>
        </tbody>
      </table>
    </div>
    {chartData.length>0?<section className="v2-panel" aria-labelledby="v2-rev-chart-title"><p className="v2-eyebrow">Revenue performance</p><h2 id="v2-rev-chart-title">Historical trend and forward outlook</h2><p className="v2-muted">Actual recognised revenue is shown alongside the current modelled forecast.</p><ChartRenderer chart={{chartType:'line',title:'',xKey:'period',seriesKeys:['revenue','forecast'],data:chartData,formatValue:'currency'} as ChartSpec}/></section>:null}
    <section className="v2-note-block"><h2>Revenue evidence</h2><p>Values are derived from the active mapped revenue field. Forecasts are planning estimates and should be reviewed alongside pipeline, pricing and operational context.</p></section>
  </div>;
}
