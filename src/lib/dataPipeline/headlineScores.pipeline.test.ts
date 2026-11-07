import { describe, expect, it } from "vitest";
import { buildStory, buildMondayBriefWithFacts } from "../story";
import { cloneResult, demoResult, resultFromCsv, salesCsv } from "../story/testkit";
import { validateNumbers } from "../story/validateNumbers";
import { compareUploads, takeSnapshot } from "../compare/uploadComparison";
import { toCleaningReportView } from "../../components/pages/cleaningReportModel";
import { guardMoneyText, guardPounds, hasMoneyFigure } from "../../components/workspace/moneyTextModel";
import { healthScoreView, qualityScoreView, scoreText } from "../../components/workspace/scoreCardModel";
import { LIMITED_LABEL, QUALITY_CAP_WHEN_INCOMPLETE, UNRELIABLE_LABEL, headlineHealth, headlineQuality } from "./headlineScores";
import type { PipelineResult } from "../../types/pipeline";

/* The headline Health and Data quality follow the dataset status. Each status goes through the real
   pipeline, then the pure functions and the view models the screens read. No DOM is needed. */

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

const ready = () => resultFromCsv(BASE);
const caveats = () => resultFromCsv(blank(BASE, 'Order Date', 6)); // 10% of dates blank
const incomplete = () => resultFromCsv(blank(BASE, 'Revenue', 30)); // 50% of revenue blank
const notCompatible = () => resultFromCsv(blank(BASE, 'Revenue', 45)); // 75% of revenue blank

function story(r: PipelineResult, page: Parameters<typeof buildStory>[0]) {
  const outcome = buildStory(page, r);
  if (outcome.kind !== 'story') throw new Error(`${page}: ${outcome.reason}`);
  return outcome;
}

describe("headlineQuality and headlineHealth, each status end to end", () => {
  it("ready shows the real numbers", async () => {
    const r = await ready();
    expect(r.datasetStatus?.status).toBe('ready');
    expect(headlineQuality(r)).toEqual({ value: r.quality.overallScore, text: String(r.quality.overallScore), label: null, asUploaded: r.quality.overallScore });
    expect(headlineHealth(r)).toMatchObject({ value: r.decision.health.total, label: null });
  });

  it("caveats shows the real numbers", async () => {
    const r = await caveats();
    expect(r.datasetStatus?.status).toBe('caveats');
    expect(headlineQuality(r)).toMatchObject({ value: r.quality.overallScore, label: null });
    expect(headlineHealth(r)).toMatchObject({ value: r.decision.health.total, label: null });
  });

  it("incomplete caps quality at 60 and says why, and keeps health with the same label", async () => {
    const r = await incomplete();
    expect(r.datasetStatus?.status).toBe('incomplete');
    expect(r.quality.overallScore).toBeGreaterThan(QUALITY_CAP_WHEN_INCOMPLETE);
    expect(headlineQuality(r)).toEqual({ value: 60, text: '60', label: LIMITED_LABEL, asUploaded: r.quality.overallScore });
    expect(headlineHealth(r)).toMatchObject({ value: r.decision.health.total, label: LIMITED_LABEL });
  });

  it("does not raise a quality that is already under the cap", async () => {
    const r = cloneResult(await incomplete());
    r.quality.overallScore = 42;
    expect(headlineQuality(r).value).toBe(42);
  });

  it("not compatible shows n/a for both, labelled, and still carries the real numbers", async () => {
    const r = await notCompatible();
    expect(r.datasetStatus?.status).toBe('not_compatible');
    expect(headlineQuality(r)).toEqual({ value: null, text: 'n/a', label: UNRELIABLE_LABEL, asUploaded: r.quality.overallScore });
    expect(headlineHealth(r)).toEqual({ value: null, text: 'n/a', label: UNRELIABLE_LABEL, asUploaded: r.decision.health.total });
  });

  it("is a pure function: the stored scores are not changed", async () => {
    const r = await notCompatible();
    const before = [r.quality.overallScore, r.decision.health.total];
    headlineQuality(r); headlineHealth(r);
    expect([r.quality.overallScore, r.decision.health.total]).toEqual(before);
  });
});

describe("the demo does not move", () => {
  it("shows quality 100 and health 95 with the pillars 25, 25, 25, 20", async () => {
    const r = await demoResult();
    expect(r.datasetStatus?.status).toBe('ready');
    expect(headlineQuality(r)).toMatchObject({ value: 100, text: '100', label: null });
    expect(headlineHealth(r)).toMatchObject({ value: 95, text: '95', label: null });
    expect(r.decision.health.pillars.map(p => p.score)).toEqual([25, 25, 25, 20]);
    expect(r.qualityAfter?.overallScore).toBe(100);
  });

  it("has no limited label on any screen model", async () => {
    const r = await demoResult();
    expect(healthScoreView(r)).toMatchObject({ text: '95', hasScale: true, limited: null });
    expect(qualityScoreView(r)).toMatchObject({ text: '100', hasScale: true, limited: null, mark: null });
    expect(toCleaningReportView(r)).toMatchObject({ kind: 'report', shownQuality: null });
  });
});

describe("a result saved before the dataset status existed", () => {
  it("keeps the old display everywhere", async () => {
    const r = cloneResult(await notCompatible());
    delete r.datasetStatus;
    expect(headlineQuality(r)).toMatchObject({ value: r.quality.overallScore, label: null });
    expect(headlineHealth(r)).toMatchObject({ value: r.decision.health.total, label: null });
    expect(scoreText(qualityScoreView(r))).toBe(`${r.quality.overallScore} / 100`);
    expect(healthScoreView(r).mark?.label).toBeTruthy();
    expect(healthScoreView(r).limited).toBeNull();
    expect(guardMoneyText(r.datasetStatus, 'The model indicates 41,200 next period.')).toBe('The model indicates 41,200 next period.');
    expect(buildStory('overview', r).kind).toBe('story');
    expect(story(r, 'quality').facts.dataQuality.value).toBe(r.quality.overallScore);
  });
});

describe("score card view models", () => {
  it("incomplete: quality 60 / 100 and health keep their numbers, with the limited label as the mark", async () => {
    const r = await incomplete();
    expect(qualityScoreView(r)).toMatchObject({ text: '60', hasScale: true, barPct: 60, limited: LIMITED_LABEL, mark: { tone: 'watch', label: LIMITED_LABEL } });
    expect(scoreText(qualityScoreView(r))).toBe('60 / 100');
    expect(healthScoreView(r)).toMatchObject({ text: String(r.decision.health.total), hasScale: true, mark: { label: LIMITED_LABEL } });
  });

  it("not compatible: n/a without a scale, an empty bar and a risk mark", async () => {
    const r = await notCompatible();
    for (const view of [healthScoreView(r), qualityScoreView(r)]) {
      expect(view).toMatchObject({ text: 'n/a', hasScale: false, barPct: 0, limited: UNRELIABLE_LABEL, mark: { tone: 'risk', label: UNRELIABLE_LABEL } });
      expect(scoreText(view)).toBe('n/a');
    }
  });
});

describe("the Data Hub report keeps the score as uploaded", () => {
  it("says the real number and why the dashboard shows another, for incomplete and not compatible", async () => {
    const inc = await incomplete();
    const incView = toCleaningReportView(inc);
    if (incView.kind !== 'report') throw new Error('no report');
    expect(incView.shownQuality?.asUploaded).toBe(`Quality as uploaded: ${inc.quality.overallScore} / 100`);
    expect(incView.shownQuality?.explanation).toContain('60 / 100, limited by missing data');
    expect(incView.shownQuality?.explanation).toContain('Incomplete');
    expect(incView.quality.before.overall).toBe(inc.quality.overallScore);

    const not = await notCompatible();
    const notView = toCleaningReportView(not);
    if (notView.kind !== 'report') throw new Error('no report');
    expect(notView.shownQuality?.asUploaded).toBe(`Quality as uploaded: ${not.quality.overallScore} / 100`);
    expect(notView.shownQuality?.explanation).toContain('n/a, not reliable for this file');
    expect(notView.shownQuality?.explanation).toContain('Not compatible');
  });

  it("adds nothing for ready and caveats", async () => {
    for (const r of [await ready(), await caveats()]) {
      const view = toCleaningReportView(r);
      expect(view.kind === 'report' && view.shownQuality).toBeNull();
    }
  });
});

describe("story facts follow the displayed values", () => {
  it("registers the capped quality as dataQuality and the real one as dataQualityAsUploaded", async () => {
    const r = await incomplete();
    const { facts } = story(r, 'health');
    expect(facts.dataQuality.value).toBe(60);
    expect(facts.dataQualityAsUploaded.value).toBe(r.quality.overallScore);
    expect(facts.health.value).toBe(r.decision.health.total);
  });

  it("registers no dataQuality or health for a not compatible file, and says so in words", async () => {
    const r = await notCompatible();
    const health = story(r, 'health');
    expect(health.facts.dataQuality).toBeUndefined();
    expect(health.facts.health).toBeUndefined();
    expect(health.happened).toContain('The health score is not reliable for this file.');
    const advisor = story(r, 'advisor');
    expect(advisor.happened).toContain('not reliable for this file');
    expect(advisor.happened).not.toMatch(new RegExp(`health ${r.decision.health.total}/100`));
    const quality = story(r, 'quality');
    expect(quality.facts.dataQualityAsUploaded.value).toBe(r.quality.overallScore);
    expect(quality.happened).toContain(`Quality as uploaded is ${r.quality.overallScore}/100.`);
    expect(quality.notes.join(' ')).toContain('no score');
    expect(validateNumbers([quality.happened, ...quality.notes].join(' '), quality.facts)).toEqual([]);
  });

  it("the Monday brief says the health score is not reliable and gives no sales or estimate for a not compatible file", async () => {
    const r = await notCompatible();
    const brief = buildMondayBriefWithFacts(r);
    expect(brief.sentences[0]).toBe('Your business health score is not reliable for this file.');
    expect(brief.sentences[1]).toBe('I cannot give reliable sales figures for this file.');
    expect(brief.sentences[3]).not.toMatch(/worth/);
    expect(brief.sentences[4]).not.toMatch(/data quality of/);
    for (const sentence of brief.sentences) expect(validateNumbers(sentence, brief.facts), sentence).toEqual([]);
  });

  it("the Monday brief says health limited by missing data for an incomplete file, and every number has a fact", async () => {
    const r = await incomplete();
    const brief = buildMondayBriefWithFacts(r);
    expect(brief.sentences[0]).toContain(`${r.decision.health.total} out of 100`);
    expect(brief.sentences[0]).toContain('limited by missing data');
    expect(brief.sentences[4]).toContain('data quality of 60 out of 100');
    for (const sentence of brief.sentences) expect(validateNumbers(sentence, brief.facts), sentence).toEqual([]);
  });

  it("the Monday brief for the demo is unchanged by the status work", async () => {
    const r = await demoResult();
    const brief = buildMondayBriefWithFacts(r);
    expect(brief.sentences[0]).toMatch(/^Your business health is 95 out of 100, which is/);
    expect(brief.sentences[4]).toContain('data quality of 100 out of 100');
  });
});

describe("money text for a not compatible file", () => {
  it("recognises pound figures, thousands separators and long numbers but not months or percentages", () => {
    expect(hasMoneyFigure('A planning estimate of £4,200')).toBe(true);
    expect(hasMoneyFigure('The model indicates 41,200 next period')).toBe(true);
    expect(hasMoneyFigure('Worth 120000 next quarter')).toBe(true);
    expect(hasMoneyFigure('Growth is flat at 3% over 12 months in 2025')).toBe(false);
  });

  it("replaces a figure with the label and keeps text with no figure", async () => {
    const not = (await notCompatible()).datasetStatus;
    const ok = (await ready()).datasetStatus;
    expect(guardMoneyText(not, 'The model indicates 41,200 next period.')).toBe('Not reliable for this file.');
    expect(guardMoneyText(not, 'Set up re-engagement triggers 30 days after the last purchase.')).toBe('Set up re-engagement triggers 30 days after the last purchase.');
    expect(guardMoneyText(ok, 'The model indicates 41,200 next period.')).toBe('The model indicates 41,200 next period.');
    expect(guardPounds(not, 4200)).toBe('Not reliable for this file');
    expect(guardPounds(ok, 4200)).toBe('£4,200');
    expect(guardPounds((await incomplete()).datasetStatus, 4200)).toBe('£4,200');
  });
});

describe("the upload comparison follows the headline", () => {
  it("does not set totals or scores of a not compatible file against another", async () => {
    const good = takeSnapshot(await ready());
    const bad = takeSnapshot(await notCompatible());
    expect(bad).toMatchObject({ unreliable: true, totalSales: null, latestMonth: null, health: null, quality: null });
    expect(takeSnapshot(await ready()).unreliable).toBeUndefined();

    const comparison = compareUploads(good, { ...bad, fileName: 'bad.csv' });
    if (comparison?.kind !== 'changed') throw new Error(`expected changed, got ${comparison?.kind}`);
    const row = (id: string) => comparison.rows.find(item => item.id === id)!;
    for (const id of ['sales', 'latest', 'health', 'quality']) {
      expect(row(id).word, id).toBe('Not compared');
      expect(row(id).detail, id).toContain('Not reliable for this file');
      expect(row(id).detail, id).not.toMatch(/£|\d{3}/);
    }
  });

  it("compares the capped quality of an incomplete file, as shown", async () => {
    const snapshot = takeSnapshot(await incomplete());
    expect(snapshot.quality).toBe(60);
    expect(snapshot.unreliable).toBeUndefined();
  });
});
