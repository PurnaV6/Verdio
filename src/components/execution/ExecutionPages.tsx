import { useMemo } from 'react';
import { CalendarDays, CheckCircle2, Circle, ClipboardCheck, Target, UserRound } from 'lucide-react';
import type { PipelineResult } from '../../types/pipeline';
import type { EnrichedRecommendation } from '../../lib/decision/verdioDecisionEngine';
import { useWorkspaceState } from '../../lib/workspace/useWorkspaceState';

type ActionStatus = 'planned' | 'in_progress' | 'complete';
interface TrackedAction { id: string; title: string; owner: string; dueDate: string; status: ActionStatus; impact: string; }
interface KpiTarget { id: string; label: string; current: number; target: number; unit: string; direction: 'up' | 'down'; }

const dueDate = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="operational-heading"><div className="eyebrow"><span className="eyebrow-dot"/> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>;
}

export function PageActionTracker({ r }: { r: PipelineResult }) {
  const recommendations = r.decision.recommendations as EnrichedRecommendation[];
  const initial = useMemo<TrackedAction[]>(() => recommendations.slice(0, 5).map((item, index) => ({
    id: `${index}-${item.title}`, title: item.title, owner: index === 0 ? 'Workspace owner' : 'Unassigned',
    dueDate: dueDate(item.urgency === 'immediate' ? 7 : item.urgency === 'this_month' ? 30 : 60),
    status: index === 0 ? 'in_progress' : 'planned', impact: item.financialImpact ? `£${item.financialImpact.estimatedValue.toLocaleString()} estimated` : `${item.impact} impact`,
  })), [recommendations]);
  const { value: actions, save, mode } = useWorkspaceState('actions', r.source.fileName, initial);
  const update = (id: string, changes: Partial<TrackedAction>) => save(actions.map(item => item.id === id ? { ...item, ...changes } : item));
  const completed = actions.filter(item => item.status === 'complete').length;

  return <div className="space-y-5"><SectionHeader eyebrow="DECISION EXECUTION" title="Action tracker" description="Convert Verdio recommendations into accountable work with clear ownership, deadlines and delivery status."/>
    <div className="execution-summary"><div><ClipboardCheck size={18}/><span><strong>{actions.length} priority actions</strong><small>Generated from the current decision analysis</small></span></div><div><b>{completed}/{actions.length}</b><span>completed</span></div></div>
    <div className="action-board">{actions.length === 0 ? <p className="empty-state">No recommended actions are available for this dataset.</p> : actions.map(action => <article className="action-row" key={action.id}>
      <button className={`action-state is-${action.status}`} onClick={() => update(action.id, { status: action.status === 'planned' ? 'in_progress' : action.status === 'in_progress' ? 'complete' : 'planned' })} aria-label={`Change status for ${action.title}`}>{action.status === 'complete' ? <CheckCircle2 size={18}/> : <Circle size={18}/>}</button>
      <div className="action-copy"><strong>{action.title}</strong><span>{action.impact}</span></div>
      <label><UserRound size={13}/><input value={action.owner} onChange={event => update(action.id, { owner: event.target.value })} aria-label={`Owner for ${action.title}`}/></label>
      <label><CalendarDays size={13}/><input type="date" value={action.dueDate} onChange={event => update(action.id, { dueDate: event.target.value })} aria-label={`Due date for ${action.title}`}/></label>
      <select value={action.status} onChange={event => update(action.id, { status: event.target.value as ActionStatus })} aria-label={`Status for ${action.title}`}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="complete">Complete</option></select>
    </article>)}</div>
    <div className="configuration-note"><ClipboardCheck size={17}/><div><strong>{mode === 'cloud' ? 'Saved to your secure workspace' : mode === 'syncing' ? 'Synchronising workspace' : 'Saved on this device'}</strong><p>Authenticated workspaces synchronise through Supabase when the workspace-state migration is installed; local storage remains available as a resilient fallback.</p></div></div>
  </div>;
}

export function PageKpiTargets({ r }: { r: PipelineResult }) {
  const defaults = useMemo<KpiTarget[]>(() => {
    const growth = Number(r.decision.health.pillars.find(item => /growth/i.test(item.name))?.score || 0);
    const forecastConfidence = Math.round((r.ml.forecast.confidence || 0) * 100);
    return [
      { id: 'health', label: 'Business health', current: r.decision.health.total, target: Math.min(100, Math.max(75, r.decision.health.total + 10)), unit: '/100', direction: 'up' },
      { id: 'quality', label: 'Data quality', current: r.quality.overallScore, target: Math.min(100, Math.max(90, r.quality.overallScore + 5)), unit: '/100', direction: 'up' },
      { id: 'growth', label: 'Growth pillar', current: growth, target: Math.min(25, Math.max(18, growth + 4)), unit: '/25', direction: 'up' },
      { id: 'confidence', label: 'Forecast confidence', current: forecastConfidence, target: Math.min(100, Math.max(80, forecastConfidence + 8)), unit: '%', direction: 'up' },
    ];
  }, [r]);
  const { value: targets, save, mode } = useWorkspaceState('targets', r.source.fileName, defaults);
  const updateTarget = (id: string, target: number) => save(targets.map(item => item.id === id ? { ...item, target } : item));
  const onTrack = targets.filter(item => item.direction === 'up' ? item.current >= item.target : item.current <= item.target).length;
  return <div className="space-y-5"><SectionHeader eyebrow="PERFORMANCE MANAGEMENT" title="KPI targets" description="Set an operating ambition against the current baseline and focus leadership attention on measurable gaps."/>
    <div className="execution-summary"><div><Target size={18}/><span><strong>{onTrack} of {targets.length} targets achieved</strong><small>Baseline calculated from the active analysis</small></span></div><div><b>{Math.round(targets.reduce((sum,item)=>sum+Math.min(100,(item.current/(item.target || 1))*100),0)/(targets.length || 1))}%</b><span>overall progress</span></div></div>
    <div className="target-grid">{targets.map(item => { const progress = Math.min(100, Math.max(0, (item.current / (item.target || 1)) * 100)); const achieved = item.current >= item.target; return <article className="target-card" key={item.id}><div className="target-heading"><span>{item.label}</span><small className={achieved ? 'is-achieved' : ''}>{achieved ? 'Target achieved' : 'Gap to target'}</small></div><div className="target-values"><strong>{item.current}{item.unit}</strong><span>Current</span><b>{item.target}{item.unit}</b><span>Target</span></div><div className="target-progress"><i style={{ width: `${progress}%` }}/></div><label>Target value<input type="number" min="0" max="100" value={item.target} onChange={event => updateTarget(item.id, Number(event.target.value))}/></label></article>; })}</div>
    <div className="configuration-note"><Target size={17}/><div><strong>Targets are planning controls · {mode === 'cloud' ? 'Cloud saved' : mode === 'syncing' ? 'Synchronising' : 'Local fallback'}</strong><p>Current values come from Verdio's analysis; targets are leadership inputs and do not alter forecasts, health scoring or source data.</p></div></div>
  </div>;
}
