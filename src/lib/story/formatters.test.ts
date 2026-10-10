import { describe, expect, it } from "vitest";
import {
  countWord, formatCount, formatPercent, formatPounds, formatPoundsCompact, fullMonthName, fullWeekdayName, parsePeriodKey, pluralise,
  roundPercent, speakable, spokenPercent, spokenPounds,
} from "./formatters";

describe('money', () => {
  it('rounds to whole pounds with thousands separators', () => {
    expect(formatPounds(41234.7)).toBe('£41,235');
    expect(formatPounds(0)).toBe('£0');
    expect(formatPounds(999.5)).toBe('£1,000');
    expect(formatPounds(1234567.2)).toBe('£1,234,567');
    expect(formatPounds(-8200)).toBe('-£8,200');
    expect(formatPounds(-0.2)).toBe('£0');
  });

  it('has k and m forms', () => {
    expect(formatPoundsCompact(850)).toBe('£850');
    expect(formatPoundsCompact(4236)).toBe('£4.2k');
    expect(formatPoundsCompact(4000)).toBe('£4k');
    expect(formatPoundsCompact(41234)).toBe('£41k');
    expect(formatPoundsCompact(1234567)).toBe('£1.2m');
    expect(formatPoundsCompact(3_000_000)).toBe('£3m');
    expect(formatPoundsCompact(-41234)).toBe('-£41k');
  });

  it('counts with separators', () => {
    expect(formatCount(1234.4)).toBe('1,234');
    expect(formatCount(12)).toBe('12');
  });
});

describe('percent', () => {
  it('uses one decimal place and never shows negative zero', () => {
    expect(formatPercent(8.123)).toBe('8.1%');
    expect(formatPercent(8)).toBe('8.0%');
    expect(formatPercent(-0.01)).toBe('0.0%');
    expect(formatPercent(-8.16)).toBe('-8.2%');
    expect(roundPercent(8.123)).toBe(8.1);
    expect(Object.is(roundPercent(-0.001), 0)).toBe(true);
  });
});

describe('spoken forms', () => {
  it('rounds money to a size a person would say', () => {
    expect(spokenPounds(41234)).toBe('about 41 thousand pounds');
    expect(spokenPounds(4236)).toBe('about 4.2 thousand pounds');
    expect(spokenPounds(4000)).toBe('about 4 thousand pounds');
    expect(spokenPounds(1_234_567)).toBe('about 1.2 million pounds');
    expect(spokenPounds(850)).toBe('850 pounds');
    expect(spokenPounds(-41234)).toBe('minus about 41 thousand pounds');
  });

  it('says percent as a word', () => {
    expect(spokenPercent(8.123)).toBe('8.1 percent');
    expect(spokenPercent(-8.123)).toBe('8.1 percent');
  });

  it('makes titles safe to read aloud', () => {
    expect(speakable('Revenue ↔ Cost')).toBe('Revenue and Cost');
    expect(speakable('at-risk/lapsed')).toBe('at-risk or lapsed');
    expect(speakable('£50 & 10%')).toBe('50 and 10 percent');
    expect(speakable('"Advisory" accounts')).toBe('Advisory accounts');
  });
});

describe('words and periods', () => {
  it('pluralises', () => {
    expect(pluralise(1, 'month')).toBe('1 month');
    expect(pluralise(24, 'month')).toBe('24 months');
    expect(pluralise(2, 'person', 'people')).toBe('2 people');
    expect(pluralise(1200, 'row')).toBe('1,200 rows');
  });

  it('spells out small counts', () => {
    expect(countWord(3)).toBe('three');
    expect(countWord(12)).toBe('12');
  });

  it('expands month and weekday abbreviations only', () => {
    expect(fullMonthName('Mar')).toBe('March');
    expect(fullMonthName('March')).toBe('March');
    expect(fullMonthName('Sept 23')).toBe('Sept 23');
    expect(fullWeekdayName('Fri')).toBe('Friday');
    expect(fullWeekdayName('Fri 3')).toBe('Fri 3');
  });

  it('reads a YYYY-MM period key', () => {
    expect(parsePeriodKey('2024-03')).toEqual({ month: 'March', year: 2024 });
    expect(parsePeriodKey('2024-13')).toBeNull();
    expect(parsePeriodKey('March 2024')).toBeNull();
  });
});
