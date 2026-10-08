import { describe, expect, it } from "vitest";
import { extractNumbers, validateNumbers } from "./validateNumbers";
import type { StoryFacts } from "./types";

const facts: StoryFacts = {
  sales: { value: 41234.7, source: 'series.latest' },
  change: { value: -8.123, source: 'computed change' },
  rows: { value: 720, source: 'source.rowCount' },
  big: { value: 1234567, source: 'total' },
  health: { value: 95, source: 'health' },
  label: { value: 'Mar 24', source: 'series label' },
  file: { value: 'Q3 sales.csv', source: 'source.fileName' },
  plain: { value: 'Revenue', source: 'column' },
};

const offending = (text: string) => validateNumbers(text, facts);

describe('extractNumbers', () => {
  it('reads separators, decimals, symbols and scale words', () => {
    expect(extractNumbers('£41,200 and 8.1% of 1.2 million, 41k, 2bn, 3 thousand').map(n => n.value)).toEqual([41200, 8.1, 1_200_000, 41_000, 2_000_000_000, 3000]);
  });

  it('does not treat month or minute words as scales', () => {
    expect(extractNumbers('12 months, 5 m').map(n => n.value)).toEqual([12, 5]);
    expect(extractNumbers('5m').map(n => n.value)).toEqual([5_000_000]);
  });
});

describe('validateNumbers accepts numbers a fact backs', () => {
  it.each([
    ['whole pounds', 'Sales were £41,235 in the month.'],
    ['no separator', 'Sales were 41235.'],
    ['k form', 'Sales were £41k.'],
    ['k form with a decimal', 'Sales were £41.2k.'],
    ['spoken thousands', 'Sales were about 41 thousand pounds.'],
    ['spoken millions', 'Sales total about 1.2 million pounds.'],
    ['m form', 'Total is £1.2m.'],
    ['percent', 'Sales fell 8.1% on last month.'],
    ['percent spoken', 'Sales fell 8.1 percent on last month.'],
    ['rounded percent', 'Sales fell about 8% on last month.'],
    ['sign dropped', 'Sales are down 8.123 percent.'],
    ['a count', 'There are 720 rows.'],
    ['a scale', 'Health is 95 out of 100.'],
  ])('%s', (_name, text) => {
    // 100 is a fact in real stories; add it here for the "out of 100" case.
    expect(validateNumbers(text, { ...facts, scale: { value: 100, source: 'score scale' } })).toEqual([]);
  });

  it('reads a hyphen between two numbers as a range, not a minus', () => {
    expect(validateNumbers('Range £720-£95.', facts)).toEqual([]);
  });

  it('skips digits inside a string fact, such as a period label or a file name', () => {
    expect(offending('Sales were £41,235 in Mar 24.')).toEqual([]);
    expect(offending('Read from Q3 sales.csv.')).toEqual([]);
  });
});

describe('validateNumbers rejects numbers no fact backs', () => {
  it('rejects an invented number and names it', () => {
    expect(offending('Sales were £999,999 last month.')).toEqual(['999,999']);
  });

  it('rejects a number that is close but not a rounding of the fact', () => {
    expect(offending('Sales were £41,300.')).toEqual(['41,300']);
    expect(offending('Sales fell 8.3%.')).toEqual(['8.3']);
    expect(offending('There are 721 rows.')).toEqual(['721']);
  });

  it('rejects a scale form that is too far from the fact', () => {
    expect(offending('Sales were £42k.')).toEqual(['42k']);
    expect(offending('Sales were about 45 thousand pounds.')).toEqual(['45 thousand']);
    expect(offending('Total is £1.3m.')).toEqual(['1.3m']);
  });

  it('rejects a period label whose digits are not a recorded string', () => {
    expect(offending('Sales were £41,235 in Apr 24.')).toEqual(['24']);
  });

  it('does not let a plain word fact hide digits', () => {
    expect(offending('Revenue 2024 grew.')).toEqual(['2024']);
  });

  it('reports each offending number once, in order', () => {
    expect(offending('£1,111 then £2,222 then £1,111 again.')).toEqual(['1,111', '2,222']);
  });

  it('accepts text with no numbers at all', () => {
    expect(offending('Nothing to count here.')).toEqual([]);
  });

  it('accepts plain numbers and strings as facts too', () => {
    expect(validateNumbers('There are 12 rows in a.csv.', { rows: 12, file: 'a.csv' })).toEqual([]);
    expect(validateNumbers('There are 13 rows.', { rows: 12 })).toEqual(['13']);
  });
});
