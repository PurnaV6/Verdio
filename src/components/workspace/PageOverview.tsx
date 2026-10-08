import { useEffect, useState, type KeyboardEvent } from "react";
import { CircleDollarSign, Gauge } from "lucide-react";
import type { PipelineResult } from "../../types/pipeline";
import type { EnrichedRecommendation } from "../../lib/decision/verdioDecisionEngine";
import { getTimeGreeting } from "../../lib/time/greeting";
import { ExecutiveRevenue } from "./ExecutiveRevenue";
import { SkeletonBlock } from "./Skeleton";
import { StateMark } from "./StateMark";
import { fmtN, formatExecutiveCurrency } from "./format";
import { getRevenueView } from "./revenue";
import { healthReading } from "./status";

type Section = 'overview' | 'revenue';
const SECTIONS: Section[] = ['overview', 'revenue'];

export function PageOverview({ r }: { r: PipelineResult }) {
  const h = r.decision.health.total; const topRisk = r.decision.risks[0]; const topRec = r.decision.recommendations[0];
  const [section,setSection]=useState<Section>('overview');
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer)},[]);
  const greeting=getTimeGreeting(now);
  const dateLabel=new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(now);
  const health=healthReading(h);
  const revenue=getRevenueView(r);
  const nextPeriod=revenue.revenueForecast?.holtNextPeriod??0;
  const highRisks=r.decision.risks.filter(risk=>risk.level==='high').length;
  const recConfidence=(topRec as Partial<EnrichedRecommendation>|undefined)?.confidence;
  const fileName=r.source.fileName;
  const moveKnown=Boolean(revenue.series);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const i=SECTIONS.indexOf(section);
    const next=e.key==='ArrowRight'?SECTIONS[(i+1)%SECTIONS.length]:e.key==='ArrowLeft'?SECTIONS[(i+SECTIONS.length-1)%SECTIONS.length]:e.key==='Home'?SECTIONS[0]:e.key==='End'?SECTIONS[SECTIONS.length-1]:null;
    if(!next)return;
    e.preventDefault(); setSection(next);
    document.getElementById(`v2-tab-${next}`)?.focus();
  }

  return (
    <div className="v2-view">
      <header className="v2-view-head">
        <p className="v2-eyebrow">Executive workspace</p>
        <h1>{greeting}<span>.</span></h1>
        <p>{dateLabel} · Your latest organisational signals are ready for review.</p>
      </header>
      <div className="v2-tabs" role="tablist" aria-label="Executive workspace views">
        <button type="button" role="tab" id="v2-tab-overview" aria-selected={section==='overview'} aria-controls="v2-panel-overview" tabIndex={section==='overview'?0:-1} onKeyDown={onTabKeyDown} onClick={()=>setSection('overview')}><Gauge size={14} aria-hidden="true"/>Overview</button>
        <button type="button" role="tab" id="v2-tab-revenue" aria-selected={section==='revenue'} aria-controls="v2-panel-revenue" tabIndex={section==='revenue'?0:-1} onKeyDown={onTabKeyDown} onClick={()=>setSection('revenue')}><CircleDollarSign size={14} aria-hidden="true"/>Revenue</button>
      </div>

      {section==='revenue'?<div role="tabpanel" id="v2-panel-revenue" aria-labelledby="v2-tab-revenue"><ExecutiveRevenue result={r}/></div>:<div role="tabpanel" id="v2-panel-overview" aria-labelledby="v2-tab-overview">
      <section className="v2-priority" aria-labelledby="v2-priority-title">
        <div>
          <p className="v2-eyebrow">Today’s decision brief</p>
          <h2 id="v2-priority-title">{topRisk ? topRisk.title : 'Your business signals are ready to review.'}</h2>
          <p className="v2-lede">{topRisk?.desc || 'No critical risk is currently affecting the executive assessment.'}</p>
          <p className="v2-lede">Verd.io reviewed {fmtN(r.source.rowCount)} records across {r.profile.columnCount} classified fields. {topRec ? `The recommended next move is to ${topRec.title.toLowerCase()}.` : 'No immediate intervention has been identified.'}</p>
          <div className="v2-action">
            <p className="v2-eyebrow">Priority 01 · Recommended action</p>
            <h3>{topRec?.title || 'No immediate recommendation'}</h3>
            <p>{topRec?.desc || 'Continue monitoring the current business signals.'}</p>
          </div>
          <div className="v2-ai">
            <p className="v2-ai-label">Verd.io intelligence · {r.aiLoading?'Generating':'Ready'}</p>
            {r.aiLoading?<SkeletonBlock lines={2}/>:<p>{r.aiInsights?.executiveSummary || 'AI analysis will appear here when the executive summary is available.'}</p>}
          </div>
        </div>
        <aside className="v2-evidence" aria-label="Evidence">
          <h3>Evidence</h3>
          <p className="v2-ev">{fmtN(r.source.rowCount)} records reviewed<span className="v2-tag"><b>{fileName}</b> · {r.profile.columnCount} classified fields</span></p>
          {topRisk&&<p className="v2-ev">Top risk rated {topRisk.level}{topRisk.sourceColumns.length>0&&<span className="v2-tag"><b>{topRisk.sourceColumns.join(', ')}</b> · risk detection</span>}</p>}
          {topRec&&<p className="v2-ev">Top recommendation: {topRec.title}{(topRec.sourceColumns.length>0||typeof recConfidence==='number')&&<span className="v2-tag">{topRec.sourceColumns.length>0&&<b>{topRec.sourceColumns.join(', ')}</b>}{topRec.sourceColumns.length>0&&typeof recConfidence==='number'&&' · '}{typeof recConfidence==='number'&&`${Math.round(recConfidence*100)}% confidence`}</span>}</p>}
          <p className="v2-ev">Data quality {r.quality.overallScore} / 100<span className="v2-tag"><b>quality check</b> · completeness, validity, consistency</span></p>
          {r.organization&&<p className="v2-ev">{r.organization.datasets.length} connected datasets<span className="v2-tag"><b>{r.organization.datasets.map(dataset=>dataset.fileName).join(', ')}</b></span></p>}
        </aside>
      </section>

      <div className="v2-table-wrap">
        <table className="v2-table">
          <caption>Headline figures</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col" className="num">Value</th><th scope="col">Reading</th><th scope="col">Source</th></tr></thead>
          <tbody>
            <tr><th scope="row">Business health</th><td className="num">{h} / 100</td><td className="read"><span className="v2-bar" aria-hidden="true"><i style={{width:`${h}%`}}/></span><StateMark tone={health.tone} label={health.label}/></td><td className="v2-tag">combined operational, quality and risk assessment</td></tr>
            <tr><th scope="row">Data quality</th><td className="num">{r.quality.overallScore} / 100</td><td className="read"><span className="v2-bar" aria-hidden="true"><i style={{width:`${r.quality.overallScore}%`}}/></span></td><td className="v2-tag"><b>quality check</b> · completeness, validity, consistency</td></tr>
            <tr><th scope="row">Recognised revenue</th><td className="num">{revenue.total?formatExecutiveCurrency(revenue.total):'—'}</td><td className="read"><span className="v2-none" aria-hidden="true">—</span><span className="sr-only">Not rated</span></td><td className="v2-tag">{revenue.revenueColumn?<><b>{revenue.revenueColumn}</b> · mapped revenue evidence</>:'Revenue field not detected'}</td></tr>
            <tr><th scope="row">Revenue momentum</th><td className="num">{moveKnown?`${revenue.changePct>=0?'+':''}${revenue.changePct.toFixed(1)}%`:'—'}</td><td className="read">{moveKnown?<StateMark tone={revenue.changePct<0?'watch':'ok'} label={revenue.changePct>0?'Rising':revenue.changePct<0?'Declining':'Flat'}/>:<><span className="v2-none" aria-hidden="true">—</span><span className="sr-only">Not rated</span></>}</td><td className="v2-tag">{moveKnown?<><b>{revenue.series?.measureColumn}</b> · latest period movement</>:'No dated revenue series'}</td></tr>
            <tr><th scope="row">Next-period outlook</th><td className="num">{nextPeriod?formatExecutiveCurrency(nextPeriod):'—'}</td><td className="read"><span className="v2-none" aria-hidden="true">—</span><span className="sr-only">Not rated</span></td><td className="v2-tag">{nextPeriod?<><b>{revenue.revenueForecast?.measureColumn}</b> · modelled base forecast</>:'Forecast not available'}</td></tr>
            <tr><th scope="row">Active risks</th><td className="num">{r.decision.risks.length}</td><td className="read">{highRisks>0?<StateMark tone="risk" label={`${highRisks} high-priority`}/>:r.decision.risks.length>0?<StateMark tone="watch" label="Monitor"/>:<StateMark tone="ok" label="None active"/>}</td><td className="v2-tag"><b>risk detection</b> · {highRisks} high-priority signals</td></tr>
          </tbody>
        </table>
      </div>
      <p className="v2-legend"><strong>Reading the states:</strong> each state has a word and a shape as well as a colour — ✓ ok, ● watch, ▲ risk.</p>
      </div>}
    </div>
  );
}
