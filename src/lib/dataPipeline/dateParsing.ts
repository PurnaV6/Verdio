/* ================================================================
   VERDIO — Strict date parsing
   The single place where text becomes a calendar date. We never fall
   back on `new Date(text)` / `Date.parse(text)`: V8 will happily read
   "C-0136" or "Product 12" as a date in some year, which silently
   corrupts identifier columns.

   Accepted (anything else is rejected):
   • ISO 8601        2024-03-05, 2024-3-5, 2024/03/05, 2024-03-05T10:00:00Z,
                     2024-03-05 10:00, 2024-03-05T10:00:00+02:00
   • Numeric d/m/y   05/03/2024, 5-3-2024, 5/3/24, 25.03.2024  ("/" and "-" read as
                     m/d/y unless the first part is above 12; "." is d.m.y)
   • Month names     5 Mar 2024, 5 March 2024, Mar 5, 2024, March 5 2024
   • Optional time   after numeric and month-name dates: 3/5/2024 10:00,
                     3/5/2024 3:45 PM, 5 Mar 2024 14:30 (12 AM = 00, hour 1-12 with AM/PM)
   • Month-year      2024-03, 03/2024, Mar 2024, March 2024, Mar-2024, Mar-24 -> day 1
                     (the two-digit year form is hyphen-only so "Mar 12" is not read as 2012)
   • Excel           sheet_to_csv writes Date cells with the default format as m/d/yy
                     (e.g. 3/5/24, time of day dropped), or the cell's own format
                     (05-Mar-24, Mar-24, 3/5/24 14:30). All of these are covered above.
   Two-digit years: 00-49 -> 20xx, 50-99 -> 19xx. Years must be 1900-2100.
   Pure numbers (including Excel serials) are not text dates.
   ================================================================ */

export interface CalendarDate { year: number; month: number; day: number } // month 1-12

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;
// Optional wall-clock time after a non-ISO date: " 10:00", " 10:15:30", " 3:45 PM". The time never
// changes the calendar day; it is only validated (hour 1-12 with AM/PM, 0-23 without).
const TIME = String.raw`(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*([AP]M))?)?`;
const NUMERIC_RE = new RegExp(String.raw`^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})` + TIME + '$', 'i');
const DAY_MONTH_NAME_RE = new RegExp(String.raw`^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2}|\d{4})` + TIME + '$', 'i');
const MONTH_NAME_DAY_RE = new RegExp(String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})` + TIME + '$', 'i');
// Month-year labels, resolved to day 1: 2024-03, 2024/03, 03/2024, 3-2024, Mar 2024, March 2024, Mar-2024, Mar-24.
const YEAR_MONTH_RE = /^(\d{4})[-/](\d{1,2})$/;
const MONTH_YEAR_NUM_RE = /^(\d{1,2})[-/](\d{4})$/;
const MONTH_YEAR_NAME_RE = /^([A-Za-z]{3,9})\.?(?:\s+(\d{4})|-(\d{2}|\d{4}))$/;

function fullYear(text: string): number {
  const y = Number(text);
  if (text.length === 4) return y;
  return y < 50 ? 2000 + y : 1900 + y;
}

/** Validates the optional time suffix captured as [hh, mm, ss, ampm]. */
function validTime(hh?: string, mi?: string, ss?: string, ampm?: string): boolean {
  if (hh === undefined) return true;
  const h = Number(hh);
  if (ampm ? h < 1 || h > 12 : h > 23) return false;
  return Number(mi) <= 59 && (ss === undefined || Number(ss) <= 59);
}

function valid(year: number, month: number, day: number): CalendarDate | null {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return { year, month, day };
}

/** Parse text as a calendar date, or return null. Timezone-independent. */
export function parseStrictDate(text: string): CalendarDate | null {
  const s = text.trim();
  if (!s || s.length > 40) return null;

  const iso = ISO_RE.exec(s);
  if (iso) {
    const [, y, mo, d, hh, mi, ss, tz] = iso;
    const date = valid(Number(y), Number(mo), Number(d));
    if (!date) return null;
    if (hh === undefined) return date;
    if (Number(hh) > 23 || Number(mi) > 59 || (ss !== undefined && Number(ss) > 59)) return null;
    // A timestamp with an explicit offset is an instant: report its UTC calendar day.
    if (tz && tz.toUpperCase() !== 'Z') {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.slice(1).replace(':', '');
      const offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
      const utc = new Date(Date.UTC(date.year, date.month - 1, date.day, Number(hh), Number(mi), Number(ss ?? 0)) - offsetMin * 60000);
      return valid(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
    }
    return date;
  }

  const num = NUMERIC_RE.exec(s);
  if (num) {
    const [, a, sep, b, y, hh, mi, ss, ap] = num;
    if (!validTime(hh, mi, ss, ap)) return null;
    if (sep === '-' && y.length !== 4) return null;                      // 12-34-56 style codes are not dates
    const first = Number(a), second = Number(b), year = fullYear(y);
    if (sep === '.') return valid(year, second, first);                  // d.m.y
    if (first > 12) return valid(year, second, first);                   // d/m/y
    return valid(year, first, second);                                   // m/d/y (also when ambiguous)
  }

  const dmn = DAY_MONTH_NAME_RE.exec(s);
  if (dmn) {
    const month = MONTHS[dmn[2].toLowerCase()];
    if (!validTime(dmn[4], dmn[5], dmn[6], dmn[7])) return null;
    return month ? valid(fullYear(dmn[3]), month, Number(dmn[1])) : null;
  }

  const mnd = MONTH_NAME_DAY_RE.exec(s);
  if (mnd) {
    const month = MONTHS[mnd[1].toLowerCase()];
    if (!validTime(mnd[4], mnd[5], mnd[6], mnd[7])) return null;
    return month ? valid(fullYear(mnd[3]), month, Number(mnd[2])) : null;
  }

  const ym = YEAR_MONTH_RE.exec(s);
  if (ym) return valid(Number(ym[1]), Number(ym[2]), 1);

  const myn = MONTH_YEAR_NUM_RE.exec(s);
  if (myn) return valid(Number(myn[2]), Number(myn[1]), 1);

  const myName = MONTH_YEAR_NAME_RE.exec(s);
  if (myName) {
    const month = MONTHS[myName[1].toLowerCase()];
    const year = myName[2] ?? myName[3];
    return month ? valid(fullYear(year), month, 1) : null;
  }

  return null;
}

export function isStrictDate(text: string): boolean {
  return parseStrictDate(text) !== null;
}

/** YYYY-MM-DD for text that parses strictly, otherwise null. */
export function toIsoDateString(text: string): string | null {
  const d = parseStrictDate(text);
  if (!d) return null;
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** Day of week 0 (Sunday) - 6, independent of the machine's timezone. */
export function dayOfWeek(d: CalendarDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}
