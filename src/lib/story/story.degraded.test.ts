import { beforeAll, describe, expect, it } from "vitest";
import type { PipelineResult } from "../../types/pipeline";
import { buildStory } from "./buildStory";
import { buildMondayBriefWithFacts } from "./mondayBrief";
import { STORY_PAGE_IDS, type CannotSayResult, type StoryInputs, type StoryPageId, type StoryResult } from "./types";
import { cloneResult, demoResult, expectHealthy, resultFromCsv, salesCsv } from "./testkit";
import { validateNumbers } from "./validateNumbers";
import { BANNED_WORDS } from "./text";

const INPUTS: StoryInputs = { teamMembers: 0, auditEvents: 0, today: new Date('2026-03-10T09:00:00Z') };

function outcome(pageId: StoryPageId, result: PipelineResult) {
  return buildStory(pageId, result, INPUTS);
}

function asStory(pageId: StoryPageId, result: PipelineResult): StoryResult {
  const o = outcome(pageId, result);
  if (o.kind !== 'story') throw new Error(`${pageId}: ${o.reason}`);
  return o;
}

function asCannotSay(pageId: StoryPageId, result: PipelineResult): CannotSayResult {
  const o = outcome(pageId, result);
  if (o.kind !== 'cannotSay') throw new Error(`${pageId} unexpectedly gave a story: ${o.happened}`);
  return o;
}

/** Every page, on one awkward file: an answer, or the honest cannot-say, but never anything broken. */
function expectEveryPageHealthy(label: string, result: PipelineResult) {
  for (const pageId of STORY_PAGE_IDS) expectHealthy(outcome(pageId, result), `${label} / ${pageId}`);
  const brief = buildMondayBriefWithFacts(result);
  expect(brief.sentences, label).toHaveLength(5);
  for (const sentence of brief.sentences) {
    expect(sentence, label).not.toMatch(/\bNaN\b|undefined|null|Infinity/);
    expect(validateNumbers(sentence, brief.facts), `${label}: ${sentence}`).toEqual([]);
  }
}

describe('degraded files', () => {
  const files: Record<string, () => Promise<PipelineResult>> = {
    'no date column': () => resultFromCsv(salesCsv({ months: 8, date: false })),
    'no revenue column': () => resultFromCsv(salesCsv({ months: 8, revenue: false, cost: false })),
    'three rows': () => resultFromCsv('Order ID,Revenue\n1,10\n2,20\n3,30'),
    'one row': () => resultFromCsv('Order ID,Revenue\n1,10'),
    'under six months': () => resultFromCsv(salesCsv({ months: 4 })),
    'no customer column': () => resultFromCsv(salesCsv({ months: 14, customer: false })),
    'no cost column': () => resultFromCsv(salesCsv({ months: 14, cost: false })),
    'all sales are zero': () => resultFromCsv(salesCsv({ months: 8, monthly: () => 0 })),
    'every month the same': () => resultFromCsv(salesCsv({ months: 14, monthly: () => 1000 })),
    'sales fall to nothing': () => resultFromCsv(salesCsv({ months: 14, monthly: month => (month === 13 ? 0 : 1000 + month * 10) })),
  };

  for (const [label, load] of Object.entries(files)) {
    it(`answers every page honestly for: ${label}`, async () => {
      expectEveryPageHealthy(label, await load());
    });
  }

  it('says why sales movement cannot be stated when the file has no date', async () => {
    const file = await resultFromCsv(salesCsv({ months: 8, date: false }));
    expect(asStory('overview', file).happened).toContain("I can't say how sales are moving, as the file has no date paired with a sales amount.");
    expect(asStory('overview', file).confidence).toMatchObject({ label: 'Low' });
    expect(asStory('overview', file).confidence.caveat).toContain('no monthly history');
    expect(asCannotSay('forecast', file).reason).toBe('A forecast needs at least 6 months of dated sales. Your file has no date column.');
    expect(asCannotSay('seasonality', file).reason).toBe('Seasonality needs a date, an amount and at least 30 rows.');
    expect(asCannotSay('customers', file).reason).toContain('Missing: date');
    expect(buildMondayBriefWithFacts(file).sentences[1]).toBe('Your file has no dates, so I cannot say how sales are moving.');
  });

  it('says revenue data is not available when no sales amount is mapped', async () => {
    const file = await resultFromCsv(salesCsv({ months: 8, revenue: false, cost: false }));
    const outcomeForRevenue = asCannotSay('revenue', file);
    expect(outcomeForRevenue.reason).toBe('Revenue data is not available.');
    expect(outcomeForRevenue.fix).toBe('Map a numeric sales field in Data Hub.');
  });

  it('keeps Low confidence and the cannot-say forecast under six months', async () => {
    // 40 rows, so the weak link is the four months of history rather than the row count.
    const file = await resultFromCsv(salesCsv({ months: 4, rowsPerMonth: 10 }));
    expect(asCannotSay('forecast', file).reason).toBe('A forecast needs at least 6 months of dated sales. Your file has 4 months.');
    const overview = asStory('overview', file);
    expect(overview.confidence.label).toBe('Low');
    expect(overview.confidence.caveat).toContain('only 4 months');
  });

  it('is honest about a very small dataset', async () => {
    const file = await resultFromCsv('Order ID,Revenue\n1,10\n2,20\n3,30');
    const overview = asStory('overview', file);
    expect(overview.confidence.label).toBe('Low');
    expect(overview.confidence.caveat).toContain('only 3 rows');
    expect(overview.happened).toContain('from 3 rows');
  });

  it('flags the missing customer column', async () => {
    const file = await resultFromCsv(salesCsv({ months: 14, customer: false }));
    expect(asCannotSay('customers', file).reason).toBe('Customer analysis needs a customer, date and amount column. Missing: customer.');
    expect(asStory('health', file).why).toContain('Customer Strength is assumed, not measured.');
  });

  it('puts the cost caveat on Scenario Planning when cost is missing', async () => {
    const file = await resultFromCsv(salesCsv({ months: 14, cost: false }));
    const scenario = asStory('scenarios', file);
    expect(scenario.notes).toContain('Cost is assumed at 55% of sales since the file has no cost column.');
    expect(scenario.confidence.label).toBe('Low');
  });

  it('does not call a drop to nothing flat, and does not divide by a zero month', async () => {
    const file = await resultFromCsv(salesCsv({ months: 14, monthly: month => (month === 12 ? 0 : 1000 + month * 10) }));
    const overview = asStory('overview', file);
    expect(overview.happened.toLowerCase()).not.toContain('flat');
    expect(overview.happened).not.toMatch(/NaN|Infinity/);
  });
});

describe('results with parts removed', () => {
  let demo: PipelineResult;
  beforeAll(async () => { demo = await demoResult(); });

  it('copes with no recommendations, no risks and no analyses', () => {
    const bare = cloneResult(demo);
    bare.decision.recommendations = [];
    bare.decision.risks = [];
    bare.analyses = [];
    expectEveryPageHealthy('bare', bare);
    expect(asCannotSay('recs', bare).reason).toBe('No actions could be ranked from this file.');
    expect(asCannotSay('analyses', bare).kind).toBe('cannotSay');
    expect(asCannotSay('risks', bare).reason).toContain('No risk checks');
    expect(asStory('overview', bare).next).toBeNull();
    expect(asStory('overview', bare).why).toBe('No risks were found in this file.');
  });

  it('reports why risk checks could not run, from the first unavailable capability', () => {
    const blocked = cloneResult(demo);
    blocked.decision.risks = [];
    blocked.capabilities.capabilities[0] = { ...blocked.capabilities.capabilities[0], available: false, reason: 'Requires a date column and a numeric measure.' };
    expect(asStory('overview', blocked).why).toBe('The risk checks could not run on this file: Requires a date column and a numeric measure.');
    expect(asCannotSay('risks', blocked).reason).toBe('No risk checks could run: Requires a date column and a numeric measure.');
  });

  it('copes with no time series, no forecast, no segmentation and no seasonality', () => {
    const flat = cloneResult(demo);
    flat.statistics.timeSeries = [];
    flat.statistics.seasonality = null;
    flat.ml = { forecast: null, anomalies: null, segmentation: null };
    expectEveryPageHealthy('no ml', flat);
    expect(asStory('revenue', flat).happened).toContain("I can't say how sales are moving");
  });

  it('copes with no semantic columns at all', () => {
    const blind = cloneResult(demo);
    blind.semantics = { columns: [], warnings: [] };
    expectEveryPageHealthy('no semantics', blind);
    expect(asCannotSay('profile', blind).reason).toBe('No columns were read from this file.');
  });

  it('copes with recommendations that carry no financial impact', () => {
    const plain = cloneResult(demo);
    plain.decision.recommendations = plain.decision.recommendations.map(rec => ({ title: rec.title, desc: rec.desc, impact: rec.impact, sourceColumns: rec.sourceColumns }));
    expectEveryPageHealthy('plain recs', plain);
  });

  it('never prints NaN: a broken number becomes the honest fallback', () => {
    const broken = cloneResult(demo);
    broken.decision.health.total = Number.NaN;
    const o = asCannotSay('overview', broken);
    expect(o.reason).toBe("I can't build a reliable summary of this page from the file.");
    expect(o.reason + o.fix).not.toMatch(/NaN/);
  });

  it('never lets a banned word through from a risk description', () => {
    const tainted = cloneResult(demo);
    tainted.decision.risks[0] = { ...tainted.decision.risks[0], desc: 'This is bad because of leverage. Typically it recovers.' };
    const text = JSON.stringify([outcome('risks', tainted), outcome('overview', tainted)]).toLowerCase();
    // The description is quoted verbatim, so the engine must refuse it rather than print it.
    for (const word of BANNED_WORDS) expect(text, word).not.toContain(word);
  });
});
