import { describe, expect, it } from "vitest";
import { buildStory } from "../story";
import { cloneResult, expectHealthy, resultFromCsv, salesCsv, storyText } from "../story/testkit";
import type { PipelineResult } from "../../types/pipeline";
import type { StoryResult } from "../story";

/* Each status end to end: a CSV goes through the real pipeline, the status is read off the result,
   and the story engine speaks about it only through recorded facts. */

/** Blanks `column` on the first `count` data rows of a CSV. */
function blank(csv: string, column: string, count: number): string {
  const [head, ...lines] = csv.split('\n');
  const at = head.split(',').indexOf(column);
  return [head, ...lines.map((line, i) => {
    if (i >= count) return line;
    const cells = line.split(',');
    cells[at] = '';
    return cells.join(',');
  })].join('\n');
}

const BASE = salesCsv({ months: 12, rowsPerMonth: 5 }); // 60 rows, clean

async function run(csv: string, name = 'status.csv'): Promise<PipelineResult> {
  return resultFromCsv(csv, name);
}

function asStory(result: PipelineResult, page: Parameters<typeof buildStory>[0] = 'overview'): StoryResult {
  const outcome = buildStory(page, result);
  if (outcome.kind !== 'story') throw new Error(`${page}: ${outcome.reason}`);
  return outcome;
}

describe("ready", () => {
  it("is ready with no triggers and no banner words in the story", async () => {
    const r = await run(BASE);
    expect(r.datasetStatus).toMatchObject({ status: 'ready', triggers: [] });
    expect(asStory(r).confidence.label).not.toBe('Low');
    expect(storyText(asStory(r))).not.toMatch(/Dataset status/);
  });
});

describe("usable with caveats", () => {
  it("is set by dates blank on 5 to 20 percent of rows, with the numbers in the reason", async () => {
    const r = await run(blank(BASE, 'Order Date', 6)); // 6 of 60 = 10%
    expect(r.datasetStatus?.status).toBe('caveats');
    expect(r.datasetStatus?.reasons).toEqual(['Order Date is blank on 10% of rows (6 of 60), so those rows are missing from the monthly trend, forecast and seasonality.']);
  });

  it("is set by rows left out for a zero amount", async () => {
    const csv = BASE.split('\n').map((line, i) => (i > 0 && i <= 3 ? line.replace(/,\d+,\d+,(\d+)$/, ',0,0,$1') : line)).join('\n');
    const r = await run(csv);
    expect(r.cleaning.rowsExcluded?.zero_revenue ?? 0).toBeGreaterThan(0);
    expect(r.datasetStatus?.status).toBe('caveats');
    expect(r.datasetStatus?.triggers.map(t => t.id)).toContain('rows_left_out_some');
  });

  it("keeps the story confidence as it was and adds a note on the data pages", async () => {
    const r = await run(blank(BASE, 'Order Date', 6));
    expect(buildStory('overview', r).kind).toBe('story');
    expect(asStory(r, 'quality').notes.join(' ')).toContain('Dataset status is usable with caveats.');
  });
});

describe("incomplete", () => {
  it("is set by dates blank on more than 20 percent of rows", async () => {
    const r = await run(blank(BASE, 'Order Date', 15)); // 25%
    expect(r.datasetStatus?.status).toBe('incomplete');
    expect(r.datasetStatus?.triggers[0].id).toBe('dates_blank_many');
  });

  it("is set by revenue blank on 40 to 60 percent of rows when it cannot be calculated", async () => {
    const r = await run(blank(BASE, 'Revenue', 30)); // 50%
    expect(r.datasetStatus?.status).toBe('incomplete');
    expect(r.datasetStatus?.reasons).toContain('Revenue is blank on 50% of rows (30 of 60), so totals may understate sales.');
  });

  it("keeps the numbers but lowers story confidence to Low, with the reason in the caveat", async () => {
    const r = await run(blank(BASE, 'Revenue', 30));
    const story = asStory(r);
    expect(story.confidence.label).toBe('Low');
    expect(story.confidence.caveat).toContain('Revenue is blank on 50% of rows (30 of 60), so totals may understate sales');
    expect(story.happened).toMatch(/£/);
    expectHealthy(story, 'overview');
  });

  it("measures revenue blanks after price x quantity is worked out", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `O-${i},2024-${String(1 + (i % 12)).padStart(2, '0')}-10,${2 + (i % 5)},10,${i < 24 ? '' : String((2 + (i % 5)) * 10)}`);
    const r = await run(`Order ID,Order Date,Units,Unit Price,Revenue\n${lines.join('\n')}`);
    expect(r.cleaning.rowsCalculated).toBe(24);
    expect(r.datasetStatus?.triggers.map(t => t.id)).not.toContain('revenue_half_blank');
    expect(r.datasetStatus?.triggers.map(t => t.id)).toContain('revenue_calculated');
    expect(r.datasetStatus?.status).toBe('caveats');
  });
});

describe("not compatible", () => {
  it("is set by revenue blank on more than 60 percent of rows", async () => {
    const r = await run(blank(BASE, 'Revenue', 40)); // 66.7%
    expect(r.datasetStatus?.status).toBe('not_compatible');
    expect(r.datasetStatus?.triggers[0].id).toBe('revenue_mostly_blank');
    // every trigger that fired is listed: the left-out rows too
    expect(r.datasetStatus?.triggers.map(t => t.id)).toContain('rows_left_out_many');
    expect(r.datasetStatus?.reasons).toHaveLength(r.datasetStatus!.triggers.length);
  });

  it("is set by a file with no sales amount column", async () => {
    const r = await run(salesCsv({ months: 12, rowsPerMonth: 5, revenue: false, cost: false }).replace(/,Units/, ',Notes').replace(/,\d+$/gm, ',x'));
    expect(r.datasetStatus?.status).toBe('not_compatible');
    expect(r.datasetStatus?.triggers.map(t => t.id)).toContain('no_sales_column');
  });

  it("is set by fewer than 10 usable rows", async () => {
    const r = await run('Order ID,Order Date,Revenue\nA,2024-01-01,10\nB,2024-02-01,20\nC,2024-03-01,30');
    expect(r.datasetStatus?.status).toBe('not_compatible');
    expect(r.datasetStatus?.triggers.map(t => t.id)).toContain('too_few_rows');
  });

  it("makes the Overview story the cannot-say state, with the sentence and every reason", async () => {
    const r = await run(blank(BASE, 'Revenue', 40));
    const outcome = buildStory('overview', r);
    expect(outcome.kind).toBe('cannotSay');
    if (outcome.kind !== 'cannotSay') return;
    expect(outcome.reason).toContain('Verd.io cannot give reliable sales figures for this file.');
    for (const reason of r.datasetStatus!.reasons) expect(outcome.reason).toContain(reason);
    expectHealthy(outcome, 'overview');
  });

  it("leaves the stories about the data itself alone", async () => {
    const r = await run(blank(BASE, 'Revenue', 40));
    expect(asStory(r, 'profile').notes.join(' ')).toContain('Dataset status is not compatible.');
    expect(asStory(r, 'quality').confidence.label).toBe('Low');
  });
});

describe("repeated rows", () => {
  it("are named in the reason and every number is a recorded fact", async () => {
    const lines = BASE.split('\n');
    const withRepeats = [...lines, lines[1], lines[2]].map((line, i) => (i >= 5 && i <= 8 ? line.replace(/,\d+,\d+,(\d+)$/, ',0,0,$1') : line));
    const r = await run(withRepeats.join('\n'));
    expect(r.cleaning.rowsExcluded?.duplicate).toBe(2);
    expect(r.datasetStatus?.reasons.join(' ')).toContain('not counting 2 repeated rows');
    const story = asStory(r, 'quality');
    expectHealthy(story, 'quality');
    expect(Object.keys(story.facts).some(name => name.endsWith('RepeatedRows'))).toBe(true);
  });
});

describe("old saved results", () => {
  it("have no status, and every story is built as before", async () => {
    const r = cloneResult(await run(BASE));
    delete r.datasetStatus;
    delete r.qualityAfter;
    for (const page of ['overview', 'revenue', 'profile', 'quality'] as const) {
      const outcome = buildStory(page, r);
      expect(outcome.kind, page).toBe('story');
      expectHealthy(outcome, page);
    }
    expect(storyText(asStory(r, 'quality'))).not.toMatch(/Dataset status|on the file as uploaded/);
  });
});
