import { useEffect, useMemo, useState } from 'react';
import { Database, FileSpreadsheet, Link2 } from 'lucide-react';
import type { PipelineResult } from '../../types/pipeline';
import { primaryMeasureColumn } from '../../lib/analysis/pickColumns';
import { getSupabase } from '../../lib/auth/supabaseClient';
import { useOrganizationAccess } from '../../lib/auth/useOrganizationAccess';
import { accessLevelLabel, projectStorageLabel } from '../../lib/auth/accessLabels';
import { StateMark } from '../workspace/StateMark';
import { Figure, Figures, IdleMark, PageHead } from '../pages/PageParts';
import { pageLabel } from "../workspace/navigation";

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

export function PageConnections({ r }: { r: PipelineResult }) {
  const connectors = [
    { name: 'Google Sheets', detail: 'Scheduled spreadsheet refresh', icon: FileSpreadsheet, status: 'Requires Google OAuth' },
    { name: 'Microsoft Excel', detail: 'OneDrive and SharePoint workbooks', icon: FileSpreadsheet, status: 'Requires Microsoft OAuth' },
    { name: 'Stripe', detail: 'Revenue and subscription activity', icon: Link2, status: 'Requires Stripe credentials' },
    { name: 'QuickBooks / Xero', detail: 'Accounting and cash-flow data', icon: Database, status: 'Requires provider credentials' },
    { name: 'PostgreSQL / Supabase', detail: 'Read-only database synchronisation', icon: Database, status: 'Requires connection secret' },
  ];
  return <div className="v2-view"><PageHead eyebrow="Connections and refresh" title={pageLabel('connections')}>Manage how information enters this workspace. External sources are not yet available and will open here once their OAuth or database integration ships.</PageHead>
    <Figures label="Active source"><Figure label="Active source" value={r.source.rowCount.toLocaleString()} unit=" rows" tone="ok" toneLabel="Ready" sub={r.source.fileName}/></Figures>
    <div className="v2-table-wrap" role="region" aria-label="Available connectors" tabIndex={0}><table className="v2-table v2-op-table-wide"><caption>Available connectors</caption>
      <thead><tr><th scope="col">Connector</th><th scope="col">Use</th><th scope="col">Requirement</th><th scope="col">Availability</th></tr></thead>
      <tbody>{connectors.map(({name,detail,icon:Icon,status})=><tr key={name}><th scope="row"><span className="v2-op-name"><Icon size={16} aria-hidden="true"/><strong>{name}</strong></span></th><td>{detail}</td><td><IdleMark label={status}/></td><td><button type="button" className="v2-op-btn" disabled title={status}>Coming soon</button></td></tr>)}</tbody></table></div>
    <aside className="v2-note-block"><h2>Secure configuration required</h2><p>Provider secrets must be stored in Vercel or Supabase server-side configuration. They should never be entered into the browser or committed to GitHub.</p></aside>
  </div>;
}

export function PageRelationships({ r }: { r: PipelineResult }) {
  const organization=r.organization;
  if(!organization) return <div className="v2-view"><PageHead eyebrow="Dataset relationships" title={pageLabel('relationships')}>Upload two or more datasets together to create a governed organisational data model.</PageHead><section className="v2-empty" role="status"><div><h2>No organisational model is active</h2><p>Start a new analysis and select sales, stock, customer, product or finance files together.</p></div></section></div>;
  const confirmed=organization.relationships.filter(item=>item.confirmed);
  const metrics=(organization.metrics||[]).filter(item=>!item.relationshipId||confirmed.some(relation=>relation.id===item.relationshipId));
  const insights=(organization.insights||[]).filter(item=>!item.relationshipId||confirmed.some(relation=>relation.id===item.relationshipId));
  const formatMetric=(value:number,format:string)=>format==='currency'?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(value):format==='percentage'?`${value.toFixed(1)}%`:Math.round(value).toLocaleString('en-GB');
  return <div className="v2-view"><PageHead eyebrow="Dataset relationships" title={pageLabel('relationships')}>Review connected sources, governed relationships and the operational signals supported by them.</PageHead>
    <div className="v2-table-wrap" role="region" aria-label="Connected datasets" tabIndex={0}><table className="v2-table"><caption>Connected datasets</caption>
      <thead><tr><th scope="col">Dataset</th><th scope="col">Purpose</th><th scope="col" className="num">Rows</th><th scope="col" className="num">Columns</th><th scope="col">Role</th></tr></thead>
      <tbody>{organization.datasets.map(dataset=><tr key={dataset.id} aria-current={dataset.primary?'true':undefined}><th scope="row" className="v2-op-wrap">{dataset.fileName}</th><td>{dataset.purpose}</td><td className="num">{dataset.rowCount.toLocaleString()}</td><td className="num">{dataset.columnCount}</td><td>{dataset.primary?<StateMark tone="ok" label="Primary executive analysis"/>:<span className="v2-none">Supporting source</span>}</td></tr>)}</tbody></table></div>
    {metrics.length>0&&<section className="v2-op-sect"><div className="v2-op-sect-head"><h2>Cross-dataset indicators</h2><span className="v2-tag">{metrics.length} indicators</span></div><p className="v2-muted">Calculated from the uploaded files; evidence is shown for every value.</p><Figures label="Cross-dataset indicators">{metrics.map(metric=><Figure key={metric.id} label={metric.label} value={formatMetric(metric.value,metric.format)} sub={metric.evidence}/>)}</Figures></section>}
    {insights.length>0&&<section className="v2-op-sect"><h2>Connected-data recommendations</h2><p className="v2-muted">Actions are qualified by relationship confidence and data coverage.</p><ul className="v2-ledger">{insights.map(insight=><li key={insight.id}><div className="v2-ledger-state">{insight.priority==='high'?<StateMark tone="risk" label="High priority"/>:insight.priority==='medium'?<StateMark tone="watch" label="Medium priority"/>:<StateMark tone="ok" label="Opportunity"/>}</div><div><div className="v2-ledger-head"><h3 className="v2-ledger-title">{insight.title}</h3><span className="v2-tag">{Math.round(insight.confidence*100)}% evidence confidence</span></div><p className="v2-ledger-copy">{insight.description}</p><p className="v2-tag"><b>Recommended next step:</b> {insight.action}</p></div></li>)}</ul></section>}
    <section className="v2-op-sect"><h2>Confirmed relationship map</h2><p className="v2-muted">{confirmed.length} governed connections across {organization.datasets.length} datasets</p>
      {confirmed.length===0?<section className="v2-empty" role="status"><div><h2>No relationships were confirmed for this workspace.</h2></div></section>:<div className="v2-table-wrap" role="region" aria-label="Confirmed relationships" tabIndex={0}><table className="v2-table v2-op-table-wide"><caption className="sr-only">Confirmed relationships between datasets</caption>
        <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Confidence</th></tr></thead>
        <tbody>{confirmed.map(relation=>{const left=organization.datasets.find(item=>item.id===relation.leftDatasetId);const right=organization.datasets.find(item=>item.id===relation.rightDatasetId);return <tr key={relation.id}><th scope="row" className="v2-op-wrap"><strong>{left?.fileName}</strong><span className="v2-tag v2-op-sub">{relation.leftColumn}</span></th><td className="v2-op-wrap"><strong>{right?.fileName}</strong><span className="v2-tag v2-op-sub">{relation.rightColumn} · {relation.overlapPct}% overlap</span></td><td className="num">{Math.round(relation.confidence*100)}%</td></tr>})}</tbody></table></div>}</section>
  </div>;
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
  useEffect(()=>{const sb=getSupabase();if(!sb)return;void sb.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:row}=await sb.from('report_schedules').select('cadence,recipient_email,active').eq('user_id',data.user.id).eq('dataset_key',r.source.fileName).maybeSingle();if(row)setPrefs(current=>({...current,reportCadence:row.active?row.cadence:'off',reportEmail:row.recipient_email}))})},[r.source.fileName]);
  async function persist() {
    savePreferences(prefs);
    const sb=getSupabase();
    if(sb){
      const {data:{user}}=await sb.auth.getUser();
      if(user){
        if(prefs.reportCadence==='off') await sb.from('report_schedules').delete().eq('user_id',user.id).eq('dataset_key',r.source.fileName);
        else {
          const next=new Date();
          if(prefs.reportCadence==='weekly') next.setDate(next.getDate()+7); else next.setMonth(next.getMonth()+1);
          await sb.from('report_schedules').upsert({user_id:user.id,dataset_key:r.source.fileName,cadence:prefs.reportCadence,recipient_email:prefs.reportEmail,active:true,next_run_at:next.toISOString(),snapshot:{health:r.decision.health.total,quality:r.quality.overallScore,risks:r.decision.risks.slice(0,3),recommendations:r.decision.recommendations.slice(0,3)},updated_at:new Date().toISOString()},{onConflict:'user_id,dataset_key'});
        }
        const {data:membership}=await sb.from('organization_members').select('organization_id').eq('user_id',user.id).limit(1).maybeSingle();
        if(membership)await sb.rpc('record_organization_audit',{target_organization:membership.organization_id,target_event:prefs.reportCadence==='off'?'schedule.disabled':'schedule.updated',target_entity_type:'schedule',target_entity_id:r.source.fileName,target_metadata:{cadence:prefs.reportCadence,recipient:prefs.reportEmail}});
      }
    }
    setSaved(true); window.setTimeout(()=>setSaved(false),1800);
  }
  const rules=[
    {key:'healthAlert' as const,label:'Business health deterioration',desc:'Flag when the health score falls below the threshold.',threshold:'healthThreshold' as const},
    {key:'qualityAlert' as const,label:'Data quality degradation',desc:'Flag incomplete or unreliable incoming data.',threshold:'qualityThreshold' as const},
    {key:'revenueDropAlert' as const,label:'Material revenue movement',desc:'Flag significant negative changes or elevated variability.'},
  ];
  return <div className="v2-view"><PageHead eyebrow="Alerts and scheduled briefs" title={pageLabel('alerts')}>Define which operating signals should demand attention and how often an executive brief should be prepared.</PageHead>
    <section className="v2-op-verdict" role="status">{activeSignals.length?<StateMark tone="risk" label="Rules triggered"/>:<StateMark tone="ok" label="Within thresholds"/>}<h2>{activeSignals.length ? `${activeSignals.length} rule${activeSignals.length===1?'':'s'} triggered` : 'No configured thresholds are currently breached'}</h2><p>{activeSignals.length ? activeSignals.join(' · ') : 'Rules are evaluated whenever the active analysis is refreshed.'}</p></section>
    <section className="v2-op-sect"><h2>Alert rules</h2>
      <ul className="v2-op-rules">{rules.map(rule=><li key={rule.key}><label className="v2-op-check"><input type="checkbox" checked={prefs[rule.key]} onChange={e=>update(rule.key,e.target.checked)}/><span><strong>{rule.label}</strong><small>{rule.desc}</small></span></label>{rule.threshold&&<div className="v2-op-threshold"><label className="sr-only" htmlFor={`${rule.key}-threshold`}>{rule.label} threshold</label><input id={`${rule.key}-threshold`} className="v2-op-input is-num is-short" type="number" min="1" max="100" value={prefs[rule.threshold]} onChange={e=>update(rule.threshold,Number(e.target.value))}/><span>/100</span></div>}</li>)}</ul></section>
    <section className="v2-op-sect"><h2>Scheduled executive report</h2>
      <div className="v2-op-form"><label className="v2-op-field"><span>Cadence</span><select className="v2-op-input" value={prefs.reportCadence} onChange={e=>update('reportCadence',e.target.value as OperationalPreferences['reportCadence'])}><option value="off">Off</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label className="v2-op-field"><span>Delivery email</span><input className="v2-op-input" type="email" value={prefs.reportEmail} onChange={e=>update('reportEmail',e.target.value)} placeholder="executive@company.com"/></label></div>
      <div className="v2-op-form-foot"><p>Schedules are stored securely in Supabase and delivered by the scheduled-reports service.</p><button type="button" className="v2-op-btn is-primary" onClick={persist}>{saved?'Cloud schedule saved':'Save schedule'}</button></div></section>
  </div>;
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
  return <div className="v2-view"><PageHead eyebrow="Model commercial decisions" title={pageLabel('scenarios')}>Adjust key assumptions and compare the resulting operating position against the current dataset baseline.</PageHead>
    <div className="v2-op-scenario">
      <section aria-labelledby="scenario-levers-heading"><h2 id="scenario-levers-heading" className="v2-op-h2">Decision levers</h2><p className="v2-muted">Changes are illustrative and update instantly.</p>
        {levers.map(lever=>{const id=`scenario-lever-${lever.label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;return <div className="v2-op-lever" key={lever.label}><div className="v2-op-lever-top"><label htmlFor={id}>{lever.label}</label><strong className="v2-op-lever-val">{lever.value>0?'+':''}{lever.value}%</strong></div><input id={id} className="v2-op-range" type="range" min={lever.min} max={lever.max} value={lever.value} aria-valuetext={`${lever.value>0?'+':''}${lever.value} percent`} onChange={e=>lever.set(Number(e.target.value))}/><div className="v2-op-lever-ends" aria-hidden="true"><span>{lever.min}%</span><span>{lever.max}%</span></div></div>})}
        <button type="button" className="v2-op-btn v2-op-reset" onClick={()=>{setPrice(0);setVolume(0);setCost(0);setRetention(0)}}>Reset assumptions</button></section>
      <section aria-labelledby="scenario-results-heading"><p className="v2-tag">Modelled outcome</p><h2 id="scenario-results-heading" className="v2-op-h2">{projectedProfit>=baselineProfit?'Improved operating case':'Downside operating case'}</h2><div className="v2-op-state">{projectedProfit>=baselineProfit?<StateMark tone="ok" label="At or above baseline"/>:<StateMark tone="risk" label="Below baseline"/>}</div>
        <Figures label="Modelled results"><Figure label="Projected revenue" value={`£${Math.round(projectedRevenue).toLocaleString()}`} sub={`${((projectedRevenue/baselineRevenue-1)*100||0).toFixed(1)}% vs baseline`}/><Figure label="Projected contribution" value={`£${Math.round(projectedProfit).toLocaleString()}`} sub={`Baseline £${Math.round(baselineProfit).toLocaleString()}`}/><Figure label="Incremental value" value={`${projectedProfit>=baselineProfit?'+':''}£${Math.round(projectedProfit-baselineProfit).toLocaleString()}`} sub="Modelled, not guaranteed"/></Figures>
        <aside className="v2-note-block"><h2>Model assumptions</h2><p>Price and volume effects are multiplicative. Retention contributes 35% of its change to recognised revenue. Costs scale with volume and the selected unit-cost adjustment.</p></aside></section>
    </div>
  </div>;
}

export function PageTrustCenter({ r }: { r: PipelineResult }) {
  const [cleared,setCleared]=useState(false);
  const access=useOrganizationAccess();
  function clearPreferences(){ localStorage.removeItem(PREFS_KEY); setCleared(true); }
  const controls=[
    {title:'In-browser data processing',detail:'Uploaded datasets are analysed in the browser. Only derived context is sent to the configured AI endpoint when AI features are used. When you are signed in, saved projects (for organisation members) and your action, target and outcome records can also be stored in the cloud; see Current workspace below.',status:'Active',tone:'ok' as const},
    {title:'AI provider boundary',detail:'The server selects Groq or OpenAI from protected deployment variables. API credentials are never exposed to the browser.',status:'Active',tone:'ok' as const},
    {title:'Authentication',detail:'Supabase authentication is enforced when deployment credentials are configured.',status:'Environment controlled',tone:'watch' as const},
    {title:'Role-based access and SSO',detail:'Owner, admin, analyst and viewer roles apply to members of an organisation, and need organisation tables and policies in the deployment. Single sign-on also needs an identity-provider configuration.',status:'Backend setup required',tone:'watch' as const},
  ];
  const activity=[
    {event:'Analysis generated',detail:`${r.source.rowCount.toLocaleString()} rows processed from ${r.source.fileName}`,when:'Current session'},
    {event:'Semantic mapping confirmed',detail:`${r.semantics.columns.length} columns classified for decision analysis`,when:'Current session'},
    {event:'AI access',detail:'Provider requests are routed through the protected /api/chat endpoint',when:'On demand'},
  ];
  return <div className="v2-view"><PageHead eyebrow="Trust center" title="Privacy and workspace controls">Understand where information is processed, what is retained, and which enterprise controls require deployment configuration.</PageHead>
    <div className="v2-table-wrap" role="region" aria-label="Privacy and security controls" tabIndex={0}><table className="v2-table"><caption>Privacy and security controls</caption>
      <thead><tr><th scope="col">Control</th><th scope="col">What it does</th><th scope="col">Status</th></tr></thead>
      <tbody>{controls.map(c=><tr key={c.title}><th scope="row">{c.title}</th><td>{c.detail}</td><td className="read"><StateMark tone={c.tone} label={c.status}/></td></tr>)}</tbody></table></div>
    <section className="v2-op-sect"><h2>Current workspace</h2>
      <dl className="v2-op-kv"><div><dt>Active dataset</dt><dd>{r.source.fileName}</dd></div><div><dt>Saved project storage</dt><dd>{projectStorageLabel(access.role,access.loading)}</dd></div><div><dt>Current access level</dt><dd>{accessLevelLabel(access.role,access.loading)}</dd></div></dl>
      <div className="v2-op-form-foot"><p><strong>Clear operational preferences.</strong> Removes alert and report preferences stored by this browser. Saved analyses are managed separately in Analysis history.</p><button type="button" className="v2-op-btn is-danger" onClick={clearPreferences}>{cleared?'Preferences cleared':'Clear preferences'}</button></div></section>
    <section className="v2-op-sect"><h2>Activity and audit readiness</h2>
      <div className="v2-table-wrap" role="region" aria-label="Activity and audit readiness" tabIndex={0}><table className="v2-table"><caption className="sr-only">Recent activity relevant to audit readiness</caption>
        <thead><tr><th scope="col">Activity</th><th scope="col">Detail</th><th scope="col">When</th></tr></thead>
        <tbody>{activity.map(a=><tr key={a.event}><th scope="row">{a.event}</th><td className="v2-op-wrap">{a.detail}</td><td className="read"><span className="v2-tag">{a.when}</span></td></tr>)}</tbody></table></div></section>
  </div>;
}
