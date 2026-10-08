import type { PipelineResult } from "../../types/pipeline";
import { Figure, Figures, PageHead } from "./PageParts";

export function PageQuality({ r }: { r: PipelineResult }) { return <div className="v2-view"><PageHead eyebrow="Data quality" title="Quality scores"><span className="v2-tag"><b>quality check</b> · completeness, validity, consistency</span></PageHead><Figures label="Quality scores">{[{l:'Overall',v:r.quality.overallScore},{l:'Completeness',v:r.quality.completenessScore},{l:'Validity',v:r.quality.validityScore},{l:'Consistency',v:r.quality.consistencyScore}].map(s=><Figure key={s.l} label={s.l} value={s.v} unit=" / 100" sub={<span className="v2-bar v2-bar-wide" aria-hidden="true"><i style={{width:`${s.v}%`}} /></span>} />)}</Figures></div>; }
