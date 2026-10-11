import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { PipelineResult } from "../../types/pipeline";
import type { EnrichedRecommendation } from "../../lib/decision/verdioDecisionEngine";
import { computeCategoryBreakdown } from "../../lib/analysis/categoryBreakdown";
import { bestColumnOfRole, primaryMeasureColumn } from "../../lib/analysis/pickColumns";
import { labelForMeasure } from "../../lib/labels";
import { buildMondayBrief, buildStory, CONFIDENCE_THRESHOLDS, formatters } from "../../lib/story";
import { compareUploads, takeSnapshot, type UploadSnapshot } from "../../lib/compare/uploadComparison";
import { getTimeGreeting } from "../../lib/time/greeting";
import { CannotShow, KpiTile, ShareBars, StackedSegmentBar, TrendChart, usableForecast } from "../charts/kit";
import { StoryStrip } from "../story/StoryStrip";
import { ExecutiveRevenue } from "./ExecutiveRevenue";
import { SkeletonBlock } from "./Skeleton";
import { StateMark } from "./StateMark";
import { WhatChanged } from "./WhatChanged";
import { fmtN } from "./format";
import { forecastAhead, moveReading, riskCounts, riskReading, segmentCounts, shareItems } from "./overviewModel";
import { getRevenueView, NO_EARLIER_PERIOD } from "./revenue";
import { healthReading, type Tone } from "./status";

type RevenueView = ReturnType<typeof getRevenueView>;
type Section = 'overview' | 'revenue';
const SECTIONS: Section[] = ['overview', 'revenue'];

const { formatCount, formatPounds } = formatters;

export function PageOverview({ r, previous = null }: { r: PipelineResult; previous?: UploadSnapshot | null }) {
  const h = r.decision.health.total; const topRisk = r.decision.risks[0]; const topRec = r.decision.recommendations[0];
  const [section,setSection]=useState<Section>('overview');
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer)},[]);
  const greeting=getTimeGreeting(now);
  const dateLabel=new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(now);
  const health=healthReading(h);
  const revenue=useMemo(()=>getRevenueView(r),[r]);
  const story=useMemo(()=>buildStory('overview',r),[r]);
  const brief=useMemo(()=>buildMondayBrief(r),[r]);
  const comparison=useMemo(()=>compareUploads(previous,takeSnapshot(r)),[previous,r]);
  const recConfidence=(topRec as Partial<EnrichedRecommendation>|undefined)?.confidence;
  const fileName=r.source.fileName;

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
        <button type="button" role="tab" id="v2-tab-overview" aria-selected={section==='overview'} aria-controls="v2-panel-overview" tabIndex={section==='overview'?0:-1} onKeyDown={onTabKeyDown} onClick={()=>setSection('overview')}>Overview</button>
        <button type="button" role="tab" id="v2-tab-revenue" aria-selected={section==='revenue'} aria-controls="v2-panel-revenue" tabIndex={section==='revenue'?0:-1} onKeyDown={onTabKeyDown} onClick={()=>setSection('revenue')}>Revenue</button>
      </div>

      {section==='revenue'
        ?<div role="tabpanel" id="v2-panel-revenue" aria-labelledby="v2-tab-revenue"><ExecutiveRevenue result={r}/></div>
        :<div role="tabpanel" id="v2-panel-overview" aria-labelledby="v2-tab-overview" className="v2-ov-body">
          <StoryStrip outcome={story} title="Story for this file" brief={brief}/>
          {comparison&&<WhatChanged comparison={comparison}/>}
          <KeyFigures r={r} view={revenue} healthLabel={health.label} healthTone={health.tone}/>
          <div className="v2-ov-row is-wide">
            <TrendPanel r={r} view={revenue}/>
            <RisksPanel r={r}/>
          </div>
          <div className="v2-ov-row">
            <SharesPanel r={r}/>
            <SegmentsPanel r={r}/>
          </div>
          <div className="v2-ov-row is-wide">
            <section className="v2-ov-panel" aria-labelledby="v2-ov-action-title">
              <h2 id="v2-ov-action-title" className="v2-ov-h">Recommended action</h2>
              <h3 className="v2-ov-action">{topRec?.title || 'No immediate recommendation'}</h3>
              <p className="v2-ov-copy">{topRec?.desc || 'Continue monitoring the current business signals.'}</p>
              <div className="v2-ov-ai" aria-busy={r.aiLoading}>
                <p className="v2-ov-label">AI summary · {r.aiLoading?'generating':'ready'}</p>
                {r.aiLoading?<SkeletonBlock lines={2}/>:<p>{r.aiInsights?.executiveSummary || 'AI analysis will appear here when the executive summary is available.'}</p>}
              </div>
            </section>
            <section className="v2-ov-panel" aria-labelledby="v2-ov-evidence-title">
              <h2 id="v2-ov-evidence-title" className="v2-ov-h">Evidence</h2>
              <ul className="v2-ov-evidence">
                <li>{fmtN(r.source.rowCount)} records reviewed<span className="v2-tag"><b>{fileName}</b> · {r.profile.columnCount} classified fields</span></li>
                {topRisk&&<li>Top risk rated {topRisk.level}{topRisk.sourceColumns.length>0&&<span className="v2-tag"><b>{topRisk.sourceColumns.join(', ')}</b> · risk detection</span>}</li>}
                {topRec&&<li>Top recommendation: {topRec.title}{(topRec.sourceColumns.length>0||typeof recConfidence==='number')&&<span className="v2-tag">{topRec.sourceColumns.length>0&&<b>{topRec.sourceColumns.join(', ')}</b>}{topRec.sourceColumns.length>0&&typeof recConfidence==='number'&&' · '}{typeof recConfidence==='number'&&`${Math.round(recConfidence*100)}% data reliability`}</span>}</li>}
                {r.organization&&<li>{r.organization.datasets.length} connected datasets<span className="v2-tag"><b>{r.organization.datasets.map(dataset=>dataset.fileName).join(', ')}</b></span></li>}
              </ul>
            </section>
          </div>
          <p className="v2-ov-legend"><strong>Reading the states:</strong> each state has a word and a shape as well as a colour. ✓ ok, ● watch, ▲ risk.</p>
        </div>}
    </div>
  );
}

/* ── Key figures: six tiles, every value read from the pipeline ── */

function KeyFigures({ r, view, healthLabel, healthTone }: { r: PipelineResult; view: RevenueView; healthLabel: string; healthTone: Tone }) {
  const series = view.series;
  const points = series?.points ?? [];
  const latest = points.at(-1);
  const move = moveReading(view.changePct, points.at(-2)?.label);
  const measureLabel = series ? labelForMeasure(series.measureColumn) : 'Revenue';

  const forecast = view.revenueForecast;
  const first = forecast?.points[0];
  const forecastUsable = !!forecast && !!first && forecast.holtNextPeriod > 0
    && usableForecast(forecast.points.map(p => ({ label: p.periodLabel, value: p.value }))).length > 0;
  const minMonths = CONFIDENCE_THRESHOLDS.minMonthsForForecast;

  const seg = r.ml.segmentation && r.ml.segmentation.segments.length ? r.ml.segmentation : null;
  const counts = seg ? segmentCounts(seg.segments) : [];
  const lapsed = counts.filter(item => item.key === 'atRisk' || item.key === 'lost');
  const quality = r.quality.overallScore;
  const salesKnown = !!view.revenueColumn || view.connectedRevenue !== undefined;

  return (
    <section aria-labelledby="v2-ov-figures-title">
      <h2 id="v2-ov-figures-title" className="sr-only">Key figures</h2>
      <ul className="v2-ov-tiles">
        <li className="v2-ov-tile">
          <KpiTile label="Business health" value={<>{formatCount(r.decision.health.total)}<span className="v2-ov-unit"> /100</span></>}
            sub={<><StateMark tone={healthTone} label={healthLabel}/><span className="v2-tag v2-ov-src">combined operational, quality and risk assessment</span></>}/>
        </li>
        <li className="v2-ov-tile">
          <KpiTile label="Total sales in your file" value={salesKnown && view.total ? formatPounds(view.total) : 'Not available'}
            sub={<span className="v2-tag v2-ov-src">{view.connectedRevenue!==undefined?<><b>connected sales source</b> · reconciled across the connected source</>:view.revenueColumn?<><b>{view.revenueColumn}</b> · mapped sales field</>:'Sales field not detected'}</span>}/>
        </li>
        <li className="v2-ov-tile">
          <KpiTile label={latest ? `Sales in ${latest.label}` : 'Latest month sales'} value={latest ? formatPounds(latest.value) : 'Not available'}
            spark={points.slice(-12).map(p => ({ label: p.label, value: p.value }))} sparkName={`Monthly ${measureLabel.toLowerCase()}, latest 12 months`}
            sub={latest
              ? (move ? <><StateMark tone={move.tone} label={move.word}/> <span className="v2-ov-vs">{move.vs}</span></> : <span className="v2-ov-vs">{NO_EARLIER_PERIOD}</span>)
              : <span className="v2-ov-vs">No date column paired with a sales amount</span>}/>
        </li>
        <li className="v2-ov-tile">
          <KpiTile label={forecastUsable && first ? `Next month, ${first.periodLabel}` : 'Next month'} value={forecastUsable && forecast ? formatPounds(forecast.holtNextPeriod) : 'Not available'}
            sub={forecastUsable && first && forecast
              ? <><StateMark tone="watch" label={`Estimate, ${forecast.scenario} case`}/><span className="v2-tag v2-ov-src">Planning range {formatPounds(first.low)} to {formatPounds(first.high)}</span></>
              : <span className="v2-ov-vs">A forecast needs at least {minMonths} months of dated sales. {points.length > 0 ? `Your file has ${points.length}.` : 'Your file has no dated sales series.'}</span>}/>
        </li>
        <li className="v2-ov-tile">
          <KpiTile label="Customers" value={seg ? formatCount(seg.segments.length) : 'Not available'}
            sub={seg
              ? (lapsed.length > 0
                ? <><StateMark tone="watch" label="Watch"/> <span className="v2-ov-vs">{lapsed.map(item => `${formatCount(item.value)} ${item.label.toLowerCase()}`).join(', ')}</span></>
                : <StateMark tone="ok" label="None at risk"/>)
              : <span className="v2-ov-vs">Customer analysis needs a customer, date and amount column.</span>}/>
        </li>
        <li className="v2-ov-tile">
          <KpiTile label="Data quality" value={<>{formatCount(quality)}<span className="v2-ov-unit"> /100</span></>}
            sub={<span className="v2-tag v2-ov-src"><b>quality check</b> · completeness, validity, consistency</span>}/>
        </li>
      </ul>
    </section>
  );
}

/* ── Sales trend and forecast ── */

function TrendPanel({ r, view }: { r: PipelineResult; view: RevenueView }) {
  const series = view.series;
  const measureLabel = series ? labelForMeasure(series.measureColumn) : 'Revenue';
  const actual = useMemo(() => series?.points.map(p => ({ label: p.label, value: p.value })) ?? [], [series]);
  const ahead = useMemo(() => forecastAhead(series?.measureColumn, r.ml.forecast), [series, r.ml.forecast]);
  const aheadUsable = usableForecast(ahead.map(p => ({ label: p.label, value: p.value }))).length > 0;
  const first = actual[0];
  const last = actual.at(-1);
  const subtitle = first && last
    ? `Monthly ${measureLabel.toLowerCase()}, ${first.label} to ${last.label}${aheadUsable ? `, with the next ${formatCount(ahead.length)} months and their planning range` : ''}`
    : undefined;

  return (
    <section className="v2-ov-panel" aria-labelledby="v2-ov-trend-title">
      <h2 id="v2-ov-trend-title" className="v2-ov-h">Sales trend and forecast</h2>
      {series
        ? <>
          <TrendChart name={`Monthly ${measureLabel.toLowerCase()}`} actual={actual} forecast={ahead} format="currency" valueLabel={measureLabel} subtitle={subtitle}/>
          {!aheadUsable && <p className="v2-ov-note">No forecast is shown: it needs at least {CONFIDENCE_THRESHOLDS.minMonthsForForecast} months of dated sales, and your file has {actual.length}.</p>}
        </>
        : <CannotShow message="Cannot show this chart: the file has no date paired with a sales amount. Map a date column and a sales amount in Data Hub."/>}
    </section>
  );
}

/* ── Risks ── */

function RisksPanel({ r }: { r: PipelineResult }) {
  const risks = r.decision.risks;
  const counts = riskCounts(risks);
  const unavailable = r.capabilities.capabilities.find(item => !item.available)?.reason;
  return (
    <section className="v2-ov-panel" aria-labelledby="v2-ov-risks-title">
      <h2 id="v2-ov-risks-title" className="v2-ov-h">Risks</h2>
      <p className="v2-ov-sub">{counts.total > 0
        ? `${formatCount(counts.total)} found: ${formatCount(counts.high)} high, ${formatCount(counts.medium)} medium, ${formatCount(counts.low)} low. Most serious first.`
        : unavailable ? `The risk checks could not run on this file: ${unavailable.replace(/\.$/, '')}.` : 'No risks were found in this file.'}</p>
      {counts.total > 0 && (
        <ul className="v2-ov-risks">
          {risks.map((risk, i) => {
            const reading = riskReading(risk.level);
            return (
              <li key={`${i}-${risk.title}`}>
                <StateMark tone={reading.tone} label={reading.label}/>
                <h3>{risk.title}</h3>
                <p>{risk.desc}</p>
                {risk.sourceColumns.length > 0 && <p className="v2-tag"><b>{risk.sourceColumns.join(', ')}</b> · risk detection</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Where sales come from ── */

function SharesPanel({ r }: { r: PipelineResult }) {
  // The category and amount the concentration risk was computed on; else the product column the Products page uses.
  const concentration = r.capabilities.capabilities.find(item => item.type === 'concentration_analysis' && item.available && item.columns.length >= 2);
  const measureCol = concentration ? concentration.columns[1] : primaryMeasureColumn(r.semantics.columns, r.engineeredRows);
  const productCol = concentration ? concentration.columns[0] : bestColumnOfRole(r.semantics.columns, 'product');
  const rows = useMemo(
    () => (measureCol && productCol ? computeCategoryBreakdown(r.engineeredRows, productCol, measureCol) : []),
    [r.engineeredRows, measureCol, productCol],
  );
  const items = useMemo(() => shareItems(rows.map(row => ({ label: row.label, value: row.value }))), [rows]);
  const measureLabel = measureCol ? labelForMeasure(measureCol) : '';
  const quantity = !!measureCol && r.semantics.columns.find(c => c.columnName === measureCol)?.businessRole === 'quantity';

  return (
    <section className="v2-ov-panel" aria-labelledby="v2-ov-shares-title">
      <h2 id="v2-ov-shares-title" className="v2-ov-h">Where sales come from</h2>
      {measureCol && productCol && items.length > 0
        ? <ShareBars name={`Share of ${measureLabel.toLowerCase()} by ${productCol}`} items={items} format={quantity ? 'count' : 'currency'}
            categoryLabel={productCol} valueLabel={measureLabel} subtitle={`${measureLabel} by ${productCol}, ${formatCount(rows.length)} ${rows.length === 1 ? 'value' : 'values'}`}/>
        : <CannotShow message="Cannot show this chart: no product column and sales amount column were found. Map them in Data Hub."/>}
    </section>
  );
}

/* ── Customer segments ── */

function SegmentsPanel({ r }: { r: PipelineResult }) {
  const seg = r.ml.segmentation;
  const counts = useMemo(() => (seg ? segmentCounts(seg.segments) : []), [seg]);
  return (
    <section className="v2-ov-panel" aria-labelledby="v2-ov-segments-title">
      <h2 id="v2-ov-segments-title" className="v2-ov-h">Customer segments</h2>
      {seg && counts.length > 0
        ? <StackedSegmentBar name="Customer segments" segments={counts.map(item => ({ label: item.label, value: item.value }))}
            categoryLabel="Segment" valueLabel="Customers" subtitle={`${formatCount(seg.segments.length)} customers in ${seg.customerColumn}, by spend, orders and recent activity`}/>
        : <CannotShow message="Cannot show this chart: customer analysis needs a customer, date and amount column. Map them in Data Hub."/>}
    </section>
  );
}
