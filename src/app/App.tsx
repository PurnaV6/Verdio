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
  RefreshCw, CheckCircle, Layers, TrendingUp, Users, Package, Activity
} from "lucide-react";
import { saveToHistory, loadHistory } from "../lib/history/historyStore";
import { openReport } from "../lib/export/reportGenerator";
import { useAuth, PasswordGateScreen } from "../lib/auth/AuthContext";
import { getSupabase } from "../lib/auth/supabaseClient";

const fmtN = (n: number) => Math.round(n).toLocaleString('en-GB');

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
  async function handleFile(file: File) {
    setError(''); setLoading(true);
    setStage('Parsing file...'); await new Promise(r => setTimeout(r, 30));
    setStage('Profiling, cleaning and detecting columns...'); await new Promise(r => setTimeout(r, 30));
    setStage('Running statistics and ML models...');
    const outcome = await runDataPipeline(file);
    setLoading(false);
    if (!outcome.ok) { setError((outcome as any).error); return; }
    onLoaded(outcome.result);
  }
  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-8">
      <div className="w-full max-w-[560px] bg-white rounded-[24px] border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-10 text-center">
        <div className="mx-auto mb-6 h-14 w-14 rounded-[14px] bg-indigo-900 flex items-center justify-center shadow-lg"><span className="text-white font-black text-xl">V</span></div>
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Verdio</h1>
        <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 mt-1 mb-4">ADAPTIVE DATA INTELLIGENCE</p>
        <p className="text-slate-500 text-[13px] leading-6 mb-8">Upload any business dataset. Verdio profiles it, understands columns, builds forecast, risks and recommendations.</p>
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }} onClick={() => document.getElementById('fi')?.click()}
          className={`cursor-pointer rounded-[16px] border-2 border-dashed p-10 transition-all ${dragging ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white'}`}>
          <input id="fi" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          {loading ? <div className="flex flex-col items-center gap-3"><div className="h-8 w-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /><p className="text-sm text-slate-600 font-medium">{stage}</p></div> :
            <><p className="text-2xl mb-2">📁</p><p className="font-semibold text-slate-900 text-sm">Drag and drop your file</p><p className="mt-1 text-[12px] text-slate-500">or click to browse — CSV, XLSX, XLS</p></>}
        </div>
        {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  );
}

const PAGES = [
  { id: 'overview', label: 'Executive Brief', icon: Home },
  { id: 'advisor', label: 'Verdio Advisor', icon: Sparkles, badge: 'AI' },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp },
  { id: 'analyses', label: 'Analyses', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'seasonality', label: 'Seasonality', icon: Activity },
  { id: 'health', label: 'Health Score', icon: CheckCircle },
  { id: 'risks', label: 'Risk Detection', icon: ShieldAlert },
  { id: 'recs', label: 'Recommendations', icon: Brain },
  { id: 'products', label: 'Products & Markets', icon: Package },
  { id: 'profile', label: 'Data Understanding', icon: Layers },
  { id: 'quality', label: 'Data Quality', icon: Database },
];

function Sidebar({ page, setPage, result, onReset }: { page: string; setPage: (p: string) => void; result: PipelineResult; onReset: () => void }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[260px] bg-white border-r border-slate-200 flex flex-col z-50">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-[10px] bg-indigo-900 flex items-center justify-center font-black text-white text-sm">V</div>
          <div><div className="font-bold text-slate-900 text-[14px]">Verdio</div><div className="text-[10px] text-slate-400 tracking-widest font-medium">ADAPTIVE INTELLIGENCE</div></div>
        </div>
      </div>
      <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
        {PAGES.map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => setPage(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium text-left ${page === id ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
            <Icon size={16} className={page === id ? 'text-white' : 'text-slate-400'} />
            <span className="flex-1">{label}</span>
            {badge && <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${page === id ? 'bg-white text-indigo-900' : 'bg-amber-400 text-slate-900'}`}>{badge}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3 space-y-2 border-t border-slate-100">
        <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold text-slate-400 tracking-widest">BUSINESS HEALTH</p>
          <div className="flex items-baseline gap-1 mt-1"><span className="text-xl font-black text-slate-900">{result.decision.health.total}</span><span className="text-xs text-slate-400">/100</span></div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-indigo-900" style={{ width: `${result.decision.health.total}%` }} /></div>
        </div>
        <div className="rounded-[12px] border border-slate-200 bg-amber-50/60 p-3">
          <p className="text-[10px] font-bold text-slate-500 tracking-widest">DATA QUALITY</p>
          <div className="flex items-baseline gap-1 mt-1"><span className="text-xl font-black text-slate-900">{result.quality.overallScore}</span><span className="text-xs text-slate-500">/100</span></div>
        </div>
      </div>
      <div className="p-3"><button onClick={onReset} className="w-full py-2.5 rounded-[10px] bg-slate-900 text-white text-xs font-semibold hover:bg-black">↑ Upload New File</button></div>
    </aside>
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

function PageOverview({ r }: { r: PipelineResult }) {
  const h = r.decision.health.total; const topRisk = r.decision.risks[0]; const topRec = r.decision.recommendations[0];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[16px] border border-slate-200 p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-900 via-indigo-600 to-amber-400" />
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 border ${h >= 80 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : h >= 60 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-800 border-red-200'}`}>{h >= 80 ? 'Healthy and Stable' : h >= 60 ? 'Performing with Risks' : 'Attention Required'} • {h}/100</span>
            <h2 className="text-[20px] font-bold text-slate-900 leading-snug mb-2">{topRisk ? `${topRisk.title} requires attention.` : 'Data analysed. Review your decision brief below.'}</h2>
            <p className="text-slate-500 text-[13px] leading-6">Verdio analysed {fmtN(r.source.rowCount)} rows across {r.profile.columnCount} columns from "{r.source.fileName}". {r.capabilities.available.length} of {r.capabilities.capabilities.length} analyses available, quality {r.quality.overallScore}/100.{topRec ? ` Top action: ${topRec.title.toLowerCase()}.` : ''}</p>
          </div>
          <div className="bg-slate-900 rounded-[14px] p-4 text-center min-w-[110px]"><p className="text-[10px] text-slate-400 font-bold tracking-widest">HEALTH</p><p className="text-4xl font-black text-white mt-1">{h}</p></div>
        </div>
      </div>
      <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3"><Brain size={16} className="text-indigo-700" /><p className="text-[11px] font-bold tracking-widest text-slate-500">AI EXECUTIVE SUMMARY</p>{r.aiLoading ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Generating</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">AI Generated</span>}</div>
        {r.aiLoading ? <SkeletonBlock lines={3} /> : <p className="text-[13px] text-slate-600 leading-6">{r.aiInsights?.executiveSummary}</p>}
      </div>
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Rows Analysed" value={fmtN(r.source.rowCount)} sub={`${r.profile.columnCount} columns`} />
        <MetricCard label="Data Quality" value={`${r.quality.overallScore}/100`} sub={r.quality.overallScore >= 80 ? 'Excellent' : 'Good'} tone={r.quality.overallScore >= 80 ? 'green' : r.quality.overallScore >= 60 ? 'amber' : 'red'} />
        <MetricCard label="Analyses Available" value={`${r.capabilities.available.length}/${r.capabilities.capabilities.length}`} sub="Capability-gated" />
        <MetricCard label="Health Score" value={`${h}/100`} sub={h >= 80 ? 'Strong' : 'Moderate'} tone={h >= 80 ? 'green' : h >= 60 ? 'amber' : 'red'} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm border-l-4 border-l-indigo-900"><p className="text-[10px] font-bold tracking-widest text-indigo-900 mb-1">TOP PRIORITY</p><p className="font-bold text-slate-900 text-[14px] leading-snug">{topRec?.title || 'No recommendations'}</p><p className="text-xs text-slate-500 leading-5 mt-2">{topRec?.desc}</p></div>
        <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm border-l-4 border-l-amber-500"><p className="text-[10px] font-bold tracking-widest text-amber-600 mb-1">HIGHEST RISK</p><p className="font-bold text-slate-900 text-[14px] leading-snug">{topRisk?.title || 'No critical risk'}</p><p className="text-xs text-slate-500 leading-5 mt-2">{topRisk?.desc}</p></div>
      </div>
      <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm"><p className="text-[11px] font-bold tracking-widest text-slate-500 mb-3">KEY INSIGHTS</p>{r.aiLoading ? <SkeletonBlock lines={4} /> : <div className="space-y-2.5">{(r.aiInsights?.keyInsights || []).map((text, i) => <div key={i} className="flex items-start gap-2.5"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-900 text-white mt-0.5">AI</span><p className="text-[13px] text-slate-600 leading-5">{text}</p></div>)}</div>}</div>
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
      <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm space-y-3">{recs.map((rec,i)=>{ const ai=findRecommendation(r.aiInsights, rec.title, i); return <div key={i} className="flex gap-3 p-4 rounded-xl border border-slate-100"><div className="w-8 h-8 rounded-full bg-indigo-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</div><div><p className="font-bold text-[13px] text-slate-900">{rec.title}</p>{r.aiLoading?<SkeletonLine width="70%"/>:ai?<p className="text-xs text-slate-600 mt-1 leading-5">{ai.action}</p>:<p className="text-xs text-slate-500 mt-1">{rec.desc}</p>}{rec.financialImpact && <div className="mt-2 flex gap-2 text-[11px]"><span className="px-2 py-0.5 rounded-full bg-slate-100 border">£{rec.financialImpact.estimatedValue.toLocaleString()} impact</span><span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">{Math.round(rec.confidence*100)}% conf</span></div>}</div></div>; })}</div>
    </div>
  );
}

function PageDataProfile({ r }: { r: PipelineResult }) { return <div className="bg-white rounded-[16px] border border-slate-200 p-5 shadow-sm overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-slate-100">{['Column','Type','Role','Conf'].map(h=><th key={h} className="pb-2 text-[10px] text-slate-400 uppercase">{h}</th>)}</tr></thead><tbody>{r.semantics.columns.map(c=><tr key={c.columnName} className="border-t border-slate-100"><td className="py-2 font-medium">{c.columnName}</td><td className="text-slate-500">{c.dataType}</td><td><span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">{c.businessRole}</span></td><td className="text-slate-600">{Math.round(c.confidence*100)}%</td></tr>)}</tbody></table></div>; }
function PageQuality({ r }: { r: PipelineResult }) { return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[{l:'Overall',v:r.quality.overallScore},{l:'Completeness',v:r.quality.completenessScore},{l:'Validity',v:r.quality.validityScore},{l:'Consistency',v:r.quality.consistencyScore}].map(s=><div key={s.l} className="bg-white rounded-[16px] border border-slate-200 p-4 shadow-sm"><p className="text-[10px] font-bold text-slate-400 tracking-widest">{s.l.toUpperCase()}</p><p className="text-2xl font-black mt-1 text-slate-900">{s.v}</p></div>)}</div>; }

function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[] }[]>([{ role: 'ai', text: `Full analysis loaded — ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100.` }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const PROXY = '/api/chat'; const context = buildAdvisorContext(r);
  async function send() {
    if (!input.trim()) return; const userMsg = input.trim(); setInput(''); setMessages(m => [...m, { role: 'user', text: userMsg }]); setLoading(true);
    try {
      const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: context }, { role: 'user', content: userMsg }], max_tokens: 700 }) });
      const data = await res.json(); const txt = data.choices?.[0]?.message?.content; if (!txt) throw new Error('empty');
      const { cleanText, charts } = parseChartTagsFromAI(txt, r); setMessages(m => [...m, { role: 'ai', text: cleanText, charts }]);
    } catch (e: any) { const fb = localAnalysisFallback(userMsg, r); setMessages(m => [...m, { role: 'ai', text: fb.text, charts: fb.charts }]); }
    setLoading(false);
  }
  return <div className="bg-white rounded-[16px] border border-slate-200 shadow-sm p-4 flex flex-col h-[70vh]"><div className="flex-1 overflow-auto space-y-3 pr-1">{messages.map((msg,i)=><div key={i} className={`flex ${msg.role==='user'?'justify-end':''}`}><div className={`max-w-[85%] px-4 py-2.5 rounded-[14px] text-[13px] leading-6 whitespace-pre-wrap ${msg.role==='user'?'bg-slate-900 text-white':'bg-slate-50 border border-slate-200 text-slate-800'}`}>{msg.text}{msg.charts?.map((c,j)=><div key={j} className="mt-3 bg-white border rounded-xl p-2"><ChartRenderer chart={c} /></div>)}</div></div>)}{loading && <div className="text-xs text-slate-500">Thinking...</div>}</div><div className="flex gap-2 mt-3"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} className="flex-1 px-4 py-2.5 rounded-full bg-slate-50 border border-slate-200 text-sm outline-none focus:bg-white focus:border-indigo-400" placeholder="Ask March sales, forecast..." /><button onClick={send} className="px-5 py-2.5 rounded-full bg-indigo-900 text-white text-sm font-bold">Send</button></div></div>;
}

export default function App() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [page, setPage] = useState('overview');
  const { user, loading: authLoading, isEnabled } = useAuth();
  const reset = useCallback(() => { setResult(null); setPage('overview'); }, []);
  useEffect(() => { if (!result || !result.aiLoading) return; let cancelled=false; generateAIInsights(result).then(ai=>{ if(!cancelled) setResult(prev=>prev?{...prev, aiInsights: ai, aiLoading:false}:prev); }); return()=>{cancelled=true;}; }, [result?.aiLoading]);
  useEffect(() => { if (result && !result.aiLoading) saveToHistory(result); }, [result]);
  if (authLoading) return <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center"><div className="h-8 w-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  if (isEnabled && !user) return <PasswordGateScreen />;
  if (!result) return <UploadScreen onLoaded={r => { setResult(r); setPage('overview'); }} />;
  const titles: Record<string, string> = { overview: 'Executive Decision Brief', advisor: 'Verdio Advisor', forecast: 'Forecast', analyses: 'Analyses', customers: 'Customer Intelligence', seasonality: 'Seasonality', health: 'Business Health', risks: 'Risk Detection', recs: 'Recommendations', products: 'Products & Markets', profile: 'Data Understanding', quality: 'Data Quality' };
  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <Sidebar page={page} setPage={setPage} result={result} onReset={reset} />
      <div className="ml-[260px]">
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-6 h-[60px] flex items-center justify-between">
          <div><p className="text-[13px] font-bold text-slate-900">{titles[page]}</p><p className="text-[11px] text-slate-500">{fmtN(result.source.rowCount)} rows · {result.profile.columnCount} cols · Health {result.decision.health.total} · Quality {result.quality.overallScore}</p></div>
          <div className="flex items-center gap-2"><button onClick={() => result && openReport(result)} className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-semibold bg-white hover:bg-slate-50">Export PDF</button><button onClick={()=>{ const h=loadHistory(); alert(`History: ${h.length}`); }} className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-semibold bg-white">History ({typeof window !== 'undefined' ? loadHistory().length : 0})</button><span className="text-[11px] text-slate-500 hidden md:block max-w-[140px] truncate">{user?.email}</span><button onClick={async()=>{ const sb=getSupabase(); if(sb) await sb.auth.signOut(); }} className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-semibold bg-white">Sign out</button><button onClick={reset} className="px-3 py-1.5 rounded-full bg-indigo-900 text-white text-[11px] font-bold flex items-center gap-1"><RefreshCw size={12}/> New File</button></div>
        </div>
        <main className="p-6 max-w-[1400px]">{page==='overview'&&<PageOverview r={result} />}{page==='advisor'&&<PageAdvisor r={result} />}{page==='forecast'&&<PageForecast r={result} />}{page==='analyses'&&<PageAnalyses r={result} />}{page==='customers'&&<PageCustomers r={result} />}{page==='seasonality'&&<PageSeasonality r={result} />}{page==='health'&&<PageHealth r={result} />}{page==='risks'&&<PageRisks r={result} />}{page==='recs'&&<PageRecs r={result} />}{page==='products'&&<PageProducts r={result} />}{page==='profile'&&<PageDataProfile r={result} />}{page==='quality'&&<PageQuality r={result} />}</main>
      </div>
    </div>
  );
}
