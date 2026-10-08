import { computeCategoryBreakdown } from "../../lib/analysis/categoryBreakdown";
import { bestColumnOfRole, primaryMeasureColumn } from "../../lib/analysis/pickColumns";
import type { PipelineResult } from "../../types/pipeline";
import { fmtN } from "../workspace/format";
import { PageEmpty, PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageProducts({ r }: { r: PipelineResult }) {
  const measureCol = primaryMeasureColumn(r.semantics.columns, r.engineeredRows); const productCol = bestColumnOfRole(r.semantics.columns, 'product');
  if (!measureCol || !productCol) return <PageEmpty message="No product breakdown." />;
  const rows = computeCategoryBreakdown(r.engineeredRows, productCol, measureCol).slice(0,12);
  return <div className="v2-view"><PageHead eyebrow="Product breakdown" title={pageLabel('products')}><span className="v2-tag"><b>{productCol}</b> · {measureCol}</span></PageHead><div className="v2-table-wrap"><table className="v2-table"><caption>Top {rows.length} products</caption><thead><tr><th scope="col">#</th><th scope="col">Product</th><th scope="col" className="num">Value</th><th scope="col" className="num">Orders</th><th scope="col">Share</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.label}><td className="v2-tag">{i+1}</td><th scope="row">{row.label}</th><td className="num">£{row.value.toLocaleString()}</td><td className="num">{fmtN(row.count)}</td><td className="read"><span className="v2-bar" aria-hidden="true"><i style={{width:`${row.pct}%`}} /></span><span className="v2-tag">{row.pct}%</span></td></tr>)}</tbody></table></div></div>;
}
