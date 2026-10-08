import { UploadCloud, X } from "lucide-react";
import type { PipelineResult } from "../../types/pipeline";
import { PAGES } from "./navigation";
import { StateMark } from "./StateMark";
import { healthReading } from "./status";

export function Sidebar({ page, setPage, result, onReset, open, onClose }: { page: string; setPage: (p: string) => void; result: PipelineResult; onReset: () => void; open: boolean; onClose: () => void }) {
  const groups = ['WORKSPACE', 'INTELLIGENCE', 'EXPLORE', 'DATA'];
  const health = result.decision.health.total;
  const reading = healthReading(health);
  return (
    <><button aria-label="Close navigation" onClick={onClose} className={`mobile-scrim ${open ? 'is-open' : ''}`} /><aside aria-label="Workspace" className={`app-sidebar v2-rail fixed left-0 top-0 h-screen w-[272px] flex flex-col z-50 ${open ? 'is-open' : ''}`}>
      <div className="v2-rail-top">
        <span className="v2-rail-mark">Verd<i>.</i>io</span>
        <button aria-label="Close navigation" onClick={onClose} className="v2-rail-close lg:hidden"><X size={19}/></button>
      </div>
      <nav aria-label="Workspace pages" className="v2-rail-nav">
        {groups.map(group => <div key={group}><p className="v2-rail-group">{group}</p>{PAGES.filter(p=>p.group===group).map(({ id, label, badge }) => (
          <button key={id} type="button" aria-current={page === id ? 'page' : undefined} onClick={() => { setPage(id); onClose(); }} className={`v2-rail-link ${page === id ? 'is-active' : ''}`}>
            <span>{label}</span>
            {badge && <span className="v2-rail-badge">{badge}</span>}
          </button>
        ))}</div>)}
      </nav>
      <div className="v2-rail-foot">
        <div className="v2-rail-health">
          <p className="v2-rail-group">Business health</p>
          <p className="v2-rail-score"><span>{health}</span> / 100 <StateMark tone={reading.tone} label={reading.label}/></p>
          <div className="v2-bar" aria-hidden="true"><i style={{ width: `${health}%` }} /></div>
          <p className="v2-tag">Data quality {result.quality.overallScore} / 100</p>
        </div>
        <button type="button" onClick={onReset} className="v2-rail-upload"><UploadCloud size={14}/> New dataset</button>
      </div>
    </aside></>
  );
}
