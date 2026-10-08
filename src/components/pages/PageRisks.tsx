import type { PipelineResult } from "../../types/pipeline";
import { SkeletonBlock } from "../workspace/Skeleton";
import { StateMark } from "../workspace/StateMark";
import type { Tone } from "../workspace/status";
import { findRiskExplanation } from "./aiLookup";
import { PageEmpty, PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

// high = oxide triangle, medium = brass dot, low = verd check
const LEVEL: Record<string, { tone: Tone; label: string }> = { high: { tone: 'risk', label: 'High risk' }, medium: { tone: 'watch', label: 'Medium risk' }, low: { tone: 'ok', label: 'Low risk' } };

export function PageRisks({ r }: { r: PipelineResult }) {
  if (!r.decision.risks.length) return <PageEmpty message="No risks." />;
  return <div className="v2-view"><PageHead eyebrow="Risks" title={pageLabel('risks')}>{r.decision.risks.length} identified from the active dataset.</PageHead><ol className="v2-ledger" aria-label="Risks">{r.decision.risks.map((risk,i)=>{ const exp=findRiskExplanation(r.aiInsights, risk.title, i); const lv=LEVEL[risk.level]||LEVEL.low; return <li key={i}><div className="v2-ledger-state"><StateMark tone={lv.tone} label={lv.label}/></div><div><h2 className="v2-ledger-title">{risk.title}</h2>{r.aiLoading?<SkeletonBlock lines={2}/>:exp?<p className="v2-ledger-copy">{exp.impact} • {exp.action}</p>:<p className="v2-ledger-copy">{risk.desc}</p>}{(risk.sourceColumns?.length??0)>0&&<p className="v2-tag"><b>{risk.sourceColumns.join(', ')}</b> · risk detection</p>}</div></li>; })}</ol></div>;
}
