import { useMemo } from 'react';
import { BrainCircuit, CheckCircle2, Database, FileCheck2, Gauge, ScrollText, ShieldCheck, Stamp } from 'lucide-react';
import type { PipelineResult } from '../../types/pipeline';
import type { EnrichedRecommendation } from '../../lib/decision/verdioDecisionEngine';
import type { ModelSelection } from '../../lib/ml/modelManager';
import { useWorkspaceState } from '../../lib/workspace/useWorkspaceState';

type ReviewStatus = 'not_started' | 'monitoring' | 'validated';
interface OutcomeRecord { id: string; decision: string; expected: number; actual: string; status: ReviewStatus; note: string; }
type ApprovalState = 'pending' | 'approved' | 'declined';
interface ApprovalRecord { id: string; decision: string; state: ApprovalState; reviewer: string; rationale: string; reviewedAt: string; }
interface ModelMetadata extends ModelSelection { seasonalityStrength?: number; volatility?: number; }

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="operational-heading"><div className="eyebrow"><span className="eyebrow-dot"/> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>;
}

export function PageOutcomes({ r }: { r: PipelineResult }) {
  const recommendations = r.decision.recommendations as EnrichedRecommendation[];
  const defaults = useMemo<OutcomeRecord[]>(() => recommendations.slice(0, 5).map((item, index) => ({ id: `${index}-${item.title}`, decision: item.title, expected: item.financialImpact?.estimatedValue || 0, actual: '', status: 'not_started', note: '' })), [recommendations]);
  const { value: records, save, mode } = useWorkspaceState('outcomes', r.source.fileName, defaults);
  const update = (id: string, changes: Partial<OutcomeRecord>) => save(records.map(item => item.id === id ? { ...item, ...changes } : item));
  const actualTotal = records.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
  const expectedTotal = records.reduce((sum, item) => sum + item.expected, 0);
  const validated = records.filter(item => item.status === 'validated').length;
  return <div className="space-y-5"><SectionHeader eyebrow="VALUE REALISATION" title="Decision outcomes" description="Track what happened after a recommendation was approved and compare realised value with Verdio's original estimate."/>
    <div className="outcome-summary"><div><Gauge size={18}/><span><small>Expected value</small><strong>£{expectedTotal.toLocaleString()}</strong></span></div><div><span><small>Recorded outcome</small><strong>£{actualTotal.toLocaleString()}</strong></span></div><div><span><small>Validated decisions</small><strong>{validated}/{records.length}</strong></span></div></div>
    <div className="outcome-table"><div className="outcome-head"><span>Decision</span><span>Expected</span><span>Realised</span><span>Review status</span><span>Outcome evidence</span></div>{records.map(record => <article key={record.id} className="outcome-row"><div><strong>{record.decision}</strong><small>Based on current analysis</small></div><b>£{record.expected.toLocaleString()}</b><label><span>£</span><input type="number" min="0" placeholder="Not recorded" value={record.actual} onChange={event => update(record.id, { actual: event.target.value })}/></label><select value={record.status} onChange={event => update(record.id, { status: event.target.value as ReviewStatus })}><option value="not_started">Not started</option><option value="monitoring">Monitoring</option><option value="validated">Validated</option></select><input className="outcome-note" value={record.note} placeholder="Add evidence or review note" onChange={event => update(record.id, { note: event.target.value })}/></article>)}</div>
    <div className="configuration-note"><CheckCircle2 size={17}/><div><strong>Evidence-led learning loop · {mode === 'cloud' ? 'Cloud saved' : mode === 'syncing' ? 'Synchronising' : 'Local fallback'}</strong><p>Recording outcomes creates a transparent link between recommendation, action and realised value. Figures are user-confirmed and remain separate from source analytics.</p></div></div>
  </div>;
}

export function PageEvidence({ r }: { r: PipelineResult }) {
  const reviewedColumns = r.semantics.columns.filter(column => !column.needsReview).length;
  const availableModels = [r.ml.forecast && 'Forecasting', r.ml.anomalies && 'Anomaly detection', r.ml.segmentation && 'Customer segmentation'].filter(Boolean) as string[];
  const generatedAt = new Date(r.profile.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return <div className="space-y-5"><SectionHeader eyebrow="DECISION GOVERNANCE" title="Evidence register" description="Inspect the data lineage, transformations and analytical capabilities supporting this decision workspace."/>
    <div className="evidence-register-grid"><article><FileCheck2 size={18}/><span>Source integrity</span><strong>{r.source.fileName}</strong><p>{r.profile.rowCount.toLocaleString()} source rows · {r.profile.columnCount} columns · processed {generatedAt}</p></article><article><Database size={18}/><span>Transformation record</span><strong>{r.cleaning.actions.length} governed actions</strong><p>{r.cleaning.rowsBefore.toLocaleString()} rows received · {r.cleaning.rowsAfter.toLocaleString()} retained · {r.cleaning.cellsImputed.toLocaleString()} cells imputed</p></article><article><ShieldCheck size={18}/><span>Semantic assurance</span><strong>{reviewedColumns}/{r.semantics.columns.length} columns confirmed</strong><p>Overall quality {r.quality.overallScore}/100 · {r.quality.flags.length} quality flags</p></article><article><ScrollText size={18}/><span>Analytical coverage</span><strong>{r.capabilities.available.length} capabilities available</strong><p>{availableModels.length ? availableModels.join(' · ') : 'Statistical analysis only for this dataset'}</p></article></div>
    <section className="evidence-panel"><header><div><strong>Data transformation log</strong><p>Every automated cleaning action applied before analysis.</p></div><span>{r.cleaning.actions.reduce((sum, item) => sum + item.count, 0).toLocaleString()} affected values</span></header>{r.cleaning.actions.length ? r.cleaning.actions.map((action, index) => <div className="evidence-log-row" key={`${action.type}-${action.column}-${index}`}><i>{index + 1}</i><div><strong>{action.detail}</strong><small>{action.column || 'Dataset level'} · {action.type.replaceAll('_', ' ')}</small></div><b>{action.count.toLocaleString()}</b></div>) : <p className="empty-state">No cleaning changes were required.</p>}</section>
    <section className="evidence-panel"><header><div><strong>Semantic mapping register</strong><p>How source columns were classified for business analysis.</p></div><span>{reviewedColumns} confirmed</span></header><div className="semantic-register">{r.semantics.columns.map(column => <div key={column.columnName}><strong>{column.columnName}</strong><span>{column.businessRole}</span><span>{column.dataType}</span><b>{Math.round(column.confidence * 100)}%</b><small className={column.needsReview ? 'needs-review' : ''}>{column.needsReview ? 'Review required' : 'Confirmed'}</small></div>)}</div></section>
  </div>;
}

export function PageApprovals({ r }: { r: PipelineResult }) {
  const recommendations = r.decision.recommendations as EnrichedRecommendation[];
  const defaults = useMemo<ApprovalRecord[]>(() => recommendations.slice(0, 5).map((item, index) => ({ id: `${index}-${item.title}`, decision: item.title, state: 'pending', reviewer: '', rationale: '', reviewedAt: '' })), [recommendations]);
  const { value: records, save, mode } = useWorkspaceState('approvals', r.source.fileName, defaults);
  const update = (id: string, changes: Partial<ApprovalRecord>) => save(records.map(item => item.id === id ? { ...item, ...changes } : item));
  const decide = (record: ApprovalRecord, state: ApprovalState) => update(record.id, { state, reviewedAt: state === 'pending' ? '' : new Date().toISOString() });
  const approved = records.filter(item => item.state === 'approved').length;
  return <div className="space-y-5"><SectionHeader eyebrow="DECISION GOVERNANCE" title="Decision approvals" description="Record who reviewed each recommendation, the decision reached and the business rationale supporting it."/>
    <div className="approval-summary"><Stamp size={18}/><div><strong>{approved} approved · {records.length - approved} awaiting or declined</strong><p>Approval records are linked to the active dataset and preserved in this workspace.</p></div><span>{records.length} decisions</span></div>
    <div className="approval-list">{records.map(record => <article key={record.id} className={`approval-card is-${record.state}`}><div className="approval-card-head"><div><small>{record.state.replace('_', ' ')}</small><strong>{record.decision}</strong></div><select value={record.state} onChange={event => decide(record, event.target.value as ApprovalState)}><option value="pending">Pending review</option><option value="approved">Approved</option><option value="declined">Declined</option></select></div><div className="approval-fields"><label>Reviewer<input value={record.reviewer} placeholder="Name or role" onChange={event => update(record.id, { reviewer: event.target.value })}/></label><label>Decision rationale<input value={record.rationale} placeholder="Why was this decision taken?" onChange={event => update(record.id, { rationale: event.target.value })}/></label></div><footer><span>{record.reviewedAt ? `Recorded ${new Date(record.reviewedAt).toLocaleString('en-GB')}` : 'No decision recorded'}</span><div><button onClick={() => decide(record, 'declined')}>Decline</button><button className="approve" onClick={() => decide(record, 'approved')}>Approve</button></div></footer></article>)}</div>
    <div className="configuration-note"><ShieldCheck size={17}/><div><strong>Governed workspace record · {mode === 'cloud' ? 'Cloud saved' : mode === 'syncing' ? 'Synchronising' : 'Local fallback'}</strong><p>Per-user records are protected by Supabase row-level security when configured. Verified multi-user approvals will follow with organisation roles and an immutable audit trail.</p></div></div>
  </div>;
}

export function PageModelAssurance({ r }: { r: PipelineResult }) {
  const meta = (r as PipelineResult & { _modelMeta?: { forecast?: ModelMetadata; anomaly?: ModelMetadata } })._modelMeta;
  const models = [{ name: 'Forecast model', result: meta?.forecast, active: Boolean(r.ml.forecast), purpose: 'Projects future movement from the detected time series.' }, { name: 'Anomaly model', result: meta?.anomaly, active: Boolean(r.ml.anomalies), purpose: 'Identifies observations materially outside the expected range.' }];
  return <div className="space-y-5"><SectionHeader eyebrow="MODEL GOVERNANCE" title="Model assurance" description="Review why each analytical model was selected, its suitability for this dataset and the alternatives considered."/>
    <div className="model-assurance-summary"><BrainCircuit size={19}/><div><strong>Automated model selection</strong><p>{models.filter(item => item.active).length} model families active · selections are governed by data shape, history and volatility</p></div><span>Explainable by design</span></div>
    <div className="model-grid">{models.map(model => <article key={model.name} className={!model.active ? 'is-inactive' : ''}><header><div><small>{model.active ? 'Active model' : 'Unavailable'}</small><strong>{model.name}</strong></div>{model.result && <b>{Math.round(model.result.confidence * 100)}% suitability</b>}</header>{model.result ? <><div className="selected-model"><span>Selected approach</span><strong>{model.result.chosenModel.replaceAll('_', ' ')}</strong><p>{model.result.reason}</p></div><div className="model-factors">{model.result.volatility !== undefined && <div><span>Volatility</span><strong>{Math.round(model.result.volatility * 100)}%</strong></div>}{model.result.seasonalityStrength !== undefined && <div><span>Seasonality strength</span><strong>{Math.round(model.result.seasonalityStrength * 100)}%</strong></div>}<div><span>Alternatives tested</span><strong>{model.result.alternativesConsidered.length}</strong></div></div><details><summary>Review alternative models</summary>{model.result.alternativesConsidered.map(item => <div key={item.model}><strong>{item.model.replaceAll('_', ' ')}</strong><span>{Math.round(item.score * 100)}%</span><p>{item.whyRejected}</p></div>)}</details></> : <div className="model-empty"><p>{model.purpose}</p><span>The uploaded data does not meet the minimum capability requirements for this model.</span></div>}</article>)}</div>
    <div className="configuration-note"><BrainCircuit size={17}/><div><strong>Model outputs support—not replace—judgement</strong><p>Suitability reflects fit to the current data structure. Forecasts and detected anomalies should be reviewed alongside operational context before decisions are approved.</p></div></div>
  </div>;
}
