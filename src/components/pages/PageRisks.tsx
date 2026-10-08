import type { PipelineResult } from "../../types/pipeline";
import { SkeletonBlock } from "../workspace/Skeleton";
import { findRiskExplanation } from "./aiLookup";

export function PageRisks({ r }: { r: PipelineResult }) {
  if (!r.decision.risks.length) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No risks.</div>;
  return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm space-y-3">{r.decision.risks.map((risk,i)=>{ const exp=findRiskExplanation(r.aiInsights, risk.title, i); return <div key={i} className="p-4 rounded-xl border border-slate-200 border-l-4" style={{borderLeftColor: risk.level==='high'?'#DC2626': risk.level==='medium'?'#D97706':'#312E81'}}><span className="text-[10px] font-bold uppercase text-slate-500">{risk.level} risk</span><p className="font-bold text-sm mt-1 text-slate-900">{risk.title}</p>{r.aiLoading?<SkeletonBlock lines={2}/>:exp?<p className="text-xs text-slate-600 mt-1 leading-5">{exp.impact} • {exp.action}</p>:<p className="text-xs text-slate-500 mt-1">{risk.desc}</p>}</div>; })}</div>;
}
