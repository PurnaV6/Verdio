import { describe, expect, it } from "vitest";
import { resultFromCsv } from "../story/testkit";
import { KEY_COLUMN_WEIGHT, KEY_GAP_CAP } from "./dataQualityEngine";

/* Key columns (revenue, price, quantity, date, the identifier) count 3x in the completeness average,
   and the worst key column's blank share docks the overall score, so one mostly blank sales column
   cannot hide among the other columns. */

const ROWS = 40;

/** A 5-column file: Order ID, Order Date, Product, Units, Revenue, with Revenue blank on the first `blankPct` percent of rows. */
function fiveColumns(blankPct: number): string {
  const blank = Math.round((ROWS * blankPct) / 100);
  const lines = ['Order ID,Order Date,Product,Units,Revenue'];
  for (let i = 0; i < ROWS; i += 1) {
    const day = String(1 + (i % 27)).padStart(2, '0');
    const month = String(1 + (i % 12)).padStart(2, '0');
    lines.push([`O-${i}`, `2024-${month}-${day}`, ['Alpha', 'Beta', 'Gamma'][i % 3], String(1 + (i % 5)), i < blank ? '' : String(100 + i * 7)].join(','));
  }
  return lines.join('\n');
}

describe("key column weighting", () => {
  const blankShares = [0, 33, 50, 60, 75];

  it("scores strictly lower as the revenue column gets emptier", async () => {
    const scores: number[] = [];
    for (const pct of blankShares) scores.push((await resultFromCsv(fiveColumns(pct))).quality.overallScore);
    for (let i = 1; i < scores.length; i += 1) expect(scores[i], `${blankShares[i]}% blank`).toBeLessThan(scores[i - 1]);
  });

  it("scores a complete file 100 and a file with revenue blank on 75 percent of rows below 70", async () => {
    expect((await resultFromCsv(fiveColumns(0))).quality.overallScore).toBe(100);
    const worst = await resultFromCsv(fiveColumns(75));
    expect(worst.quality.overallScore).toBeLessThan(70);
    expect(worst.quality.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("lowers completeness more than an equal blank share in a non-key column would", async () => {
    const keyed = await resultFromCsv(fiveColumns(50));
    const lines = fiveColumns(0).split('\n').map((line, i) => {
      if (i === 0 || i > ROWS / 2) return line;
      const cells = line.split(',');
      cells[2] = ''; // Product, a descriptive column
      return cells.join(',');
    });
    const plain = await resultFromCsv(lines.join('\n'));
    expect(keyed.quality.completenessScore).toBeLessThan(plain.quality.completenessScore);
    expect(keyed.quality.overallScore).toBeLessThan(plain.quality.overallScore);
  });

  it("weights a key column at 3x and caps the extra dock", () => {
    expect(KEY_COLUMN_WEIGHT).toBe(3);
    expect(KEY_GAP_CAP).toBe(30);
  });

  it("keeps every score between 0 and 100 even with every key column empty", async () => {
    const lines = ['Order ID,Order Date,Product,Units,Revenue', ...Array.from({ length: ROWS }, (_, i) => `O-${i},,${['A', 'B'][i % 2]},,`)];
    const r = await resultFromCsv(lines.join('\n'));
    for (const score of [r.quality.overallScore, r.quality.completenessScore]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
