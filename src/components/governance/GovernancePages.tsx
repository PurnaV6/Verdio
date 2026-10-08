import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { PipelineResult } from '../../types/pipeline';
import type { EnrichedRecommendation } from '../../lib/decision/verdioDecisionEngine';
import type { ModelSelection } from '../../lib/ml/modelManager';
import { useWorkspaceState } from '../../lib/workspace/useWorkspaceState';
import { getSupabase } from '../../lib/auth/supabaseClient';
import { StateMark } from '../workspace/StateMark';
import { Figure, Figures, IdleMark, InlineEmpty, PageHead } from '../pages/PageParts';

type ReviewStatus = 'not_started' | 'monitoring' | 'validated';
interface OutcomeRecord { id: string; decision: string; expected: number; actual: string; status: ReviewStatus; note: string; }
type ApprovalState = 'pending' | 'approved' | 'declined';
interface ApprovalRecord { id: string; decision: string; state: ApprovalState; reviewer: string; rationale: string; reviewedAt: string; }
interface ModelMetadata extends ModelSelection { seasonalityStrength?: number; volatility?: number; }

const REVIEW_LABEL: Record<ReviewStatus, string> = { not_started: 'Not started', monitoring: 'Monitoring', validated: 'Validated' };
const reviewMark = (status: ReviewStatus) => status === 'validated' ? <StateMark tone="ok" label={REVIEW_LABEL[status]}/> : status === 'monitoring' ? <StateMark tone="watch" label={REVIEW_LABEL[status]}/> : <IdleMark label={REVIEW_LABEL[status]}/>;
const APPROVAL_LABEL: Record<ApprovalState, string> = { pending: 'Pending review', approved: 'Approved', declined: 'Declined' };
const approvalMark = (state: ApprovalState) => state === 'approved' ? <StateMark tone="ok" label={APPROVAL_LABEL[state]}/> : state === 'declined' ? <StateMark tone="risk" label={APPROVAL_LABEL[state]}/> : <IdleMark label={APPROVAL_LABEL[state]}/>;
const saveLabel = (mode: string) => mode === 'cloud' ? 'Cloud saved' : mode === 'syncing' ? 'Synchronising' : 'Local fallback';

export function PageOutcomes({ r }: { r: PipelineResult }) {
  const recommendations = r.decision.recommendations as EnrichedRecommendation[];
  const defaults = useMemo<OutcomeRecord[]>(() => recommendations.slice(0, 5).map((item, index) => ({ id: `${index}-${item.title}`, decision: item.title, expected: item.financialImpact?.estimatedValue || 0, actual: '', status: 'not_started', note: '' })), [recommendations]);
  const { value: records, save, mode } = useWorkspaceState('outcomes', r.source.fileName, defaults);
  const update = (id: string, changes: Partial<OutcomeRecord>) => save(records.map(item => item.id === id ? { ...item, ...changes } : item));
  const actualTotal = records.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
  const expectedTotal = records.reduce((sum, item) => sum + item.expected, 0);
  const validated = records.filter(item => item.status === 'validated').length;
  return <div className="v2-view"><PageHead eyebrow="Value realisation" title="Decision outcomes">Track what happened after a recommendation was approved and compare realised value with Verd.io's original estimate.</PageHead>
    <Figures label="Outcome summary"><Figure label="Planning estimate" value={`£${expectedTotal.toLocaleString()}`} sub="Verd.io's original estimate"/><Figure label="Recorded outcome" value={`£${actualTotal.toLocaleString()}`}/><Figure label="Validated decisions" value={`${validated}/${records.length}`}/></Figures>
    <div className="v2-table-wrap" role="region" aria-label="Decision outcomes" tabIndex={0}><table className="v2-table v2-op-table-wide"><caption className="sr-only">Expected and realised value, review status and evidence for each decision</caption>
      <thead><tr><th scope="col">Decision</th><th scope="col" className="num">Planning estimate</th><th scope="col">Realised</th><th scope="col">Review status</th><th scope="col">Outcome evidence</th></tr></thead>
      <tbody>{records.map(record => <tr key={record.id}>
        <th scope="row"><strong>{record.decision}</strong><span className="v2-tag v2-op-sub">Based on current analysis</span></th>
        <td className="num">£{record.expected.toLocaleString()}</td>
        <td><label className="v2-op-inline"><span className="sr-only">Realised value for {record.decision}</span><span className="v2-unit" aria-hidden="true">£</span><input className="v2-op-input is-num" type="number" min="0" placeholder="Not recorded" value={record.actual} onChange={event => update(record.id, { actual: event.target.value })}/></label></td>
        <td><div className="v2-op-stack">{reviewMark(record.status)}<label><span className="sr-only">Review status for {record.decision}</span><select className="v2-op-input" value={record.status} onChange={event => update(record.id, { status: event.target.value as ReviewStatus })}><option value="not_started">Not started</option><option value="monitoring">Monitoring</option><option value="validated">Validated</option></select></label></div></td>
        <td><label><span className="sr-only">Outcome evidence for {record.decision}</span><input className="v2-op-input" value={record.note} placeholder="Add evidence or review note" onChange={event => update(record.id, { note: event.target.value })}/></label></td>
      </tr>)}</tbody></table></div>
    <aside className="v2-note-block"><h2>Evidence-led learning loop · {saveLabel(mode)}</h2><p>Recording outcomes creates a transparent link between recommendation, action and realised value. Figures are user-confirmed and remain separate from source analytics.</p></aside>
  </div>;
}

export function PageEvidence({ r }: { r: PipelineResult }) {
  const reviewedColumns = r.semantics.columns.filter(column => !column.needsReview).length;
  const availableModels = [r.ml.forecast && 'Forecasting', r.ml.anomalies && 'Anomaly detection', r.ml.segmentation && 'Customer segmentation'].filter(Boolean) as string[];
  const generatedAt = new Date(r.profile.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const evidenceRows = [
    { check: 'Source integrity', record: r.source.fileName, detail: `${r.profile.rowCount.toLocaleString()} source rows · ${r.profile.columnCount} columns · processed ${generatedAt}` },
    { check: 'Transformation record', record: `${r.cleaning.actions.length} governed actions`, detail: `${r.cleaning.rowsBefore.toLocaleString()} rows received · ${r.cleaning.rowsAfter.toLocaleString()} retained · ${r.cleaning.cellsImputed.toLocaleString()} cells imputed` },
    { check: 'Semantic assurance', record: `${reviewedColumns}/${r.semantics.columns.length} columns confirmed`, detail: `Overall quality ${r.quality.overallScore}/100 · ${r.quality.flags.length} quality flags` },
    { check: 'Analytical coverage', record: `${r.capabilities.available.length} capabilities available`, detail: availableModels.length ? availableModels.join(' · ') : 'Statistical analysis only for this dataset' },
  ];
  return <div className="v2-view"><PageHead eyebrow="Decision governance" title="Evidence register">Inspect the data lineage, transformations and analytical capabilities supporting this decision workspace.</PageHead>
    <div className="v2-table-wrap" role="region" aria-label="Evidence summary" tabIndex={0}><table className="v2-table"><caption>Evidence summary</caption>
      <thead><tr><th scope="col">Check</th><th scope="col">Record</th><th scope="col">Detail</th></tr></thead>
      <tbody>{evidenceRows.map(row => <tr key={row.check}><th scope="row">{row.check}</th><td className="v2-op-wrap"><strong>{row.record}</strong></td><td className="v2-op-wrap">{row.detail}</td></tr>)}</tbody></table></div>
    <section className="v2-op-sect"><div className="v2-op-sect-head"><h2>Data transformation log</h2><span className="v2-tag">{r.cleaning.actions.reduce((sum, item) => sum + item.count, 0).toLocaleString()} affected values</span></div><p className="v2-muted">Every automated cleaning action applied before analysis.</p>
      {r.cleaning.actions.length ? <div className="v2-table-wrap" role="region" aria-label="Data transformation log" tabIndex={0}><table className="v2-table"><caption className="sr-only">Cleaning actions applied before analysis</caption>
        <thead><tr><th scope="col">No.</th><th scope="col">Action</th><th scope="col" className="num">Values affected</th></tr></thead>
        <tbody>{r.cleaning.actions.map((action, index) => <tr key={`${action.type}-${action.column}-${index}`}><td className="v2-op-index">{index + 1}</td><th scope="row"><strong>{action.detail}</strong><span className="v2-tag v2-op-sub">{action.column || 'Dataset level'} · {action.type.replaceAll('_', ' ')}</span></th><td className="num">{action.count.toLocaleString()}</td></tr>)}</tbody></table></div>
        : <InlineEmpty message="No cleaning changes were required."/>}</section>
    <section className="v2-op-sect"><div className="v2-op-sect-head"><h2>Semantic mapping register</h2><span className="v2-tag">{reviewedColumns} confirmed</span></div><p className="v2-muted">How source columns were classified for business analysis.</p>
      <div className="v2-table-wrap" role="region" aria-label="Semantic mapping register" tabIndex={0}><table className="v2-table"><caption className="sr-only">Business role, data type and confidence for each source column</caption>
        <thead><tr><th scope="col">Column</th><th scope="col">Business role</th><th scope="col">Data type</th><th scope="col" className="num">Confidence</th><th scope="col">Review</th></tr></thead>
        <tbody>{r.semantics.columns.map(column => <tr key={column.columnName}><th scope="row" className="v2-op-wrap">{column.columnName}</th><td>{column.businessRole}</td><td>{column.dataType}</td><td className="num">{Math.round(column.confidence * 100)}%</td><td className="read">{column.needsReview ? <StateMark tone="watch" label="Review required"/> : <StateMark tone="ok" label="Confirmed"/>}</td></tr>)}</tbody></table></div></section>
  </div>;
}

export function PageApprovals({ r }: { r: PipelineResult }) {
  const recommendations = r.decision.recommendations as EnrichedRecommendation[];
  const defaults = useMemo<ApprovalRecord[]>(() => recommendations.slice(0, 5).map((item, index) => ({ id: `${index}-${item.title}`, decision: item.title, state: 'pending', reviewer: '', rationale: '', reviewedAt: '' })), [recommendations]);
  const { value: records, save, mode } = useWorkspaceState('approvals', r.source.fileName, defaults);
  const update = (id: string, changes: Partial<ApprovalRecord>) => save(records.map(item => item.id === id ? { ...item, ...changes } : item));
  const decide = (record: ApprovalRecord, state: ApprovalState) => update(record.id, { state, reviewedAt: state === 'pending' ? '' : new Date().toISOString() });
  const approved = records.filter(item => item.state === 'approved').length;
  return <div className="v2-view"><PageHead eyebrow="Decision governance" title="Decision approvals">Record who reviewed each recommendation, the decision reached and the business rationale supporting it.</PageHead>
    <Figures label="Approval summary"><Figure label="Approved" value={approved} sub="Approval records are linked to the active dataset and preserved in this workspace."/><Figure label="Awaiting or declined" value={records.length - approved}/><Figure label="Decisions" value={records.length}/></Figures>
    <ul className="v2-ledger">{records.map(record => <li key={record.id}>
      <div className="v2-ledger-state">{approvalMark(record.state)}</div>
      <div><div className="v2-ledger-head"><h2 className="v2-ledger-title">{record.decision}</h2></div>
        <div className="v2-op-form">
          <label className="v2-op-field"><span>Decision status</span><select className="v2-op-input" value={record.state} onChange={event => decide(record, event.target.value as ApprovalState)}><option value="pending">Pending review</option><option value="approved">Approved</option><option value="declined">Declined</option></select></label>
          <label className="v2-op-field"><span>Reviewer</span><input className="v2-op-input" value={record.reviewer} placeholder="Name or role" onChange={event => update(record.id, { reviewer: event.target.value })}/></label>
          <label className="v2-op-field"><span>Decision rationale</span><input className="v2-op-input" value={record.rationale} placeholder="Why was this decision taken?" onChange={event => update(record.id, { rationale: event.target.value })}/></label>
        </div>
        <div className="v2-op-form-foot"><span className="v2-tag">{record.reviewedAt ? `Recorded ${new Date(record.reviewedAt).toLocaleString('en-GB')}` : 'No decision recorded'}</span><div className="v2-op-actions"><button type="button" className="v2-op-btn" onClick={() => decide(record, 'declined')}>Decline</button><button type="button" className="v2-op-btn is-primary" onClick={() => decide(record, 'approved')}>Approve</button></div></div>
      </div></li>)}</ul>
    <aside className="v2-note-block"><h2>Governed workspace record · {saveLabel(mode)}</h2><p>Per-user records are protected by Supabase row-level security when configured. Verified multi-user approvals will follow with organisation roles and an immutable audit trail.</p></aside>
  </div>;
}

export function PageModelAssurance({ r }: { r: PipelineResult }) {
  const meta = (r as PipelineResult & { _modelMeta?: { forecast?: ModelMetadata; anomaly?: ModelMetadata } })._modelMeta;
  const models = [{ name: 'Forecast model', result: meta?.forecast, active: Boolean(r.ml.forecast), purpose: 'Projects future movement from the detected time series.' }, { name: 'Anomaly model', result: meta?.anomaly, active: Boolean(r.ml.anomalies), purpose: 'Identifies observations materially outside the expected range.' }];
  return <div className="v2-view"><PageHead eyebrow="Model governance" title="Model assurance">Review why each analytical model was selected, its suitability for this dataset and the alternatives considered.</PageHead>
    <Figures label="Model selection summary"><Figure label="Automated model selection" value={models.filter(item => item.active).length} unit=" model families active" sub="Selections are governed by data shape, history and volatility · Explainable by design"/></Figures>
    {models.map(model => <section className="v2-op-sect" key={model.name}><div className="v2-op-sect-head"><h2>{model.name}</h2>{model.active ? <StateMark tone="ok" label="Active model"/> : <IdleMark label="Unavailable"/>}</div>
      {model.result ? <>
        <Figures label={`${model.name} measures`}><Figure label="Suitability" value={Math.round(model.result.confidence * 100)} unit="%"/>{model.result.volatility !== undefined && <Figure label="Volatility" value={Math.round(model.result.volatility * 100)} unit="%"/>}{model.result.seasonalityStrength !== undefined && <Figure label="Seasonality strength" value={Math.round(model.result.seasonalityStrength * 100)} unit="%"/>}<Figure label="Alternatives tested" value={model.result.alternativesConsidered.length}/></Figures>
        <div className="v2-op-selected"><p className="v2-tag">Selected approach</p><h3>{model.result.chosenModel.replaceAll('_', ' ')}</h3><p className="v2-muted">{model.result.reason}</p></div>
        <details className="v2-details"><summary>Review alternative models</summary>{model.result.alternativesConsidered.map(item => <div key={item.model}><p><strong>{item.model.replaceAll('_', ' ')}</strong> <span className="v2-tag">{Math.round(item.score * 100)}%</span></p><p>{item.whyRejected}</p></div>)}</details></>
        : <div className="v2-op-selected"><p className="v2-muted">{model.purpose}</p><p className="v2-tag">The uploaded data does not meet the minimum capability requirements for this model.</p></div>}
    </section>)}
    <aside className="v2-note-block"><h2>Model outputs support—not replace—judgement</h2><p>Suitability reflects fit to the current data structure. Forecasts and detected anomalies should be reviewed alongside operational context before decisions are approved.</p></aside>
  </div>;
}

interface AuditEvent { id:number; actor_email:string; event_type:string; entity_type:string; entity_id:string|null; metadata:Record<string,unknown>; occurred_at:string; }
export function PageAuditLog(){
  const [events,setEvents]=useState<AuditEvent[]>([]);const [loading,setLoading]=useState(true);const [filter,setFilter]=useState('all');
  useEffect(()=>{const sb=getSupabase();if(!sb){setLoading(false);return}void sb.auth.getUser().then(async({data})=>{if(!data.user){setLoading(false);return}const {data:membership}=await sb.from('organization_members').select('organization_id').eq('user_id',data.user.id).limit(1).maybeSingle();if(!membership){setLoading(false);return}const {data:rows}=await sb.from('organization_audit_events').select('id,actor_email,event_type,entity_type,entity_id,metadata,occurred_at').eq('organization_id',membership.organization_id).order('occurred_at',{ascending:false}).limit(250);setEvents((rows||[]) as AuditEvent[]);setLoading(false)})},[]);
  const visible=filter==='all'?events:events.filter(item=>item.entity_type===filter);const types=[...new Set(events.map(item=>item.entity_type))];
  function exportCsv(){const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;const rows=[['Time','User','Event','Entity type','Entity id','Details'],...visible.map(item=>[item.occurred_at,item.actor_email,item.event_type,item.entity_type,item.entity_id||'',JSON.stringify(item.metadata)])];const blob=new Blob([rows.map(row=>row.map(quote).join(',')).join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='verdio-audit-log.csv';link.click();URL.revokeObjectURL(url)}
  return <div className="v2-view"><PageHead eyebrow="Accountability" title="Organisation audit log">Review the append-only record of material activity across shared workspaces.</PageHead>
    <Figures label="Audit summary"><Figure label="Recorded events" value={events.length} sub="Newest activity appears first"/></Figures>
    <div className="v2-op-form-foot v2-op-toolbar"><label className="v2-op-field"><span>Filter by activity</span><select className="v2-op-input" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All activity</option>{types.map(type=><option key={type} value={type}>{type}</option>)}</select></label><button type="button" className="v2-op-btn" onClick={exportCsv} disabled={!visible.length}><Download size={14} aria-hidden="true"/> Export CSV</button></div>
    {loading?<InlineEmpty message="Loading audit activity…"/>:visible.length===0?<InlineEmpty message="No organisation activity has been recorded yet."/>:<div className="v2-table-wrap" role="region" aria-label="Audit events" tabIndex={0}><table className="v2-table v2-op-table-wide"><caption className="sr-only">Organisation audit events, newest first</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Event</th><th scope="col">User</th><th scope="col">Entity</th></tr></thead>
      <tbody>{visible.map(item=><tr key={item.id}><td className="read"><time className="v2-tag" dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString('en-GB')}</time></td><th scope="row">{item.event_type.replaceAll('.',' ')}</th><td className="v2-op-wrap">{item.actor_email}</td><td className="v2-op-wrap">{item.entity_type}{item.entity_id?` · ${item.entity_id}`:''}</td></tr>)}</tbody></table></div>}
    <aside className="v2-note-block"><h2>Append-only governance record</h2><p>Application users can read authorised events but cannot edit or delete audit history.</p></aside>
  </div>;
}
