import type { PipelineResult } from "../../types/pipeline";
import { fmtN } from "../workspace/format";
import { StateMark } from "../workspace/StateMark";
import { MetricCard } from "./MetricCard";
import { Figures, PageEmpty, PageHead } from "./PageParts";

export function PageCustomers({ r }: { r: PipelineResult }) {
  if (!r.ml.segmentation || !r.ml.segmentation.segments.length) return <PageEmpty message="Segmentation not available." />;
  const seg = r.ml.segmentation;
  const shown = seg.segments.slice(0, 12);
  return (
    <div className="v2-view">
      <PageHead eyebrow="Customer intelligence" title="Customer segments">Showing {shown.length} of {fmtN(seg.segments.length)} customers.</PageHead>
      <Figures label="Customer figures">
        <MetricCard label="Total Customers" value={fmtN(seg.segments.length)} />
        <MetricCard label="Churn Risk" value={`${seg.churnRiskScore}/100`} tone={seg.churnRiskScore >= 60 ? 'red' : 'amber'} toneLabel={seg.churnRiskScore >= 60 ? 'High' : 'Watch'} />
        <MetricCard label="Revenue at Risk" value={`£${Math.round(seg.revenueAtRisk).toLocaleString()}`} tone="red" toneLabel="At risk" />
        <MetricCard label="At Risk" value={fmtN(seg.segments.filter(s=>s.segment==='atRisk' || s.segment==='lost').length)} />
      </Figures>
      <div className="v2-table-wrap"><table className="v2-table"><caption>Customers</caption><thead><tr><th scope="col">Customer</th><th scope="col">Segment</th><th scope="col" className="num">Total</th><th scope="col" className="num">Orders</th><th scope="col">RFM</th></tr></thead><tbody>{shown.map(s=><tr key={s.id}><th scope="row">{s.id}</th><td>{s.segment==='atRisk'?<StateMark tone="watch" label={s.segment}/>:s.segment==='lost'?<StateMark tone="risk" label={s.segment}/>:<span className="v2-tag">{s.segment}</span>}</td><td className="num">£{s.monetary.toLocaleString()}</td><td className="num">{s.frequency}</td><td className="read"><span className="v2-bar" aria-hidden="true"><i style={{width:`${(s.rfmScore/9)*100}%`}} /></span><span className="v2-tag">{s.rfmScore}/9</span></td></tr>)}</tbody></table></div>
    </div>
  );
}
