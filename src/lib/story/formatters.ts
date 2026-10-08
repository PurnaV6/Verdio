/* ================================================================
   VERDIO — Story formatters
   Money is whole pounds (£ is hard-coded across the app), percentages
   are one decimal place. Compact (k / m) and spoken forms are for
   labels and for the Monday brief.
   ================================================================ */

function trimZero(text: string): string {
  return text.replace(/\.0$/, '');
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 41234.7 -> "41,235" (no unit). */
export function formatCount(value: number): string {
  const rounded = Math.round(value);
  return (rounded < 0 ? '-' : '') + groupThousands(String(Math.abs(rounded)));
}

/** 41234.7 -> "£41,235"; -500 -> "-£500". */
export function formatPounds(value: number): string {
  const rounded = Math.round(value);
  return (rounded < 0 ? '-' : '') + '£' + groupThousands(String(Math.abs(rounded)));
}

/** 41234 -> "£41k"; 4236 -> "£4.2k"; 1234567 -> "£1.2m"; 850 -> "£850". */
export function formatPoundsCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = Math.round(value) < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}£${trimZero((abs / 1_000_000).toFixed(1))}m`;
  if (abs >= 10_000) return `${sign}£${Math.round(abs / 1000)}k`;
  if (abs >= 1_000) return `${sign}£${trimZero((abs / 1000).toFixed(1))}k`;
  return formatPounds(value);
}

/** 8.123 -> "8.1%"; never "-0.0%". */
export function formatPercent(value: number): string {
  const text = value.toFixed(1);
  return (text === '-0.0' ? '0.0' : text) + '%';
}

/** Rounds to the one decimal place a percentage is shown with. */
export function roundPercent(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

/** Spoken money: "about 41 thousand pounds", "about 1.2 million pounds", "850 pounds". */
export function spokenPounds(value: number): string {
  const abs = Math.abs(value);
  const sign = Math.round(value) < 0 ? 'minus ' : '';
  if (abs >= 1_000_000) return `${sign}about ${trimZero((abs / 1_000_000).toFixed(1))} million pounds`;
  if (abs >= 10_000) return `${sign}about ${Math.round(abs / 1000)} thousand pounds`;
  if (abs >= 1_000) return `${sign}about ${trimZero((abs / 1000).toFixed(1))} thousand pounds`;
  return `${sign}${Math.round(abs)} pounds`;
}

/** Spoken percentage: 8.123 -> "8.1 percent". */
export function spokenPercent(value: number): string {
  return `${formatPercent(Math.abs(value)).replace('%', '')} percent`;
}

/** "1 month", "24 months". */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

/** Spells out small counts used as words in a sentence ("top three"). */
export function countWord(count: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][count] ?? formatCount(count);
}

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Mar" -> "March"; anything else is returned unchanged. */
export function fullMonthName(label: string): string {
  return FULL_MONTHS.find(name => name.slice(0, 3).toLowerCase() === label.slice(0, 3).toLowerCase() && label.length <= 3) ?? label;
}

/** "Fri" -> "Friday"; anything else is returned unchanged. */
export function fullWeekdayName(label: string): string {
  return FULL_WEEKDAYS.find(name => name.slice(0, 3).toLowerCase() === label.slice(0, 3).toLowerCase() && label.length <= 3) ?? label;
}

/** "2024-03" -> { month: "March", year: 2024 }, or null when the key is not YYYY-MM. */
export function parsePeriodKey(periodKey: string): { month: string; year: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const month = FULL_MONTHS[Number(match[2]) - 1];
  return month ? { month, year: Number(match[1]) } : null;
}

/** Makes a title safe to read aloud: symbols become words, nothing else is changed. */
export function speakable(text: string): string {
  return text
    .replace(/\s*[↔⇄]\s*/g, ' and ')
    .replace(/\s*[→>]\s*/g, ' to ')
    .replace(/&/g, ' and ')
    .replace(/\s*\/\s*/g, ' or ')
    .replace(/£/g, '')
    .replace(/%/g, ' percent')
    .replace(/["“”]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
