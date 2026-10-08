/* ================================================================
   VERDIO — Story text helpers
   Word and sentence counting, and a fitter that keeps each story part
   inside its limit by choosing the longest wording that fits, never by
   cutting a sentence in half.
   ================================================================ */

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"“'£0-9])/)
    .map(part => part.trim())
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(token => /[A-Za-z0-9£]/.test(token)).length;
}

export function sentenceCount(text: string): number {
  return splitSentences(text).length;
}

export function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? '';
}

/** "Some title." and "Some title" both become "Some title." */
export function asSentence(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, '');
  return trimmed ? `${trimmed}.` : '';
}

export function stripFinalPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

export interface PartLimit { sentences: number; words: number }

export const LIMITS = {
  happened: { sentences: 2, words: 35 },
  why: { sentences: 2, words: 30 },
  next: { sentences: 1, words: 25 },
} as const satisfies Record<string, PartLimit>;

function fits(text: string, limit: PartLimit): boolean {
  return wordCount(text) <= limit.words && sentenceCount(text) <= limit.sentences;
}

/**
 * Builds one story part from groups of alternative wordings. Each group lists its
 * wordings from fullest to shortest; a group whose shortest wording is '' is optional.
 * Groups are filled in order, taking the fullest wording that still lets the rest of
 * the part (at its shortest) stay inside the limit.
 */
export function fitPart(groups: string[][], limit: PartLimit): string {
  const shortest = groups.map(group => group[group.length - 1] ?? '');
  const chosen: string[] = [];
  groups.forEach((group, index) => {
    const later = shortest.slice(index + 1);
    const pick = group.find(option => fits([...chosen, option, ...later].filter(Boolean).join(' '), limit));
    chosen.push(pick ?? shortest[index]);
  });
  return chosen.filter(Boolean).join(' ');
}

/** Words and punctuation that must never reach a user in story text. */
export const BANNED_WORDS = ['because', 'recognised', 'typically', 'leverage'] as const;

export function findBannedWords(text: string): string[] {
  return BANNED_WORDS.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
}

/** True when the text contains a value that should never be printed. */
export function hasBrokenValue(text: string): boolean {
  return /\b(NaN|undefined|null|Infinity)\b|\[object|\{\w+\}/.test(text);
}
