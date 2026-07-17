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
  RefreshCw, Bell, CheckCircle, Layers, TrendingUp, Users, Package, Activity,LogOut } from "lucide-react";
import { saveToHistory, loadHistory } from "../lib/history/historyStore";
import { openReport } from "../lib/export/reportGenerator";
import { useAuth, PasswordGateScreen } from "../lib/auth/AuthContext";
import { getSupabase } from "../lib/auth/supabaseClient";

const fmtN = (n: number) => Math.round(n).toLocaleString('en-GB');

/* ─────────────────────────────────────────────────────────────────
   SKELETON LOADERS — shown while result.aiLoading === true
───────────────────────────────────────────────────────────────── */
function SkeletonLine({ width = '100%' }: { width?: string }) {
  return <div className="h-3 animate-pulse bg-slate-200 rounded" style={{ width }} />;
}
function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  const widths = ['100%', '92%', '68%', '80%', '55%'];
  return <div className="space-y-2">{Array.from({ length: lines }).map((_, i) => <SkeletonLine key={i} width={widths[i % widths.length]} />)}</div>;
}

/* ── AI content matchers ── */
function findRiskExplanation(ai: AIInsights | null, title: string, idx: number) {
  if (!ai) return null;
  return ai.riskExplanations[idx] || ai.riskExplanations.find(r => r.title === title) || null;
}
function findRecommendation(ai: AIInsights | null, title: string, idx: number) {
  if (!ai) return null;
  return ai.recommendations[idx] || ai.recommendations.find(r => r.title === title) || null;
}
function findNarrative(ai: AIInsights | null, id: string, idx: number) {
  if (!ai) return null;
  return ai.analysisNarratives[idx] || ai.analysisNarratives.find(n => n.analysisId === id) || null;
}

/* ─────────────────────────────────────────────────────────────────
   UPLOAD SCREEN
───────────────────────────────────────────────────────────────── */
function UploadScreen({ onLoaded }: { onLoaded: (r: PipelineResult) => void }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [stage, setStage]       = useState('');

  async function handleFile(file: File) {
    setError(''); setLoading(true);
    setStage('Parsing file...');
    await new Promise(res => setTimeout(res, 30));
    setStage('Profiling, cleaning and detecting columns...');
    await new Promise(res => setTimeout(res, 30));
    setStage('Running statistics and ML models...');

    const outcome = await runDataPipeline(file);
    setLoading(false);
    if (!outcome.ok) { setError((outcome as any).error); return; }
    onLoaded(outcome.result);
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center p-8">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-lg p-10 text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-[#0F172A] flex items-center justify-center shadow-lg">
          <span className="text-[#22C55E] font-black text-2xl">V</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Verdio</h1>
        <p className="text-xs font-bold tracking-[0.25em] text-slate-400 mt-1 mb-3">ADAPTIVE DATA INTELLIGENCE</p>
        <p className="text-slate-500 text-sm leading-6 mb-8">
          Upload any structured business dataset. Verdio profiles it, understands what each column means,
          decides which analyses are valid, and builds a decision brief automatically — no fixed template required.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById('fi')?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 transition-all ${
            dragging ? 'border-[#16A34A] bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-[#16A34A] hover:bg-emerald-50/40'
          }`}
        >
          <input id="fi" type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-slate-200 border-t-[#16A34A] rounded-full animate-spin" />
              <p className="text-sm text-slate-600 font-medium">{stage}</p>
            </div>
          ) : (
            <>
              <p className="text-2xl mb-2">📁</p>
              <p className="font-semibold text-slate-700">Drag and drop your file</p>
              <p className="mt-1 text-sm text-slate-500">or click to browse</p>
              <p className="mt-2 text-xs text-slate-400">CSV · Excel XLSX · XLS — any structure, any column names</p>
            </>
          )}
        </div>

        {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────────── */
const PAGES = [
  { id: 'overview',    label: 'Executive Brief',    icon: Home },
  { id: 'advisor',     label: 'Verdio Advisor',      icon: Sparkles, badge: 'AI' },
  { id: 'forecast',    label: 'Forecast',            icon: TrendingUp },
  { id: 'analyses',    label: 'Analyses',            icon: BarChart3 },
  { id: 'customers',   label: 'Customers',           icon: Users },
  { id: 'seasonality', label: 'Seasonality',         icon: Activity },
  { id: 'health',      label: 'Health Score',        icon: CheckCircle },
  { id: 'risks',       label: 'Risk Detection',      icon: ShieldAlert },
  { id: 'recs',        label: 'Recommendations',     icon: Brain },
  { id: 'products',    label: 'Products & Markets',  icon: Package },
  { id: 'profile',     label: 'Data Understanding',  icon: Layers },
  { id: 'quality',     label: 'Data Quality',        icon: Database },
];

function Sidebar({ page, setPage, result, onReset }: { page: string; setPage: (p: string) => void; result: PipelineResult; onReset: () => void }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-[#0F172A] text-white flex flex-col z-50">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[#16A34A]/20 border border-[#16A34A]/40 flex items-center justify-center font-black text-[#16A34A]">V</div>
          <div>
            <div className="font-bold text-white">Verdio</div>
            <div className="text-[10px] text-slate-400 tracking-widest">ADAPTIVE INTELLIGENCE</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
        {PAGES.map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => setPage(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
              page === id ? 'bg-[#16A34A]/20 text-white border-l-4 border-[#16A34A] pl-2' : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}>
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {badge && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#16A34A] text-white font-bold">{badge}</span>}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="bg-white/5 rounded-xl p-3 mb-3">
          <p className="text-[9px] font-bold text-slate-400 tracking-widest mb-1">BUSINESS HEALTH</p>
          <div className="text-2xl font-black text-white">{result.decision.health.total}<span className="text-sm font-normal text-slate-400">/100</span></div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-[#16A34A] transition-all duration-1000" style={{ width: `${result.decision.health.total}%` }} />
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-[9px] font-bold text-slate-400 tracking-widest mb-1">DATA QUALITY</p>
          <div className="text-2xl font-black" style={{ color: result.quality.overallScore >= 80 ? '#22C55E' : result.quality.overallScore >= 60 ? '#F59E0B' : '#EF4444' }}>
            {result.quality.overallScore}<span className="text-sm font-normal text-slate-400">/100</span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 border-t border-white/10 pt-3">
        <button onClick={onReset} className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-xs font-medium hover:bg-white/10 transition-all">
          ↑ Upload New File
        </button>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────
   METRIC CARD
───────────────────────────────────────────────────────────────── */
function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' }) {
  const bg   = tone === 'red' ? 'bg-red-50 border-red-200' : tone === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';
  const subC = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-[#16A34A]';
  return (
    <div className={`rounded-2xl border p-5 ${bg}`}>
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">{label}</p>
      <p className="text-2xl font-bold text-[#0F172A] leading-tight break-words">{value}</p>
      {sub && <p className={`mt-2 text-xs font-semibold ${subC}`}>{sub}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: EXECUTIVE BRIEF (OVERVIEW)
───────────────────────────────────────────────────────────────── */
function PageOverview({ r }: { r: PipelineResult }) {
  const h = r.decision.health.total;
  const topRisk = r.decision.risks[0];
  const topRec  = r.decision.recommendations[0];

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-7 mb-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#16A34A] to-[#22C55E]" />
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold mb-3" style={{
              background: h >= 80 ? '#DCFCE7' : h >= 60 ? '#FEF3C7' : '#FEF2F2',
              color: h >= 80 ? '#14532D' : h >= 60 ? '#92400E' : '#991B1B',
            }}>
              {h >= 80 ? 'Healthy and Stable' : h >= 60 ? 'Performing with Risks' : 'Attention Required'}
            </span>
            <h2 className="text-2xl font-bold text-[#0F172A] leading-snug mb-3">
              {topRisk ? `${topRisk.title} requires attention.` : 'Data analysed. Review your decision brief below.'}
            </h2>
            <p className="text-slate-500 text-sm leading-7">
              Verdio analysed {fmtN(r.source.rowCount)} rows across {r.profile.columnCount} columns from "{r.source.fileName}".
              {' '}{r.capabilities.available.length} of {r.capabilities.capabilities.length} possible analysis types were available for this dataset,
              with a data quality score of {r.quality.overallScore}/100.
              {topRec ? ` Top action: ${topRec.title.toLowerCase()}.` : ''}
            </p>
          </div>
          <div className="bg-[#0F172A] rounded-2xl p-5 text-center min-w-[140px]">
            <p className="text-[10px] text-slate-400 font-bold tracking-widest mb-2">HEALTH</p>
            <p className="text-5xl font-black text-white">{h}</p>
            <p className="text-slate-400 text-sm">/100</p>
          </div>
        </div>
      </div>

      {/* AI Executive Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-[#16A34A]" />
          <p className="text-[10px] font-bold tracking-widest text-slate-500">AI EXECUTIVE SUMMARY</p>
          {r.aiLoading
            ? <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />Generating</span>
            : <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#16A34A]/10 text-[#16A34A] font-bold">AI Generated</span>}
        </div>
        {r.aiLoading ? <SkeletonBlock lines={3} /> : <p className="text-sm text-slate-600 leading-7">{r.aiInsights?.executiveSummary}</p>}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MetricCard label="Rows Analysed" value={fmtN(r.source.rowCount)} sub={`${r.profile.columnCount} columns`} />
        <MetricCard label="Data Quality" value={`${r.quality.overallScore}/100`} tone={r.quality.overallScore >= 80 ? 'green' : r.quality.overallScore >= 60 ? 'amber' : 'red'} />
        <MetricCard label="Analyses Available" value={`${r.capabilities.available.length}/${r.capabilities.capabilities.length}`} sub="Capability-gated" />
        <MetricCard label="Health Score" value={`${h}/100`} tone={h >= 80 ? 'green' : h >= 60 ? 'amber' : 'red'} />
      </div>

      {/* Top priority / risk cards */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm border-t-4 border-t-[#16A34A]">
          <p className="text-[10px] font-bold tracking-widest text-[#16A34A] mb-2">TOP PRIORITY</p>
          <p className="font-bold text-[#0F172A] text-base leading-snug mb-2">{topRec?.title || 'No recommendations generated'}</p>
          <p className="text-xs text-slate-500 leading-6">{topRec?.desc}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm border-t-4 border-t-[#DC2626]">
          <p className="text-[10px] font-bold tracking-widest text-[#DC2626] mb-2">HIGHEST RISK</p>
          <p className="font-bold text-[#0F172A] text-base leading-snug mb-2">{topRisk?.title || 'No critical risk detected'}</p>
          <p className="text-xs text-slate-500 leading-6">{topRisk?.desc}</p>
        </div>
      </div>

      {/* Key insights */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <p className="text-[10px] font-bold tracking-widest text-slate-500 mb-4">KEY INSIGHTS</p>
        {r.aiLoading ? <SkeletonBlock lines={4} /> : (
          <div className="space-y-3">
            {(r.aiInsights?.keyInsights || []).map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap mt-0.5 flex-shrink-0 bg-[#16A34A]/10 text-[#16A34A]">AI</span>
                <p className="text-sm text-slate-600 leading-6">{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: ANALYSES — renders every ranked AnalysisCandidate generically
───────────────────────────────────────────────────────────────── */
function PageAnalyses({ r }: { r: PipelineResult }) {
  // comparison/concentration/segmentation now have dedicated, deeper pages (Products & Markets, Customers)
  const filtered = r.analyses.filter(a => !['comparison', 'concentration_analysis', 'segmentation'].includes(a.capability));
  if (!filtered.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">
        No analyses could be generated for this dataset — not enough of the required column combinations were confidently detected.
        See the Data Understanding page for what was found.
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {filtered.map((a, i) => {
        const narrative = findNarrative(r.aiInsights, a.id, i);
        return (
          <div key={a.id}>
            <ChartRenderer chart={a.chart} />
            <div className="mt-2 px-1">
              {r.aiLoading ? <SkeletonLine width="60%" /> : narrative ? (
                <p className="text-xs text-slate-500 leading-6"><span className="font-semibold text-[#16A34A]">AI: </span>{narrative.narrative}</p>
              ) : <p className="text-xs text-slate-400 leading-6">{a.explanation}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: FORECAST — scenario toggle + monthly breakdown table
───────────────────────────────────────────────────────────────── */
function PageForecast({ r }: { r: PipelineResult }) {
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'conservative'>('base');

  if (!r.ml.forecast) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">Forecasting isn't available for this dataset — see Data Understanding for why.</div>;
  }

  const ts = r.statistics.timeSeries.find(t => t.measureColumn === r.ml.forecast!.measureColumn);
  const forecast = runForecast(ts ?? { measureColumn: r.ml.forecast.measureColumn, dateColumn: '', points: [] }, scenario);
  const measureLabel = labelForMeasure(forecast.measureColumn);
  const last = ts?.points[ts.points.length - 1]?.value || 0;

  const chartData = [
    ...(ts?.points.map(p => ({ period: p.label, historical: p.value, forecast: null })) || []),
    ...forecast.points.map(p => ({ period: p.periodLabel, historical: null, forecast: p.value })),
  ];

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1">{measureLabel.toUpperCase()} FORECAST</p>
            <p className="text-[11px] text-slate-400">Linear regression + Holt exponential smoothing · ±12% confidence</p>
          </div>
          <div className="flex gap-2">
            {(['base', 'optimistic', 'conservative'] as const).map(s => (
              <button key={s} onClick={() => setScenario(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${scenario === s ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'text-slate-500 border-slate-300 hover:border-[#16A34A] hover:text-[#16A34A]'}`}>
                {s === 'base' ? 'Base' : s === 'optimistic' ? 'Optimistic +15%' : 'Conservative -15%'}
              </button>
            ))}
          </div>
        </div>
        <ChartRenderer chart={{ chartType: 'line', title: `${measureLabel} Forecast`, xKey: 'period', seriesKeys: ['historical', 'forecast'], data: chartData, formatValue: 'currency' }} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <MetricCard label="6-Period Projection" value={`£${forecast.points.reduce((s, p) => s + p.value, 0).toLocaleString('en-GB')}`} sub={`${scenario} scenario`} tone="green" />
        <MetricCard label="Monthly Trend" value={`${forecast.monthlyTrendPct >= 0 ? '+' : ''}${forecast.monthlyTrendPct}%`} sub="Per period (linear regression)" tone={forecast.monthlyTrendPct >= 0 ? 'green' : 'red'} />
        <MetricCard label="Holt Next Period" value={`£${Math.round(forecast.holtNextPeriod).toLocaleString('en-GB')}`} sub="Exponential smoothing" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-600 mb-4">PERIOD-BY-PERIOD BREAKDOWN</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left">
            {['Period', 'Forecast', 'Low', 'High', 'vs Current'].map(h => <th key={h} className="pb-3 font-bold text-[10px] text-slate-400 uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody>
            {forecast.points.map((p, i) => {
              const chg = last ? Math.round(((p.value - last) / last) * 100) : null;
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-3 font-semibold text-[#0F172A]">{p.periodLabel}</td>
                  <td className="py-3 font-bold text-[#16A34A]">£{p.value.toLocaleString('en-GB')}</td>
                  <td className="py-3 text-slate-400">£{p.low.toLocaleString('en-GB')}</td>
                  <td className="py-3 text-slate-400">£{p.high.toLocaleString('en-GB')}</td>
                  <td className="py-3">{chg !== null && <span className={`font-bold ${chg >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{chg >= 0 ? '↑' : '↓'} {Math.abs(chg)}%</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: CUSTOMERS — full RFM table + segment cards
───────────────────────────────────────────────────────────────── */
function PageCustomers({ r }: { r: PipelineResult }) {
  if (!r.ml.segmentation || !r.ml.segmentation.segments.length) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">Customer segmentation isn't available for this dataset — see Data Understanding for why.</div>;
  }
  const seg = r.ml.segmentation;
  const idx = r.analyses.findIndex(a => a.id === 'segmentation');
  const narrative = idx >= 0 ? findNarrative(r.aiInsights, 'segmentation', idx) : null;

  const segColors: Record<string, string> = { champion: '#16A34A', loyal: '#2563EB', atRisk: '#D97706', lost: '#DC2626', new: '#7C3AED' };
  const segLabels: Record<string, string> = { champion: 'Champion 🏆', loyal: 'Loyal 💚', atRisk: 'At Risk ⚠️', lost: 'Lapsed ❌', new: 'New 🌱' };
  const counts: Record<string, number> = {};
  seg.segments.forEach(s => { counts[s.segment] = (counts[s.segment] || 0) + 1; });

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MetricCard label="Total Customers" value={fmtN(seg.segments.length)} />
        <MetricCard label="Churn Risk" value={`${seg.churnRiskScore}/100`} tone={seg.churnRiskScore >= 60 ? 'red' : seg.churnRiskScore >= 35 ? 'amber' : 'green'} />
        <MetricCard label="Revenue at Risk" value={`£${Math.round(seg.revenueAtRisk).toLocaleString('en-GB')}`} tone="red" />
        <MetricCard label="At Risk / Lapsed" value={fmtN((counts.atRisk || 0) + (counts.lost || 0))} tone="amber" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-5">
        <div className="flex items-center gap-2 mb-2"><Brain size={16} className="text-[#16A34A]" /><p className="text-xs font-bold text-slate-600">RFM CUSTOMER SEGMENTATION</p></div>
        <p className="text-[11px] text-slate-400 mb-5">Recency × Frequency × Monetary scoring across "{seg.customerColumn}".</p>
        {r.aiLoading ? <SkeletonLine width="70%" /> : narrative && <p className="text-xs text-slate-500 leading-6 mb-4"><span className="font-semibold text-[#16A34A]">AI: </span>{narrative.narrative}</p>}

        <div className="grid grid-cols-5 gap-3 mb-5">
          {(['champion', 'loyal', 'atRisk', 'lost', 'new'] as const).map(key => (
            <div key={key} className="rounded-xl border p-4 text-center" style={{ borderColor: segColors[key] + '40', background: segColors[key] + '08' }}>
              <p className="text-2xl font-black" style={{ color: segColors[key] }}>{counts[key] || 0}</p>
              <p className="text-xs font-bold mt-1 text-[#0F172A]">{segLabels[key]}</p>
            </div>
          ))}
        </div>

        <table className="w-full text-sm">
          <thead><tr className="text-left border-b border-slate-100">
            {['#', 'Customer', 'Segment', 'Total Value', 'Orders', 'RFM Score'].map(h => <th key={h} className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody>
            {seg.segments.slice(0, 15).map((s, i) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-2.5"><span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white ${i === 0 ? 'bg-amber-500' : 'bg-slate-300'}`}>{i + 1}</span></td>
                <td className="py-2.5 font-semibold text-[#0F172A]">{s.id}</td>
                <td className="py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: segColors[s.segment] + '20', color: segColors[s.segment] }}>{segLabels[s.segment]}</span></td>
                <td className="py-2.5 font-bold text-[#16A34A]">£{s.monetary.toLocaleString('en-GB')}</td>
                <td className="py-2.5 text-slate-500">{s.frequency}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s.rfmScore / 9) * 100}%`, background: segColors[s.segment] }} /></div>
                    <span className="text-xs font-bold text-slate-500">{s.rfmScore}/9</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: SEASONALITY
───────────────────────────────────────────────────────────────── */
function PageSeasonality({ r }: { r: PipelineResult }) {
  const s = r.statistics.seasonality;
  if (!s) return <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">Seasonality analysis isn't available for this dataset — see Data Understanding for why.</div>;

  const measureLabel = labelForMeasure(s.measureColumn);
  const peakMonths = [...s.byMonthOfYear].sort((a, b) => b.value - a.value).slice(0, 3);
  const quietMonths = [...s.byMonthOfYear].sort((a, b) => a.value - b.value).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ChartRenderer chart={{ chartType: 'bar', title: `${measureLabel} by Day of Week`, xKey: 'label', yKey: 'value', data: s.byDayOfWeek, formatValue: 'currency' }} />
        <ChartRenderer chart={{ chartType: 'bar', title: `${measureLabel} by Month of Year`, xKey: 'label', yKey: 'value', data: s.byMonthOfYear, formatValue: 'currency' }} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-600 mb-4">PEAK TRADING PERIODS</p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">🔥 Peak months</p>
            {peakMonths.map(p => <div key={p.label} className="flex justify-between py-2 border-b border-slate-100 text-sm"><span className="font-semibold text-[#0F172A]">{p.label}</span><span className="font-bold text-[#16A34A]">£{p.value.toLocaleString('en-GB')}</span></div>)}
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">🌙 Quieter months</p>
            {quietMonths.map(p => <div key={p.label} className="flex justify-between py-2 border-b border-slate-100 text-sm"><span className="text-slate-500">{p.label}</span><span className="text-slate-400">£{p.value.toLocaleString('en-GB')}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: HEALTH SCORE
───────────────────────────────────────────────────────────────── */
function PageHealth({ r }: { r: PipelineResult }) {
  const h = r.decision.health;
  const gc = h.total >= 80 ? '#16A34A' : h.total >= 60 ? '#D97706' : '#DC2626';
  const circumference = 2 * Math.PI * 66;
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-7 shadow-sm mb-5">
        <div className="flex items-center gap-10 flex-wrap">
          <div className="relative w-[160px] h-[160px] flex-shrink-0">
            <svg width="160" height="160" viewBox="0 0 160 160" className="absolute inset-0">
              <circle cx="80" cy="80" r="66" fill="none" strokeWidth="10" stroke="#F0F2F8" />
              <circle cx="80" cy="80" r="66" fill="none" strokeWidth="10" stroke={gc} strokeLinecap="round" strokeDasharray={circumference}
                strokeDashoffset={circumference - (h.total / 100) * circumference} transform="rotate(-90 80 80)" style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-[#0F172A]">{h.total}</span>
              <span className="text-xs text-slate-400">out of 100</span>
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold mb-2" style={{ color: gc }}>{h.total >= 80 ? 'Healthy 💚' : h.total >= 60 ? 'Moderate ⚠️' : 'At Risk ❌'}</p>
            <p className="text-slate-500 text-sm leading-7 max-w-sm">
              {h.total >= 80 ? 'Strong fundamentals across all four pillars. Continue monitoring monthly.' : h.total >= 60 ? 'Reasonable performance with room for improvement — focus on the lowest-scoring pillar first.' : 'Several indicators are below healthy levels. Review the Recommendations page urgently.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-6">
          {h.pillars.map(p => (
            <div key={p.name} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase">{p.name}</p>
              <p className="text-2xl font-black mb-2" style={{ color: p.color }}>{p.score}<span className="text-sm text-slate-400 font-normal">/{p.max}</span></p>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(p.score / p.max) * 100}%`, background: p.color }} /></div>
            </div>
          ))}
        </div>
      </div>

      {r.ml.segmentation && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><Brain size={16} className="text-[#7C3AED]" /><p className="text-xs font-bold text-slate-600">CHURN RISK ANALYSIS</p></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 mb-1">CHURN RISK SCORE</p>
              <p className="text-3xl font-black" style={{ color: r.ml.segmentation.churnRiskScore >= 60 ? '#DC2626' : r.ml.segmentation.churnRiskScore >= 35 ? '#D97706' : '#16A34A' }}>{r.ml.segmentation.churnRiskScore}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 mb-1">REVENUE AT RISK</p>
              <p className="text-3xl font-black text-[#DC2626]">£{Math.round(r.ml.segmentation.revenueAtRisk).toLocaleString('en-GB')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: PRODUCTS & MARKETS — full ranked breakdown tables
───────────────────────────────────────────────────────────────── */
function PageProducts({ r }: { r: PipelineResult }) {
  const measureCol = primaryMeasureColumn(r.semantics.columns, r.engineeredRows);
  const productCol = bestColumnOfRole(r.semantics.columns, 'product');
  const locationCol = bestColumnOfRole(r.semantics.columns, 'location');

  if (!measureCol || (!productCol && !locationCol)) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">No product or location breakdown is available for this dataset — see Data Understanding for what was detected.</div>;
  }
  const measureLabel = labelForMeasure(measureCol);

  return (
    <div className="space-y-4">
      {productCol && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-4">PRODUCT PERFORMANCE</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-slate-100">{['#', 'Product', measureLabel, 'Orders', 'Share'].map(h => <th key={h} className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {computeCategoryBreakdown(r.engineeredRows, productCol, measureCol).slice(0, 15).map((row, i) => (
                <tr key={row.label} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-3"><span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold ${i === 0 ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span></td>
                  <td className="py-3 font-semibold text-[#0F172A]">{row.label}</td>
                  <td className="py-3 font-bold text-[#16A34A]">£{row.value.toLocaleString('en-GB')}</td>
                  <td className="py-3 text-slate-500">{fmtN(row.count)}</td>
                  <td className="py-3"><div className="flex items-center gap-2"><div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-[#16A34A]" style={{ width: `${row.pct}%` }} /></div><span className="text-xs text-slate-500">{row.pct}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {locationCol && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-4">MARKET PERFORMANCE</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-slate-100">{['#', 'Market', measureLabel, 'Orders', 'Share'].map(h => <th key={h} className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {computeCategoryBreakdown(r.engineeredRows, locationCol, measureCol).slice(0, 15).map((row, i) => (
                <tr key={row.label} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-3"><span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold ${i === 0 ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span></td>
                  <td className="py-3 font-semibold text-[#0F172A]">{row.label}</td>
                  <td className="py-3 font-bold text-[#16A34A]">£{row.value.toLocaleString('en-GB')}</td>
                  <td className="py-3 text-slate-500">{fmtN(row.count)}</td>
                  <td className="py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{row.pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: RISKS
───────────────────────────────────────────────────────────────── */
function PageRisks({ r }: { r: PipelineResult }) {
  const levelColor = (l: string) => l === 'high' ? '#DC2626' : l === 'medium' ? '#D97706' : '#16A34A';
  const levelBg    = (l: string) => l === 'high' ? '#FEF2F2' : l === 'medium' ? '#FFFBEB' : '#DCFCE7';
  if (!r.decision.risks.length) return <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">No risks were detected for this dataset.</div>;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-4">RISK DETECTION — RANKED BY SEVERITY</p>
      <div className="space-y-3">
        {r.decision.risks.map((risk, i) => {
          const exp = findRiskExplanation(r.aiInsights, risk.title, i);
          return (
            <div key={i} className="flex items-start gap-4 p-5 rounded-xl border border-slate-200" style={{ borderLeftWidth: 4, borderLeftColor: levelColor(risk.level) }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: levelBg(risk.level) }}>{risk.icon}</div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: levelColor(risk.level) }}>{risk.level} risk</span>
                <p className="font-bold text-[#0F172A] text-sm mb-2 mt-0.5">{risk.title}</p>
                {r.aiLoading ? <SkeletonBlock lines={2} /> : exp ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-600 leading-6"><span className="font-semibold text-slate-700">Impact:</span> {exp.impact}</p>
                    <p className="text-xs text-slate-600 leading-6"><span className="font-semibold text-slate-700">Action:</span> {exp.action}</p>
                  </div>
                ) : <p className="text-xs text-slate-500 leading-6">{risk.desc}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: RECOMMENDATIONS
───────────────────────────────────────────────────────────────── */
function PageRecs({ r }: { r: PipelineResult }) {
  const recs = r.decision.recommendations as EnrichedRec[];
  // Check if V2 is active (has financialImpact)
  const isV2 = recs.length && recs[0].financialImpact;

  // Get VDE summary if present (injected via _vdeMeta in runDataPipeline patch)
  const vdeMeta = (r as any)._vdeMeta as VDEResult | undefined;
  const modelMeta = (r as any)._modelMeta as any;

  if (!recs.length) return <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-sm text-slate-500">No recommendations were generated for this dataset.</div>;

  return (
    <div className="space-y-4">
      {/* VDE Summary Card - NEW for visa endorsement */}
      {isV2 && vdeMeta && (
        <div className="bg-[#0F172A] rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#16A34A]/20 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#22C55E]">VERDIO DECISION ENGINE v2</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#16A34A] text-white font-bold">FINANCIALLY RANKED</span>
            </div>
            <p className="text-sm leading-7 text-slate-200 mb-4">{vdeMeta.summary}</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-[10px] text-slate-400 tracking-widest">VALUE AT RISK</p>
                <p className="text-xl font-black text-white">£{vdeMeta.totalValueAtRisk?.toLocaleString()}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-[10px] text-slate-400 tracking-widest">OPPORTUNITY VALUE</p>
                <p className="text-xl font-black text-[#22C55E]">£{vdeMeta.totalOpportunityValue?.toLocaleString()}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-[10px] text-slate-400 tracking-widest">ACTIONS RANKED</p>
                <p className="text-xl font-black text-white">{recs.length}</p>
                <p className="text-[10px] text-slate-400">by Priority Score</p>
              </div>
            </div>
            {modelMeta?.forecast && (
              <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10">
                <p className="text-[10px] text-[#22C55E] font-bold tracking-widest mb-1">MODEL SELECTION TRANSPARENCY</p>
                <p className="text-xs text-slate-300">Forecast model: <span className="text-white font-bold">{modelMeta.forecast.chosenModel}</span> (confidence {Math.round(modelMeta.forecast.confidence*100)}%) — {modelMeta.forecast.reason}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-4">
          {isV2 ? 'PRIORITISED ACTIONS — RANKED BY FINANCIAL IMPACT × CONFIDENCE / EFFORT' : 'PRIORITISED RECOMMENDATIONS'}
        </p>
        <div className="space-y-3">
          {recs.map((rec: EnrichedRec, i: number) => {
            const ai = findRecommendation(r.aiInsights, rec.title, i);
            const hasFinance = !!rec.financialImpact;

            return (
              <div key={i} className="flex items-start gap-4 p-5 rounded-xl border border-slate-100 hover:border-[#16A34A]/30 transition-colors">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white flex-shrink-0" style={{ background: i === 0 ? '#16A34A' : '#0F172A' }}>
                  {hasFinance ? rec.priorityScore || i+1 : i+1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-bold text-[#0F172A] text-[14px] leading-snug">{rec.title}</p>
                    {hasFinance && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0 ${
                        rec.urgency === 'immediate' ? 'bg-red-50 text-red-700 border border-red-200' :
                        rec.urgency === 'this_month' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>
                        {rec.urgency.replace('_',' ')}
                      </span>
                    )}
                  </div>

                  {r.aiLoading ? <SkeletonBlock lines={2} /> : ai ? (
                    <div className="space-y-2">
                      <p className="text-[13px] text-slate-600 leading-6">{ai.action}</p>
                    </div>
                  ) : <p className="text-[13px] text-slate-500 leading-6">{rec.desc}</p>}

                  {/* NEW V2 Financial Impact Row */}
                  {hasFinance ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className="text-[9px] tracking-widest text-slate-400 font-bold">EST. IMPACT</p>
                        <p className="text-[13px] font-black text-[#0F172A]">£{rec.financialImpact.estimatedValue.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500 truncate" title={rec.financialImpact.basis}>Range £{rec.financialImpact.rangeLow.toLocaleString()}–£{rec.financialImpact.rangeHigh.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className="text-[9px] tracking-widest text-slate-400 font-bold">CONFIDENCE & EFFORT</p>
                        <p className="text-[13px] font-bold text-[#0F172A]">{Math.round(rec.confidence*100)}% conf • {rec.effortDays}d</p>
                        <p className="text-[10px] text-slate-500 capitalize">{rec.effort} effort</p>
                      </div>
                      <div className="bg-[#16A34A]/10 rounded-lg p-2.5 border border-[#16A34A]/20">
                        <p className="text-[9px] tracking-widest text-[#16A34A] font-bold">PRIORITY SCORE</p>
                        <p className="text-[18px] font-black text-[#16A34A]">{rec.priorityScore}/100</p>
                        <p className="text-[10px] text-slate-500">{rec.financialImpact.basis.slice(0, 48)}...</p>
                      </div>
                    </div>
                  ) : (
                    <span className={`mt-3 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${rec.impact === 'high' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                      {rec.impact === 'high' ? 'High Impact' : 'Medium Impact'}
                    </span>
                  )}

                  {hasFinance && rec.relatedRiskTitles?.length > 0 && (
                    <p className="mt-2 text-[10px] text-slate-400">Linked risks: {rec.relatedRiskTitles.join(', ')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: DATA UNDERSTANDING — semantic detection + capabilities
───────────────────────────────────────────────────────────────── */
function PageDataProfile({ r }: { r: PipelineResult }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-600 mb-1">COLUMN DETECTION</p>
        <p className="text-[11px] text-slate-400 mb-4">How Verdio classified each column, and how confident it is.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b border-slate-100">
            {['Column', 'Type', 'Detected Role', 'Confidence', ''].map(h => (
              <th key={h} className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {r.semantics.columns.map(c => (
              <tr key={c.columnName} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 font-semibold text-[#0F172A]">{c.columnName}</td>
                <td className="py-2.5 text-slate-500">{c.dataType}</td>
                <td className="py-2.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.businessRole === 'unknown' ? 'bg-slate-100 text-slate-400' : 'bg-[#16A34A]/10 text-[#16A34A]'}`}>
                    {c.businessRole}
                  </span>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-[#16A34A]" style={{ width: `${c.confidence * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{Math.round(c.confidence * 100)}%</span>
                  </div>
                </td>
                <td className="py-2.5">{c.needsReview && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Review</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.semantics.warnings.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {r.semantics.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600 leading-6">⚠️ {w}</p>)}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-600 mb-1">ANALYSIS CAPABILITIES</p>
        <p className="text-[11px] text-slate-400 mb-4">Which analyses are valid for this specific dataset, and why.</p>
        <div className="grid grid-cols-2 gap-3">
          {r.capabilities.capabilities.map(cap => (
            <div key={cap.type} className={`rounded-xl border p-4 ${cap.available ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                {cap.available ? <CheckCircle size={14} className="text-[#16A34A]" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                <p className="text-xs font-bold text-[#0F172A] capitalize">{cap.type.replace(/_/g, ' ')}</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-5">{cap.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {r.features.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-4">DERIVED FEATURES</p>
          <div className="space-y-2">
            {r.features.map((f, i) => (
              <p key={i} className="text-xs text-slate-500 leading-6"><span className="font-semibold text-slate-700">{f.name}</span> — {f.description}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: DATA QUALITY
───────────────────────────────────────────────────────────────── */
function PageQuality({ r }: { r: PipelineResult }) {
  const qColor = (n: number) => n >= 90 ? '#16A34A' : n >= 70 ? '#D97706' : '#DC2626';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Overall', value: r.quality.overallScore },
          { label: 'Completeness', value: r.quality.completenessScore },
          { label: 'Validity', value: r.quality.validityScore },
          { label: 'Consistency', value: r.quality.consistencyScore },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-1">{s.label.toUpperCase()}</p>
            <p className="text-3xl font-black" style={{ color: qColor(s.value) }}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">out of 100</p>
          </div>
        ))}
      </div>

      {r.quality.flags.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-3">QUALITY FLAGS</p>
          <div className="space-y-2">{r.quality.flags.map((f, i) => <p key={i} className="text-xs text-amber-600 leading-6">⚠️ {f}</p>)}</div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-600 mb-4">COLUMN QUALITY BREAKDOWN</p>
        <div className="space-y-3">
          {r.quality.columns.map((c, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-600">{c.column}</span>
                <span className="font-bold" style={{ color: qColor(c.overall) }}>{c.overall}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.overall}%`, background: qColor(c.overall) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {r.cleaning.actions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-1">WHAT VERDIO CLEANED</p>
          <p className="text-[11px] text-slate-400 mb-4">{r.cleaning.rowsBefore} rows in → {r.cleaning.rowsAfter} rows after cleaning · {r.cleaning.cellsImputed} cell(s) imputed</p>
          <div className="space-y-2">
            {r.cleaning.actions.map((a, i) => <p key={i} className="text-xs text-slate-500 leading-6">✓ {a.detail}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PAGE: ADVISOR
───────────────────────────────────────────────────────────────── */
function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[] }[]>([
    { role: 'ai', text: `Full analysis loaded — ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100. Hybrid LLM with local fallback.` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<string>('unknown');
  const PROXY = 'https://sme-bi-copilot-proxy.vercel.app/api/chat';
  const context = buildAdvisorContext(r);

  async function callProxyWithRetry(userMsg: string, retries=2): Promise<string> {
    for(let attempt=0; attempt<=retries; attempt++){
      try {
        const controller=new AbortController();
        const t=setTimeout(()=>controller.abort(), 10000);
        const res=await fetch(PROXY, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          signal:controller.signal,
          body:JSON.stringify({
            max_tokens: 700,
            messages:[
              {role:'system', content: context},
              {role:'user', content: userMsg}
            ]
          })
        });
        clearTimeout(t);
        if(!res.ok){
          const txt=await res.text();
          throw new Error(`Proxy HTTP ${res.status}: ${txt.slice(0,300)}`);
        }
        const data=await res.json();
        const txt=data.choices?.[0]?.message?.content;
        if(!txt) throw new Error('Empty AI response');
        setProxyStatus('online');
        return txt;
      } catch(e:any){
        console.warn(`Proxy attempt ${attempt+1} failed`, e);
        setProxyStatus(`retry ${attempt+1} failed: ${e.message?.slice(0,100)}`);
        if(attempt===retries) throw e;
        await new Promise(r=>setTimeout(r, 800* (attempt+1)));
      }
    }
    throw new Error('All retries failed');
  }

  async function send() {
    if(!input.trim()) return;
    const userMsg=input.trim();
    setInput('');
    setMessages(prev=>[...prev, {role:'user', text:userMsg}]);
    setLoading(true);
    try{
      const aiText=await callProxyWithRetry(userMsg, 2);
      const {cleanText, charts}=parseChartTagsFromAI(aiText, r);
      setMessages(prev=>[...prev, {role:'ai', text:cleanText, charts}]);
    }catch(err:any){
      console.error('Proxy final fail, using local fallback', err);
      setProxyStatus(`offline: ${err.message?.slice(0,200)}`);
      const fallback=localAnalysisFallback(userMsg, r);
      setMessages(prev=>[...prev, {
        role:'ai',
        text: `${fallback.text}

⚠️ AI proxy is currently offline (${err.message?.slice(0,150)}). Showing answer from local analysis engines. Fix: check Vercel env OPENAI_API_KEY and redeploy proxy.`,
        charts: fallback.charts
      }]);
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F172A] flex items-center justify-center"><span className="text-[#22C55E] font-black">V</span></div>
          <div><p className="font-bold text-[#0F172A]">Verdio Advisor — Hybrid LLM</p><p className="text-xs text-slate-500">Proxy: {proxyStatus} · {r.analyses.length} charts · LLM + local engines</p></div>
        </div>
      </div>
      <div className="max-h-[700px] overflow-y-auto flex flex-col gap-4 mb-4 pr-1">
        {messages.map((msg,i)=>(
          <div key={i} className={`flex gap-2 ${msg.role==='user'?'flex-row-reverse':''}`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${msg.role==='ai'?'bg-[#0F172A] text-[#22C55E]':'bg-slate-200'}`}>{msg.role==='ai'?'V':'U'}</div>
            <div className="flex-1 max-w-[92%]">
              {msg.role==='user'?<div className="px-4 py-2.5 rounded-2xl text-sm bg-[#0F172A] text-white rounded-tr-sm ml-auto max-w-[85%] w-fit">{msg.text}</div>:
              <div className="flex flex-col gap-3"><div className="px-4 py-2.5 rounded-2xl text-sm bg-slate-50 border border-slate-200 rounded-tl-sm leading-6 whitespace-pre-wrap">{msg.text}</div>{msg.charts?.map((ch,idx)=>(<div key={idx}><ChartRenderer chart={ch} /></div>))}</div>}
            </div>
          </div>
        ))}
        {loading && <div className="flex gap-2"><div className="w-7 h-7 rounded-lg bg-[#0F172A] flex items-center justify-center text-[#22C55E] text-xs">V</div><div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex gap-1">{[0,1,2].map(i=><span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div></div>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && !loading && send()} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-[#16A34A] bg-slate-50" placeholder="Ask about March, risks, forecast..." />
        <button onClick={send} disabled={loading || !input.trim()} className="px-4 py-2.5 bg-[#0F172A] hover:bg-[#16A34A] text-white rounded-xl text-sm font-bold disabled:opacity-40">➤</button>
      </div>
    </div>
  );
}


export default function App() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [page, setPage]     = useState('overview');
  const { user, loading: authLoading, isEnabled } = useAuth();

  const reset = useCallback(() => { setResult(null); setPage('overview'); }, []);

  useEffect(() => {
    if (!result || !result.aiLoading) return;
    let cancelled = false;
    generateAIInsights(result).then(aiInsights => {
      if (cancelled) return;
      setResult(prev => prev ? { ...prev, aiInsights, aiLoading: false } : prev);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.aiLoading]);

  // SaaS viability - save history
  useEffect(() => {
    if (result && !result.aiLoading) saveToHistory(result);
  }, [result]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-slate-200 border-t-[#16A34A] rounded-full animate-spin" />
      </div>
    );
  }

  // MANDATORY PASSWORD GATE - must sign in before upload
  if (isEnabled && !user) {
    return <PasswordGateScreen />;
  }

  if (!result) return <UploadScreen onLoaded={r => { setResult(r); setPage('overview'); }} />;

  const titles: Record<string, string> = {
    overview: 'Executive Decision Brief', advisor: 'Verdio Advisor', forecast: 'Forecast', analyses: 'Analyses',
    customers: 'Customer Intelligence', seasonality: 'Seasonality Analysis', health: 'Business Health Score',
    risks: 'Risk Detection', recs: 'Recommendations', products: 'Products & Markets',
    profile: 'Data Understanding', quality: 'Data Quality',
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Sidebar page={page} setPage={setPage} result={result} onReset={reset} />
      <div className="ml-[240px]">
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-7 h-[60px] flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm font-bold text-[#0F172A]">{titles[page]}</p>
            <p className="text-[11px] text-slate-400">{fmtN(result.source.rowCount)} rows · {result.profile.columnCount} columns · Health {result.decision.health.total}/100 · Quality {result.quality.overallScore}/100</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] px-2 py-1 rounded-full bg-[#0F172A] text-white font-bold">Beta</span>
            <button onClick={() => result && openReport(result)} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold hover:bg-white hover:border-[#16A34A]/40 transition-all">
              Export PDF Report
            </button>
            <button onClick={() => { const h=loadHistory(); alert(`History: ${h.length} analyses\n`+h.map((x:any)=>`• ${x.fileName} - Health ${x.healthScore}/100`).join('\n')); }} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold hover:bg-white">
              History ({typeof window !== 'undefined' ? loadHistory().length : 0})
            </button>
            <div className="h-6 w-px bg-slate-200 hidden md:block" />
            <span className="text-xs text-slate-500 max-w-[160px] truncate hidden md:block">{user?.email}</span>
            <button onClick={async ()=>{ const sb=getSupabase(); if(sb) await sb.auth.signOut(); }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-full text-xs font-bold hover:bg-slate-50">
              <LogOut size={12} /> Sign out
            </button>
            <button onClick={reset} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all">
              <RefreshCw size={14} className="text-[#16A34A]" /> Upload New File
            </button>
            <Bell size={18} className="text-slate-400" />
          </div>
        </div>

        <main className="p-7">
          <div className="mb-5"><h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">{titles[page]}</h1></div>
          {page === 'overview'    && <PageOverview r={result} />}
          {page === 'advisor'     && <PageAdvisor r={result} />}
          {page === 'forecast'    && <PageForecast r={result} />}
          {page === 'analyses'    && <PageAnalyses r={result} />}
          {page === 'customers'   && <PageCustomers r={result} />}
          {page === 'seasonality' && <PageSeasonality r={result} />}
          {page === 'health'      && <PageHealth r={result} />}
          {page === 'risks'       && <PageRisks r={result} />}
          {page === 'recs'        && <PageRecs r={result} />}
          {page === 'products'    && <PageProducts r={result} />}
          {page === 'profile'     && <PageDataProfile r={result} />}
          {page === 'quality'     && <PageQuality r={result} />}
        </main>
      </div>
    </div>
  );
}
