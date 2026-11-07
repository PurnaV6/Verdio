import { describe, expect, it } from "vitest";
import { demoResult, expectHealthy, resultFromCsv } from "../story/testkit";
import { buildStory } from "../story";
import { assessDataQuality } from "./dataQualityEngine";
import { profileDataset } from "./profileDataset";
import { parseDataset } from "./parseDataset";

/* result.quality is the score of the file as uploaded. Filling, calculating or leaving rows out can
   never raise it. result.qualityAfter scores the rows that count toward sales, for the "after" view. */

function tinyRng(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

/** A dirty sales file: blanks, text markers, zeros, returns, repeated rows and currency formats, all chosen by the seed. */
function dirtyCsv(seed: number): string {
  const next = tinyRng(seed * 7919 + 13);
  const rows = 24 + Math.floor(next() * 40);
  const lines = ['Order ID,Order Date,Product,Region,Units,Unit Price,Revenue'];
  for (let i = 0; i < rows; i += 1) {
    const units = 1 + Math.floor(next() * 9);
    const price = 5 + Math.floor(next() * 90);
    const revenue = units * price;
    const day = String(1 + Math.floor(next() * 27)).padStart(2, '0');
    const month = String(1 + Math.floor(next() * 12)).padStart(2, '0');
    const dirt = next();
    const date = dirt < 0.1 ? '' : dirt < 0.2 ? `${day}/${month}/2024` : `2024-${month}-${day}`;
    const revenueCell = dirt > 0.9 ? '' : dirt > 0.8 ? `$${revenue.toLocaleString('en-US')}.00` : dirt > 0.75 ? 'N/A' : String(revenue);
    const unitsCell = dirt > 0.6 && dirt < 0.65 ? '0' : dirt > 0.65 && dirt < 0.7 ? '-1' : String(units);
    const region = next() < 0.3 ? '' : ['North', 'South', 'East'][Math.floor(next() * 3)];
    const line = [`O-${i}`, date, ['Alpha', 'Beta', 'Gamma'][Math.floor(next() * 3)], region, unitsCell, String(price), revenueCell].join(',');
    lines.push(line);
    if (next() < 0.06) lines.push(line);
  }
  return lines.join('\n');
}

describe("quality is scored on the file as uploaded", () => {
  it("equals the quality report of the raw rows and raw profile", async () => {
    const csv = dirtyCsv(3);
    const parsed = await parseDataset(new File([csv], 'dirty.csv', { type: 'text/csv' }));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const result = await resultFromCsv(csv);
    const raw = assessDataQuality(parsed.data.rows, profileDataset(parsed.data.rows), result.semantics);
    expect(result.quality.overallScore).toBe(raw.overallScore);
    expect(result.quality.completenessScore).toBe(raw.completenessScore);
    expect(result.quality.flags).toEqual(raw.flags);
  });

  it("is not raised by calculating a blank revenue", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `O-${i},2024-0${1 + (i % 9)}-1${i % 9},${i + 2},10,${i < 8 ? '' : String((i + 2) * 10)}`);
    const csv = `Order ID,Order Date,Units,Unit Price,Revenue\n${lines.join('\n')}`;
    const result = await resultFromCsv(csv);
    expect(result.cleaning.rowsCalculated).toBe(8);
    const revenueRaw = result.quality.columns.find(column => column.column === 'Revenue')!;
    const revenueAfter = result.qualityAfter!.columns.find(column => column.column === 'Revenue')!;
    expect(revenueRaw.completeness).toBe(60);
    expect(revenueAfter.completeness).toBe(100);
    expect(result.qualityAfter!.overallScore).toBeGreaterThan(result.quality.overallScore);
  });

  it("is not raised by leaving rows out", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `O-${i},2024-01-${String(1 + (i % 27)).padStart(2, '0')},${i % 3 === 0 ? 0 : 5},${i % 3 === 0 ? '' : 100}`);
    const result = await resultFromCsv(`Order ID,Order Date,Units,Revenue\n${lines.join('\n')}`);
    expect(result.analysisRowCount!).toBeLessThan(result.source.rowCount);
    expect(result.qualityAfter!.overallScore).toBeGreaterThanOrEqual(result.quality.overallScore);
    expect(result.quality.overallScore).toBeLessThan(100);
  });

  it("feeds the health score from the raw quality", async () => {
    const result = await resultFromCsv(dirtyCsv(5));
    const qualityPillar = result.decision.health.pillars.find(pillar => pillar.name === 'Data Quality')!;
    expect(qualityPillar.score).toBe(Math.round((result.quality.overallScore / 100) * 25));
  });
});

describe("qualityAfter is never lower than quality (property over dirty files)", () => {
  const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
  it.each(seeds)("seed %i", async seed => {
    const result = await resultFromCsv(dirtyCsv(seed));
    expect(result.qualityAfter).toBeDefined();
    expect(result.qualityAfter!.overallScore).toBeGreaterThanOrEqual(result.quality.overallScore);
    /* Completeness weights key columns 3x, and leaving rows out can raise the blank share of a column that was not the cause (a date), so it may dip by a point or two. */
    expect(result.qualityAfter!.completenessScore).toBeGreaterThanOrEqual(result.quality.completenessScore - 2);
    expect(result.qualityAfter!.consistencyScore).toBeGreaterThanOrEqual(result.quality.consistencyScore);
  });
});

describe("the quality story says both scores through registered facts", () => {
  it("adds a note only when the two differ, and every number has a fact", async () => {
    const result = await resultFromCsv(dirtyCsv(2));
    const story = buildStory('quality', result);
    if (story.kind !== 'story') throw new Error(story.reason);
    expectHealthy(story, 'quality');
    if (result.qualityAfter!.overallScore !== result.quality.overallScore) {
      expect(story.notes.join(' ')).toContain('on the file as uploaded');
      expect(story.facts.dataQualityAfter.value).toBe(result.qualityAfter!.overallScore);
    }
  });
});

describe("the demo does not move", () => {
  it("keeps quality 100, the same on both views, and nothing cleaned", async () => {
    const r = await demoResult();
    expect(r.quality.overallScore).toBe(100);
    expect(r.qualityAfter?.overallScore).toBe(100);
    expect(r.cleaning.actions).toEqual([]);
    expect(r.datasetStatus).toMatchObject({ status: 'ready', triggers: [] });
  });

  it("keeps revenue, health, pillars and customers", async () => {
    const r = await demoResult();
    expect(r.engineeredRows.reduce((sum, row) => sum + Number(row['Revenue']), 0)).toBe(3292752);
    expect(r.decision.health.total).toBe(95);
    expect(r.decision.health.pillars.map(p => p.score)).toEqual([25, 25, 25, 20]);
    expect(r.ml.segmentation!.segments).toHaveLength(145);
  });

  it("adds no status or quality note to the demo stories", async () => {
    const r = await demoResult();
    for (const page of ['quality', 'profile', 'overview'] as const) {
      const story = buildStory(page, r);
      if (story.kind !== 'story') throw new Error(story.reason);
      expect(story.notes.join(' ')).not.toMatch(/Dataset status|on the file as uploaded/);
    }
  });
});
