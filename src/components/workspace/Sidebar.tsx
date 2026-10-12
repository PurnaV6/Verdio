import {
  Activity, BarChart3, Bell, Brain, CheckCircle, ClipboardCheck, Home, Layers, MessageSquare, Network, Package,
  Plug, ShieldAlert, ShieldCheck, SlidersHorizontal, TrendingUp, UploadCloud, Users, X, type LucideIcon,
} from "lucide-react";
import type { PipelineResult } from "../../types/pipeline";
import { PAGES } from "./navigation";
import { StateMark } from "./StateMark";
import { healthReading } from "./status";

// One icon per page, shown in a small chip beside the label. The set lives here so navigation.ts stays plain data.
const PAGE_ICONS: Record<string, LucideIcon> = {
  overview: Home, analyses: BarChart3, forecast: TrendingUp, risks: ShieldAlert, recs: Brain, execution: ClipboardCheck,
  advisor: MessageSquare, scenarios: SlidersHorizontal, customers: Users, seasonality: Activity, products: Package,
  health: CheckCircle, profile: Layers, connections: Plug, relationships: Network, governance: ShieldCheck, alerts: Bell,
};

export function Sidebar({ page, setPage, result, onReset, open, onClose }: { page: string; setPage: (p: string) => void; result: PipelineResult; onReset: () => void; open: boolean; onClose: () => void }) {
  const groups = ['Workspace', 'Intelligence', 'Explore', 'Data'];
  const health = result.decision.health.total;
  const reading = healthReading(health);
  return (
    <><button aria-label="Close navigation" onClick={onClose} className={`mobile-scrim ${open ? 'is-open' : ''}`} /><aside aria-label="Workspace" className={`app-sidebar v2-rail fixed left-0 top-0 h-screen w-[232px] flex flex-col z-50 ${open ? 'is-open' : ''}`}>
      <div className="v2-rail-top">
        <span className="v2-rail-logo" aria-hidden="true">V</span>
        <span className="v2-rail-brand"><span className="v2-rail-mark">Verd<i>.</i>io</span><span className="v2-rail-sub">Decision intelligence</span></span>
        <button aria-label="Close navigation" onClick={onClose} className="v2-rail-close lg:hidden"><X size={19}/></button>
      </div>
      <nav aria-label="Workspace pages" className="v2-rail-nav">
        {groups.map(group => <div key={group}><p className="v2-rail-group">{group}</p>{PAGES.filter(p=>p.group===group).map(({ id, label, badge }) => {
          const Icon = PAGE_ICONS[id];
          return (
            <button key={id} type="button" aria-current={page === id ? 'page' : undefined} onClick={() => { setPage(id); onClose(); }} className={`v2-rail-link ${page === id ? 'is-active' : ''}`}>
              {Icon && <span className="v2-rail-icon" aria-hidden="true"><Icon size={14} strokeWidth={1.9}/></span>}
              <span className="v2-rail-label">{label}</span>
              {badge && <span className="v2-rail-badge" aria-hidden="true">{badge}</span>}
            </button>
          );
        })}</div>)}
      </nav>
      <div className="v2-rail-foot">
        <div className="v2-rail-health">
          <p className="v2-rail-group">Business health</p>
          <p className="v2-rail-score"><span>{health}</span> / 100 <StateMark tone={reading.tone} label={reading.label}/></p>
          <div className="v2-bar" aria-hidden="true"><i style={{ width: `${health}%` }} /></div>
          <p className="v2-tag">Data quality {result.quality.overallScore} / 100</p>
        </div>
        <button type="button" onClick={onReset} className="v2-rail-upload"><UploadCloud size={14} aria-hidden="true"/> New dataset</button>
      </div>
    </aside></>
  );
}
