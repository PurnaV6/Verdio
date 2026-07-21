import { useMemo, useState } from 'react';
import { CheckCircle2, Database, FileCheck2, Gauge, ScrollText, ShieldCheck } from 'lucide-react';
import type { PipelineResult } from '../../types/pipeline';
import type { EnrichedRecommendation } from '../../lib/decision/verdioDecisionEngine';

type ReviewStatus = 'not_started' | 'monitoring' | 'validated';
interface OutcomeRecord { id: string; decision: string; expected: number; actual: string; status: ReviewStatus; note: string; }

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="operational-heading"><div className="eyebrow"><span className="eyebrow-dot"/> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>;
}
function loadRecords(key: string, fallback: OutcomeRecord[]) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as OutcomeRecord[] : fallback; } catch { return fallback; } }

export function PageOutcomes({ r }: { r: PipelineResult }) {
  const recommendations = r.decision.recommendations as EnrichedRecommendation[];
  const defaults = useMemo<OutcomeRecord[]>(() => recommendations.slice(0, 5).map((item, index) => ({ id: `${index}-${item.title}`, decision: item.title, expected: item.financialImpact?.estimatedValue || 0, actual: '', status: 'not_started', note: '' })), [recommendations]);
  const storageKey = `verdio_outcomes_v1_${r.source.fileName}`;
  const [records, setRecords] = useState(() => loadRecords(storageKey, defaults));
  const save = (next: OutcomeRecord[]) => { setRecords(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  const update = (id: string, changes: Partial<OutcomeRecord>) => save(records.map(item => item.id === id ? { ...item, ...changes } : item));
  const actualTotal = records.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
  const expectedTotal = records.reduce((sum, item) => sum + item.expected, 0);
  const validated = records.filter(item => item.status === 'validated').length;
  return <div className="space-y-5"><SectionHeader eyebrow="VALUE REALISATION" title="Decision outcomes" description="Track what happened after a recommendation was approved and compare realised value with Verdio's original estimate."/>
    <div className="outcome-summary"><div><Gauge size={18}/><span><small>Expected value</small><strong>£{expectedTotal.toLocaleString()}</strong></span></div><div><span><small>Recorded outcome</small><strong>£{actualTotal.toLocaleString()}</strong></span></div><div><span><small>Validated decisions</small><strong>{validated}/{records.length}</strong></span></div></div>
    <div className="outcome-table"><div className="outcome-head"><span>Decision</span><span>Expected</span><span>Realised</span><span>Review status</span><span>Outcome evidence</span></div>{records.map(record => <article key={record.id} className="outcome-row"><div><strong>{record.decision}</strong><small>Based on current analysis</small></div><b>£{record.expected.toLocaleString()}</b><label><span>£</span><input type="number" min="0" placeholder="Not recorded" value={record.actual} onChange={event => update(record.id, { actual: event.target.value })}/></label><select value={record.status} onChange={event => update(record.id, { status: event.target.value as ReviewStatus })}><option value="not_started">Not started</option><option value="monitoring">Monitoring</option><option value="validated">Validated</option></select><input className="outcome-note" value={record.note} placeholder="Add evidence or review note" onChange={event => update(record.id, { note: event.target.value })}/></article>)}</div>
    <div className="configuration-note"><CheckCircle2 size={17}/><div><strong>Evidence-led learning loop</strong><p>Recording outcomes creates a transparent link between recommendation, action and realised value. Figures are user-confirmed and remain separate from source analytics.</p></div></div>
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
