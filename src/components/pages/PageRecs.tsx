import type { PipelineResult } from "../../types/pipeline";
import type { EnrichedRecommendation as EnrichedRec, VDEResult } from "../../lib/decision/verdioDecisionEngine";
import { SkeletonLine } from "../workspace/Skeleton";
import { findRecommendation } from "./aiLookup";
import { Figure, Figures, PageEmpty, PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageRecs({ r }: { r: PipelineResult }) {
  const recs = r.decision.recommendations as EnrichedRec[]; if (!recs.length) return <PageEmpty message="No recommendations." />;
  const vdeMeta = (r as any)._vdeMeta as VDEResult | undefined;
  return (
    <div className="v2-view">
      <PageHead eyebrow="Recommended actions" title={pageLabel('recs')}>{recs.length} {recs.length === 1 ? 'action' : 'actions'} ranked for this dataset.</PageHead>
      {vdeMeta && <section className="v2-panel" aria-label="Decision engine summary"><p className="v2-eyebrow">Verd.io decision engine v2 · financially ranked</p><p className="v2-lede">{vdeMeta.summary}</p><Figures label="Decision engine totals"><Figure label="Value at risk" value={`£${vdeMeta.totalValueAtRisk?.toLocaleString()}`} sub="Planning estimate" /><Figure label="Opportunity" value={`£${vdeMeta.totalOpportunityValue?.toLocaleString()}`} sub="Planning estimate" /><Figure label="Actions" value={recs.length} /></Figures></section>}
      <ol className="v2-ledger v2-ledger-numbered" aria-label="Recommendations">{recs.map((rec,i)=>{ const ai=findRecommendation(r.aiInsights, rec.title, i); return <li key={i}><span className="v2-ledger-n" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><article><div className="v2-ledger-head"><h2 className="v2-ledger-title">{rec.title}</h2><span className="v2-tag">{Math.round(rec.confidence*100)}% confidence</span></div>{r.aiLoading?<SkeletonLine width="70%"/>:ai?<p className="v2-ledger-copy">{ai.action}</p>:<p className="v2-ledger-copy">{rec.desc}</p>}{rec.financialImpact && <dl className="v2-facts"><div><dt>Planning estimate</dt><dd className="v2-fact-fig">£{rec.financialImpact.estimatedValue.toLocaleString()}</dd><dd className="v2-tag">Range £{rec.financialImpact.rangeLow.toLocaleString()}–£{rec.financialImpact.rangeHigh.toLocaleString()}</dd></div><div><dt>Basis for the estimate</dt><dd>{rec.financialImpact.basis}</dd></div><div><dt>Supporting data</dt><dd>{rec.sourceColumns.length ? <span className="v2-tag"><b>{rec.sourceColumns.join(', ')}</b></span> : 'Business-wide operating baseline'}</dd></div></dl>}<details className="v2-details"><summary>View assumptions and decision evidence</summary><div><p><b>Priority:</b> {rec.priorityScore}/100 · <b>Urgency:</b> {rec.urgency.replace('_',' ')} · <b>Estimated effort:</b> {rec.effortDays} days</p><p>Confidence combines data completeness, validity and the quality of the source columns. Pound figures are planning estimates built from the basis shown, and some rest on fixed assumptions. They are an indicative range, not a forecast or a guaranteed outcome.</p></div></details></article></li>; })}</ol>
    </div>
  );
}
