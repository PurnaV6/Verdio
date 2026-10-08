import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { runDataPipeline } from "../lib/dataPipeline/runDataPipeline";
import { generateAIInsights } from "../services/ai";

import { computeCategoryBreakdown } from "../lib/analysis/categoryBreakdown";
import { bestColumnOfRole, primaryMeasureColumn } from "../lib/analysis/pickColumns";
import { buildAdvisorContext } from "../lib/analysis/factSummary";
import { parseChartTagsFromAI, localAnalysisFallback } from "../lib/analysis/chatChartIntent";
import type { ChartSpec } from "../types/analysis";
import { runForecast } from "../lib/ml/forecastEngine";
import { labelForMeasure } from "../lib/labels";
import type { PipelineResult } from "../types/pipeline";
import type { EnrichedRecommendation as EnrichedRec, VDEResult } from "../lib/decision/verdioDecisionEngine";
import type { AIInsights } from "../types/aiInsights";
import {
  Sparkles, Database,
  RefreshCw, Users, Activity,
  ArrowUpRight, FileText, Menu, Settings, X, UploadCloud, PlayCircle, Building2,
  Trash2, FolderOpen, Mail, Download, ChevronRight,
  ShieldCheck, Network, Files, ClipboardCheck, Target, Gauge, ScrollText, Stamp, BrainCircuit, CircleDollarSign
} from "lucide-react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { saveToHistory } from "../lib/history/historyStore";
import { openReport, emailExecutiveSummary } from "../lib/export/reportGenerator";
import { useAuth, PasswordGateScreen } from "../lib/auth/AuthContext";
import { getSupabase } from "../lib/auth/supabaseClient";
import { useOrganizationAccess } from "../lib/auth/useOrganizationAccess";
import { createSampleBusinessFile } from "../lib/demo/sampleBusinessDataset";
import { deleteProject, listProjects, recordProjectOpened, saveProject, type SavedProject } from "../lib/projects/projectStore";
import type { BusinessRole } from "../types/semantic";
import LandingPage from "../components/marketing/LandingPage";
import { lazyWithReload, ChartRenderer } from "../components/workspace/lazy";
import { BrandMark } from "../components/workspace/BrandMark";
import { SkeletonLine, SkeletonBlock } from "../components/workspace/Skeleton";
import { fmtN } from "../components/workspace/format";
import { Sidebar } from "../components/workspace/Sidebar";
import { PageOverview } from "../components/workspace/PageOverview";
const PageAlerts = lazyWithReload(() => import("../components/operational/OperationalPages").then(m => ({ default: m.PageAlerts })));
const PageConnections = lazyWithReload(() => import("../components/operational/OperationalPages").then(m => ({ default: m.PageConnections })));
const PageRelationships = lazyWithReload(() => import("../components/operational/OperationalPages").then(m => ({ default: m.PageRelationships })));
const PageScenarioPlanner = lazyWithReload(() => import("../components/operational/OperationalPages").then(m => ({ default: m.PageScenarioPlanner })));
const PageTrustCenter = lazyWithReload(() => import("../components/operational/OperationalPages").then(m => ({ default: m.PageTrustCenter })));
import { prepareOrganizationWorkspace, type PreparedOrganizationWorkspace } from "../lib/organization/prepareOrganizationWorkspace";
const PageActionTracker = lazyWithReload(() => import("../components/execution/ExecutionPages").then(m => ({ default: m.PageActionTracker })));
const PageKpiTargets = lazyWithReload(() => import("../components/execution/ExecutionPages").then(m => ({ default: m.PageKpiTargets })));
const PageApprovals = lazyWithReload(() => import("../components/governance/GovernancePages").then(m => ({ default: m.PageApprovals })));
const PageEvidence = lazyWithReload(() => import("../components/governance/GovernancePages").then(m => ({ default: m.PageEvidence })));
const PageModelAssurance = lazyWithReload(() => import("../components/governance/GovernancePages").then(m => ({ default: m.PageModelAssurance })));
const PageOutcomes = lazyWithReload(() => import("../components/governance/GovernancePages").then(m => ({ default: m.PageOutcomes })));
const PageAuditLog = lazyWithReload(() => import("../components/governance/GovernancePages").then(m => ({ default: m.PageAuditLog })));
const PageTeamWorkspace = lazyWithReload(() => import("../components/team/TeamWorkspace").then(m => ({ default: m.PageTeamWorkspace })));

function findRiskExplanation(ai: AIInsights | null, title: string, idx: number) { if (!ai) return null; return ai.riskExplanations[idx] || ai.riskExplanations.find(r => r.title === title) || null; }
function findRecommendation(ai: AIInsights | null, title: string, idx: number) { if (!ai) return null; return ai.recommendations[idx] || ai.recommendations.find(r => r.title === title) || null; }
function findNarrative(ai: AIInsights | null, id: string, idx: number) { if (!ai) return null; return ai.analysisNarratives[idx] || ai.analysisNarratives.find(n => n.analysisId === id) || null; }

function UploadScreen({ onLoaded }: { onLoaded: (r: PipelineResult) => void }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [pending, setPending] = useState<{ file: File; result: PipelineResult } | null>(null);
  const [organization, setOrganization] = useState<PreparedOrganizationWorkspace | null>(null);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, BusinessRole>>({});
  async function handleFile(file: File, isDemo = false) {
    setError(''); setLoading(true);
    setStage(isDemo ? 'Preparing the sample business...' : 'Parsing file...'); await new Promise(r => setTimeout(r, 30));
    setStage('Profiling, cleaning and detecting columns...'); await new Promise(r => setTimeout(r, 30));
    setStage('Running statistics and ML models...');
    const outcome = await runDataPipeline(file);
    setLoading(false);
    if (!outcome.ok) { setError((outcome as any).error); return; }
    if (isDemo) { onLoaded(outcome.result); return; }
    setRoleOverrides(Object.fromEntries(outcome.result.semantics.columns.map(c => [c.columnName, c.businessRole])));
    setPending({ file, result: outcome.result });
  }
  async function handleFiles(files: File[]) {
    if (!files.length) return;
    if (files.length === 1) { await handleFile(files[0]); return; }
    setError(''); setLoading(true); setStage(`Profiling ${files.length} organisational datasets...`);
    try { setOrganization(await prepareOrganizationWorkspace(files)); }
    catch (e:any) { setError(e?.message || 'The organisational datasets could not be prepared.'); }
    setLoading(false);
  }
  async function confirmOrganization() {
    if (!organization) return;
    const primary=organization.context.datasets.find(dataset=>dataset.primary);
    if (!primary) { setError('Select one primary dataset for executive analysis.'); return; }
    setLoading(true); setStage('Building the organisational workspace...');
    const outcome=await runDataPipeline(organization.files[primary.id]);
    setLoading(false);
    if (!outcome.ok) { setError(outcome.error); return; }
    onLoaded({ ...outcome.result, organization: organization.context });
  }
  async function confirmMapping() {
    if (!pending) return;
    setLoading(true); setStage('Applying your mapping and building the analysis...');
    const outcome = await runDataPipeline(pending.file, roleOverrides);
    setLoading(false);
    if (!outcome.ok) { setError(outcome.error); return; }
    onLoaded(outcome.result);
  }
  const roleOptions: Array<{ value: BusinessRole; label: string }> = [
    { value: 'date', label: 'Date' }, { value: 'revenue', label: 'Revenue' }, { value: 'cost', label: 'Cost' },
    { value: 'price', label: 'Price' }, { value: 'quantity', label: 'Quantity' }, { value: 'customer', label: 'Customer' },
    { value: 'product', label: 'Product' }, { value: 'location', label: 'Region / location' }, { value: 'category', label: 'Category' },
    { value: 'identifier', label: 'Identifier' }, { value: 'status', label: 'Status' }, { value: 'percentage', label: 'Percentage' },
    { value: 'unknown', label: 'Ignore / other' },
  ];

  if (organization) return (
    <div className="onboarding-shell min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="onboarding-glow" />
      <div className="w-full max-w-[1040px] elevated-panel organization-review-shell rounded-[28px] p-6 md:p-9 relative">
        <div className="organization-review-heading"><BrandMark compact /><div><div className="eyebrow mb-2"><span className="eyebrow-dot"/> CONNECTED BUSINESS INTELLIGENCE</div><h1>Build your organisational workspace</h1><p>Choose the source that should drive forecasts and executive KPIs, then confirm the governed relationships Verd.io will use across supporting data.</p></div><span className="organization-count"><Files size={14}/>{organization.context.datasets.length} datasets ready</span></div>
        <div className="primary-guidance"><Target size={18}/><div><strong>Which file should be primary?</strong><p>The primary source drives the main Business Intelligence, predictions, risks and decisions. Verd.io recommends the sales file because it contains dated transactions, quantities and revenue. Stock and finance remain connected supporting sources.</p></div></div>
        <div className="organization-datasets">
          {organization.context.datasets.map(dataset=>{const recommended=dataset.purpose==='sales';return <article key={dataset.id} className={dataset.primary?'is-primary':''}><div className="dataset-card-top"><div className="dataset-purpose"><Database size={16}/><span>{dataset.purpose}</span></div>{recommended&&<b>Recommended</b>}</div><strong>{dataset.fileName}</strong><p>{dataset.rowCount.toLocaleString()} rows · {dataset.columnCount} columns</p><small>{dataset.purpose==='sales'?'Best for revenue, forecasting and executive decisions':dataset.purpose==='inventory'?'Supports stock coverage and replenishment review':'Supports margin and financial reconciliation'}</small><label><input type="radio" name="primary-dataset" checked={dataset.primary} onChange={()=>setOrganization(current=>current?{...current,context:{...current.context,datasets:current.context.datasets.map(item=>({...item,primary:item.id===dataset.id}))}}:current)}/><span>{dataset.primary?'Selected as primary':'Use as primary source'}</span></label></article>})}
        </div>
        <section className="relationship-panel"><div className="relationship-title"><div><Network size={17}/><span><strong>Proposed relationships</strong><small>Confirmed relationships form the governed organisational model.</small></span></div><b>{organization.context.relationships.filter(item=>item.confirmed).length} confirmed</b></div>{organization.context.relationships.length===0?<div className="relationship-empty">No reliable shared keys were detected. Rename shared identifiers consistently—for example, Product ID or Customer ID—and try again.</div>:<div className="relationship-list">{organization.context.relationships.map(relation=>{const left=organization.context.datasets.find(item=>item.id===relation.leftDatasetId)!;const right=organization.context.datasets.find(item=>item.id===relation.rightDatasetId)!;return <label key={relation.id}><input type="checkbox" checked={relation.confirmed} onChange={e=>setOrganization(current=>current?{...current,context:{...current.context,relationships:current.context.relationships.map(item=>item.id===relation.id?{...item,confirmed:e.target.checked}:item)}}:current)}/><span className="relationship-route"><b>{left.fileName}</b><small>{relation.leftColumn}</small></span><i><Network size={14}/><em>{Math.round(relation.confidence*100)}%</em></i><span className="relationship-route"><b>{right.fileName}</b><small>{relation.rightColumn} · {relation.overlapPct}% overlap</small></span></label>})}</div>}</section>
        {error&&<div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="organization-footer"><button onClick={()=>setOrganization(null)} className="secondary-button justify-center">Choose different files</button><div><span>{organization.context.relationships.filter(item=>item.confirmed).length} relationships will be retained</span><button disabled={loading} onClick={confirmOrganization} className="primary-action justify-center">{loading?stage:'Create organisational workspace'}<ChevronRight size={15}/></button></div></div>
      </div>
    </div>
  );

  if (pending) return (
    <div className="onboarding-shell min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="onboarding-glow" />
      <div className="w-full max-w-[760px] elevated-panel rounded-[28px] p-6 md:p-9 relative">
        <div className="flex items-start gap-4"><BrandMark compact /><div><div className="eyebrow mb-2"><span className="eyebrow-dot" /> DATA MAPPING</div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Confirm how Verd.io should read your data</h1><p className="mt-2 text-sm text-slate-500">We detected these roles automatically. Correct anything that does not match your business before analysis.</p></div></div>
        <div className="mapping-list mt-6">
          {pending.result.semantics.columns.map(column => <div key={column.columnName} className="mapping-row">
            <div className="min-w-0"><strong>{column.columnName}</strong><span>{column.dataType} · {Math.round(column.confidence * 100)}% detected confidence</span></div>
            <select aria-label={`Role for ${column.columnName}`} value={roleOverrides[column.columnName]} onChange={e=>setRoleOverrides(v=>({...v,[column.columnName]:e.target.value as BusinessRole}))}>{roleOptions.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select>
          </div>)}
        </div>
        {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-3"><button onClick={()=>setPending(null)} className="secondary-button justify-center">Choose another file</button><button disabled={loading} onClick={confirmMapping} className="primary-action justify-center">{loading ? stage : 'Confirm mapping and analyse'} <ChevronRight size={15}/></button></div>
      </div>
    </div>
  );
  return (
    <div className="onboarding-shell min-h-screen flex items-center justify-center p-5 md:p-8">
      <div className="onboarding-glow" />
      <div className="w-full max-w-[620px] elevated-panel rounded-[28px] p-7 md:p-11 text-center relative">
        <div className="mx-auto mb-6 flex justify-center"><BrandMark /></div>
        <div className="eyebrow justify-center mb-3"><span className="eyebrow-dot" /> NEW ANALYSIS</div>
        <h1 className="text-[30px] md:text-[36px] font-semibold tracking-[-0.04em] text-slate-950">Turn your data into decisions.</h1>
        <p className="text-slate-500 text-[14px] leading-6 mt-3 mb-8 max-w-[470px] mx-auto">Upload one or more structured business datasets. Verd.io will understand how they relate and surface the decisions that matter.</p>
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }} onClick={() => document.getElementById('fi')?.click()}
          className={`upload-zone cursor-pointer rounded-[20px] border p-8 md:p-10 transition-all ${dragging ? 'is-dragging' : ''}`}>
          <input id="fi" type="file" multiple accept=".csv,.xlsx,.xls,.tsv,.json" className="hidden" onChange={e => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          {loading ? <div className="flex flex-col items-center gap-3"><div className="h-9 w-9 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /><p className="text-sm text-slate-700 font-medium">{stage}</p><p className="text-xs text-slate-400">This usually takes less than a minute.</p></div> :
            <><div className="upload-icon mx-auto mb-4"><UploadCloud size={22}/></div><p className="font-semibold text-slate-950 text-sm">Drop one or multiple business datasets here</p><p className="mt-1.5 text-[12px] text-slate-500">Sales, stock, customers, products or finance · CSV, XLSX, XLS, TSV, JSON</p><p className="mt-4 text-[10px] text-slate-400 font-semibold tracking-[0.12em]">YOUR DATA REMAINS PRIVATE</p></>}
        </div>
        {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="demo-divider"><span>or explore before uploading</span></div>
        <button type="button" disabled={loading} onClick={() => handleFile(createSampleBusinessFile(), true)} className="demo-entry group">
          <span className="demo-entry-icon"><Building2 size={18} /></span>
          <span className="demo-entry-copy"><strong>Explore a sample business</strong><small>See forecasts, risks and recommended decisions using 24 months of realistic operating data.</small></span>
          <PlayCircle className="demo-entry-arrow" size={21} />
        </button>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-slate-400"><span>Automatic cleaning</span><span className="hidden sm:inline">•</span><span>Adaptive analysis</span><span className="hidden sm:inline">•</span><span>Explainable decisions</span></div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' }) {
  const toneCls = tone === 'red' ? 'bg-red-50 text-red-700 border-red-200' : tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <div className="rounded-[14px] bg-white border border-slate-200 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{label}</p>
      <p className="mt-2 text-[22px] font-bold text-slate-900 leading-none tracking-tight">{value}</p>
      {sub && <span className={`mt-2 inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${tone ? toneCls : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{sub}</span>}
    </div>
  );
}

function PageAnalyses({ r }: { r: PipelineResult }) {
  const filtered = r.analyses.filter(a => !['comparison', 'concentration_analysis', 'segmentation'].includes(a.capability));
  const revenueColumn=bestColumnOfRole(r.semantics.columns,'revenue');
  const connectedRevenue=r.organization?.metrics?.find(metric=>metric.id==='connected-revenue')?.value;
  const revenue=connectedRevenue??(revenueColumn?r.engineeredRows.reduce((sum,row)=>sum+(Number(row[revenueColumn])||0),0):0);
  const inventoryCoverage=r.organization?.metrics?.find(metric=>metric.id==='inventory-demand-coverage');
  const stockReview=r.organization?.metrics?.find(metric=>metric.id==='products-requiring-review');
  return <div className="space-y-5"><section className="bi-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> BUSINESS INTELLIGENCE</div><h1>Commercial performance</h1><p>Decision-ready KPIs and analytical evidence from the active organisational workspace.</p></div>{r.organization&&<span><Network size={14}/>{r.organization.datasets.length} connected sources</span>}</section><section className="bi-kpi-grid"><article className="bi-revenue-kpi"><div><CircleDollarSign size={20}/><span>Recognised revenue</span></div><strong>{revenue?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(revenue):'Not available'}</strong><p>{connectedRevenue!==undefined?'Connected sales source · reconciled organisational context':revenueColumn?`Calculated from ${revenueColumn}`:'A revenue measure was not detected'}</p></article><article><span>{inventoryCoverage?'Inventory coverage':'Transactions analysed'}</span><strong>{inventoryCoverage?`${inventoryCoverage.value.toFixed(1)}%`:r.source.rowCount.toLocaleString('en-GB')}</strong><p>{inventoryCoverage?'Against demand represented in the sales period':`${r.profile.columnCount} classified columns`}</p></article><article><span>{stockReview?'Products requiring review':'Data quality'}</span><strong>{stockReview?Math.round(stockReview.value):`${r.quality.overallScore}/100`}</strong><p>{stockReview?'Validate lead times and safety stock':'Decision-grade source integrity'}</p></article><article><span>Analytical coverage</span><strong>{r.capabilities.available.length}/{r.capabilities.capabilities.length}</strong><p>Capability-gated analyses available</p></article></section>{filtered.length?<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{filtered.map((a, i) => { const narrative = findNarrative(r.aiInsights, a.id, i); return <div key={a.id} className="bg-white rounded-[16px] border border-slate-200 p-4 shadow-sm"><ChartRenderer chart={a.chart} /><div className="mt-2">{r.aiLoading ? <SkeletonLine width="60%" /> : narrative ? <p className="text-xs text-slate-500 leading-5"><span className="font-semibold text-indigo-700">AI: </span>{narrative.narrative}</p> : <p className="text-xs text-slate-400">{a.explanation}</p>}</div></div>; })}</div>:<div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No analyses could be generated.</div>}</div>;
}

function PageForecast({ r }: { r: PipelineResult }) {
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'conservative'>('base');
  if (!r.ml.forecast) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">Forecasting isn't available.</div>;
  const ts = r.statistics.timeSeries.find(t => t.measureColumn === r.ml.forecast!.measureColumn);
  const forecast = runForecast(ts ?? { measureColumn: r.ml.forecast.measureColumn, dateColumn: '', points: [] }, scenario as any);
  const measureLabel = labelForMeasure(forecast.measureColumn);
  const chartData = [...(ts?.points.map(p => ({ period: p.label, historical: p.value, forecast: null })) || []), ...forecast.points.map(p => ({ period: p.periodLabel, historical: null, forecast: p.value }))];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[16px] border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4"><div><p className="text-[11px] font-bold tracking-widest text-slate-600">{measureLabel.toUpperCase()} FORECAST</p><p className="text-[11px] text-slate-400">Linear + Holt smoothing</p></div><div className="flex gap-1.5">{(['base', 'optimistic', 'conservative'] as const).map(s => <button key={s} onClick={() => setScenario(s)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${scenario === s ? 'bg-indigo-900 text-white border-indigo-900' : 'text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{s}</button>)}</div></div>
        <ChartRenderer chart={{ chartType: 'line', title: '', xKey: 'period', seriesKeys: ['historical', 'forecast'], data: chartData, formatValue: 'currency' } as any} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="6-Period Projection" value={`£${forecast.points.reduce((s, p) => s + p.value, 0).toLocaleString('en-GB')}`} sub={`${scenario}`} />
        <MetricCard label="Monthly Trend" value={`${forecast.monthlyTrendPct >= 0 ? '+' : ''}${forecast.monthlyTrendPct}%`} tone={forecast.monthlyTrendPct >= 0 ? 'green' : 'red'} />
        <MetricCard label="Holt Next Period" value={`£${Math.round(forecast.holtNextPeriod).toLocaleString('en-GB')}`} />
      </div>
    </div>
  );
}

function PageCustomers({ r }: { r: PipelineResult }) {
  if (!r.ml.segmentation || !r.ml.segmentation.segments.length) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">Segmentation not available.</div>;
  const seg = r.ml.segmentation;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3"><MetricCard label="Total Customers" value={fmtN(seg.segments.length)} /><MetricCard label="Churn Risk" value={`${seg.churnRiskScore}/100`} tone={seg.churnRiskScore >= 60 ? 'red' : 'amber'} /><MetricCard label="Revenue at Risk" value={`£${Math.round(seg.revenueAtRisk).toLocaleString()}`} tone="red" /><MetricCard label="At Risk" value={fmtN(seg.segments.filter(s=>s.segment==='atRisk' || s.segment==='lost').length)} /></div>
      <div className="bg-white rounded-[16px] border p-5 shadow-sm overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{['Customer','Segment','Total','Orders','RFM'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase">{h}</th>)}</tr></thead><tbody>{seg.segments.slice(0,12).map(s=><tr key={s.id} className="border-t border-slate-100"><td className="py-2.5 font-semibold">{s.id}</td><td><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">{s.segment}</span></td><td className="font-bold">£{s.monetary.toLocaleString()}</td><td className="text-slate-500">{s.frequency}</td><td><div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-900" style={{width:`${(s.rfmScore/9)*100}%`}} /></div></td></tr>)}</tbody></table></div>
    </div>
  );
}

function PageSeasonality({ r }: { r: PipelineResult }) {
  const s = r.statistics.seasonality; if (!s) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">Seasonality not available.</div>;
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="bg-white rounded-[16px] border p-4"><ChartRenderer chart={{ chartType: 'bar', title: 'By Day of Week', xKey: 'label', yKey: 'value', data: s.byDayOfWeek, formatValue: 'currency' } as any} /></div><div className="bg-white rounded-[16px] border p-4"><ChartRenderer chart={{ chartType: 'bar', title: 'By Month', xKey: 'label', yKey: 'value', data: s.byMonthOfYear, formatValue: 'currency' } as any} /></div></div>;
}

function PageHealth({ r }: { r: PipelineResult }) {
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

function PageProducts({ r }: { r: PipelineResult }) {
  const measureCol = primaryMeasureColumn(r.semantics.columns, r.engineeredRows); const productCol = bestColumnOfRole(r.semantics.columns, 'product');
  if (!measureCol || !productCol) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No product breakdown.</div>;
  const rows = computeCategoryBreakdown(r.engineeredRows, productCol, measureCol).slice(0,12);
  return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm"><table className="w-full text-sm"><thead><tr className="text-left border-b border-slate-100">{['#','Product','Value','Orders','Share'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.label} className="border-t border-slate-100"><td className="py-2.5"><span className="w-6 h-6 rounded-full bg-slate-100 inline-flex items-center justify-center text-[10px] font-bold">{i+1}</span></td><td className="py-2.5 font-semibold">{row.label}</td><td className="py-2.5 font-bold">£{row.value.toLocaleString()}</td><td className="py-2.5 text-slate-500">{fmtN(row.count)}</td><td className="py-2.5"><span className="text-xs">{row.pct}%</span></td></tr>)}</tbody></table></div>;
}

function PageRisks({ r }: { r: PipelineResult }) {
  if (!r.decision.risks.length) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No risks.</div>;
  return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm space-y-3">{r.decision.risks.map((risk,i)=>{ const exp=findRiskExplanation(r.aiInsights, risk.title, i); return <div key={i} className="p-4 rounded-xl border border-slate-200 border-l-4" style={{borderLeftColor: risk.level==='high'?'#DC2626': risk.level==='medium'?'#D97706':'#312E81'}}><span className="text-[10px] font-bold uppercase text-slate-500">{risk.level} risk</span><p className="font-bold text-sm mt-1 text-slate-900">{risk.title}</p>{r.aiLoading?<SkeletonBlock lines={2}/>:exp?<p className="text-xs text-slate-600 mt-1 leading-5">{exp.impact} • {exp.action}</p>:<p className="text-xs text-slate-500 mt-1">{risk.desc}</p>}</div>; })}</div>;
}

function PageRecs({ r }: { r: PipelineResult }) {
  const recs = r.decision.recommendations as EnrichedRec[]; if (!recs.length) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No recommendations.</div>;
  const vdeMeta = (r as any)._vdeMeta as VDEResult | undefined;
  return (
    <div className="space-y-4">
      {vdeMeta && <div className="bg-indigo-900 rounded-[16px] p-5 text-white"><p className="text-[11px] tracking-widest opacity-70">VERD.IO DECISION ENGINE v2 • FINANCIALLY RANKED</p><p className="text-sm mt-2 leading-6 opacity-90">{vdeMeta.summary}</p><div className="grid grid-cols-3 gap-3 mt-4"><div className="bg-white/10 rounded-xl p-3"><p className="text-[10px] opacity-60">VALUE AT RISK</p><p className="font-bold">£{vdeMeta.totalValueAtRisk?.toLocaleString()}</p></div><div className="bg-white/10 rounded-xl p-3"><p className="text-[10px] opacity-60">OPPORTUNITY</p><p className="font-bold text-amber-300">£{vdeMeta.totalOpportunityValue?.toLocaleString()}</p></div><div className="bg-white/10 rounded-xl p-3"><p className="text-[10px] opacity-60">ACTIONS</p><p className="font-bold">{recs.length}</p></div></div></div>}
      <div className="space-y-3">{recs.map((rec,i)=>{ const ai=findRecommendation(r.aiInsights, rec.title, i); return <article key={i} className="decision-evidence-card"><div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-indigo-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[13px] text-slate-900">{rec.title}</p><span className="evidence-confidence">{Math.round(rec.confidence*100)}% confidence</span></div>{r.aiLoading?<SkeletonLine width="70%"/>:ai?<p className="text-xs text-slate-600 mt-1 leading-5">{ai.action}</p>:<p className="text-xs text-slate-500 mt-1 leading-5">{rec.desc}</p>}</div></div>{rec.financialImpact && <div className="evidence-grid"><div><span>Estimated impact</span><strong>£{rec.financialImpact.estimatedValue.toLocaleString()}</strong><small>Range £{rec.financialImpact.rangeLow.toLocaleString()}–£{rec.financialImpact.rangeHigh.toLocaleString()}</small></div><div><span>Calculation basis</span><p>{rec.financialImpact.basis}</p></div><div><span>Supporting data</span><p>{rec.sourceColumns.length ? rec.sourceColumns.join(', ') : 'Business-wide operating baseline'}</p></div></div>}<details className="evidence-details"><summary>View assumptions and decision evidence</summary><div><p><b>Priority:</b> {rec.priorityScore}/100 · <b>Urgency:</b> {rec.urgency.replace('_',' ')} · <b>Estimated effort:</b> {rec.effortDays} days</p><p>Confidence combines data completeness, validity and the quality of the source columns. Financial impact is an indicative planning range, not a guaranteed outcome.</p></div></details></article>; })}</div>
    </div>
  );
}

function PageDataProfile({ r }: { r: PipelineResult }) { return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-slate-100">{['Column','Type','Role','Conf'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase">{h}</th>)}</tr></thead><tbody>{r.semantics.columns.map(c=><tr key={c.columnName} className="border-t border-slate-100"><td className="py-2 font-medium">{c.columnName}</td><td className="text-slate-500">{c.dataType}</td><td><span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">{c.businessRole}</span></td><td className="text-slate-600">{Math.round(c.confidence*100)}%</td></tr>)}</tbody></table></div>; }
function PageQuality({ r }: { r: PipelineResult }) { return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[{l:'Overall',v:r.quality.overallScore},{l:'Completeness',v:r.quality.completenessScore},{l:'Validity',v:r.quality.validityScore},{l:'Consistency',v:r.quality.consistencyScore}].map(s=><div key={s.l} className="bg-white rounded-[16px] border border-slate-200 p-4 shadow-sm"><p className="text-[10px] font-bold text-slate-400 tracking-widest">{s.l.toUpperCase()}</p><p className="text-2xl font-black mt-1 text-slate-900">{s.v}</p></div>)}</div>; }

function PageLoadingFallback() { return <div role="status" aria-live="polite" className="flex items-center justify-center py-16"><div className="h-8 w-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /><span className="sr-only">Loading…</span></div>; }

function WorkspaceHub({ tabs, initial }: { tabs: { id: string; label: string; icon: typeof ClipboardCheck; content: React.ReactNode }[]; initial: string }) {
  const [active, setActive] = useState(initial);
  return <div className="space-y-5"><nav className="workspace-tabs" aria-label="Workspace sections">{tabs.map(({id,label,icon:Icon})=><button key={id} className={active===id?'is-active':''} onClick={()=>setActive(id)}><Icon size={14}/>{label}</button>)}</nav><ErrorBoundary><Suspense fallback={<PageLoadingFallback />}>{tabs.find(tab=>tab.id===active)?.content}</Suspense></ErrorBoundary></div>;
}

function PageExecutionHub({ r }: { r: PipelineResult }) {
  return <WorkspaceHub initial="actions" tabs={[{id:'actions',label:'Actions',icon:ClipboardCheck,content:<PageActionTracker r={r}/>},{id:'targets',label:'KPI Targets',icon:Target,content:<PageKpiTargets r={r}/>},{id:'outcomes',label:'Outcomes',icon:Gauge,content:<PageOutcomes r={r}/>},{id:'approvals',label:'Approvals',icon:Stamp,content:<PageApprovals r={r}/>}]} />;
}

function PageGovernanceHub({ r }: { r: PipelineResult }) {
  return <WorkspaceHub initial="evidence" tabs={[{id:'evidence',label:'Evidence',icon:ScrollText,content:<PageEvidence r={r}/>},{id:'models',label:'Models',icon:BrainCircuit,content:<PageModelAssurance r={r}/>},{id:'quality',label:'Data Quality',icon:Database,content:<PageQuality r={r}/>},{id:'team',label:'Team & Roles',icon:Users,content:<PageTeamWorkspace/>},{id:'audit',label:'Audit Log',icon:Activity,content:<PageAuditLog/>},{id:'trust',label:'Trust',icon:ShieldCheck,content:<PageTrustCenter r={r}/>}]} />;
}

function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[]; sources?: string[] }[]>([{ role: 'ai', text: `Full analysis loaded — ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100. Choose a decision task below or ask a specific question.`, sources: [r.source.fileName, 'Verd.io decision engine'] }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const PROXY = '/api/chat'; const context = buildAdvisorContext(r);
  const quickActions = ['Explain the highest risk', 'Create a 30-day action plan', 'Compare recent performance', 'Summarise for the board'];
  async function send(prompt?: string) {
    const userMsg = (prompt || input).trim(); if (!userMsg) return; setInput(''); setMessages(m => [...m, { role: 'user', text: userMsg }]); setLoading(true);
    try {
      const groundedPrompt = `${userMsg}\n\nUse only the supplied Verd.io analysis. State the supporting metric or analysis and finish with a concrete next action. Add [CHART:analysis_id] when a chart supports the answer.`;
      const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: context }, { role: 'user', content: groundedPrompt }], max_tokens: 700 }) });
      const data = await res.json(); const txt = data.choices?.[0]?.message?.content; if (!txt) throw new Error('empty');
      const { cleanText, charts } = parseChartTagsFromAI(txt, r); setMessages(m => [...m, { role: 'ai', text: cleanText, charts, sources: [r.source.fileName, ...charts.map(c=>c.title || 'Supporting analysis')] }]);
    } catch { const fb = localAnalysisFallback(userMsg, r); setMessages(m => [...m, { role: 'ai', text: fb.text, charts: fb.charts, sources: [r.source.fileName, 'Local analysis fallback'] }]); }
    setLoading(false);
  }
  return <div className="advisor-workspace"><div className="advisor-actions"><div><strong>Decision tasks</strong><span>Grounded in {r.source.fileName}</span></div>{quickActions.map(action=><button key={action} disabled={loading} onClick={()=>send(action)}>{action}<ChevronRight size={13}/></button>)}</div><div className="advisor-conversation"><div className="advisor-messages">{messages.map((msg,i)=><div key={i} className={`flex ${msg.role==='user'?'justify-end':''}`}><div className={`advisor-message ${msg.role==='user'?'is-user':'is-ai'}`}>{msg.text}{msg.charts?.map((c,j)=><div key={j} className="mt-3 bg-white border rounded-xl p-2"><ChartRenderer chart={c} /></div>)}{msg.sources&&<div className="advisor-sources"><span>Evidence</span>{msg.sources.map(source=><small key={source}>{source}</small>)}</div>}</div></div>)}{loading && <div className="advisor-thinking"><Sparkles size={13}/> Analysing the supporting evidence…</div>}</div><div className="advisor-input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about a risk, forecast, customer segment or decision…" /><button disabled={loading} onClick={()=>send()}>Send</button></div></div></div>;
}

function ProjectLibrary({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (project: SavedProject) => void }) {
  const access=useOrganizationAccess();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!open) return; setLoading(true); listProjects().then(setProjects).finally(()=>setLoading(false)); }, [open]);
  if (!open) return null;
  async function remove(id: string) { const project=projects.find(item=>item.id===id);if(project?.shared&&access.role==='viewer')return;await deleteProject(id);setProjects(items=>items.filter(item=>item.id!==id)); }
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Saved analyses"><button className="modal-scrim" onClick={onClose} aria-label="Close saved analyses"/><section className="workspace-modal"><div className="modal-heading"><div><div className="eyebrow mb-2"><span className="eyebrow-dot"/> WORKSPACE</div><h2>Saved analyses</h2><p>Return to previous decision workspaces without uploading the dataset again.</p></div><button className="header-icon flex" onClick={onClose} aria-label="Close"><X size={17}/></button></div><div className="project-list">{loading?<p className="empty-state">Loading projects…</p>:projects.length===0?<p className="empty-state">Your completed analyses will appear here automatically.</p>:projects.map(project=><article key={project.id} className="project-row"><span className="project-icon"><FolderOpen size={17}/></span><div><strong>{project.name}</strong><small>{project.result.source.rowCount.toLocaleString()} rows · Health {project.result.decision.health.total}/100 · {new Date(project.updatedAt).toLocaleDateString('en-GB')}</small></div><button onClick={()=>onOpen(project)} className="project-open">Open</button><button onClick={()=>remove(project.id)} className="project-delete" aria-label={`Delete ${project.name}`}><Trash2 size={15}/></button></article>)}</div></section></div>;
}

function ExportDialog({ result, open, onClose }: { result: PipelineResult; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Export executive report"><button className="modal-scrim" onClick={onClose} aria-label="Close export dialog"/><section className="export-modal"><div className="modal-heading"><div><div className="eyebrow mb-2"><span className="eyebrow-dot"/> EXECUTIVE REPORTING</div><h2>Share the decision brief</h2><p>Use a board-ready report or send a concise summary through your email application.</p></div><button className="header-icon flex" onClick={onClose} aria-label="Close"><X size={17}/></button></div><div className="export-options"><button onClick={()=>openReport(result)}><span><Download size={18}/></span><div><strong>PDF-ready executive report</strong><small>Open the formatted report, then print or save it as PDF.</small></div><ChevronRight size={17}/></button><button onClick={()=>emailExecutiveSummary(result)}><span><Mail size={18}/></span><div><strong>Email executive summary</strong><small>Prepare a concise risk, health and recommended-action email.</small></div><ChevronRight size={17}/></button></div></section></div>;
}

function ViewerWorkspaceLanding({ message, onOpen }: { message: string; onOpen: (project: SavedProject) => void }) {
  const [projects,setProjects]=useState<SavedProject[]>([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{listProjects().then(items=>setProjects(items.filter(item=>item.shared))).finally(()=>setLoading(false))},[]);
  return <div className="onboarding-shell min-h-screen flex items-center justify-center p-6"><div className="elevated-panel w-full max-w-2xl rounded-[24px] p-8"><div className="text-center"><ShieldCheck className="mx-auto text-blue-700"/><h1 className="text-2xl font-semibold mt-4">Shared organisation projects</h1><p className="text-sm text-slate-500 mt-3">Your viewer role provides secure read-only access.</p>{message&&<p className="mt-3 text-xs text-blue-700">{message}</p>}</div><div className="viewer-projects">{loading?<p>Loading shared projects…</p>:projects.length===0?<p>No shared analyses are available yet. Ask an analyst or administrator to publish one.</p>:projects.map(project=><article key={project.id}><div><strong>{project.name}</strong><small>{project.result.source.rowCount.toLocaleString()} rows · Health {project.result.decision.health.total}/100</small></div><button onClick={()=>onOpen(project)}>Open read-only</button></article>)}</div></div></div>;
}

export default function App() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [page, setPage] = useState('overview');
  const [navOpen, setNavOpen] = useState(false);
  const [projectLibraryOpen, setProjectLibraryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [inviteMessage,setInviteMessage]=useState('');
  const [publicMode,setPublicMode]=useState<'landing'|'signin'|'signup'|'demo'>(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('demo')==='1')return 'demo';
    if(params.get('auth')==='signup')return 'signup';
    if(params.get('auth')==='signin')return 'signin';
    if(params.has('invite') || window.location.pathname.startsWith('/app'))return 'signin';
    return 'landing';
  });
  const [demoLoading,setDemoLoading]=useState(false);
  const { user, loading: authLoading } = useAuth();
  const access=useOrganizationAccess();
  const reset = useCallback(() => {
    setResult(null); setPage('overview'); setCurrentProjectId(null);
    if(publicMode==='demo'){setPublicMode('landing');window.history.replaceState({},'','/');}
  }, [publicMode]);
  const currentProjectIdRef = useRef(currentProjectId);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);
  useEffect(() => { if (!result || !result.aiLoading) return; let cancelled=false; generateAIInsights(result).then(ai=>{ if(!cancelled) setResult(prev=>prev?{...prev, aiInsights: ai, aiLoading:false}:prev); }); return()=>{cancelled=true;}; }, [result]);
  useEffect(() => { if (!result || result.aiLoading) return; saveToHistory(result); saveProject(result, currentProjectIdRef.current || undefined).then(setCurrentProjectId).catch(e=>console.warn('Project save failed', e)); }, [result]);
  useEffect(()=>{if(!user)return;const token=new URLSearchParams(window.location.search).get('invite');if(!token)return;const sb=getSupabase();if(!sb)return;void sb.rpc('accept_organization_invitation',{invitation_token:token}).then(({error})=>{setInviteMessage(error?error.message:'Invitation accepted. Your workspace role is now active.');if(!error)window.history.replaceState({},'',window.location.pathname)})},[user]);
  if (authLoading) return <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center"><div className="h-8 w-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  const setPublicView=(mode:'landing'|'signin'|'signup')=>{
    if(publicMode==='demo'){setResult(null);setPage('overview')}
    setPublicMode(mode);
    const destination=mode==='landing'?'/':`/app?auth=${mode}`;
    window.history.replaceState({},'',destination);
  };
  const openDemo=async()=>{
    setDemoLoading(true);
    setPublicMode('demo');
    window.history.replaceState({},'','/app?demo=1');
    try {
      const outcome=await runDataPipeline(createSampleBusinessFile());
      if(outcome.ok){setResult(outcome.result);setPage('overview')}
      else {setPublicMode('landing');window.history.replaceState({},'','/')}
    } finally {
      setDemoLoading(false);
    }
  };
  const isPublicHomepage=window.location.pathname==='/' && publicMode==='landing';
  if (isPublicHomepage) return <LandingPage onDemo={()=>void openDemo()} onLogin={()=>setPublicView('signin')} onSignup={()=>setPublicView('signup')}/>;
  if (!user && publicMode==='landing') return <PasswordGateScreen onBack={()=>setPublicView('landing')}/>;
  if (!user && (publicMode==='signin'||publicMode==='signup')) return <PasswordGateScreen initialMode={publicMode} onBack={()=>setPublicView('landing')}/>;
  if (!user && publicMode==='demo' && demoLoading) return <div className="public-demo-loading"><div className="h-9 w-9 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"/><p>Preparing the Verd.io live demo…</p></div>;
  if (!result && access.role==='viewer') return <ViewerWorkspaceLanding message={inviteMessage} onOpen={project=>{void recordProjectOpened(project);setResult(project.result);setCurrentProjectId(project.id)}}/>;
  if (!result) return <UploadScreen onLoaded={r => { setCurrentProjectId(null); setResult(r); setPage('overview'); }} />;
  const titles: Record<string, string> = { overview: 'Executive Workspace', execution: 'Execution', governance: 'Governance', advisor: 'AI Advisor', forecast: 'Predictions', scenarios: 'Scenario Planning', analyses: 'Intelligence', customers: 'Customer Intelligence', seasonality: 'Seasonality', health: 'Health Detail', risks: 'Risks & Opportunities', recs: 'Decisions', products: 'Products & Markets', profile: 'Data Hub', connections: 'Connections', relationships: 'Data Relationships', alerts: 'Alerts & Reports' };
  return (
    <div className="app-shell min-h-screen">
      <Sidebar page={page} setPage={setPage} result={result} onReset={reset} open={navOpen} onClose={()=>setNavOpen(false)} />
      <div className="app-content lg:ml-[272px]">
        <header className="app-header sticky top-0 z-30 px-4 md:px-7 h-[72px] flex items-center justify-between gap-3">
          <div className="flex items-center min-w-0"><button aria-label="Open navigation" onClick={()=>setNavOpen(true)} className="header-icon mr-3 lg:hidden"><Menu size={18}/></button><div className="min-w-0"><p className="v2-header-title truncate">{titles[page]}</p><p className="v2-header-source truncate">{result.organization?`${result.organization.datasets.length} connected datasets · `:''}{result.source.fileName} · {fmtN(result.source.rowCount)} rows · updated just now</p></div></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setExportOpen(true)} className="header-action hidden md:flex"><FileText size={14}/> Export report</button>
            <button onClick={()=>setProjectLibraryOpen(true)} className="header-icon hidden sm:flex" aria-label="Analysis history"><Activity size={16}/></button>
            {publicMode==='demo'&&!user?<button onClick={()=>setPublicView('signup')} className="header-action flex">Create free account <ArrowUpRight size={13}/></button>:<div className="user-menu group relative"><button className="user-avatar" aria-label="Account menu">{(user?.email?.[0] || 'V').toUpperCase()}</button><div className="user-popover"><p className="truncate text-xs font-semibold text-slate-900">{user?.email || 'Local workspace'}</p><button onClick={reset}><RefreshCw size={13}/> New dataset</button><button onClick={()=>setPage('governance')}><Settings size={13}/> Settings</button><button onClick={async()=>{ const sb=getSupabase(); if(sb) await sb.auth.signOut(); }}>Sign out</button></div></div>}
          </div>
        </header>
        <main className={`app-main p-4 md:p-7 max-w-[1480px] mx-auto ${access.role==='viewer'?'read-only-workspace':''}`}><ErrorBoundary key={page}><Suspense fallback={<PageLoadingFallback />}>{page==='overview'&&<PageOverview r={result} />}{page==='execution'&&<PageExecutionHub r={result} />}{page==='governance'&&<PageGovernanceHub r={result} />}{page==='advisor'&&<PageAdvisor r={result} />}{page==='forecast'&&<PageForecast r={result} />}{page==='scenarios'&&<PageScenarioPlanner r={result} />}{page==='analyses'&&<PageAnalyses r={result} />}{page==='customers'&&<PageCustomers r={result} />}{page==='seasonality'&&<PageSeasonality r={result} />}{page==='health'&&<PageHealth r={result} />}{page==='risks'&&<PageRisks r={result} />}{page==='recs'&&<PageRecs r={result} />}{page==='products'&&<PageProducts r={result} />}{page==='profile'&&<PageDataProfile r={result} />}{page==='connections'&&<PageConnections r={result} />}{page==='relationships'&&<PageRelationships r={result} />}{page==='alerts'&&<PageAlerts r={result} />}</Suspense></ErrorBoundary></main>
      </div>
      <ProjectLibrary open={projectLibraryOpen} onClose={()=>setProjectLibraryOpen(false)} onOpen={project=>{ void recordProjectOpened(project);setResult(project.result);setCurrentProjectId(project.id);setPage('overview');setProjectLibraryOpen(false); }} />
      <ExportDialog result={result} open={exportOpen} onClose={()=>setExportOpen(false)} />
    </div>
  );
}
