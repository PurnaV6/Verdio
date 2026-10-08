import { UploadCloud, X } from "lucide-react";
import type { PipelineResult } from "../../types/pipeline";
import { BrandMark } from "./BrandMark";
import { PAGES } from "./navigation";

export function Sidebar({ page, setPage, result, onReset, open, onClose }: { page: string; setPage: (p: string) => void; result: PipelineResult; onReset: () => void; open: boolean; onClose: () => void }) {
  const groups = ['WORKSPACE', 'INTELLIGENCE', 'EXPLORE', 'DATA'];
  return (
    <><button aria-label="Close navigation" onClick={onClose} className={`mobile-scrim ${open ? 'is-open' : ''}`} /><aside className={`app-sidebar fixed left-0 top-0 h-screen w-[272px] flex flex-col z-50 ${open ? 'is-open' : ''}`}>
      <div className="px-5 h-[72px] flex items-center border-b border-slate-200">
        <div className="flex items-center gap-3">
          <BrandMark compact />
          <div><div className="font-semibold text-slate-950 text-[15px] tracking-tight">Verd.io</div><div className="text-[9px] text-slate-500 tracking-[0.16em] font-semibold">DECISION INTELLIGENCE</div></div>
        </div>
        <button aria-label="Close navigation" onClick={onClose} className="ml-auto text-slate-400 lg:hidden"><X size={19}/></button>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {groups.map(group => <div key={group} className="mb-4"><p className="px-3 mb-1.5 text-[9px] tracking-[0.18em] font-bold text-slate-600">{group}</p>{PAGES.filter(p=>p.group===group).map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => { setPage(id); onClose(); }} className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[12px] font-medium text-left ${page === id ? 'is-active' : ''}`}>
            <span className="nav-icon"><Icon size={15} strokeWidth={1.8}/></span>
            <span className="flex-1">{label}</span>
            {badge && <span className="nav-badge">{badge}</span>}
          </button>
        ))}</div>)}
      </nav>
      <div className="p-3 border-t border-slate-200">
        <div className="sidebar-score rounded-[14px] p-3.5">
          <div className="flex items-center justify-between"><p className="text-[9px] font-bold text-slate-500 tracking-[0.14em]">BUSINESS HEALTH</p><span className="text-xs font-semibold text-blue-700">{result.decision.health.total}/100</span></div>
          <div className="mt-2.5 h-1 rounded-full bg-blue-100 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${result.decision.health.total}%` }} /></div>
          <p className="text-[10px] text-slate-500 mt-2">Data quality {result.quality.overallScore}/100</p>
        </div>
      </div>
      <div className="px-3 pb-3"><button onClick={onReset} className="sidebar-upload w-full py-2.5 rounded-[10px] text-xs font-semibold flex items-center justify-center gap-2"><UploadCloud size={14}/> New dataset</button></div>
    </aside></>
  );
}
