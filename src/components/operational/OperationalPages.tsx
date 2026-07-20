import { useMemo, useState } from 'react';
import { Bell, CheckCircle, Clock, Database, FileSpreadsheet, Link2, LockKeyhole, Mail, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { PipelineResult } from '../../types/pipeline';
import { primaryMeasureColumn } from '../../lib/analysis/pickColumns';

const PREFS_KEY = 'verdio_operational_preferences_v1';

interface OperationalPreferences {
  revenueDropAlert: boolean;
  healthAlert: boolean;
  qualityAlert: boolean;
  healthThreshold: number;
  qualityThreshold: number;
  reportCadence: 'off' | 'weekly' | 'monthly';
  reportEmail: string;
}

const DEFAULT_PREFS: OperationalPreferences = {
  revenueDropAlert: true, healthAlert: true, qualityAlert: true,
  healthThreshold: 60, qualityThreshold: 75, reportCadence: 'off', reportEmail: '',
};

function loadPreferences(): OperationalPreferences {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return DEFAULT_PREFS; }
}

function savePreferences(value: OperationalPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(value));
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="operational-heading"><div className="eyebrow"><span className="eyebrow-dot"/> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>;
}

export function PageConnections({ r }: { r: PipelineResult }) {
  const connectors = [
    { name: 'Google Sheets', detail: 'Scheduled spreadsheet refresh', icon: FileSpreadsheet, status: 'Requires Google OAuth' },
    { name: 'Microsoft Excel', detail: 'OneDrive and SharePoint workbooks', icon: FileSpreadsheet, status: 'Requires Microsoft OAuth' },
    { name: 'Stripe', detail: 'Revenue and subscription activity', icon: Link2, status: 'Requires Stripe credentials' },
    { name: 'QuickBooks / Xero', detail: 'Accounting and cash-flow data', icon: Database, status: 'Requires provider credentials' },
    { name: 'PostgreSQL / Supabase', detail: 'Read-only database synchronisation', icon: Database, status: 'Requires connection secret' },
  ];
  return <div className="space-y-5"><SectionHeader eyebrow="DATA OPERATIONS" title="Connections and refresh" description="Manage how information enters this workspace. External sources remain disabled until their OAuth or database credentials are configured."/><div className="active-source-card"><span><CheckCircle size={18}/></span><div><strong>Active source</strong><p>{r.source.fileName} · {r.source.rowCount.toLocaleString()} rows</p></div><div className="source-status"><i/> Ready</div></div><div className="connector-grid">{connectors.map(({name,detail,icon:Icon,status})=><article key={name} className="connector-card"><div className="connector-icon"><Icon size={19}/></div><div><strong>{name}</strong><p>{detail}</p></div><span>{status}</span><button disabled>Configure</button></article>)}</div><div className="configuration-note"><LockKeyhole size={17}/><div><strong>Secure configuration required</strong><p>Provider secrets must be stored in Vercel or Supabase server-side configuration. They should never be entered into the browser or committed to GitHub.</p></div></div></div>;
}

export function PageAlerts({ r }: { r: PipelineResult }) {
  const [prefs, setPrefs] = useState(loadPreferences);
  const [saved, setSaved] = useState(false);
  const update = <K extends keyof OperationalPreferences>(key: K, value: OperationalPreferences[K]) => setPrefs(p=>({...p,[key]:value}));
  const activeSignals = [
    prefs.healthAlert && r.decision.health.total < prefs.healthThreshold ? `Business health is below ${prefs.healthThreshold}` : null,
    prefs.qualityAlert && r.quality.overallScore < prefs.qualityThreshold ? `Data quality is below ${prefs.qualityThreshold}` : null,
    prefs.revenueDropAlert && r.decision.risks.some(x=>/drop|variability|revenue/i.test(x.title) && x.level !== 'low') ? 'A material revenue movement requires review' : null,
  ].filter(Boolean);
  function persist() { savePreferences(prefs); setSaved(true); window.setTimeout(()=>setSaved(false),1800); }
  return <div className="space-y-5"><SectionHeader eyebrow="MONITORING" title="Alerts and scheduled briefs" description="Define which operating signals should demand attention and how often an executive brief should be prepared."/><div className="alert-summary"><Bell size={18}/><div><strong>{activeSignals.length ? `${activeSignals.length} rule${activeSignals.length===1?'':'s'} triggered` : 'No configured thresholds are currently breached'}</strong><p>{activeSignals.length ? activeSignals.join(' · ') : 'Rules are evaluated whenever the active analysis is refreshed.'}</p></div></div><div className="settings-panel"><h2>Alert rules</h2>{[
    {key:'healthAlert' as const,label:'Business health deterioration',desc:'Flag when the health score falls below the threshold.',threshold:'healthThreshold' as const},
    {key:'qualityAlert' as const,label:'Data quality degradation',desc:'Flag incomplete or unreliable incoming data.',threshold:'qualityThreshold' as const},
    {key:'revenueDropAlert' as const,label:'Material revenue movement',desc:'Flag significant negative changes or elevated variability.'},
  ].map(rule=><div className="setting-row" key={rule.key}><label><input type="checkbox" checked={prefs[rule.key]} onChange={e=>update(rule.key,e.target.checked)}/><span><strong>{rule.label}</strong><small>{rule.desc}</small></span></label>{rule.threshold&&<div className="threshold-input"><input type="number" min="1" max="100" value={prefs[rule.threshold]} onChange={e=>update(rule.threshold,Number(e.target.value))}/><span>/100</span></div>}</div>)}<h2 className="settings-subheading">Scheduled executive report</h2><div className="schedule-grid"><label><span>Cadence</span><select value={prefs.reportCadence} onChange={e=>update('reportCadence',e.target.value as OperationalPreferences['reportCadence'])}><option value="off">Off</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label><span>Delivery email</span><input type="email" value={prefs.reportEmail} onChange={e=>update('reportEmail',e.target.value)} placeholder="executive@company.com"/></label></div><div className="settings-footer"><p><Clock size={13}/> Automated delivery requires a deployed scheduler; preferences are saved now and ready for backend activation.</p><button onClick={persist}>{saved?'Saved':'Save preferences'}</button></div></div></div>;
}

export function PageScenarioPlanner({ r }: { r: PipelineResult }) {
  const [price, setPrice] = useState(0); const [volume, setVolume] = useState(0); const [cost, setCost] = useState(0); const [retention, setRetention] = useState(0);
  const measure = primaryMeasureColumn(r.semantics.columns, r.engineeredRows);
  const baselineRevenue = useMemo(()=>measure ? r.engineeredRows.reduce((sum,row)=>sum+(Number(row[measure])||0),0) : 0,[r,measure]);
  const costCol = r.semantics.columns.find(c=>c.businessRole==='cost')?.columnName;
  const baselineCost = costCol ? r.engineeredRows.reduce((sum,row)=>sum+(Number(row[costCol])||0),0) : baselineRevenue * .55;
  const projectedRevenue = baselineRevenue * (1+price/100) * (1+volume/100) * (1+retention/100*.35);
  const projectedCost = baselineCost * (1+volume/100) * (1+cost/100);
  const baselineProfit = baselineRevenue-baselineCost; const projectedProfit=projectedRevenue-projectedCost;
  const levers = [{label:'Price change',value:price,set:setPrice,min:-20,max:30},{label:'Volume / demand',value:volume,set:setVolume,min:-30,max:50},{label:'Unit cost change',value:cost,set:setCost,min:-25,max:30},{label:'Retention improvement',value:retention,set:setRetention,min:0,max:30}];
  return <div className="space-y-5"><SectionHeader eyebrow="SCENARIO PLANNING" title="Model commercial decisions" description="Adjust key assumptions and compare the resulting operating position against the current dataset baseline."/><div className="scenario-layout"><section className="scenario-controls"><div className="scenario-title"><SlidersHorizontal size={17}/><div><strong>Decision levers</strong><p>Changes are illustrative and update instantly.</p></div></div>{levers.map(lever=><label className="scenario-lever" key={lever.label}><div><span>{lever.label}</span><strong>{lever.value>0?'+':''}{lever.value}%</strong></div><input type="range" min={lever.min} max={lever.max} value={lever.value} onChange={e=>lever.set(Number(e.target.value))}/><small>{lever.min}%</small><small>{lever.max}%</small></label>)}<button className="scenario-reset" onClick={()=>{setPrice(0);setVolume(0);setCost(0);setRetention(0)}}>Reset assumptions</button></section><section className="scenario-results"><div className="scenario-result-heading"><span>MODELLED OUTCOME</span><strong>{projectedProfit>=baselineProfit?'Improved operating case':'Downside operating case'}</strong></div><div className="scenario-metrics"><div><span>Projected revenue</span><strong>£{Math.round(projectedRevenue).toLocaleString()}</strong><small>{((projectedRevenue/baselineRevenue-1)*100||0).toFixed(1)}% vs baseline</small></div><div><span>Projected contribution</span><strong>£{Math.round(projectedProfit).toLocaleString()}</strong><small>Baseline £{Math.round(baselineProfit).toLocaleString()}</small></div><div><span>Incremental value</span><strong className={projectedProfit>=baselineProfit?'positive':'negative'}>{projectedProfit>=baselineProfit?'+':''}£{Math.round(projectedProfit-baselineProfit).toLocaleString()}</strong><small>Modelled, not guaranteed</small></div></div><div className="scenario-assumptions"><strong>Model assumptions</strong><p>Price and volume effects are multiplicative. Retention contributes 35% of its change to recognised revenue. Costs scale with volume and the selected unit-cost adjustment.</p></div></section></div></div>;
}

export function PageTrustCenter({ r }: { r: PipelineResult }) {
  const [cleared,setCleared]=useState(false);
  function clearPreferences(){ localStorage.removeItem(PREFS_KEY); setCleared(true); }
  const controls=[
    {title:'In-browser data processing',detail:'Uploaded datasets are analysed in the browser. Only derived context is sent to the configured AI endpoint when AI features are used.',status:'Active'},
    {title:'AI provider boundary',detail:'The server selects Groq or OpenAI from protected deployment variables. API credentials are never exposed to the browser.',status:'Active'},
    {title:'Authentication',detail:'Supabase authentication is enforced when deployment credentials are configured.',status:'Environment controlled'},
    {title:'Role-based access and SSO',detail:'Enterprise roles and SSO require organisation tables, policies and an identity-provider configuration.',status:'Backend setup required'},
  ];
  return <div className="space-y-5"><SectionHeader eyebrow="TRUST CENTER" title="Privacy and workspace controls" description="Understand where information is processed, what is retained, and which enterprise controls require deployment configuration."/><div className="trust-grid">{controls.map(c=><article key={c.title}><span><ShieldCheck size={17}/></span><div><strong>{c.title}</strong><p>{c.detail}</p><small>{c.status}</small></div></article>)}</div><div className="settings-panel"><h2>Current workspace</h2><div className="trust-facts"><div><span>Active dataset</span><strong>{r.source.fileName}</strong></div><div><span>Local project retention</span><strong>IndexedDB on this device</strong></div><div><span>Current access level</span><strong>Workspace owner</strong></div></div><div className="danger-zone"><div><Trash2 size={17}/><span><strong>Clear operational preferences</strong><small>Removes alert and report preferences stored by this browser. Saved analyses are managed separately in Analysis history.</small></span></div><button onClick={clearPreferences}>{cleared?'Preferences cleared':'Clear preferences'}</button></div></div><div className="audit-panel"><h2>Activity and audit readiness</h2><div><span>Analysis generated</span><p>{r.source.rowCount.toLocaleString()} rows processed from {r.source.fileName}</p><time>Current session</time></div><div><span>Semantic mapping confirmed</span><p>{r.semantics.columns.length} columns classified for decision analysis</p><time>Current session</time></div><div><span>AI access</span><p>Provider requests are routed through the protected /api/chat endpoint</p><time>On demand</time></div></div></div>;
}
