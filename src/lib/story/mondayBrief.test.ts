import { beforeAll, describe, expect, it } from "vitest";
import { getRevenueView } from "../analysis/revenueView";
import { healthReading } from "../analysis/healthReading";
import type { EnrichedRecommendation } from "../decision/verdioDecisionEngine";
import type { PipelineResult } from "../../types/pipeline";
import { buildStory } from "./buildStory";
import { buildMondayBrief, buildMondayBriefWithFacts } from "./mondayBrief";
import { BANNED_WORDS, wordCount } from "./text";
import { cloneResult, demoResult, resultFromCsv, salesCsv } from "./testkit";
import { validateNumbers } from "./validateNumbers";

let demo: PipelineResult;
beforeAll(async () => { demo = await demoResult(); });

/** Spoken text: no symbols, only words, digits, and plain punctuation. */
const SYMBOLS = /[£$€%&/\\<>=+*#@^~|↔→←_[\]{}]/;

function expectSpoken(brief: ReturnType<typeof buildMondayBriefWithFacts>, label: string) {
  expect(brief.sentences, label).toHaveLength(5);
  for (const sentence of brief.sentences) {
    expect(wordCount(sentence), `${label}: "${sentence}"`).toBeLessThanOrEqual(20);
    expect(sentence, label).not.toMatch(SYMBOLS);
    expect(sentence, label).not.toMatch(/\bNaN\b|undefined|null|Infinity/);
    expect(sentence.trim().endsWith('.'), `${label}: ends with a full stop`).toBe(true);
    expect(sentence.match(/[.!?](\s|$)/g)?.length, `${label}: one sentence "${sentence}"`).toBe(1);
    expect(validateNumbers(sentence, brief.facts), `${label}: "${sentence}"`).toEqual([]);
    for (const word of BANNED_WORDS) expect(sentence.toLowerCase(), label).not.toContain(word);
  }
}

describe('buildMondayBrief', () => {
  it('returns exactly five short, symbol-free, number-backed sentences for the demo', () => {
    expectSpoken(buildMondayBriefWithFacts(demo), 'demo');
    expect(buildMondayBrief(demo)).toHaveLength(5);
  });

  it('says health, sales movement, risk, first action and confidence from the computed fields', () => {
    const [health, sales, risk, action, confidence] = buildMondayBrief(demo);
    const total = demo.decision.health.total;
    expect(health).toBe(`Your business health is ${total} out of 100, ${healthReading(total).tone === 'risk' ? 'which needs attention' : `which is ${healthReading(total).label.toLowerCase()}`}.`);

    const points = getRevenueView(demo).series!.points;
    const latest = points.at(-1)!, previous = points.at(-2)!;
    const pct = Math.abs(((latest.value - previous.value) / Math.abs(previous.value)) * 100);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const spoken = (key: string) => `${months[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
    expect(sales).toContain(`in ${spoken(latest.periodKey)}`);
    expect(sales).toContain(`${latest.value >= previous.value ? 'up' : 'down'} ${pct.toFixed(1)} percent on ${spoken(previous.periodKey)}`);
    expect(sales).toMatch(/^Sales were about \d+(\.\d)? (thousand|million) pounds/);

    expect(risk).toContain(demo.decision.risks[0].title);

    const top = demo.decision.recommendations[0] as EnrichedRecommendation;
    expect(action).toContain('Do this first:');
    expect(action).toContain(`about ${top.effortDays} day`);
    expect(action).toMatch(/worth about [\d.]+ (thousand|million) pounds|worth \d+ pounds/);

    const overview = buildStory('overview', demo);
    expect(overview.kind).toBe('story');
    expect(confidence).toContain(`My confidence is ${overview.kind === 'story' ? overview.confidence.label.toLowerCase() : ''}`);
    expect(confidence).toContain(`${demo.source.rowCount} rows over ${demo.statistics.timeSeries[0].points.length} months`);
    expect(confidence).toContain(`data quality of ${demo.quality.overallScore} out of 100`);
  });

  it('rounds sales to a spoken size', () => {
    const big = cloneResult(demo);
    const series = getRevenueView(big).series!;
    series.points = series.points.slice(0, 3).map((point, i) => ({ ...point, value: [1_100_000, 1_300_000, 1_234_567][i] }));
    expect(buildMondayBrief(big)[1]).toContain('about 1.2 million pounds');
    series.points[2].value = 41_234;
    series.points[1].value = 38_000;
    expect(buildMondayBrief(big)[1]).toContain('about 41 thousand pounds');
  });

  it('says there is no earlier month, never flat, when the previous month is zero', () => {
    const zero = cloneResult(demo);
    const series = getRevenueView(zero).series!;
    series.points = series.points.slice(0, 3).map((point, i) => ({ ...point, value: [100, 0, 250][i] }));
    const sentence = buildMondayBrief(zero)[1];
    expect(sentence).toContain('no earlier month to compare with');
    expect(sentence.toLowerCase()).not.toContain('flat');
    expectSpoken(buildMondayBriefWithFacts(zero), 'zero previous month');
  });

  it('says the file has no dates when there is no series', async () => {
    const file = await resultFromCsv(salesCsv({ months: 8, date: false }));
    const brief = buildMondayBriefWithFacts(file);
    expect(brief.sentences[1]).toBe('Your file has no dates, so I cannot say how sales are moving.');
    expectSpoken(brief, 'no dates');
  });

  it('copes with empty risks and recommendations', () => {
    const bare = cloneResult(demo);
    bare.decision.risks = [];
    bare.decision.recommendations = [];
    const brief = buildMondayBriefWithFacts(bare);
    expect(brief.sentences[2]).toBe('No risk was flagged in this file.');
    expect(brief.sentences[3]).toBe('I have no ranked action for this file yet.');
    expectSpoken(brief, 'bare');
  });

  it('turns symbols in titles into words so they can be spoken', () => {
    const odd = cloneResult(demo);
    odd.decision.risks[0] = { ...odd.decision.risks[0], title: 'Revenue ↔ Cost & Margin / 50% share' };
    odd.decision.recommendations[0] = { ...odd.decision.recommendations[0], title: 'Re-engage 12 at-risk/lapsed customers' };
    const brief = buildMondayBriefWithFacts(odd);
    expect(brief.sentences[2]).toBe('The biggest risk is Revenue and Cost and Margin or 50 percent share.');
    expect(brief.sentences[3]).toContain('Re-engage 12 at-risk or lapsed customers');
    expectSpoken(brief, 'symbols');
  });

  it('keeps long titles inside twenty words', () => {
    const long = cloneResult(demo);
    long.decision.risks[0] = { ...long.decision.risks[0], title: 'An extremely long risk title that goes on and on well beyond what anyone would want to hear read out in one go' };
    long.decision.recommendations[0] = { ...long.decision.recommendations[0], title: 'An extremely long action title that goes on and on well beyond what anyone would want to hear read out in one go' };
    expectSpoken(buildMondayBriefWithFacts(long), 'long titles');
  });
});
