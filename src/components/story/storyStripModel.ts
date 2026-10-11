import { formatters } from "../../lib/story";
import type { StoryFacts, StoryOutcome } from "../../lib/story";
import type { Tone } from "../workspace/status";

/* ================================================================
   VERDIO — StoryStrip model (pure)
   Maps a StoryOutcome from buildStory() to the plain fields the
   StoryStrip renders. No new wording is made here beyond the part
   headings: every sentence is the story engine's own text, so the
   strip can never say something the engine did not.
   ================================================================ */

export interface StoryPart {
  id: 'happened' | 'why' | 'next' | 'reason' | 'fix';
  heading: string;
  text: string;
}

export interface StoryNumber {
  name: string;
  value: string;
  source: string;
}

export interface StoryConfidenceView {
  /** "High confidence": the word that carries the meaning next to its glyph. */
  label: string;
  tone: Tone;
  caveat: string;
}

export type StoryStripView =
  | { kind: 'story'; parts: StoryPart[]; confidence: StoryConfidenceView; source: string; notes: string[]; numbers: StoryNumber[] }
  | { kind: 'cannotSay'; parts: StoryPart[]; numbers: StoryNumber[] };

const CONFIDENCE_TONE: Record<'High' | 'Medium' | 'Low', Tone> = { High: 'ok', Medium: 'watch', Low: 'risk' };

/** "latestSalesChangePct" -> "Latest sales change percent"; "riskColumn1" -> "Risk column 1". */
export function factLabel(name: string): string {
  const words = name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase().replace(/\bpct\b/g, 'percent');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Whole numbers with thousands separators; other numbers to at most 2 decimal places. */
export function factValue(value: number): string {
  if (Number.isInteger(value)) return formatters.formatCount(value);
  return (Math.round(value * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

/** The numeric facts of a story, in the order the engine recorded them. Words are already in the sentences. */
export function numberRows(facts: StoryFacts): StoryNumber[] {
  const rows: StoryNumber[] = [];
  for (const [name, fact] of Object.entries(facts)) {
    if (typeof fact.value !== 'number' || !Number.isFinite(fact.value)) continue;
    rows.push({ name: factLabel(name), value: factValue(fact.value), source: fact.source });
  }
  return rows;
}

export function toStoryStripView(outcome: StoryOutcome): StoryStripView {
  const numbers = numberRows(outcome.facts);
  if (outcome.kind === 'cannotSay') {
    return {
      kind: 'cannotSay',
      parts: [
        { id: 'reason', heading: 'What Verd.io cannot say', text: outcome.reason },
        { id: 'fix', heading: 'What would fix it', text: outcome.fix },
      ],
      numbers,
    };
  }
  const parts: StoryPart[] = [
    { id: 'happened', heading: 'What happened', text: outcome.happened },
    { id: 'why', heading: 'Why it likely happened', text: outcome.why },
  ];
  if (outcome.next !== null) parts.push({ id: 'next', heading: 'What to do next', text: outcome.next });
  return {
    kind: 'story',
    parts,
    confidence: {
      label: `${outcome.confidence.label} confidence`,
      tone: CONFIDENCE_TONE[outcome.confidence.label],
      caveat: outcome.confidence.caveat,
    },
    source: outcome.source,
    notes: outcome.notes,
    numbers,
  };
}
