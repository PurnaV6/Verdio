import { describe, expect, it } from "vitest";
import { LONG_TABLE_ROWS, applyFilters, hasActiveFilters, needsFilters, planFilters, rowCountLabel, type TableRow } from "./tableFilter";

const text = (row: TableRow, key: string) => String(row[key] ?? '');
const columns = [{ key: 'period', label: 'Period' }, { key: 'region', label: 'Region' }, { key: 'amount', label: 'Amount' }];

function rows(n: number): TableRow[] {
  return Array.from({ length: n }, (_, i) => ({ period: `P${i + 1}`, region: ['North', 'South', 'East'][i % 3], amount: 100 + i }));
}

describe('needsFilters', () => {
  it('starts past twelve rows', () => {
    expect(LONG_TABLE_ROWS).toBe(12);
    expect(needsFilters(12)).toBe(false);
    expect(needsFilters(13)).toBe(true);
    expect(needsFilters(0)).toBe(false);
  });
});

describe('planFilters', () => {
  it('plans nothing for a short table', () => {
    expect(planFilters(columns, rows(12), text)).toEqual([]);
  });

  it('plans a text find for names, a select for repeating categories and nothing for numbers', () => {
    const plan = planFilters(columns, rows(30), text);
    expect(plan.map(f => [f.key, f.kind])).toEqual([['period', 'text'], ['region', 'select']]);
    expect(plan[1].options).toEqual(['East', 'North', 'South']);
  });

  it('leaves out a column with one value and an empty column', () => {
    const r = rows(20).map(x => ({ ...x, region: 'North', note: '' }));
    const plan = planFilters([...columns, { key: 'note', label: 'Note' }], r, text);
    expect(plan.map(f => f.key)).toEqual(['period']);
  });

  it('treats numeric strings as numbers', () => {
    const r = rows(20).map(x => ({ ...x, amount: String(x.amount) }));
    expect(planFilters(columns, r, text).map(f => f.key)).toEqual(['period', 'region']);
  });

  it('caps text finds at two', () => {
    const cols = ['a', 'b', 'c'].map(k => ({ key: k, label: k }));
    const r = Array.from({ length: 20 }, (_, i) => ({ a: `a${i}`, b: `b${i}`, c: `c${i}` }));
    expect(planFilters(cols, r, text).map(f => f.key)).toEqual(['a', 'b']);
  });

  it('uses a text find for a column with more than twenty values', () => {
    const r = Array.from({ length: 60 }, (_, i) => ({ period: 'x', region: `R${i % 25}`, amount: i }));
    const f = planFilters(columns, r, text).find(x => x.key === 'region')!;
    expect(f.kind).toBe('text');
  });
});

describe('applyFilters', () => {
  const data = rows(30);
  const fields = planFilters(columns, data, text);

  it('returns every row with no filter', () => {
    expect(applyFilters(data, fields, {}, text)).toHaveLength(30);
    expect(applyFilters(data, fields, { region: '  ' }, text)).toHaveLength(30);
  });

  it('matches a select on the whole value', () => {
    const idx = applyFilters(data, fields, { region: 'North' }, text);
    expect(idx).toHaveLength(10);
    expect(idx.every(i => data[i].region === 'North')).toBe(true);
  });

  it('finds text anywhere in the cell, ignoring case', () => {
    expect(applyFilters(data, fields, { period: 'p1' }, text)).toHaveLength(11); // P1, P10 to P19
  });

  it('combines filters and can match nothing', () => {
    expect(applyFilters(data, fields, { period: 'P1', region: 'North' }, text)).toHaveLength(5); // P1, P10, P13, P16, P19
    expect(applyFilters(data, fields, { period: 'zzz' }, text)).toEqual([]);
  });
});

describe('labels', () => {
  it('writes the count', () => {
    expect(rowCountLabel(5, 40)).toBe('5 of 40 rows');
    expect(rowCountLabel(0, 1200)).toBe('0 of 1,200 rows');
  });

  it('knows when a filter is active', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ a: ' ' })).toBe(false);
    expect(hasActiveFilters({ a: 'x' })).toBe(true);
  });
});
