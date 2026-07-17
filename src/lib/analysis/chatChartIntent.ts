import type { PipelineResult } from "../../types/pipeline";
import type { ChartSpec } from "../../types/analysis";
import { buildBarChart } from "./buildChartSpecs";

export function parseChartTagsFromAI(aiText: string, p: PipelineResult): { cleanText: string; charts: ChartSpec[] } {
  const regex = /\[CHART:([a-zA-Z0-9_\-]+)\]/g;
  const charts: ChartSpec[] = [];
  let m; const ids:string[]=[];
  while ((m=regex.exec(aiText))!==null) ids.push(m[1]);
  ids.forEach(id=>{
    let f=p.analyses.find(a=>a.id===id);
    if(!f) f=p.analyses.find(a=>a.id.toLowerCase().includes(id.toLowerCase()));
    if(!f) f=p.analyses.find(a=>a.title.toLowerCase().includes(id.toLowerCase()));
    if(f) charts.push(f.chart);
  });
  return { cleanText: aiText.replace(regex,'').trim(), charts };
}

function fmt(v:number){ return Math.round(v).toLocaleString('en-GB'); }

function getMonthInfo(p: PipelineResult, monthName: string){
  const s=p.statistics.seasonality;
  const ts=p.statistics.timeSeries[0];
  const out:{ avg?: string; points: string[] }={ points: [] };
  if(s){
    const found=s.byMonthOfYear.find(x=>x.label.toLowerCase().startsWith(monthName.slice(0,3)));
    if(found) out.avg=`${found.label} avg £${fmt(found.value)} (${found.count} samples)`;
  }
  if(ts){
    ts.points.forEach(pt=>{
      if(pt.periodKey.toLowerCase().includes(monthName.slice(0,3)) || pt.label.toLowerCase().includes(monthName.slice(0,3))){
        out.points.push(`${pt.periodKey}=£${fmt(pt.value)}`);
      }
    });
  }
  return out;
}

export function localAnalysisFallback(userMsg: string, p: PipelineResult): { text: string; charts: ChartSpec[] } {
  const msg=userMsg.toLowerCase();
  const ts=p.statistics.timeSeries[0];
  const s=p.statistics.seasonality;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const mm=months.find(m=>msg.includes(m));

  if(mm && /(sales|revenue|amount)/.test(msg)){
    const info=getMonthInfo(p, mm);
    const chart=s ? buildBarChart(`${s.measureColumn} by Month`, s.byMonthOfYear, 'label','value','currency') : undefined;
    return { text: `${mm.toUpperCase()} from engines: ${info.avg || ''} ${info.points.join(', ')}`, charts: chart ? [chart as any] : [] };
  }
  if(/(revenue per month|monthly revenue|revenue.*month chart)/.test(msg)){
    const chart=ts ? buildBarChart(`Revenue by Month`, ts.points.slice(-12).map(pt=>({label:pt.label, value:Math.round(pt.value)})), 'label','value','currency') : undefined;
    return { text: `Monthly revenue ${ts?.points.length || 0} periods, total £${fmt(ts?.points.reduce((a,b)=>a+b.value,0)||0)}`, charts: chart ? [chart as any] : [] };
  }
  if(/(major risk|biggest risk)/.test(msg)){
    const r=p.decision.risks[0];
    return { text: r ? `Major risk: [${r.level}] ${r.title} — ${r.desc}` : 'No risks found', charts: [] };
  }
  if(/(improve.*business|recommendation)/.test(msg)){
    const recs=p.decision.recommendations.slice(0,3).map(x=>`• ${x.title}: ${x.desc}`).join('\n');
    return { text: `Improvements:\n${recs}`, charts: [] };
  }
  const best=p.analyses[0];
  return { text: `Analysed ${p.source.rowCount} rows, ${p.analyses.length} charts. Ask about March, risks, forecast.`, charts: best ? [best.chart] : [] };
}

export function detectChartIntent(): null { return null; }
export function detectChartIntentFallback(): null { return null; }
