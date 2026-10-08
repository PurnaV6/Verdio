import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { runDataPipeline } from "../lib/dataPipeline/runDataPipeline";
import { generateAIInsights } from "../services/ai";

import type { PipelineResult } from "../types/pipeline";
import {
  Database,
  RefreshCw, Users, Activity,
  ArrowUpRight, FileText, Menu, Settings, X, UploadCloud, PlayCircle, Building2,
  Trash2, FolderOpen, Mail, Download, ChevronRight,
  ShieldCheck, Network, Files, ClipboardCheck, Target, Gauge, ScrollText, Stamp, BrainCircuit, AlertTriangle
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
import { fmtN } from "../components/workspace/format";
import { lazyWithReload } from "../components/workspace/lazy";
import { useDialogBehaviour } from "../components/workspace/useDialogBehaviour";
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
import { pageLabel } from "../components/workspace/navigation";
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
    <div className="v2-entry-shell">
      <main className="v2-entry-col is-wide">
        <p className="v2-entry-mark">Verd<i>.</i>io</p>
        <header className="v2-entry-head is-split">
          <div><p className="v2-eyebrow">CONNECTED BUSINESS INTELLIGENCE</p><h1 className="v2-entry-title is-compact">Build your organisational workspace</h1><p className="v2-entry-lede">Choose the source that should drive forecasts and executive KPIs, then confirm the governed relationships Verd.io will use across supporting data.</p></div>
          <span className="v2-entry-count"><Files size={14} aria-hidden="true"/>{organization.context.datasets.length} datasets ready</span>
        </header>
        <div className="v2-entry-guide"><Target size={18} aria-hidden="true"/><div><strong>Which file should be primary?</strong><p>The primary source drives the main Business Intelligence, predictions, risks and decisions. Verd.io recommends the sales file because it contains dated transactions, quantities and revenue. Stock and finance remain connected supporting sources.</p></div></div>
        <div className="v2-entry-datasets" role="radiogroup" aria-label="Primary source">
          {organization.context.datasets.map(dataset=>{const recommended=dataset.purpose==='sales';return <article key={dataset.id} className={`v2-entry-ds${dataset.primary?' is-primary':''}`}><div className="v2-entry-ds-top"><span className="v2-entry-ds-purpose"><Database size={16} aria-hidden="true"/>{dataset.purpose}</span>{recommended&&<b className="v2-entry-ds-flag">Recommended</b>}</div><strong className="v2-entry-ds-name">{dataset.fileName}</strong><p className="v2-tag">{dataset.rowCount.toLocaleString()} rows · {dataset.columnCount} columns</p><p className="v2-entry-ds-note">{dataset.purpose==='sales'?'Best for revenue, forecasting and executive decisions':dataset.purpose==='inventory'?'Supports stock coverage and replenishment review':'Supports margin and financial reconciliation'}</p><label className="v2-entry-ds-pick"><input type="radio" name="primary-dataset" checked={dataset.primary} onChange={()=>setOrganization(current=>current?{...current,context:{...current.context,datasets:current.context.datasets.map(item=>({...item,primary:item.id===dataset.id}))}}:current)}/><span>{dataset.primary?'Selected as primary':'Use as primary source'}</span></label></article>})}
        </div>
        <section className="v2-entry-rel"><div className="v2-entry-rel-head"><div><h2><Network size={16} aria-hidden="true"/>Proposed relationships</h2><p>Confirmed relationships form the governed organisational model.</p></div><b className="v2-tag">{organization.context.relationships.filter(item=>item.confirmed).length} confirmed</b></div>{organization.context.relationships.length===0?<div className="v2-entry-rel-empty">No reliable shared keys were detected. Rename shared identifiers consistently—for example, Product ID or Customer ID—and try again.</div>:<div className="v2-entry-rel-list">{organization.context.relationships.map(relation=>{const left=organization.context.datasets.find(item=>item.id===relation.leftDatasetId)!;const right=organization.context.datasets.find(item=>item.id===relation.rightDatasetId)!;return <label key={relation.id}><input type="checkbox" checked={relation.confirmed} onChange={e=>setOrganization(current=>current?{...current,context:{...current.context,relationships:current.context.relationships.map(item=>item.id===relation.id?{...item,confirmed:e.target.checked}:item)}}:current)}/><span className="v2-entry-rel-route"><b>{left.fileName}</b><small>{relation.leftColumn}</small></span><span className="v2-entry-rel-conf"><Network size={14} aria-hidden="true"/><em>{Math.round(relation.confidence*100)}%</em></span><span className="v2-entry-rel-route"><b>{right.fileName}</b><small>{relation.rightColumn} · {relation.overlapPct}% overlap</small></span></label>})}</div>}</section>
        {error&&<div role="alert" className="v2-entry-error"><AlertTriangle size={16} aria-hidden="true"/><span>{error}</span></div>}
        <div className="v2-entry-foot"><button type="button" onClick={()=>setOrganization(null)} className="v2-btn is-quiet">Choose different files</button><div><span className="v2-tag">{organization.context.relationships.filter(item=>item.confirmed).length} relationships will be retained</span><button type="button" disabled={loading} onClick={confirmOrganization} className="v2-btn">{loading?stage:'Create organisational workspace'}<ChevronRight size={15} aria-hidden="true"/></button></div></div>
      </main>
    </div>
  );

  if (pending) return (
    <div className="v2-entry-shell">
      <main className="v2-entry-col is-mid">
        <p className="v2-entry-mark">Verd<i>.</i>io</p>
        <header className="v2-entry-head"><p className="v2-eyebrow">DATA MAPPING</p><h1 className="v2-entry-title is-compact">Confirm how Verd.io should read your data</h1><p className="v2-entry-lede">We detected these roles automatically. Correct anything that does not match your business before analysis.</p></header>
        <div className="v2-entry-map">
          {pending.result.semantics.columns.map(column => <div key={column.columnName} className="v2-entry-map-row">
            <div className="min-w-0"><strong>{column.columnName}</strong><span className="v2-tag">{column.dataType} · {Math.round(column.confidence * 100)}% detected confidence</span></div>
            <select className="v2-entry-select" aria-label={`Role for ${column.columnName}`} value={roleOverrides[column.columnName]} onChange={e=>setRoleOverrides(v=>({...v,[column.columnName]:e.target.value as BusinessRole}))}>{roleOptions.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select>
          </div>)}
        </div>
        {error && <div role="alert" className="v2-entry-error"><AlertTriangle size={16} aria-hidden="true"/><span>{error}</span></div>}
        <div className="v2-entry-foot"><button type="button" onClick={()=>setPending(null)} className="v2-btn is-quiet">Choose another file</button><button type="button" disabled={loading} onClick={confirmMapping} className="v2-btn">{loading ? stage : 'Confirm mapping and analyse'} <ChevronRight size={15} aria-hidden="true"/></button></div>
      </main>
    </div>
  );
  return (
    <div className="v2-entry-shell">
      <main className="v2-entry-col">
        <p className="v2-entry-mark">Verd<i>.</i>io</p>
        <header className="v2-entry-head"><p className="v2-eyebrow">NEW ANALYSIS</p><h1 className="v2-entry-title">Turn your data into <em>decisions.</em></h1><p className="v2-entry-lede">Upload one or more structured business datasets. Verd.io will understand how they relate and surface the decisions that matter.</p></header>
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }} onClick={() => document.getElementById('fi')?.click()}
          role="button" tabIndex={0} aria-busy={loading} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById('fi')?.click(); } }}
          className={`v2-entry-drop${dragging ? ' is-dragging' : ''}`}>
          <input id="fi" type="file" multiple accept=".csv,.xlsx,.xls,.tsv,.json" className="hidden" onChange={e => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          {loading ? <div className="v2-entry-drop-busy" role="status" aria-live="polite"><div className="v2-spinner" aria-hidden="true" /><p className="v2-entry-drop-title">{stage}</p><p className="v2-tag">This usually takes less than a minute.</p></div> :
            <><UploadCloud className="v2-entry-drop-icon" size={28} aria-hidden="true"/><p className="v2-entry-drop-title">Drop one or multiple business datasets here</p><p className="v2-entry-drop-types">Sales, stock, customers, products or finance · CSV, XLSX, XLS, TSV, JSON</p><p className="v2-entry-drop-private">YOUR DATA REMAINS PRIVATE</p></>}
        </div>
        {error && <div role="alert" className="v2-entry-error"><AlertTriangle size={16} aria-hidden="true"/><span>{error}</span></div>}
        <div className="v2-entry-or"><span>or explore before uploading</span></div>
        <button type="button" disabled={loading} onClick={() => handleFile(createSampleBusinessFile(), true)} className="v2-entry-demo">
          <Building2 className="v2-entry-demo-icon" size={22} aria-hidden="true" />
          <span className="v2-entry-demo-copy"><strong>Explore a sample business</strong><small>See forecasts, risks and recommended decisions using 24 months of realistic operating data.</small></span>
          <PlayCircle className="v2-entry-demo-arrow" size={22} aria-hidden="true" />
        </button>
        <div className="v2-entry-assure"><span>Automatic cleaning</span><span className="hidden sm:inline" aria-hidden="true">•</span><span>Adaptive analysis</span><span className="hidden sm:inline" aria-hidden="true">•</span><span>Explainable decisions</span></div>
      </main>
    </div>
  );
}

function PageLoadingFallback() { return <div role="status" aria-live="polite" className="v2-loading"><div className="v2-spinner" aria-hidden="true" /><span className="v2-tag">Loading…</span></div>; }

function WorkspaceHub({ tabs, initial, label: ariaLabel }: { tabs: { id: string; label: string; icon: typeof ClipboardCheck; content: React.ReactNode }[]; initial: string; label: string }) {
  const [active, setActive] = useState(initial);
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const i=tabs.findIndex(tab=>tab.id===active);
    const next=e.key==='ArrowRight'?tabs[(i+1)%tabs.length]:e.key==='ArrowLeft'?tabs[(i+tabs.length-1)%tabs.length]:e.key==='Home'?tabs[0]:e.key==='End'?tabs[tabs.length-1]:null;
    if(!next)return;
    e.preventDefault(); setActive(next.id);
    document.getElementById(`hub-tab-${next.id}`)?.focus();
  }
  return <div className="v2-op-hub space-y-5"><div className="v2-tabs v2-hub-tabs" role="tablist" aria-label={ariaLabel}>{tabs.map(({id,label,icon:Icon})=><button key={id} type="button" role="tab" id={`hub-tab-${id}`} aria-selected={active===id} aria-controls={`hub-panel-${id}`} tabIndex={active===id?0:-1} onKeyDown={onTabKeyDown} onClick={()=>setActive(id)}><Icon size={14} aria-hidden="true"/>{label}</button>)}</div><div role="tabpanel" id={`hub-panel-${active}`} aria-labelledby={`hub-tab-${active}`}><ErrorBoundary><Suspense fallback={<PageLoadingFallback />}>{tabs.find(tab=>tab.id===active)?.content}</Suspense></ErrorBoundary></div></div>;
}

function PageExecutionHub({ r }: { r: PipelineResult }) {
  return <WorkspaceHub initial="actions" label="Execution sections" tabs={[{id:'actions',label:'Actions',icon:ClipboardCheck,content:<PageActionTracker r={r}/>},{id:'targets',label:'KPI Targets',icon:Target,content:<PageKpiTargets r={r}/>},{id:'outcomes',label:'Outcomes',icon:Gauge,content:<PageOutcomes r={r}/>},{id:'approvals',label:'Approvals',icon:Stamp,content:<PageApprovals r={r}/>}]} />;
}

function PageGovernanceHub({ r }: { r: PipelineResult }) {
  return <WorkspaceHub initial="evidence" label="Governance sections" tabs={[{id:'evidence',label:'Evidence',icon:ScrollText,content:<PageEvidence r={r}/>},{id:'models',label:'Models',icon:BrainCircuit,content:<PageModelAssurance r={r}/>},{id:'quality',label:'Data Quality',icon:Database,content:<PageQuality r={r}/>},{id:'team',label:'Team & Roles',icon:Users,content:<PageTeamWorkspace/>},{id:'audit',label:'Audit Log',icon:Activity,content:<PageAuditLog/>},{id:'trust',label:'Trust',icon:ShieldCheck,content:<PageTrustCenter r={r}/>}]} />;
}

function ProjectLibrary({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (project: SavedProject) => void }) {
  const access=useOrganizationAccess();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!open) return; setLoading(true); listProjects().then(setProjects).finally(()=>setLoading(false)); }, [open]);
  const panelRef=useDialogBehaviour(open,onClose);
  if (!open) return null;
  async function remove(id: string) { const project=projects.find(item=>item.id===id);if(project?.shared&&access.role==='viewer')return;await deleteProject(id);setProjects(items=>items.filter(item=>item.id!==id)); }
  return <div className="v2-dlg-shell"><button type="button" tabIndex={-1} className="v2-dlg-scrim" onClick={onClose} aria-label="Close saved analyses"/><section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="project-library-title" className="v2-dlg-panel"><div className="v2-dlg-head"><div><p className="v2-eyebrow">WORKSPACE</p><h2 id="project-library-title">Saved analyses</h2><p className="v2-dlg-lede">Return to previous decision workspaces without uploading the dataset again.</p></div><button type="button" className="v2-dlg-close" onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true"/></button></div><div className="v2-dlg-body">{loading?<p className="v2-dlg-empty" role="status">Loading projects…</p>:projects.length===0?<p className="v2-dlg-empty">Your completed analyses will appear here automatically.</p>:projects.map(project=><article key={project.id} className="v2-dlg-row"><FolderOpen className="v2-dlg-row-icon" size={18} aria-hidden="true"/><div className="v2-dlg-row-copy"><strong>{project.name}</strong><small className="v2-tag">{project.result.source.rowCount.toLocaleString()} rows · Health {project.result.decision.health.total}/100 · {new Date(project.updatedAt).toLocaleDateString('en-GB')}</small></div><button type="button" onClick={()=>onOpen(project)} className="v2-op-btn">Open</button><button type="button" onClick={()=>remove(project.id)} className="v2-dlg-delete" aria-label={`Delete ${project.name}`}><Trash2 size={16} aria-hidden="true"/></button></article>)}</div></section></div>;
}

function ExportDialog({ result, open, onClose }: { result: PipelineResult; open: boolean; onClose: () => void }) {
  const panelRef=useDialogBehaviour(open,onClose);
  if (!open) return null;
  return <div className="v2-dlg-shell"><button type="button" tabIndex={-1} className="v2-dlg-scrim" onClick={onClose} aria-label="Close export dialog"/><section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" className="v2-dlg-panel is-narrow"><div className="v2-dlg-head"><div><p className="v2-eyebrow">EXECUTIVE REPORTING</p><h2 id="export-dialog-title">Share the decision brief</h2><p className="v2-dlg-lede">Use a board-ready report or send a concise summary through your email application.</p></div><button type="button" className="v2-dlg-close" onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true"/></button></div><div className="v2-dlg-body"><button type="button" className="v2-dlg-option" onClick={()=>openReport(result)}><Download size={20} aria-hidden="true"/><span><strong>PDF-ready executive report</strong><small>Open the formatted report, then print or save it as PDF.</small></span><ChevronRight size={18} aria-hidden="true"/></button><button type="button" className="v2-dlg-option" onClick={()=>emailExecutiveSummary(result)}><Mail size={20} aria-hidden="true"/><span><strong>Email executive summary</strong><small>Prepare a concise risk, health and recommended-action email.</small></span><ChevronRight size={18} aria-hidden="true"/></button></div></section></div>;
}

function ViewerWorkspaceLanding({ message, onOpen }: { message: string; onOpen: (project: SavedProject) => void }) {
  const [projects,setProjects]=useState<SavedProject[]>([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{listProjects().then(items=>setProjects(items.filter(item=>item.shared))).finally(()=>setLoading(false))},[]);
  return <div className="v2-entry-shell"><main className="v2-entry-col is-mid"><p className="v2-entry-mark">Verd<i>.</i>io</p><header className="v2-entry-head"><h1 className="v2-entry-title is-compact">Shared organisation projects</h1><p className="v2-entry-lede"><ShieldCheck className="v2-entry-inline-icon" size={18} aria-hidden="true"/>Your viewer role provides secure read-only access.</p>{message&&<p className="v2-entry-notice" role="status">{message}</p>}</header><div className="v2-entry-projects">{loading?<p className="v2-entry-projects-empty" role="status">Loading shared projects…</p>:projects.length===0?<p className="v2-entry-projects-empty">No shared analyses are available yet. Ask an analyst or administrator to publish one.</p>:projects.map(project=><article key={project.id}><div><strong>{project.name}</strong><small className="v2-tag">{project.result.source.rowCount.toLocaleString()} rows · Health {project.result.decision.health.total}/100</small></div><button type="button" onClick={()=>onOpen(project)} className="v2-op-btn">Open read-only</button></article>)}</div></main></div>;
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
  if (authLoading) return <div role="status" aria-live="polite" className="v2-entry-shell is-wait"><div className="v2-spinner" aria-hidden="true" /><span className="v2-tag">Loading…</span></div>;
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
  if (!user && publicMode==='demo' && demoLoading) return <div role="status" aria-live="polite" className="v2-entry-shell is-wait"><div className="v2-spinner" aria-hidden="true"/><p className="v2-tag">Preparing the Verd.io live demo…</p></div>;
  if (!result && access.role==='viewer') return <ViewerWorkspaceLanding message={inviteMessage} onOpen={project=>{void recordProjectOpened(project);setResult(project.result);setCurrentProjectId(project.id)}}/>;
  if (!result) return <UploadScreen onLoaded={r => { setCurrentProjectId(null); setResult(r); setPage('overview'); }} />;
  return (
    <div className="app-shell min-h-screen">
      <Sidebar page={page} setPage={setPage} result={result} onReset={reset} open={navOpen} onClose={()=>setNavOpen(false)} />
      <div className="app-content lg:ml-[272px]">
        <header className="app-header sticky top-0 z-30 px-4 md:px-7 h-[72px] flex items-center justify-between gap-3">
          <div className="flex items-center min-w-0"><button aria-label="Open navigation" onClick={()=>setNavOpen(true)} className="header-icon mr-3 lg:hidden"><Menu size={18}/></button><div className="min-w-0"><p className="v2-header-title truncate">{pageLabel(page)}</p><p className="v2-header-source truncate">{result.organization?`${result.organization.datasets.length} connected datasets · `:''}{result.source.fileName} · {fmtN(result.source.rowCount)} rows · Analysed this session</p></div></div>
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
