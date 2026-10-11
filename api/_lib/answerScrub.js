// Post-processing of model answers for /api/chat. Pure functions, no I/O.
//
//   1. normaliseTypography: odd hyphens, spaced dashes and "50 %" become plain punctuation.
//   2. removeInventedReferences: an Advisor sentence that names a page, tab or section that is not
//      one of the real Verd.io pages, or a chart that is not in the CHARTS list of the supplied
//      context, is removed. Numbers and [CHART:id] tokens are never edited.

import { PAGE_NAMES } from './prompts.js';

const CHART_TOKEN = /\[CHART:[A-Za-z0-9_-]+\]/g;
const SPACE = '[ \\t\\u00A0\\u2009\\u202F]';

// ---- typography -------------------------------------------------------------

export function normaliseTypography(text) {
  return String(text)
    // Non-breaking and other typographic hyphens, and en dashes between characters, become '-'.
    .replace(/[‐‑‒⁃]/g, '-')
    // A dash used as a pause, after punctuation, just becomes a space.
    .replace(new RegExp(`([.,;:!?])${SPACE}+[\\u2013\\u2014]${SPACE}+`, 'g'), '$1 ')
    // A spaced en or em dash, or an unspaced em dash, becomes a comma.
    .replace(new RegExp(`${SPACE}*[\\u2013\\u2014]${SPACE}+|${SPACE}+[\\u2013\\u2014]${SPACE}*|\\u2014`, 'g'), ', ')
    // Unspaced en dash (ranges such as 2020-2021).
    .replace(/–/g, '-')
    // "50 %" -> "50%".
    .replace(new RegExp(`(\\d)${SPACE}+%`, 'g'), '$1%');
}

// ---- invented references ----------------------------------------------------

const PAGE_KEYWORDS = new Set(['page', 'tab', 'section']);

/** Lower-case, "&" as "and", no punctuation, single spaces, no leading "the". */
function key(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/ (page|tab|chart|section)$/, '');
}

const REAL_PAGES = new Set(PAGE_NAMES.map(key));

/** Titles and ids from the CHARTS block of the data context the server was given. */
export function chartNamesFromContext(context) {
  const names = new Set();
  const lines = String(context ?? '').split('\n');
  const start = lines.findIndex(line => /^CHARTS:/.test(line));
  if (start === -1) return names;
  for (let i = start; i < lines.length; i += 1) {
    const line = i === start ? lines[i].replace(/^CHARTS:\s*/, '') : lines[i];
    if (!/^ID="/.test(line)) break;
    const id = /ID="([^"\n]*)"/.exec(line)?.[1];
    const title = /Title="([^"\n]*)"/.exec(line)?.[1];
    if (id) names.add(key(id));
    if (title) names.add(key(title));
  }
  return names;
}

// A name that is quoted, italic, bold or in backticks, with the capture group being the name.
const NAME_FORMS = [
  '\\*\\*([^*\\n]{2,80}?)\\*\\*',
  '(?<![*\\w])\\*([^*\\n]{2,80}?)\\*(?!\\*)',
  '(?<!\\w)_([^_\\n]{2,80}?)_(?!\\w)',
  '"([^"\\n]{2,80}?)"',
  '\\u201C([^\\u201D\\n]{2,80}?)\\u201D',
  '\\u2018([^\\u2019\\n]{2,80}?)\\u2019',
  "(?<![\\w'])'([^'\\n]{2,80}?)'(?![\\w'])",
  '`([^`\\n]{2,80}?)`',
];
const KEYWORD = '(page|tab|chart|section)';
// "the *Concentration* page"
const NAME_THEN_KEYWORD = NAME_FORMS.map(form => new RegExp(`${form}\\s*${KEYWORD}\\b`, 'gi'));
// "the page called 'Concentration'"
const KEYWORD_THEN_NAME = NAME_FORMS.map(form => new RegExp(`\\b${KEYWORD}\\s+(?:called|named|titled|labell?ed)\\s*${form}`, 'gi'));

// "go to the Concentration page" with no quotes: only after a navigation verb, capitalised words only.
const NAV_VERBS = ['go to', 'head to', 'head over to', 'navigate to', 'open', 'visit', 'switch to', 'jump to', 'click', 'select', 'view', 'see', 'check']
  .map(verb => `[${verb[0].toUpperCase()}${verb[0]}]${verb.slice(1)}`)
  .join('|');
const WORD = "[A-Z][\\w'-]*";
const VERB_THEN_NAME = new RegExp(
  `\\b(?:${NAV_VERBS})\\s+(?:the\\s+|your\\s+)?(${WORD}(?:\\s+(?:and|of|by|&|${WORD}))*)\\s+(page|tab|chart|section)\\b`,
  'g',
);

const FILE_WORDS = /\b(?:file|spreadsheet|workbook|worksheet|sheet|csv)\b/i;

/** Every [name, keyword] pair in a sentence that points at a named page, tab, section or chart. */
function namedReferences(sentence) {
  const found = [];
  for (const re of NAME_THEN_KEYWORD) for (const m of sentence.matchAll(re)) found.push([m[1], m[2].toLowerCase()]);
  for (const re of KEYWORD_THEN_NAME) for (const m of sentence.matchAll(re)) found.push([m[2], m[1].toLowerCase()]);
  for (const m of sentence.matchAll(VERB_THEN_NAME)) found.push([m[1], m[2].toLowerCase()]);
  return found;
}

function isInvented(sentence, chartNames) {
  for (const [name, keyword] of namedReferences(sentence)) {
    const normalised = key(name);
    if (!normalised) continue;
    if (PAGE_KEYWORDS.has(keyword)) {
      // A user's own spreadsheet can have tabs and sections of its own.
      if (keyword !== 'page' && FILE_WORDS.test(sentence)) continue;
      if (!REAL_PAGES.has(normalised)) return true;
    } else if (!REAL_PAGES.has(normalised) && !chartNames.has(normalised)) {
      return true;
    }
  }
  return false;
}

// One sentence (or list line), including its trailing spaces and any line breaks.
const SENTENCE = /(?:^[ \t]*\d{1,2}[.)][ \t]+)?[\s\S]*?(?:[.!?]+["'”’)\]*_]*(?=\s|$)[ \t]*\n*|\n+|$)/gm;

/**
 * Removes every sentence that sends the user to a page, tab or section that does not exist, or
 * that names a chart that is not in the CHARTS list. [CHART:id] tokens in a removed sentence are kept.
 * Returns the cleaned text, which may be empty.
 */
export function removeInventedReferences(text, chartNames = new Set()) {
  const segments = String(text).match(SENTENCE) || [];
  let out = '';
  for (const segment of segments) {
    if (!segment) continue;
    const tokens = segment.match(CHART_TOKEN) || [];
    const prose = segment.replace(CHART_TOKEN, ' ');
    if (!isInvented(prose, chartNames)) { out += segment; continue; }
    // Keep a paragraph break, and a line break only when the removed sentence did not fill its own line.
    const trailing = segment.match(/\s*$/)[0];
    const ownLine = out === '' || out.endsWith('\n');
    const lineBreaks = trailing.includes('\n') && (!ownLine || trailing.split('\n').length > 2) ? trailing : '';
    out += tokens.length ? `${tokens.join(' ')}${lineBreaks || ' '}` : lineBreaks;
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when nothing but [CHART:id] tokens and whitespace is left. */
export function isEffectivelyEmpty(text) {
  return String(text).replace(CHART_TOKEN, '').trim() === '';
}
