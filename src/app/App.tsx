import { useState, useCallback, useEffect } from "react";
import { runDataPipeline } from "../lib/dataPipeline/runDataPipeline";
import { generateAIInsights } from "../services/ai";
import { ChartRenderer } from "../components/ChartRenderer";
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
  Home, Sparkles, BarChart3, ShieldAlert, Brain, Database,
  RefreshCw, CheckCircle, Layers, TrendingUp, Users, Package, Activity,
  ArrowUpRight, FileText, Menu, Search, Settings, X, UploadCloud, PlayCircle, Building2,
  Trash2, FolderOpen, Mail, Download, ChevronRight,
  Plug, Bell, SlidersHorizontal, ShieldCheck, Network, Files, ClipboardCheck, Target
} from "lucide-react";
import { saveToHistory } from "../lib/history/historyStore";
import { openReport, emailExecutiveSummary } from "../lib/export/reportGenerator";
import { useAuth, PasswordGateScreen } from "../lib/auth/AuthContext";
import { getSupabase } from "../lib/auth/supabaseClient";
import { createSampleBusinessFile } from "../lib/demo/sampleBusinessDataset";
import { deleteProject, listProjects, saveProject, type SavedProject } from "../lib/projects/projectStore";
import type { BusinessRole } from "../types/semantic";
import { PageAlerts, PageConnections, PageRelationships, PageScenarioPlanner, PageTrustCenter } from "../components/operational/OperationalPages";
import { prepareOrganizationWorkspace, type PreparedOrganizationWorkspace } from "../lib/organization/prepareOrganizationWorkspace";
import { PageActionTracker, PageKpiTargets } from "../components/execution/ExecutionPages";

const fmtN = (n: number) => Math.round(n).toLocaleString('en-GB');

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'h-9 w-9' : 'h-12 w-12'}`} aria-label="Verdio">
    <svg viewBox="0 0 48 48" role="img" aria-hidden="true">
      <path className="brand-path" d="M10.5 13.5 22.8 34.5 36.5 10.5" />
      <path className="brand-decision" d="M22.8 34.5V24.2" />
      <circle className="brand-node" cx="10.5" cy="13.5" r="2.4" />
      <circle className="brand-node" cx="36.5" cy="10.5" r="2.4" />
      <circle className="brand-focus" cx="22.8" cy="34.5" r="3.1" />
    </svg>
  </div>;
}

function SkeletonLine({ width = '100%' }: { width?: string }) { return <div className="h-3 animate-pulse bg-slate-200 rounded" style={{ width }} />; }
function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  const widths = ['100%', '92%', '68%', '80%', '55%'];
  return <div className="space-y-2">{Array.from({ length: lines }).map((_, i) => <SkeletonLine key={i} width={widths[i % widths.length]} />)}</div>;
}
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
      <div className="w-full max-w-[940px] elevated-panel rounded-[28px] p-6 md:p-9 relative">
        <div className="organization-review-heading"><BrandMark compact /><div><div className="eyebrow mb-2"><span className="eyebrow-dot"/> ORGANISATIONAL DATA MODEL</div><h1>Confirm how your datasets work together</h1><p>Verdio classified each file and proposed relationships from shared keys and overlapping values. Review the structure before executive analysis.</p></div><span className="organization-count"><Files size={14}/>{organization.context.datasets.length} datasets</span></div>
        <div className="organization-datasets">
          {organization.context.datasets.map(dataset=><article key={dataset.id} className={dataset.primary?'is-primary':''}><div className="dataset-purpose"><Database size={16}/><span>{dataset.purpose}</span></div><strong>{dataset.fileName}</strong><p>{dataset.rowCount.toLocaleString()} rows · {dataset.columnCount} columns</p><label><input type="radio" name="primary-dataset" checked={dataset.primary} onChange={()=>setOrganization(current=>current?{...current,context:{...current.context,datasets:current.context.datasets.map(item=>({...item,primary:item.id===dataset.id}))}}:current)}/><span>Primary analysis source</span></label></article>)}
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
        <div className="flex items-start gap-4"><BrandMark compact /><div><div className="eyebrow mb-2"><span className="eyebrow-dot" /> DATA MAPPING</div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Confirm how Verdio should read your data</h1><p className="mt-2 text-sm text-slate-500">We detected these roles automatically. Correct anything that does not match your business before analysis.</p></div></div>
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
        <p className="text-slate-500 text-[14px] leading-6 mt-3 mb-8 max-w-[470px] mx-auto">Upload one or more structured business datasets. Verdio will understand how they relate and surface the decisions that matter.</p>
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }} onClick={() => document.getElementById('fi')?.click()}
          className={`upload-zone cursor-pointer rounded-[20px] border p-8 md:p-10 transition-all ${dragging ? 'is-dragging' : ''}`}>
          <input id="fi" type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          {loading ? <div className="flex flex-col items-center gap-3"><div className="h-9 w-9 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" /><p className="text-sm text-slate-700 font-medium">{stage}</p><p className="text-xs text-slate-400">This usually takes less than a minute.</p></div> :
            <><div className="upload-icon mx-auto mb-4"><UploadCloud size={22}/></div><p className="font-semibold text-slate-950 text-sm">Drop one or multiple business datasets here</p><p className="mt-1.5 text-[12px] text-slate-500">Sales, stock, customers, products or finance · CSV, XLSX, XLS</p><p className="mt-4 text-[10px] text-slate-400 font-semibold tracking-[0.12em]">YOUR DATA REMAINS PRIVATE</p></>}
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

const PAGES = [
  { id: 'overview', label: 'Executive Workspace', icon: Home, group: 'WORKSPACE' },
  { id: 'analyses', label: 'Intelligence', icon: BarChart3, group: 'INTELLIGENCE' },
  { id: 'forecast', label: 'Predictions', icon: TrendingUp, group: 'INTELLIGENCE' },
  { id: 'risks', label: 'Risks & Opportunities', icon: ShieldAlert, group: 'INTELLIGENCE' },
  { id: 'recs', label: 'Decisions', icon: Brain, group: 'INTELLIGENCE' },
  { id: 'actions', label: 'Action Tracker', icon: ClipboardCheck, group: 'WORKSPACE' },
  { id: 'targets', label: 'KPI Targets', icon: Target, group: 'WORKSPACE' },
  { id: 'advisor', label: 'AI Advisor', icon: Sparkles, badge: 'AI', group: 'INTELLIGENCE' },
  { id: 'scenarios', label: 'Scenario Planning', icon: SlidersHorizontal, group: 'INTELLIGENCE' },
  { id: 'customers', label: 'Customer Intelligence', icon: Users, group: 'EXPLORE' },
  { id: 'seasonality', label: 'Seasonality', icon: Activity, group: 'EXPLORE' },
  { id: 'products', label: 'Products & Markets', icon: Package, group: 'EXPLORE' },
  { id: 'health', label: 'Health Detail', icon: CheckCircle, group: 'EXPLORE' },
  { id: 'profile', label: 'Data Hub', icon: Layers, group: 'DATA' },
  { id: 'connections', label: 'Connections', icon: Plug, group: 'DATA' },
  { id: 'relationships', label: 'Data Relationships', icon: Network, group: 'DATA' },
  { id: 'quality', label: 'Data Quality', icon: Database, group: 'DATA' },
  { id: 'alerts', label: 'Alerts & Reports', icon: Bell, group: 'DATA' },
  { id: 'trust', label: 'Trust Center', icon: ShieldCheck, group: 'DATA' },
];

function Sidebar({ page, setPage, result, onReset, open, onClose }: { page: string; setPage: (p: string) => void; result: PipelineResult; onReset: () => void; open: boolean; onClose: () => void }) {
  const groups = ['WORKSPACE', 'INTELLIGENCE', 'EXPLORE', 'DATA'];
  return (
    <><button aria-label="Close navigation" onClick={onClose} className={`mobile-scrim ${open ? 'is-open' : ''}`} /><aside className={`app-sidebar fixed left-0 top-0 h-screen w-[272px] flex flex-col z-50 ${open ? 'is-open' : ''}`}>
      <div className="px-5 h-[72px] flex items-center border-b border-white/10">
        <div className="flex items-center gap-3">
          <BrandMark compact />
          <div><div className="font-semibold text-white text-[15px] tracking-tight">Verdio</div><div className="text-[9px] text-slate-500 tracking-[0.16em] font-semibold">DECISION INTELLIGENCE</div></div>
        </div>
        <button aria-label="Close navigation" onClick={onClose} className="ml-auto text-slate-400 lg:hidden"><X size={19}/></button>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {groups.map(group => <div key={group} className="mb-4"><p className="px-3 mb-1.5 text-[9px] tracking-[0.18em] font-bold text-slate-600">{group}</p>{PAGES.filter(p=>p.group===group).map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => { setPage(id); onClose(); }} className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[12px] font-medium text-left ${page === id ? 'is-active' : ''}`}>
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {badge && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-bold">{badge}</span>}
          </button>
        ))}</div>)}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="sidebar-score rounded-[14px] p-3.5">
          <div className="flex items-center justify-between"><p className="text-[9px] font-bold text-slate-500 tracking-[0.14em]">BUSINESS HEALTH</p><span className="text-xs font-semibold text-emerald-300">{result.decision.health.total}/100</span></div>
          <div className="mt-2.5 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${result.decision.health.total}%` }} /></div>
          <p className="text-[10px] text-slate-500 mt-2">Data quality {result.quality.overallScore}/100</p>
        </div>
      </div>
      <div className="px-3 pb-3"><button onClick={onReset} className="sidebar-upload w-full py-2.5 rounded-[10px] text-xs font-semibold flex items-center justify-center gap-2"><UploadCloud size={14}/> New dataset</button></div>
    </aside></>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' }) {
  const toneCls = tone === 'red' ? 'bg-red-50 text-red-700 border-red-200' : tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <div className="rounded-[14px] bg-white border border-slate-200 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{label}</p>
      <p className="mt-2 text-[22px] font-bold text-slate-900 leading-none tracking-tight">{value}</p>
      {sub && <span className={`mt-2 inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${tone ? toneCls : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{sub}</span>}
    </div>
  );
}

function ExecutiveSignals({ result }: { result: PipelineResult }) {
  const health = result.decision.health.total;
  const quality = result.quality.overallScore;
  const signals = [
    {
      label: 'Dataset scale',
      value: fmtN(result.source.rowCount),
      unit: 'rows',
      detail: `${result.profile.columnCount} columns assessed`,
      icon: Database,
      tone: 'neutral',
    },
    {
      label: 'Business health',
      value: `${health}`,
      unit: '/100',
      detail: health >= 80 ? 'Strong operating position' : health >= 60 ? 'Active risks to monitor' : 'Executive attention required',
      icon: Activity,
      tone: health >= 80 ? 'positive' : health >= 60 ? 'watch' : 'critical',
    },
    {
      label: 'Data integrity',
      value: `${quality}`,
      unit: '/100',
      detail: quality >= 90 ? 'Decision-grade quality' : quality >= 70 ? 'Reliable with minor gaps' : 'Quality review recommended',
      icon: CheckCircle,
      tone: quality >= 90 ? 'positive' : quality >= 70 ? 'watch' : 'critical',
    },
    {
      label: 'Analysis coverage',
      value: `${result.analyses.length}`,
      unit: 'charts',
      detail: `${result.capabilities.available.length} analytical capabilities`,
      icon: BarChart3,
      tone: 'insight',
    },
  ];

  return (
    <section className="signals-panel" aria-labelledby="executive-signals-title">
      <div className="signals-heading">
        <div>
          <p id="executive-signals-title">Executive signals</p>
          <span>Current decision context from the active dataset</span>
        </div>
        <span className="signals-live"><i /> Live analysis</span>
      </div>
      <div className="signals-grid">
        {signals.map(({ label, value, unit, detail, icon: Icon, tone }) => (
          <article key={label} className={`signal-card signal-${tone}`}>
            <div className="signal-icon"><Icon size={17} strokeWidth={1.8} /></div>
            <div className="signal-copy">
              <p>{label}</p>
              <div className="signal-value"><strong>{value}</strong><span>{unit}</span></div>
              <small>{detail}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageOverview({ r }: { r: PipelineResult }) {
  const h = r.decision.health.total; const topRisk = r.decision.risks[0]; const topRec = r.decision.recommendations[0];
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-1"><div><div className="eyebrow"><span className="eyebrow-dot"/> LIVE EXECUTIVE BRIEF</div><h1 className="page-title mt-2">Good afternoon. Here’s what matters.</h1><p className="text-[13px] text-slate-500 mt-1">Verdio has prioritised the strongest signals in your latest data.</p></div><button className="secondary-button">View methodology <ArrowUpRight size={13}/></button></div>
      <div className="executive-hero rounded-[22px] p-5 md:p-7 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex-1">
            <span className={`status-pill ${h >= 80 ? 'is-good' : h >= 60 ? 'is-watch' : 'is-risk'}`}><i/>{h >= 80 ? 'Healthy and stable' : h >= 60 ? 'Performing with risks' : 'Attention required'}</span>
            <h2 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.035em] text-white leading-tight mt-4 mb-3 max-w-2xl">{topRisk ? `${topRisk.title} requires your attention.` : 'Your business signals are ready to review.'}</h2>
            <p className="text-slate-400 text-[13px] leading-6 max-w-2xl">Verdio analysed {fmtN(r.source.rowCount)} rows across {r.profile.columnCount} columns. {topRec ? `The highest-priority action is ${topRec.title.toLowerCase()}.` : 'Your executive brief is ready.'}</p>
          </div>
          <div className="health-ring" style={{'--score': `${h * 3.6}deg`} as React.CSSProperties}><div><strong>{h}</strong><span>HEALTH</span></div></div>
        </div>
      </div>
      <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3"><Brain size={16} className="text-indigo-700" /><p className="text-[11px] font-bold tracking-widest text-slate-500">AI EXECUTIVE SUMMARY</p>{r.aiLoading ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Generating</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">AI Generated</span>}</div>
        {r.aiLoading ? <SkeletonBlock lines={3} /> : <p className="text-[13px] text-slate-600 leading-6">{r.aiInsights?.executiveSummary}</p>}
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Rows Analysed" value={fmtN(r.source.rowCount)} sub={`${r.profile.columnCount} columns`} />
        <MetricCard label="Data Quality" value={`${r.quality.overallScore}/100`} sub={r.quality.overallScore >= 80 ? 'Excellent' : 'Good'} tone={r.quality.overallScore >= 80 ? 'green' : r.quality.overallScore >= 60 ? 'amber' : 'red'} />
        <MetricCard label="Analyses Available" value={`${r.capabilities.available.length}/${r.capabilities.capabilities.length}`} sub="Capability-gated" />
        <MetricCard label="Health Score" value={`${h}/100`} sub={h >= 80 ? 'Strong' : 'Moderate'} tone={h >= 80 ? 'green' : h >= 60 ? 'amber' : 'red'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm border-l-4 border-l-indigo-900"><p className="text-[10px] font-bold tracking-widest text-indigo-900 mb-1">TOP PRIORITY</p><p className="font-bold text-slate-900 text-[14px] leading-snug">{topRec?.title || 'No recommendations'}</p><p className="text-xs text-slate-500 leading-5 mt-2">{topRec?.desc}</p></div>
        <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm border-l-4 border-l-amber-500"><p className="text-[10px] font-bold tracking-widest text-amber-600 mb-1">HIGHEST RISK</p><p className="font-bold text-slate-900 text-[14px] leading-snug">{topRisk?.title || 'No critical risk'}</p><p className="text-xs text-slate-500 leading-5 mt-2">{topRisk?.desc}</p></div>
      </div>
      <ExecutiveSignals result={r} />
    </div>
  );
}

function PageAnalyses({ r }: { r: PipelineResult }) {
  const filtered = r.analyses.filter(a => !['comparison', 'concentration_analysis', 'segmentation'].includes(a.capability));
  if (!filtered.length) return <div className="bg-white rounded-[16px] border p-6 text-sm text-slate-500">No analyses could be generated.</div>;
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{filtered.map((a, i) => { const narrative = findNarrative(r.aiInsights, a.id, i); return <div key={a.id} className="bg-white rounded-[16px] border border-slate-200 p-4 shadow-sm"><ChartRenderer chart={a.chart} /><div className="mt-2">{r.aiLoading ? <SkeletonLine width="60%" /> : narrative ? <p className="text-xs text-slate-500 leading-5"><span className="font-semibold text-indigo-700">AI: </span>{narrative.narrative}</p> : <p className="text-xs text-slate-400">{a.explanation}</p>}</div></div>; })}</div>;
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
      {vdeMeta && <div className="bg-indigo-900 rounded-[16px] p-5 text-white"><p className="text-[11px] tracking-widest opacity-70">VERDIO DECISION ENGINE v2 • FINANCIALLY RANKED</p><p className="text-sm mt-2 leading-6 opacity-90">{vdeMeta.summary}</p><div className="grid grid-cols-3 gap-3 mt-4"><div className="bg-white/10 rounded-xl p-3"><p className="text-[10px] opacity-60">VALUE AT RISK</p><p className="font-bold">£{vdeMeta.totalValueAtRisk?.toLocaleString()}</p></div><div className="bg-white/10 rounded-xl p-3"><p className="text-[10px] opacity-60">OPPORTUNITY</p><p className="font-bold text-amber-300">£{vdeMeta.totalOpportunityValue?.toLocaleString()}</p></div><div className="bg-white/10 rounded-xl p-3"><p className="text-[10px] opacity-60">ACTIONS</p><p className="font-bold">{recs.length}</p></div></div></div>}
      <div className="space-y-3">{recs.map((rec,i)=>{ const ai=findRecommendation(r.aiInsights, rec.title, i); return <article key={i} className="decision-evidence-card"><div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-indigo-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[13px] text-slate-900">{rec.title}</p><span className="evidence-confidence">{Math.round(rec.confidence*100)}% confidence</span></div>{r.aiLoading?<SkeletonLine width="70%"/>:ai?<p className="text-xs text-slate-600 mt-1 leading-5">{ai.action}</p>:<p className="text-xs text-slate-500 mt-1 leading-5">{rec.desc}</p>}</div></div>{rec.financialImpact && <div className="evidence-grid"><div><span>Estimated impact</span><strong>£{rec.financialImpact.estimatedValue.toLocaleString()}</strong><small>Range £{rec.financialImpact.rangeLow.toLocaleString()}–£{rec.financialImpact.rangeHigh.toLocaleString()}</small></div><div><span>Calculation basis</span><p>{rec.financialImpact.basis}</p></div><div><span>Supporting data</span><p>{rec.sourceColumns.length ? rec.sourceColumns.join(', ') : 'Business-wide operating baseline'}</p></div></div>}<details className="evidence-details"><summary>View assumptions and decision evidence</summary><div><p><b>Priority:</b> {rec.priorityScore}/100 · <b>Urgency:</b> {rec.urgency.replace('_',' ')} · <b>Estimated effort:</b> {rec.effortDays} days</p><p>Confidence combines data completeness, validity and the quality of the source columns. Financial impact is an indicative planning range, not a guaranteed outcome.</p></div></details></article>; })}</div>
    </div>
  );
}

function PageDataProfile({ r }: { r: PipelineResult }) { return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-slate-100">{['Column','Type','Role','Conf'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase">{h}</th>)}</tr></thead><tbody>{r.semantics.columns.map(c=><tr key={c.columnName} className="border-t border-slate-100"><td className="py-2 font-medium">{c.columnName}</td><td className="text-slate-500">{c.dataType}</td><td><span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">{c.businessRole}</span></td><td className="text-slate-600">{Math.round(c.confidence*100)}%</td></tr>)}</tbody></table></div>; }
function PageQuality({ r }: { r: PipelineResult }) { return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[{l:'Overall',v:r.quality.overallScore},{l:'Completeness',v:r.quality.completenessScore},{l:'Validity',v:r.quality.validityScore},{l:'Consistency',v:r.quality.consistencyScore}].map(s=><div key={s.l} className="bg-white rounded-[16px] border border-slate-200 p-4 shadow-sm"><p className="text-[10px] font-bold text-slate-400 tracking-widest">{s.l.toUpperCase()}</p><p className="text-2xl font-black mt-1 text-slate-900">{s.v}</p></div>)}</div>; }

function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[]; sources?: string[] }[]>([{ role: 'ai', text: `Full analysis loaded — ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100. Choose a decision task below or ask a specific question.`, sources: [r.source.fileName, 'Verdio decision engine'] }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const PROXY = '/api/chat'; const context = buildAdvisorContext(r);
  const quickActions = ['Explain the highest risk', 'Create a 30-day action plan', 'Compare recent performance', 'Summarise for the board'];
  async function send(prompt?: string) {
    const userMsg = (prompt || input).trim(); if (!userMsg) return; setInput(''); setMessages(m => [...m, { role: 'user', text: userMsg }]); setLoading(true);
    try {
      const groundedPrompt = `${userMsg}\n\nUse only the supplied Verdio analysis. State the supporting metric or analysis and finish with a concrete next action. Add [CHART:analysis_id] when a chart supports the answer.`;
      const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: context }, { role: 'user', content: groundedPrompt }], max_tokens: 700 }) });
      const data = await res.json(); const txt = data.choices?.[0]?.message?.content; if (!txt) throw new Error('empty');
      const { cleanText, charts } = parseChartTagsFromAI(txt, r); setMessages(m => [...m, { role: 'ai', text: cleanText, charts, sources: [r.source.fileName, ...charts.map(c=>c.title || 'Supporting analysis')] }]);
    } catch { const fb = localAnalysisFallback(userMsg, r); setMessages(m => [...m, { role: 'ai', text: fb.text, charts: fb.charts, sources: [r.source.fileName, 'Local analysis fallback'] }]); }
    setLoading(false);
  }
  return <div className="advisor-workspace"><div className="advisor-actions"><div><strong>Decision tasks</strong><span>Grounded in {r.source.fileName}</span></div>{quickActions.map(action=><button key={action} disabled={loading} onClick={()=>send(action)}>{action}<ChevronRight size={13}/></button>)}</div><div className="advisor-conversation"><div className="advisor-messages">{messages.map((msg,i)=><div key={i} className={`flex ${msg.role==='user'?'justify-end':''}`}><div className={`advisor-message ${msg.role==='user'?'is-user':'is-ai'}`}>{msg.text}{msg.charts?.map((c,j)=><div key={j} className="mt-3 bg-white border rounded-xl p-2"><ChartRenderer chart={c} /></div>)}{msg.sources&&<div className="advisor-sources"><span>Evidence</span>{msg.sources.map(source=><small key={source}>{source}</small>)}</div>}</div></div>)}{loading && <div className="advisor-thinking"><Sparkles size={13}/> Analysing the supporting evidence…</div>}</div><div className="advisor-input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about a risk, forecast, customer segment or decision…" /><button disabled={loading} onClick={()=>send()}>Send</button></div></div></div>;
}

function ProjectLibrary({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (project: SavedProject) => void }) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!open) return; setLoading(true); listProjects().then(setProjects).finally(()=>setLoading(false)); }, [open]);
  if (!open) return null;
  async function remove(id: string) { await deleteProject(id); setProjects(items=>items.filter(item=>item.id!==id)); }
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Saved analyses"><button className="modal-scrim" onClick={onClose} aria-label="Close saved analyses"/><section className="workspace-modal"><div className="modal-heading"><div><div className="eyebrow mb-2"><span className="eyebrow-dot"/> WORKSPACE</div><h2>Saved analyses</h2><p>Return to previous decision workspaces without uploading the dataset again.</p></div><button className="header-icon flex" onClick={onClose} aria-label="Close"><X size={17}/></button></div><div className="project-list">{loading?<p className="empty-state">Loading projects…</p>:projects.length===0?<p className="empty-state">Your completed analyses will appear here automatically.</p>:projects.map(project=><article key={project.id} className="project-row"><span className="project-icon"><FolderOpen size={17}/></span><div><strong>{project.name}</strong><small>{project.result.source.rowCount.toLocaleString()} rows · Health {project.result.decision.health.total}/100 · {new Date(project.updatedAt).toLocaleDateString('en-GB')}</small></div><button onClick={()=>onOpen(project)} className="project-open">Open</button><button onClick={()=>remove(project.id)} className="project-delete" aria-label={`Delete ${project.name}`}><Trash2 size={15}/></button></article>)}</div></section></div>;
}

function ExportDialog({ result, open, onClose }: { result: PipelineResult; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Export executive report"><button className="modal-scrim" onClick={onClose} aria-label="Close export dialog"/><section className="export-modal"><div className="modal-heading"><div><div className="eyebrow mb-2"><span className="eyebrow-dot"/> EXECUTIVE REPORTING</div><h2>Share the decision brief</h2><p>Use a board-ready report or send a concise summary through your email application.</p></div><button className="header-icon flex" onClick={onClose} aria-label="Close"><X size={17}/></button></div><div className="export-options"><button onClick={()=>openReport(result)}><span><Download size={18}/></span><div><strong>PDF-ready executive report</strong><small>Open the formatted report, then print or save it as PDF.</small></div><ChevronRight size={17}/></button><button onClick={()=>emailExecutiveSummary(result)}><span><Mail size={18}/></span><div><strong>Email executive summary</strong><small>Prepare a concise risk, health and recommended-action email.</small></div><ChevronRight size={17}/></button></div></section></div>;
}

export default function App() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [page, setPage] = useState('overview');
  const [navOpen, setNavOpen] = useState(false);
  const [projectLibraryOpen, setProjectLibraryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const { user, loading: authLoading, isEnabled } = useAuth();
  const reset = useCallback(() => { setResult(null); setPage('overview'); setCurrentProjectId(null); }, []);
  useEffect(() => { if (!result || !result.aiLoading) return; let cancelled=false; generateAIInsights(result).then(ai=>{ if(!cancelled) setResult(prev=>prev?{...prev, aiInsights: ai, aiLoading:false}:prev); }); return()=>{cancelled=true;}; }, [result?.aiLoading]);
  useEffect(() => { if (!result || result.aiLoading) return; saveToHistory(result); saveProject(result, currentProjectId || undefined).then(setCurrentProjectId).catch(e=>console.warn('Project save failed', e)); }, [result]);
  if (authLoading) return <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center"><div className="h-8 w-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  if (isEnabled && !user) return <PasswordGateScreen />;
  if (!result) return <UploadScreen onLoaded={r => { setCurrentProjectId(null); setResult(r); setPage('overview'); }} />;
  const titles: Record<string, string> = { overview: 'Executive Workspace', actions: 'Action Tracker', targets: 'KPI Targets', advisor: 'AI Advisor', forecast: 'Predictions', scenarios: 'Scenario Planning', analyses: 'Intelligence', customers: 'Customer Intelligence', seasonality: 'Seasonality', health: 'Health Detail', risks: 'Risks & Opportunities', recs: 'Decisions', products: 'Products & Markets', profile: 'Data Hub', connections: 'Connections', relationships: 'Data Relationships', quality: 'Data Quality', alerts: 'Alerts & Reports', trust: 'Trust Center' };
  return (
    <div className="app-shell min-h-screen">
      <Sidebar page={page} setPage={setPage} result={result} onReset={reset} open={navOpen} onClose={()=>setNavOpen(false)} />
      <div className="app-content lg:ml-[272px]">
        <header className="app-header sticky top-0 z-30 px-4 md:px-7 h-[72px] flex items-center justify-between gap-3">
          <div className="flex items-center min-w-0"><button aria-label="Open navigation" onClick={()=>setNavOpen(true)} className="header-icon mr-3 lg:hidden"><Menu size={18}/></button><div className="min-w-0"><p className="text-[14px] font-semibold text-slate-950 truncate">{titles[page]}</p><p className="text-[10px] md:text-[11px] text-slate-500 truncate">{result.organization?`${result.organization.datasets.length} connected datasets · `:''}{result.source.fileName} · {fmtN(result.source.rowCount)} rows · updated just now</p></div></div>
          <div className="flex items-center gap-2">
            <button aria-label="Search" className="header-icon hidden sm:flex"><Search size={16}/></button>
            <button onClick={() => setExportOpen(true)} className="header-action hidden md:flex"><FileText size={14}/> Export report</button>
            <button onClick={()=>setProjectLibraryOpen(true)} className="header-icon hidden sm:flex" aria-label="Analysis history"><Activity size={16}/></button>
            <div className="user-menu group relative"><button className="user-avatar" aria-label="Account menu">{(user?.email?.[0] || 'V').toUpperCase()}</button><div className="user-popover"><p className="truncate text-xs font-semibold text-slate-900">{user?.email || 'Local workspace'}</p><button onClick={reset}><RefreshCw size={13}/> New dataset</button><button><Settings size={13}/> Settings</button><button onClick={async()=>{ const sb=getSupabase(); if(sb) await sb.auth.signOut(); }}>Sign out</button></div></div>
          </div>
        </header>
        <main className="app-main p-4 md:p-7 max-w-[1480px] mx-auto">{page==='overview'&&<PageOverview r={result} />}{page==='actions'&&<PageActionTracker r={result} />}{page==='targets'&&<PageKpiTargets r={result} />}{page==='advisor'&&<PageAdvisor r={result} />}{page==='forecast'&&<PageForecast r={result} />}{page==='scenarios'&&<PageScenarioPlanner r={result} />}{page==='analyses'&&<PageAnalyses r={result} />}{page==='customers'&&<PageCustomers r={result} />}{page==='seasonality'&&<PageSeasonality r={result} />}{page==='health'&&<PageHealth r={result} />}{page==='risks'&&<PageRisks r={result} />}{page==='recs'&&<PageRecs r={result} />}{page==='products'&&<PageProducts r={result} />}{page==='profile'&&<PageDataProfile r={result} />}{page==='connections'&&<PageConnections r={result} />}{page==='relationships'&&<PageRelationships r={result} />}{page==='quality'&&<PageQuality r={result} />}{page==='alerts'&&<PageAlerts r={result} />}{page==='trust'&&<PageTrustCenter r={result} />}</main>
      </div>
      <ProjectLibrary open={projectLibraryOpen} onClose={()=>setProjectLibraryOpen(false)} onOpen={project=>{ setResult(project.result); setCurrentProjectId(project.id); setPage('overview'); setProjectLibraryOpen(false); }} />
      <ExportDialog result={result} open={exportOpen} onClose={()=>setExportOpen(false)} />
    </div>
  );
}
