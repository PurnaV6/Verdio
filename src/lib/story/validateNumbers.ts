import type { StoryFact } from "./types";

/* ================================================================
   VERDIO — Number validator
   Extracts every number from a piece of text and checks each one is
   backed by a recorded fact. It will gate AI-written text, so it errs
   on the side of rejecting.

   Rules
   - Digits are read with thousands separators ("41,200"), decimals
     ("8.1") and the symbols % and £, which are ignored.
   - Scale suffixes are understood: "41k", "1.2m", "2bn", "41 thousand",
     "1.2 million", "3 billion". "5 m" and "12 months" are NOT scales.
   - A number matches a fact when it equals the fact rounded to the number
     of decimal places shown. "41k" therefore matches 41,000 to 41,499 and
     "41.2k" matches 41,150 to 41,249; "about 41 thousand" is the same as "41k".
   - Signs are ignored (text says "down 8.1%" for -8.1), and a hyphen between
     two numbers is a range ("£12,000-£13,000"), not a minus.
   - Digits that sit inside a string fact (a month label such as "Mar 24", a
     file name, a column name, a risk title) are quotes, not claims, and are
     skipped. Only string facts that contain both a letter and a digit count.
   - Number words ("twelve") are not checked: only digits are.
   ================================================================ */

export type FactsInput = Record<string, StoryFact | number | string>;

const NUMBER_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?(thousand|million|billion)\b|(k|m|bn)\b)?/gi;

const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, bn: 1e9 };

export interface ExtractedNumber {
  /** The text as written, e.g. "41,200" or "1.2 million". */
  text: string;
  /** The value after applying any scale suffix. */
  value: number;
  /** Half the size of the last digit shown (scaled): how far a real value may sit from it. */
  tolerance: number;
}

function factValue(fact: StoryFact | number | string): number | string {
  return typeof fact === 'object' ? fact.value : fact;
}

function stripQuotedStrings(text: string, facts: FactsInput): string {
  const quotes = Object.values(facts)
    .map(factValue)
    .filter((value): value is string => typeof value === 'string' && /[A-Za-z]/.test(value) && /\d/.test(value))
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const quote of quotes) out = out.split(quote).join(' ');
  return out;
}

export function extractNumbers(text: string): ExtractedNumber[] {
  const found: ExtractedNumber[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const [whole, integer, decimal, word, short] = match;
    const scale = SCALE[(word ?? short ?? '').toLowerCase()] ?? 1;
    const decimals = decimal ? decimal.length - 1 : 0;
    const base = Number(integer.replace(/,/g, '') + (decimal ?? ''));
    found.push({ text: whole.trim(), value: base * scale, tolerance: 0.5 * 10 ** -decimals * scale });
  }
  return found;
}

/**
 * Returns the numbers in `text` that no fact backs, as written (de-duplicated, in order).
 * An empty array means every number is accounted for.
 */
export function validateNumbers(text: string, facts: FactsInput): string[] {
  const known = Object.values(facts)
    .map(factValue)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map(Math.abs);
  const offending: string[] = [];
  for (const number of extractNumbers(stripQuotedStrings(text, facts))) {
    const backed = known.some(value => Math.abs(value - number.value) <= number.tolerance + 1e-9 * Math.max(1, number.value));
    if (!backed && !offending.includes(number.text)) offending.push(number.text);
  }
  return offending;
}
