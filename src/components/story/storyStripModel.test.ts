import { describe, expect, it } from "vitest";
import { buildStory } from "../../lib/story";
import type { CannotSayResult, StoryResult } from "../../lib/story";
import { demoResult, resultFromCsv, salesCsv } from "../../lib/story/testkit";
import { factLabel, factValue, numberRows, toStoryStripView } from "./storyStripModel";

describe("toStoryStripView: a story", () => {
  it("carries the engine's own sentences, confidence, source and numbers for the demo Overview", async () => {
    const outcome = buildStory('overview', await demoResult()) as StoryResult;
    expect(outcome.kind).toBe('story');
    const view = toStoryStripView(outcome);
    if (view.kind !== 'story') throw new Error('expected a story view');

    expect(view.parts.map(part => part.id)).toEqual(['happened', 'why', 'next']);
    expect(view.parts.map(part => part.text)).toEqual([outcome.happened, outcome.why, outcome.next]);
    expect(view.parts.map(part => part.heading)).toEqual(['What happened', 'Why it likely happened', 'What to do next']);
    expect(view.confidence).toEqual({ label: 'High confidence', tone: 'ok', caveat: outcome.confidence.caveat });
    expect(view.source).toBe(outcome.source);
    expect(view.source).toMatch(/^Source: /);
    expect(view.notes).toEqual(outcome.notes);

    const byName = new Map(view.numbers.map(row => [row.name, row]));
    expect(byName.get('Health')).toMatchObject({ value: '95', source: 'decision.health.total' });
    expect(byName.get('Latest sales')?.value).toBe('148,960');
    expect(byName.get('Rows')?.value).toBe('720');
    expect(byName.get('Latest sales change percent')?.value).toBe('-4.79');
    // Words are in the sentences already; the numbers list holds numbers only.
    expect(byName.has('Health label')).toBe(false);
    expect(view.numbers.every(row => /^-?[\d,]+(\.\d+)?$/.test(row.value))).toBe(true);
  });

  it("leaves out the next step when the story has none", async () => {
    const outcome = buildStory('overview', await demoResult()) as StoryResult;
    const view = toStoryStripView({ ...outcome, next: null });
    expect(view.parts.map(part => part.id)).toEqual(['happened', 'why']);
  });

  it("marks a Low confidence story with the risk tone and the word", async () => {
    const file = await resultFromCsv(salesCsv({ months: 4 }));
    const outcome = buildStory('overview', file);
    if (outcome.kind !== 'story') throw new Error('expected a story');
    const view = toStoryStripView(outcome);
    if (view.kind !== 'story') throw new Error('expected a story view');
    expect(outcome.confidence.label).toBe('Low');
    expect(view.confidence).toMatchObject({ label: 'Low confidence', tone: 'risk' });
    expect(view.confidence.caveat.length).toBeGreaterThan(0);
  });
});

describe("toStoryStripView: cannot say", () => {
  it("shows the reason and the fix in the engine's words, never a blank", async () => {
    const file = await resultFromCsv(salesCsv({ months: 8, date: false }));
    const outcome = buildStory('forecast', file) as CannotSayResult;
    expect(outcome.kind).toBe('cannotSay');
    const view = toStoryStripView(outcome);
    if (view.kind !== 'cannotSay') throw new Error('expected a cannot-say view');

    expect(view.parts.map(part => part.id)).toEqual(['reason', 'fix']);
    expect(view.parts[0].text).toBe(outcome.reason);
    expect(view.parts[1].text).toBe(outcome.fix);
    expect(view.parts[0].text).toBe('A forecast needs at least 6 months of dated sales. Your file has no date column.');
    expect(view.parts.every(part => part.text.trim().length > 0 && part.heading.trim().length > 0)).toBe(true);
  });

  it("keeps the fallback sentences when the engine returns them with no facts", () => {
    const view = toStoryStripView({ kind: 'cannotSay', pageId: 'overview', reason: "I can't build a reliable summary of this page from the file.", fix: 'Check the file in Data Hub, then run the analysis again.', facts: {} });
    expect(view).toEqual({
      kind: 'cannotSay',
      parts: [
        { id: 'reason', heading: 'What Verd.io cannot say', text: "I can't build a reliable summary of this page from the file." },
        { id: 'fix', heading: 'What would fix it', text: 'Check the file in Data Hub, then run the analysis again.' },
      ],
      numbers: [],
    });
  });
});

describe("number rows", () => {
  it("humanises fact names", () => {
    expect(factLabel('latestSalesChangePct')).toBe('Latest sales change percent');
    expect(factLabel('riskColumn1')).toBe('Risk column 1');
    expect(factLabel('rows')).toBe('Rows');
  });

  it("formats whole numbers with separators and other numbers to 2 decimal places", () => {
    expect(factValue(148960)).toBe('148,960');
    expect(factValue(-4.785037648773378)).toBe('-4.79');
    expect(factValue(0)).toBe('0');
    expect(factValue(1.5)).toBe('1.5');
  });

  it("keeps only finite numbers, in the order recorded", () => {
    const rows = numberRows({
      a: { value: 5, source: 'x.a' },
      b: { value: 'text', source: 'x.b' },
      c: { value: Number.NaN, source: 'x.c' },
      d: { value: 1234.5, source: 'x.d' },
    });
    expect(rows).toEqual([
      { name: 'A', value: '5', source: 'x.a' },
      { name: 'D', value: '1,234.5', source: 'x.d' },
    ]);
  });
});
