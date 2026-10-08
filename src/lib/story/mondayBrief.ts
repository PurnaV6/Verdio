import { healthReading } from "../analysis/healthReading";
import { getRevenueView } from "../analysis/revenueView";
import type { PipelineResult } from "../../types/pipeline";
import type { TimePoint } from "../../types/statistics";
import { buildStory } from "./buildStory";
import { FactBook } from "./facts";
import { formatCount, parsePeriodKey, pluralise, speakable, spokenPercent, spokenPounds } from "./formatters";
import { periodChange, makeCtx } from "./context";
import { firstSentence, wordCount } from "./text";
import type { StoryFacts } from "./types";

/* ================================================================
   VERDIO — Monday brief
   Five spoken sentences for the Listen button. Written for the ear:
   no symbols (pounds and percent are said, not shown), numbers rounded
   to "about 41 thousand" or "about 1.2 million", and no more than 20
   words each. Every number is recorded as a fact so the brief can be
   checked with validateNumbers like any other story text.
   ================================================================ */

export const BRIEF_SENTENCE_COUNT = 5;
export const BRIEF_MAX_WORDS = 20;

export interface MondayBrief { sentences: string[]; facts: StoryFacts }

/** The first candidate that fits the word limit; the last candidate is always short enough. */
function fitSpoken(candidates: string[]): string {
  return candidates.find(candidate => wordCount(candidate) <= BRIEF_MAX_WORDS) ?? candidates[candidates.length - 1];
}

/** "2024-03" -> "March 2024" (and records the year); falls back to the label. */
function spokenPeriod(f: FactBook, point: TimePoint, name: string): string {
  const parsed = parsePeriodKey(point.periodKey);
  if (!parsed) return point.label.replace(/\s+/g, ' ');
  f.n(`${name}Year`, parsed.year, 'statistics.timeSeries[].points[].periodKey');
  return `${parsed.month} ${parsed.year}`;
}

function sentenceOne(f: FactBook, r: PipelineResult): string {
  const total = f.n('health', r.decision.health.total, 'decision.health.total');
  f.scale100();
  const { label, tone } = healthReading(total);
  const reading = tone === 'risk' ? 'which needs attention' : `which is ${label.toLowerCase()}`;
  return `Your business health is ${formatCount(total)} out of 100, ${reading}.`;
}

function sentenceTwo(f: FactBook, r: PipelineResult): string {
  const series = getRevenueView(r).series;
  const points = series?.points ?? [];
  const latest = points.at(-1);
  if (!series || !latest || !Number.isFinite(latest.value)) return 'Your file has no dates, so I cannot say how sales are moving.';
  const sales = spokenPounds(f.n('latestSales', latest.value, 'statistics.timeSeries[].points[last].value'));
  const when = spokenPeriod(f, latest, 'latest');
  const change = periodChange(points);
  if (!change) return fitSpoken([`Sales were ${sales} in ${when}, and there is no earlier month to compare with.`, `Sales were ${sales} in ${when}.`]);
  const before = spokenPeriod(f, change.previous, 'previous');
  if (change.direction === 'level') return fitSpoken([`Sales were ${sales} in ${when}, level with ${before}.`, `Sales were ${sales} in ${when}.`]);
  const pct = spokenPercent(f.n('latestSalesChangePct', change.pct, 'computed from the last two series points'));
  return fitSpoken([`Sales were ${sales} in ${when}, ${change.direction} ${pct} on ${before}.`, `Sales were ${sales} in ${when}, ${change.direction} ${pct}.`, `Sales were ${sales} in ${when}.`]);
}

function sentenceThree(f: FactBook, r: PipelineResult): string {
  const risk = r.decision.risks[0];
  if (!risk) return 'No risk was flagged in this file.';
  const title = f.s('riskTitle', speakable(risk.title), 'decision.risks[0].title');
  const lead = risk.level === 'low' ? 'No serious risk was found, and the leading item is' : 'The biggest risk is';
  return fitSpoken([`${lead} ${title}.`, `${lead} on your Risks page.`, 'The biggest risk is on your Risks page.']);
}

function sentenceFour(f: FactBook, r: PipelineResult): string {
  const top = r.decision.recommendations[0] as (typeof r.decision.recommendations)[number] & {
    financialImpact?: { estimatedValue: number }; effortDays?: number;
  } | undefined;
  if (!top) return 'I have no ranked action for this file yet.';
  const title = f.s('actionTitle', speakable(top.title), 'decision.recommendations[0].title');
  const value = top.financialImpact && Number.isFinite(top.financialImpact.estimatedValue) && top.financialImpact.estimatedValue > 0
    ? spokenPounds(f.n('actionEstimate', top.financialImpact.estimatedValue, 'decision.recommendations[0].financialImpact.estimatedValue')) : null;
  const days = top.effortDays !== undefined && Number.isFinite(top.effortDays) && top.effortDays > 0
    ? pluralise(f.n('effortDays', top.effortDays, 'decision.recommendations[0].effortDays'), 'day') : null;
  return fitSpoken([
    ...(value && days ? [`Do this first: ${title}, worth ${value} and taking about ${days}.`] : []),
    ...(value ? [`Do this first: ${title}, worth ${value}.`] : []),
    `Do this first: ${title}.`,
    'Do this first: the top ranked action.',
  ]);
}

function sentenceFive(f: FactBook, r: PipelineResult): string {
  const overview = buildStory('overview', r);
  const label = (overview.kind === 'story' ? overview.confidence.label : 'Low').toLowerCase();
  const rows = formatCount(f.n('rows', r.source.rowCount, 'source.rowCount'));
  const quality = formatCount(f.n('dataQuality', r.quality.overallScore, 'quality.overallScore'));
  const months = makeCtx(r).P;
  const span = months > 0 ? ` over ${pluralise(f.n('months', months, 'statistics.timeSeries[0].points.length'), 'month')}` : '';
  return fitSpoken([
    `My confidence is ${label}, with ${rows} rows${span} and data quality of ${quality} out of 100.`,
    `My confidence is ${label}, with data quality of ${quality} out of 100.`,
    `My confidence is ${label}.`,
  ]);
}

const FALLBACK = 'I could not read this part of your file.';

/** The five sentences plus the facts behind every number in them. */
export function buildMondayBriefWithFacts(result: PipelineResult): MondayBrief {
  const f = new FactBook();
  const parts = [sentenceOne, sentenceTwo, sentenceThree, sentenceFour, sentenceFive];
  const sentences = parts.map(part => {
    try { return part(f, result); } catch { return FALLBACK; }
  });
  // The brief is spoken: keep the first sentence of anything long and strip stray symbols.
  return { sentences: sentences.map(sentence => firstSentence(sentence) || FALLBACK), facts: f.facts };
}

/** The five spoken sentences for the Listen button. */
export function buildMondayBrief(result: PipelineResult): string[] {
  return buildMondayBriefWithFacts(result).sentences;
}
