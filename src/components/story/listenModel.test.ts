import { describe, expect, it } from "vitest";
import { buildMondayBrief, buildStory } from "../../lib/story";
import { demoResult, resultFromCsv, salesCsv } from "../../lib/story/testkit";
import { chooseVoice, hasLocalVoice, toSpoken, utterancesFor } from "./listenModel";
import type { VoiceLike } from "./listenModel";

/** Nothing a speech engine would read out as a symbol. */
const SYMBOLS = /[£$€%&<>/\\|*#@^~`_=+[\]{}↔⇄→←↑↓·•—–…×≈"“”]/;

describe("toSpoken", () => {
  it("says money, percentages and out-of-100 scores in words", () => {
    expect(toSpoken('Sales were £148,960 in March, down 4.8% on February.')).toBe('Sales were about 149 thousand pounds in March, down 4.8 percent on February.');
    expect(toSpoken('That is £850 and £4.2k and £1.2m.')).toBe('That is 850 pounds and about 4.2 thousand pounds and about 1.2 million pounds.');
    expect(toSpoken('Profit fell to -£500, a drop of -3.2%.')).toBe('Profit fell to minus 500 pounds, a drop of minus 3.2 percent.');
    expect(toSpoken('Health is 72/100.')).toBe('Health is 72 out of 100.');
  });

  it("turns joining symbols into words and strips the rest", () => {
    expect(toSpoken('Price ↔ volume & margin → review (see "notes") · done')).toBe('Price and volume and margin to review (see notes), done');
    expect(toSpoken('Review east/west stock — now…')).toBe('Review east or west stock, now.');
  });

  it("leaves text that is already spoken unchanged", () => {
    const sentence = 'Sales were about 41 thousand pounds in March 2024, down 4.8 percent on February 2024.';
    expect(toSpoken(sentence)).toBe(sentence);
  });
});

describe("utterancesFor", () => {
  it("speaks the five Monday brief sentences on the Overview, in order", async () => {
    const result = await demoResult();
    const brief = buildMondayBrief(result);
    const spoken = utterancesFor(buildStory('overview', result), brief);
    expect(spoken).toHaveLength(5);
    expect(spoken).toEqual(brief.map(toSpoken));
    expect(spoken.join(' ')).toMatch(/^Your business health is \d+ out of 100/);
    for (const line of spoken) expect(line).not.toMatch(SYMBOLS);
  });

  it("speaks the story's own what happened, why and next step where there is no brief", async () => {
    const result = await demoResult();
    const outcome = buildStory('overview', result);
    if (outcome.kind !== 'story') throw new Error('expected a story');
    const spoken = utterancesFor(outcome);
    expect(spoken).toEqual([outcome.happened, outcome.why, outcome.next as string].map(toSpoken));
    for (const line of spoken) expect(line).not.toMatch(SYMBOLS);
  });

  it("leaves out the next step when the story has none", async () => {
    const outcome = buildStory('overview', await demoResult());
    if (outcome.kind !== 'story') throw new Error('expected a story');
    expect(utterancesFor({ ...outcome, next: null })).toHaveLength(2);
  });

  it("speaks the reason and the fix when the engine cannot tell a story", () => {
    const spoken = utterancesFor({
      kind: 'cannotSay', pageId: 'overview', facts: {},
      reason: 'The file has no date column, so sales over time cannot be read.', fix: 'Map a date column in Data Hub.',
    });
    expect(spoken).toEqual(['The file has no date column, so sales over time cannot be read.', 'Map a date column in Data Hub.']);
  });

  it("is clean for every page story of a small file and the demo", async () => {
    const files = [await demoResult(), await resultFromCsv(salesCsv({ months: 5 }), 'small.csv')];
    for (const file of files) {
      for (const page of ['overview', 'forecast', 'risks', 'recs', 'customers', 'products', 'health', 'profile'] as const) {
        const spoken = utterancesFor(buildStory(page, file));
        expect(spoken.length, page).toBeGreaterThan(0);
        for (const line of spoken) {
          expect(line, `${page}: ${line}`).not.toMatch(SYMBOLS);
          expect(line, page).not.toMatch(/\b(NaN|undefined|null)\b/);
        }
      }
    }
  });
});

const voice = (name: string, lang: string, localService = true, isDefault = false): VoiceLike => ({ name, lang, localService, default: isDefault });

describe("chooseVoice", () => {
  const voices = [
    voice('Network US', 'en-US', false), voice('Local US', 'en-US'), voice('Local GB', 'en-GB'),
    voice('Local FR', 'fr-FR'), voice('Local DE', 'de_DE', true, true),
  ];

  it("picks the document language voice when one is on the device", () => {
    expect(chooseVoice(voices, ['fr'])?.name).toBe('Local FR');
    expect(chooseVoice(voices, ['de-DE'])?.name).toBe('Local DE');
    expect(chooseVoice(voices, ['en-GB'])?.name).toBe('Local GB');
  });

  it("prefers an exact region, then the same language, in the order the languages are given", () => {
    expect(chooseVoice(voices, ['en', 'en-GB'])?.name).toBe('Local GB');
    expect(chooseVoice(voices, ['en-US'])?.name).toBe('Local US');
    expect(chooseVoice(voices, ['en'])?.name).toBe('Local US');
  });

  it("never picks a network voice", () => {
    const onlyNetwork = [voice('Network US', 'en-US', false), voice('Local FR', 'fr-FR')];
    expect(chooseVoice(onlyNetwork, ['en-US'])?.name).toBe('Local FR');
    expect(chooseVoice([voice('Network US', 'en-US', false)], ['en-US'])).toBeNull();
  });

  it("falls back to the device default voice, and to null while no voices are listed", () => {
    expect(chooseVoice(voices, ['ja-JP'])?.name).toBe('Local DE');
    expect(chooseVoice([], ['en'])).toBeNull();
  });
});

describe("hasLocalVoice", () => {
  it("is false only when voices are listed and none run on the device", () => {
    expect(hasLocalVoice([])).toBe(true);
    expect(hasLocalVoice([voice('A', 'en-US', false), voice('B', 'en-GB')])).toBe(true);
    expect(hasLocalVoice([voice('A', 'en-US', false)])).toBe(false);
  });
});
