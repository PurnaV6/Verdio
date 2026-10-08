import { bestColumnOfRole } from "../../lib/analysis/pickColumns";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";
import { SkeletonLine } from "../workspace/Skeleton";
import { findNarrative } from "./aiLookup";
import { Figure, Figures, PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageAnalyses({ r }: { r: PipelineResult }) {
  const filtered = r.analyses.filter(a => !['comparison', 'concentration_analysis', 'segmentation'].includes(a.capability));
  const revenueColumn=bestColumnOfRole(r.semantics.columns,'revenue');
  const connectedRevenue=r.organization?.metrics?.find(metric=>metric.id==='connected-revenue')?.value;
  const revenue=connectedRevenue??(revenueColumn?r.engineeredRows.reduce((sum,row)=>sum+(Number(row[revenueColumn])||0),0):0);
  const inventoryCoverage=r.organization?.metrics?.find(metric=>metric.id==='inventory-demand-coverage');
  const stockReview=r.organization?.metrics?.find(metric=>metric.id==='products-requiring-review');
  return <div className="v2-view">
    <PageHead eyebrow="Commercial performance" title={pageLabel('analyses')}>Decision-ready KPIs and analytical evidence from the active organisational workspace.{r.organization&&<> <span className="v2-tag">{r.organization.datasets.length} connected sources</span></>}</PageHead>
    <Figures label="Key figures">
      <Figure label="Recognised revenue" value={revenue?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(revenue):'Not available'} sub={connectedRevenue!==undefined?'Connected sales source · reconciled organisational context':revenueColumn?<>Calculated from <b>{revenueColumn}</b></>:'A revenue measure was not detected'}/>
      <Figure label={inventoryCoverage?'Inventory coverage':'Transactions analysed'} value={inventoryCoverage?`${inventoryCoverage.value.toFixed(1)}%`:r.source.rowCount.toLocaleString('en-GB')} sub={inventoryCoverage?'Against demand represented in the sales period':`${r.profile.columnCount} classified columns`}/>
      <Figure label={stockReview?'Products requiring review':'Data quality'} value={stockReview?Math.round(stockReview.value):`${r.quality.overallScore}/100`} sub={stockReview?'Validate lead times and safety stock':'Decision-grade source integrity'}/>
      <Figure label="Analytical coverage" value={`${r.capabilities.available.length}/${r.capabilities.capabilities.length}`} sub="Capability-gated analyses available"/>
    </Figures>
    {filtered.length?<div className="v2-chart-list">{filtered.map((a, i) => { const narrative = findNarrative(r.aiInsights, a.id, i); return <section key={a.id} className="v2-chart-item"><ChartRenderer chart={a.chart} /><div className="v2-chart-note">{r.aiLoading ? <SkeletonLine width="60%" /> : narrative ? <p><b className="v2-ai-tag">AI: </b>{narrative.narrative}</p> : <p className="v2-muted">{a.explanation}</p>}</div></section>; })}</div>:<section className="v2-empty" role="status"><div><h2>No analyses could be generated.</h2></div></section>}
  </div>;
}
