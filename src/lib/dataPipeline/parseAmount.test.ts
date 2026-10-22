import { describe, expect, it } from "vitest";
import { parseAmount } from "./profileDataset";
import { sumColumn } from "./salesRows";

describe("parseAmount", () => {
  it("reads numbers and numeric text, including zero and negatives", () => {
    expect(parseAmount(0)).toBe(0);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount(' 12.5 ')).toBe(12.5);
    expect(parseAmount('-3')).toBe(-3);
    expect(parseAmount('.5')).toBe(.5);
    expect(parseAmount('1e3')).toBe(1000);
  });

  it("reads currency symbols, commas, spaces and a trailing percent", () => {
    expect(parseAmount('£1,234.50')).toBe(1234.5);
    expect(parseAmount('$ 2 000')).toBe(2000);
    expect(parseAmount('€7')).toBe(7);
    expect(parseAmount('12%')).toBe(12);
  });

  it("reads accounting negatives and a trailing minus", () => {
    expect(parseAmount('(1,234.00)')).toBe(-1234);
    expect(parseAmount('(£50)')).toBe(-50);
    expect(parseAmount('1,234-')).toBe(-1234);
    expect(parseAmount('-£5')).toBe(-5);
  });

  it("gives null for a blank, text or a non-finite value, never 0", () => {
    for (const value of ['', '   ', '\t', 'abc', '12abc', '-', '()', 'N/A', '0x10', 'Infinity', NaN, Infinity, -Infinity, null, undefined, true, {}, []]) {
      expect(parseAmount(value), String(value)).toBeNull();
    }
  });
});

describe("sumColumn", () => {
  it("adds only the cells that hold a number", () => {
    expect(sumColumn([{ R: '10' }, { R: '' }, { R: '5.5' }, { R: 'n/a' }, { R: '(2)' }], 'R')).toBe(13.5);
  });
});
