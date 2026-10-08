import type { PipelineResult } from "../../types/pipeline";

export function PageHealth({ r }: { r: PipelineResult }) {
  const h = r.decision.health;
  return (
    <div className="bg-white rounded-[16px] border border-slate-200 p-6 shadow-sm">
      <div className="flex gap-8 items-start flex-wrap">
        <div className="text-5xl font-black text-slate-900">{h.total}<span className="text-lg text-slate-400 font-normal">/100</span></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          {h.pillars.map(p => (
            <div key={p.name} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{p.name}</p>
              <p className="text-xl font-black mt-1 text-slate-900">{p.score}<span className="text-sm text-slate-400 font-normal">/{p.max}</span></p>
              <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className="h-full bg-indigo-900 rounded-full" style={{ width: `${(p.score / p.max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
