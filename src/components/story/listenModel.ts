import { formatters } from "../../lib/story";
import type { StoryOutcome } from "../../lib/story";

/* ================================================================
   VERDIO — Listen model (pure)
   Decides what the Listen button says and which voice says it. No
   browser API is touched here, so it can be tested in node. Text is
   turned into the spoken forms the Monday brief already uses (money
   and percentages said, not shown); nothing is added to the story.
   ================================================================ */

const { spokenPercent, spokenPounds, speakable } = formatters;

const MONEY = /([-−])?£(\d(?:[\d,]*\d)?(?:\.\d+)?)([km])?(?![\p{L}\p{N}])/gu;
const PERCENT = /([-−])?(\d+(?:\.\d+)?)\s?%/g;
const OUT_OF_HUNDRED = /(\d+(?:\.\d+)?)\s?\/\s?100\b/g;

/** One sentence in a form a speech engine reads well: no £, %, slashes or other symbols. */
export function toSpoken(text: string): string {
  return speakable(
    text
      .replace(MONEY, (_all, minus: string | undefined, digits: string, unit: string | undefined) => {
        const value = Number(digits.replace(/,/g, '')) * (unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : 1);
        return spokenPounds(minus ? -value : value);
      })
      .replace(PERCENT, (_all, minus: string | undefined, digits: string) => `${minus ? 'minus ' : ''}${spokenPercent(Number(digits))}`)
      .replace(OUT_OF_HUNDRED, '$1 out of 100')
      .replace(/\s*[·•—–]\s*/g, ', ')
      .replace(/…/g, '.')
      .replace(/×/g, ' times ')
      .replace(/≈/g, 'about '),
  )
    .replace(/[^\p{L}\p{N}\s.,;:'’!?()-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/**
 * The utterances for one strip, in the order they are spoken. A brief (the Monday brief's five
 * sentences) is spoken as given; otherwise the story's own what happened, why and next step, or
 * the reason and the fix when the engine cannot tell a story.
 */
export function utterancesFor(outcome: StoryOutcome, brief?: readonly string[]): string[] {
  const lines = brief && brief.length > 0
    ? [...brief]
    : outcome.kind === 'story'
      ? [outcome.happened, outcome.why, ...(outcome.next !== null ? [outcome.next] : [])]
      : [outcome.reason, outcome.fix];
  return lines.map(toSpoken).filter(line => /[\p{L}\p{N}]/u.test(line));
}

/* ── Voices ── */

export interface VoiceLike { name: string; lang: string; localService: boolean; default: boolean }

const normaliseLang = (lang: string) => lang.toLowerCase().replace(/_/g, '-');
const primaryLang = (lang: string) => normaliseLang(lang).split('-')[0];

/** True unless the browser lists voices and none of them runs on this device (a network voice would send the text away). */
export function hasLocalVoice(voices: readonly VoiceLike[]): boolean {
  return voices.length === 0 || voices.some(voice => voice.localService);
}

/**
 * The on-device voice for the page language: an exact match for the first preferred language that
 * has one, then any voice with the same primary language, then the device default voice. Voices
 * that are not local are never chosen. null leaves the choice to the browser (no voices listed yet).
 */
export function chooseVoice<T extends VoiceLike>(voices: readonly T[], preferred: readonly string[]): T | null {
  const local = voices.filter(voice => voice.localService);
  if (local.length === 0) return null;
  const wanted = preferred.map(normaliseLang).filter(Boolean);
  const pick = (matches: T[]) => matches.find(voice => voice.default) ?? matches[0];
  for (const lang of wanted) {
    const exact = local.filter(voice => normaliseLang(voice.lang) === lang);
    if (exact.length > 0) return pick(exact);
  }
  for (const lang of wanted) {
    const same = local.filter(voice => primaryLang(voice.lang) === primaryLang(lang));
    if (same.length > 0) return pick(same);
  }
  return pick(local);
}
