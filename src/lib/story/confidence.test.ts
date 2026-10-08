import { describe, expect, it } from "vitest";
import { computeConfidence, type ConfidenceInput } from "./confidence";

const solid: ConfidenceInput = { quality: 95, rows: 500, months: 24, timeBased: true, citedColumns: [{ name: 'Revenue', needsReview: false }] };
const label = (changes: Partial<ConfidenceInput>) => computeConfidence({ ...solid, ...changes }).label;

describe('computeConfidence', () => {
  it('is High when everything is strong', () => {
    expect(computeConfidence(solid)).toEqual({
      label: 'High',
      caveat: 'This rests on 500 rows over 24 months and a data quality score of 95 out of 100. You can act on it, but check it against what you know.',
    });
  });

  describe('data quality: Low below 70, High from 88', () => {
    it.each([[69, 'Low'], [70, 'Medium'], [87, 'Medium'], [88, 'High'], [100, 'High']])('Q=%i is %s', (quality, expected) => {
      expect(label({ quality })).toBe(expected);
    });
  });

  describe('rows: Low below 30', () => {
    it.each([[0, 'Low'], [29, 'Low'], [30, 'High'], [31, 'High']])('N=%i is %s', (rows, expected) => {
      expect(label({ rows })).toBe(expected);
    });
  });

  describe('months on a time-based page: Low below 6, High from 12', () => {
    it.each([[0, 'Low'], [5, 'Low'], [6, 'Medium'], [11, 'Medium'], [12, 'High'], [30, 'High']])('P=%i is %s', (months, expected) => {
      expect(label({ months })).toBe(expected);
    });

    it('ignores months on a page that is not time-based', () => {
      expect(label({ months: 2, timeBased: false })).toBe('High');
      expect(label({ months: 0, timeBased: false })).toBe('High');
    });
  });

  describe('customers on a customer-based page: Low below 20', () => {
    it.each([[0, 'Low'], [19, 'Low'], [20, 'High'], [21, 'High']])('%i customers is %s', (customers, expected) => {
      expect(label({ timeBased: false, customerBased: true, customers })).toBe(expected);
    });

    it('ignores the customer count on other pages', () => {
      expect(label({ customerBased: false, customers: 1 })).toBe('High');
    });
  });

  describe('columns that still need review', () => {
    const cited = (flags: boolean[]) => flags.map((needsReview, i) => ({ name: `Col${i}`, needsReview }));
    it('is Medium when some, but not more than half, are unconfirmed', () => {
      expect(label({ citedColumns: cited([true, false, false]) })).toBe('Medium');
      expect(label({ citedColumns: cited([true, false]) })).toBe('Medium');
      expect(label({ citedColumns: cited([true, false, false, false]) })).toBe('Medium');
    });
    it('is Low when more than half are unconfirmed', () => {
      expect(label({ citedColumns: cited([true, true, false]) })).toBe('Low');
      expect(label({ citedColumns: cited([true]) })).toBe('Low');
      expect(label({ citedColumns: cited([true, true]) })).toBe('Low');
    });
    it('stays High when none are unconfirmed or none are cited', () => {
      expect(label({ citedColumns: cited([false, false]) })).toBe('High');
      expect(label({ citedColumns: [] })).toBe('High');
      expect(label({ citedColumns: undefined })).toBe('High');
    });
  });

  it('takes the weakest link: any Low reason wins over strong numbers', () => {
    expect(label({ quality: 100, rows: 29 })).toBe('Low');
    expect(label({ quality: 100, rows: 1000, months: 5 })).toBe('Low');
    expect(label({ quality: 69, rows: 1000, months: 100 })).toBe('Low');
  });

  it('can be forced Low with a reason', () => {
    const result = computeConfidence({ ...solid, forceLow: { reason: 'Cost is assumed, not measured', missing: 'a cost column' } });
    expect(result).toEqual({ label: 'Low', caveat: 'Do not make a large decision on this alone. Cost is assumed, not measured. Adding a cost column would make it firmer.' });
  });

  it('does not use model suitability: it is not an input', () => {
    expect(Object.keys(solid)).not.toContain('modelConfidence');
    expect(label({ ...solid, ...({ modelConfidence: 0.1 } as object) })).toBe('High');
  });

  describe('caveat sentences', () => {
    it('Medium names the weakest reason', () => {
      expect(computeConfidence({ ...solid, quality: 80 }).caveat).toBe('Treat this as a good guide, not a certainty. Data quality is 80 out of 100.');
      expect(computeConfidence({ ...solid, months: 8 }).caveat).toBe('Treat this as a good guide, not a certainty. Only 8 months of history.');
      expect(computeConfidence({ ...solid, citedColumns: [{ name: 'Region', needsReview: true }, { name: 'Revenue', needsReview: false }] }).caveat)
        .toBe('Treat this as a good guide, not a certainty. Column Region is not confirmed.');
    });

    it('Low names the reason and what would firm it up', () => {
      expect(computeConfidence({ ...solid, rows: 12 }).caveat).toBe('Do not make a large decision on this alone. The file has only 12 rows. Adding more rows would make it firmer.');
      expect(computeConfidence({ ...solid, months: 4 }).caveat).toBe('Do not make a large decision on this alone. The file covers only 4 months. Adding more months of dated sales would make it firmer.');
      expect(computeConfidence({ ...solid, months: 0 }).caveat).toContain('The file has no monthly history.');
      expect(computeConfidence({ ...solid, quality: 60 }).caveat).toBe('Do not make a large decision on this alone. Data quality is 60 out of 100. Adding cleaner data would make it firmer.');
      expect(computeConfidence({ ...solid, timeBased: false, customerBased: true, customers: 8 }).caveat).toContain('The file has only 8 customers.');
    });

    it('High on a page with no time series leaves the months out', () => {
      expect(computeConfidence({ ...solid, months: 0, timeBased: false }).caveat)
        .toBe('This rests on 500 rows and a data quality score of 95 out of 100. You can act on it, but check it against what you know.');
    });
  });
});
