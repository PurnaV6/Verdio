import { computeCategoryBreakdown } from "../../lib/analysis/categoryBreakdown";
import { bestColumnOfRole, primaryMeasureColumn } from "../../lib/analysis/pickColumns";
import type { PipelineResult } from "../../types/pipeline";
import { fmtN } from "../workspace/format";

export function PageProducts({ r }: { r: PipelineResult }) {
  const measureCol = primaryMeasureColumn(r.semantics.columns, r.engineeredRows); const productCol = bestColumnOfRole(r.semantics.columns, 'product');
  if (!measureCol || !productCol) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No product breakdown.</div>;
  const rows = computeCategoryBreakdown(r.engineeredRows, productCol, measureCol).slice(0,12);
  return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm"><table className="w-full text-sm"><thead><tr className="text-left border-b border-slate-100">{['#','Product','Value','Orders','Share'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.label} className="border-t border-slate-100"><td className="py-2.5"><span className="w-6 h-6 rounded-full bg-slate-100 inline-flex items-center justify-center text-[10px] font-bold">{i+1}</span></td><td className="py-2.5 font-semibold">{row.label}</td><td className="py-2.5 font-bold">£{row.value.toLocaleString()}</td><td className="py-2.5 text-slate-500">{fmtN(row.count)}</td><td className="py-2.5"><span className="text-xs">{row.pct}%</span></td></tr>)}</tbody></table></div>;
}
