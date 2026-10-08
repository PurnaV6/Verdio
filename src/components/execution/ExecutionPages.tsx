import { useMemo } from 'react';
import type { PipelineResult } from '../../types/pipeline';
import type { EnrichedRecommendation } from '../../lib/decision/verdioDecisionEngine';
import { useWorkspaceState } from '../../lib/workspace/useWorkspaceState';
import { StateMark } from '../workspace/StateMark';
import { Figure, Figures, IdleMark, InlineEmpty, PageHead } from '../pages/PageParts';
import { buildKpiTargets, mergeSavedTargets, type KpiTarget } from './kpiTargets';

type ActionStatus = 'planned' | 'in_progress' | 'complete';
interface TrackedAction { id: string; title: string; owner: string; dueDate: string; status: ActionStatus; impact: string; }

const dueDate = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };

const STATUS_LABEL: Record<ActionStatus, string> = { planned: 'Planned', in_progress: 'In progress', complete: 'Complete' };
const statusMark = (status: ActionStatus) => status === 'complete' ? <StateMark tone="ok" label={STATUS_LABEL[status]}/> : status === 'in_progress' ? <StateMark tone="watch" label={STATUS_LABEL[status]}/> : <IdleMark label={STATUS_LABEL[status]}/>;

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

  return <div className="v2-view"><PageHead eyebrow="Decision execution" title="Action tracker">Convert Verd.io recommendations into accountable work with clear ownership, deadlines and delivery status.</PageHead>
    <Figures label="Action summary"><Figure label="Priority actions" value={actions.length} sub="Generated from the current decision analysis"/><Figure label="Completed" value={`${completed}/${actions.length}`}/></Figures>
    {actions.length === 0 ? <InlineEmpty message="No recommended actions are available for this dataset."/> : <div className="v2-table-wrap" role="region" aria-label="Priority actions" tabIndex={0}><table className="v2-table v2-op-table-wide"><caption className="sr-only">Priority actions with progress, owner, due date and status</caption>
      <thead><tr><th scope="col">Action</th><th scope="col">Progress</th><th scope="col">Owner</th><th scope="col">Due date</th><th scope="col">Status</th></tr></thead>
      <tbody>{actions.map(action => <tr key={action.id}>
        <th scope="row"><strong>{action.title}</strong><span className="v2-tag v2-op-sub">{action.impact}</span></th>
        <td><button type="button" className="v2-op-state-btn" onClick={() => update(action.id, { status: action.status === 'planned' ? 'in_progress' : action.status === 'in_progress' ? 'complete' : 'planned' })}>{statusMark(action.status)}<span className="sr-only">: change status for {action.title}</span></button></td>
        <td><label><span className="sr-only">Owner for {action.title}</span><input className="v2-op-input" value={action.owner} onChange={event => update(action.id, { owner: event.target.value })}/></label></td>
        <td><label><span className="sr-only">Due date for {action.title}</span><input className="v2-op-input is-num" type="date" value={action.dueDate} onChange={event => update(action.id, { dueDate: event.target.value })}/></label></td>
        <td><label><span className="sr-only">Status for {action.title}</span><select className="v2-op-input" value={action.status} onChange={event => update(action.id, { status: event.target.value as ActionStatus })}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="complete">Complete</option></select></label></td>
      </tr>)}</tbody></table></div>}
    <aside className="v2-note-block"><h2>{mode === 'cloud' ? 'Saved to your secure workspace' : mode === 'syncing' ? 'Synchronising workspace' : 'Saved on this device'}</h2><p>Authenticated workspaces synchronise through Supabase when the workspace-state migration is installed; local storage remains available as a resilient fallback.</p></aside>
  </div>;
}

export function PageKpiTargets({ r }: { r: PipelineResult }) {
  const defaults = useMemo(() => buildKpiTargets(r), [r]);
  const { value: saved, save, mode } = useWorkspaceState<KpiTarget[]>('targets', r.source.fileName, defaults);
  const targets = useMemo(() => mergeSavedTargets(defaults, saved), [defaults, saved]);
  const updateTarget = (id: string, target: number) => save(targets.map(item => item.id === id ? { ...item, target } : item));
  const onTrack = targets.filter(item => item.direction === 'up' ? item.current >= item.target : item.current <= item.target).length;
  const overallProgress = Math.round(targets.reduce((sum,item)=>sum+Math.min(100,(item.current/(item.target || 1))*100),0)/(targets.length || 1));
  return <div className="v2-view"><PageHead eyebrow="Performance management" title="KPI targets">Set an operating ambition against the current baseline and focus leadership attention on measurable gaps.</PageHead>
    <Figures label="Target summary"><Figure label="Targets achieved" value={`${onTrack} of ${targets.length}`} sub="Baseline calculated from the active analysis"/><Figure label="Overall progress" value={overallProgress} unit="%"/></Figures>
    <div className="v2-table-wrap" role="region" aria-label="KPI targets" tabIndex={0}><table className="v2-table"><caption className="sr-only">Current value, editable target and progress for each KPI</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col" className="num">Current</th><th scope="col">Target value</th><th scope="col">Progress</th></tr></thead>
      <tbody>{targets.map(item => { const progress = Math.min(100, Math.max(0, (item.current / (item.target || 1)) * 100)); const achieved = item.current >= item.target; return <tr key={item.id}>
        <th scope="row">{item.label}{item.hint&&<span className="v2-tag v2-op-sub">{item.hint}</span>}</th>
        <td className="num">{item.current}{item.unit}</td>
        <td><label className="v2-op-inline"><span className="sr-only">Target value for {item.label}</span><input className="v2-op-input is-num is-short" type="number" min="0" max="100" value={item.target} onChange={event => updateTarget(item.id, Number(event.target.value))}/><span className="v2-unit">{item.unit}</span></label></td>
        <td className="read"><span className="v2-bar" aria-hidden="true"><i style={{ width: `${progress}%` }}/></span>{achieved ? <StateMark tone="ok" label="Target achieved"/> : <StateMark tone="watch" label="Gap to target"/>}</td>
      </tr>; })}</tbody></table></div>
    <aside className="v2-note-block"><h2>Targets are planning controls · {mode === 'cloud' ? 'Cloud saved' : mode === 'syncing' ? 'Synchronising' : 'Local fallback'}</h2><p>Current values come from Verd.io's analysis; targets are leadership inputs and do not alter forecasts, health scoring or source data.</p></aside>
  </div>;
}
