import type { PipelineResult } from "../../types/pipeline";
import { fmtN } from "../workspace/format";
import { MetricCard } from "./MetricCard";

export function PageCustomers({ r }: { r: PipelineResult }) {
  if (!r.ml.segmentation || !r.ml.segmentation.segments.length) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">Segmentation not available.</div>;
  const seg = r.ml.segmentation;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3"><MetricCard label="Total Customers" value={fmtN(seg.segments.length)} /><MetricCard label="Churn Risk" value={`${seg.churnRiskScore}/100`} tone={seg.churnRiskScore >= 60 ? 'red' : 'amber'} /><MetricCard label="Revenue at Risk" value={`£${Math.round(seg.revenueAtRisk).toLocaleString()}`} tone="red" /><MetricCard label="At Risk" value={fmtN(seg.segments.filter(s=>s.segment==='atRisk' || s.segment==='lost').length)} /></div>
      <div className="bg-white rounded-[16px] border p-5 shadow-sm overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{['Customer','Segment','Total','Orders','RFM'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase">{h}</th>)}</tr></thead><tbody>{seg.segments.slice(0,12).map(s=><tr key={s.id} className="border-t border-slate-100"><td className="py-2.5 font-semibold">{s.id}</td><td><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">{s.segment}</span></td><td className="font-bold">£{s.monetary.toLocaleString()}</td><td className="text-slate-500">{s.frequency}</td><td><div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-900" style={{width:`${(s.rfmScore/9)*100}%`}} /></div></td></tr>)}</tbody></table></div>
    </div>
  );
}
