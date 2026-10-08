import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { runDataPipeline } from "../lib/dataPipeline/runDataPipeline";
import { generateAIInsights } from "../services/ai";

import type { PipelineResult } from "../types/pipeline";
import {
  Database,
  RefreshCw, Users, Activity,
  ArrowUpRight, FileText, Menu, Settings, X, UploadCloud, PlayCircle, Building2,
  Trash2, FolderOpen, Mail, Download, ChevronRight,
  ShieldCheck, Network, Files, ClipboardCheck, Target, Gauge, ScrollText, Stamp, BrainCircuit
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
import { BrandMark } from "../components/workspace/BrandMark";
import { fmtN } from "../components/workspace/format";
import { lazyWithReload } from "../components/workspace/lazy";
import { PageAnalyses } from "../components/pages/PageAnalyses";
import { PageForecast } from "../components/pages/PageForecast";
import { PageCustomers } from "../components/pages/PageCustomers";
import { PageSeasonality } from "../components/pages/PageSeasonality";
import { PageHealth } from "../components/pages/PageHealth";
import { PageProducts } from "../components/pages/PageProducts";
import { PageRisks } from "../components/pages/PageRisks";
import { PageRecs } from "../components/pages/PageRecs";
import { PageDataProfile } from "../components/pages/PageDataProfile";
import { PageQuality } from "../components/pages/PageQuality";
import { PageAdvisor } from "../components/pages/PageAdvisor";
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

function PageLoadingFallback() { return <div role="status" aria-live="polite" className="v2-loading"><div className="v2-spinner" aria-hidden="true" /><span className="v2-tag">Loading…</span></div>; }

function WorkspaceHub({ tabs, initial }: { tabs: { id: string; label: string; icon: typeof ClipboardCheck; content: React.ReactNode }[]; initial: string }) {
  const [active, setActive] = useState(initial);
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const i=tabs.findIndex(tab=>tab.id===active);
    const next=e.key==='ArrowRight'?tabs[(i+1)%tabs.length]:e.key==='ArrowLeft'?tabs[(i+tabs.length-1)%tabs.length]:e.key==='Home'?tabs[0]:e.key==='End'?tabs[tabs.length-1]:null;
    if(!next)return;
    e.preventDefault(); setActive(next.id);
    document.getElementById(`hub-tab-${next.id}`)?.focus();
  }
  return <div className="space-y-5"><div className="v2-tabs v2-hub-tabs" role="tablist" aria-label="Workspace sections">{tabs.map(({id,label,icon:Icon})=><button key={id} type="button" role="tab" id={`hub-tab-${id}`} aria-selected={active===id} aria-controls={`hub-panel-${id}`} tabIndex={active===id?0:-1} onKeyDown={onTabKeyDown} onClick={()=>setActive(id)}><Icon size={14} aria-hidden="true"/>{label}</button>)}</div><div role="tabpanel" id={`hub-panel-${active}`} aria-labelledby={`hub-tab-${active}`}><ErrorBoundary><Suspense fallback={<PageLoadingFallback />}>{tabs.find(tab=>tab.id===active)?.content}</Suspense></ErrorBoundary></div></div>;
}

function PageExecutionHub({ r }: { r: PipelineResult }) {
  return <WorkspaceHub initial="actions" tabs={[{id:'actions',label:'Actions',icon:ClipboardCheck,content:<PageActionTracker r={r}/>},{id:'targets',label:'KPI Targets',icon:Target,content:<PageKpiTargets r={r}/>},{id:'outcomes',label:'Outcomes',icon:Gauge,content:<PageOutcomes r={r}/>},{id:'approvals',label:'Approvals',icon:Stamp,content:<PageApprovals r={r}/>}]} />;
}

function PageGovernanceHub({ r }: { r: PipelineResult }) {
  return <WorkspaceHub initial="evidence" tabs={[{id:'evidence',label:'Evidence',icon:ScrollText,content:<PageEvidence r={r}/>},{id:'models',label:'Models',icon:BrainCircuit,content:<PageModelAssurance r={r}/>},{id:'quality',label:'Data Quality',icon:Database,content:<PageQuality r={r}/>},{id:'team',label:'Team & Roles',icon:Users,content:<PageTeamWorkspace/>},{id:'audit',label:'Audit Log',icon:Activity,content:<PageAuditLog/>},{id:'trust',label:'Trust',icon:ShieldCheck,content:<PageTrustCenter r={r}/>}]} />;
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
          <div className="v2-header-actions flex items-center gap-2">
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
