import type { PipelineResult } from "../../types/pipeline";
import { StateMark } from "../workspace/StateMark";
import { healthReading } from "../workspace/status";
import { PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageHealth({ r }: { r: PipelineResult }) {
  const h = r.decision.health;
  const reading = healthReading(h.total);
  return (
    <div className="v2-view">
      <PageHead eyebrow="Business health" title={pageLabel('health')} />
      <section className="v2-rev-hero" aria-label="Overall health score">
        <div>
          <p className="v2-eyebrow">Overall score</p>
          <p className="v2-rev-fig">{h.total}<span className="v2-unit"> / 100</span></p>
          <span className="v2-bar v2-bar-wide" aria-hidden="true"><i style={{ width: `${h.total}%` }} /></span>
        </div>
        <div className="v2-rev-move">
          <p className="v2-eyebrow">Reading</p>
          <StateMark tone={reading.tone} label={reading.label} />
        </div>
      </section>
      <div className="v2-table-wrap"><table className="v2-table"><caption>Health pillars</caption><thead><tr><th scope="col">Pillar</th><th scope="col" className="num">Score</th><th scope="col">Share of maximum</th></tr></thead><tbody>{h.pillars.map(p => <tr key={p.name}><th scope="row">{p.name}</th><td className="num">{p.score}<span className="v2-unit"> / {p.max}</span></td><td className="read"><span className="v2-bar v2-bar-wide" aria-hidden="true"><i style={{ width: `${(p.score / p.max) * 100}%` }} /></span></td></tr>)}</tbody></table></div>
    </div>
  );
}
