import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, BrainCircuit, CircleDollarSign, Gauge, ShieldAlert, Target, TrendingUp } from "lucide-react";
import type { PipelineResult } from "../../types/pipeline";
import { getTimeGreeting } from "../../lib/time/greeting";
import { ExecutiveRevenue } from "./ExecutiveRevenue";
import { SkeletonBlock } from "./Skeleton";
import { fmtN, formatExecutiveCurrency } from "./format";
import { getRevenueView } from "./revenue";

export function PageOverview({ r }: { r: PipelineResult }) {
  const h = r.decision.health.total; const topRisk = r.decision.risks[0]; const topRec = r.decision.recommendations[0];
  const [section,setSection]=useState<'overview'|'revenue'>('overview');
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer)},[]);
  const greeting=getTimeGreeting(now);
  const dateLabel=new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(now);
  const healthLabel=h>=80?'Strong':h>=60?'Monitored':'Needs attention';
  const revenue=getRevenueView(r);
  const nextPeriod=revenue.revenueForecast?.holtNextPeriod??0;
  return (
    <div className="executive-overview">
      <header className="executive-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot"/> EXECUTIVE WORKSPACE</div>
          <h1>{greeting}<span>.</span></h1>
          <p>{dateLabel} · Your latest organisational signals are ready for review.</p>
        </div>
        <button className="executive-methodology">Decision methodology <ArrowUpRight size={14}/></button>
      </header>
      <nav className="executive-view-tabs" aria-label="Executive workspace views">
        <button className={section==='overview'?'is-active':''} onClick={()=>setSection('overview')}><Gauge size={14}/>Overview</button>
        <button className={section==='revenue'?'is-active':''} onClick={()=>setSection('revenue')}><CircleDollarSign size={14}/>Revenue</button>
      </nav>

      {section==='revenue'?<ExecutiveRevenue result={r}/>:<>
      <section className="executive-command-card">
        <div className="executive-command-main">
          <div className="executive-command-meta">
            <span className={`status-pill ${h >= 80 ? 'is-good' : h >= 60 ? 'is-watch' : 'is-risk'}`}><i/>{h >= 80 ? 'Business performing strongly' : h >= 60 ? 'Performance requires monitoring' : 'Management attention required'}</span>
            <span className="analysis-freshness"><Activity size={12}/> Live analysis</span>
          </div>
          <p className="executive-kicker">Today’s decision brief</p>
          <h2>{topRisk ? topRisk.title : 'Your business signals are ready to review.'}</h2>
          <p className="executive-command-copy">Verd.io reviewed {fmtN(r.source.rowCount)} records across {r.profile.columnCount} classified fields. {topRec ? `The recommended next move is to ${topRec.title.toLowerCase()}.` : 'No immediate intervention has been identified.'}</p>
          <div className="executive-ai-brief">
            <span><BrainCircuit size={17}/></span>
            <div>
              <div className="executive-ai-label">Verd.io intelligence {r.aiLoading?<small>Generating</small>:<small className="is-ready">Ready</small>}</div>
              {r.aiLoading?<SkeletonBlock lines={2}/>:<p>{r.aiInsights?.executiveSummary || 'AI analysis will appear here when the executive summary is available.'}</p>}
            </div>
          </div>
        </div>
        <aside className="executive-health">
          <div className="health-ring" style={{'--score': `${h * 3.6}deg`} as React.CSSProperties}><div><strong>{h}</strong><span>OUT OF 100</span></div></div>
          <p>Business health</p>
          <strong>{healthLabel}</strong>
          <small>Combined operational, quality and risk assessment</small>
        </aside>
      </section>

      <section className="executive-kpis" aria-label="Executive key performance indicators">
        <article><span className="executive-kpi-icon"><CircleDollarSign size={16}/></span><div><p>Recognised revenue</p><strong>{revenue.total?formatExecutiveCurrency(revenue.total):'—'}</strong><small>{revenue.revenueColumn?'Mapped revenue evidence':'Revenue field not detected'}</small></div></article>
        <article><span className="executive-kpi-icon"><TrendingUp size={16}/></span><div><p>Revenue momentum</p><strong>{revenue.series?`${revenue.changePct>=0?'+':''}${revenue.changePct.toFixed(1)}%`:'—'}</strong><small>Latest period movement</small></div></article>
        <article><span className="executive-kpi-icon"><BrainCircuit size={16}/></span><div><p>Next-period outlook</p><strong>{nextPeriod?formatExecutiveCurrency(nextPeriod):'—'}</strong><small>{nextPeriod?'Modelled base forecast':'Forecast not available'}</small></div></article>
        <article><span className="executive-kpi-icon"><ShieldAlert size={16}/></span><div><p>Active risks</p><strong>{r.decision.risks.length}</strong><small>{r.decision.risks.filter(risk=>risk.level==='high').length} high-priority signals</small></div></article>
      </section>

      <section className="executive-decisions">
        <article className="executive-decision-card is-priority">
          <div className="decision-card-heading"><span><Target size={16}/></span><p>Recommended action</p><em>Priority 01</em></div>
          <h3>{topRec?.title || 'No immediate recommendation'}</h3>
          <p>{topRec?.desc || 'Continue monitoring the current business signals.'}</p>
          <footer><span>Next best action</span><ArrowUpRight size={15}/></footer>
        </article>
        <article className="executive-decision-card is-risk">
          <div className="decision-card-heading"><span><ShieldAlert size={16}/></span><p>Risk requiring attention</p><em>Monitor</em></div>
          <h3>{topRisk?.title || 'No material risk identified'}</h3>
          <p>{topRisk?.desc || 'No critical risk is currently affecting the executive assessment.'}</p>
          <footer><span>Review supporting evidence</span><ArrowUpRight size={15}/></footer>
        </article>
      </section>
      </>}
    </div>
  );
}
