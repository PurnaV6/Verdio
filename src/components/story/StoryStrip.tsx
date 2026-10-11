import { useId, useMemo } from "react";
import type { StoryOutcome } from "../../lib/story";
import { StateMark } from "../workspace/StateMark";
import { healthReading } from "../workspace/status";
import { HealthRingBlock } from "./HealthRing";
import { toStoryStripView } from "./storyStripModel";

/* ================================================================
   VERDIO — StoryStrip
   The plain-English block at the top of a page: what happened, why,
   what to do next, how sure we are and where it comes from. All
   text is the story engine's; when the engine cannot tell a story it
   says why and what would fix it, never a blank.
   ================================================================ */

export function StoryStrip({ outcome, title = 'Story' }: { outcome: StoryOutcome; title?: string }) {
  const headingId = useId();
  const view = useMemo(() => toStoryStripView(outcome), [outcome]);
  // A story that rests on the business health score shows it as a ring beside the text. The number is the story's own fact.
  const healthFact = outcome.kind === 'story' ? outcome.facts.health : undefined;
  const health = healthFact && typeof healthFact.value === 'number' ? { value: healthFact.value, ...healthReading(healthFact.value) } : null;

  return (
    <section className={`v2-ov-story${view.kind === 'cannotSay' ? ' is-cannot' : ''}${health ? ' has-ring' : ''}`} aria-labelledby={headingId}>
      <div className="v2-ov-story-main">
        <h2 id={headingId} className="v2-ov-story-title">{title}</h2>
        <dl className="v2-ov-story-parts">
          {view.parts.map(part => (
            <div key={part.id} className="v2-ov-story-part">
              <dt>{part.heading}</dt>
              <dd>{part.text}</dd>
            </div>
          ))}
          {view.kind === 'story' && (
            <div className="v2-ov-story-part">
              <dt>How sure we are</dt>
              <dd><StateMark tone={view.confidence.tone} label={view.confidence.label} /> <span className="v2-ov-story-caveat">{view.confidence.caveat}</span></dd>
            </div>
          )}
          {view.kind === 'story' && view.notes.length > 0 && (
            <div className="v2-ov-story-part">
              <dt>Also worth knowing</dt>
              <dd>
                <ul className="v2-ov-story-notes">
                  {view.notes.map(note => <li key={note}>{note}</li>)}
                </ul>
              </dd>
            </div>
          )}
        </dl>
        {view.kind === 'story' && <p className="v2-tag v2-ov-story-source">{view.source}</p>}
        {view.numbers.length > 0 && (
          <details className="v2-ov-numbers">
            <summary>Show the numbers</summary>
            <div className="v2-ov-numbers-scroll" tabIndex={0} role="region" aria-label="Numbers behind this story">
              <table>
                <caption>Every number in this story and the field it was read from</caption>
                <thead><tr><th scope="col">Number</th><th scope="col">Value</th><th scope="col">Read from</th></tr></thead>
                <tbody>
                  {view.numbers.map(row => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{row.value}</td>
                      <td>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
      {health && <HealthRingBlock value={health.value} label={health.label} tone={health.tone} />}
    </section>
  );
}
