import { TONE_GLYPH, type Tone } from "./status";

// A state is always a word plus a shape plus a colour, never colour alone.
export function StateMark({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`v2-state is-${tone}`}><span aria-hidden="true">{TONE_GLYPH[tone]}</span> {label}</span>;
}
