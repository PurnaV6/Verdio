/* ================================================================
   VERDIO — table filters (pure)
   Long tables get a select for each categorical column and a text
   find for names, with an "x of y rows" count. Short tables get
   nothing: filters are only planned past LONG_TABLE_ROWS.
   ================================================================ */

/** A table gets filters only when it has MORE rows than this. */
export const LONG_TABLE_ROWS = 12;
/** A column with more distinct values than this is searched as text, not picked from a list. */
export const MAX_SELECT_OPTIONS = 20;
const MAX_TEXT_FIELDS = 2;

export type TableRow = Record<string, unknown>;

export interface FilterField {
  key: string;
  label: string;
  kind: 'select' | 'text';
  options: string[];            // for 'select': the distinct values, alphabetical
}

export interface TableFilterState { [key: string]: string }   // '' means no filter on that column

export function needsFilters(rowCount: number): boolean {
  return rowCount > LONG_TABLE_ROWS;
}

const isNumeric = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));

/**
 * The filters for a table. Numeric columns get none. A text column with 2 to 20 distinct values that repeat
 * gets a select; any other text column becomes a text find (at most two, the first ones, which are the names).
 * Returns nothing for a table that is not long.
 */
export function planFilters(columns: { key: string; label: string }[], rows: TableRow[], cellText: (row: TableRow, key: string) => string): FilterField[] {
  if (!needsFilters(rows.length)) return [];
  const fields: FilterField[] = [];
  let textFields = 0;
  for (const col of columns) {
    const raw = rows.map(r => r[col.key]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (raw.length === 0 || raw.every(isNumeric)) continue;
    const values = new Set(rows.map(r => cellText(r, col.key).trim()).filter(Boolean));
    if (values.size < 2) continue;
    if (values.size <= MAX_SELECT_OPTIONS && values.size * 2 <= rows.length) {
      fields.push({ key: col.key, label: col.label, kind: 'select', options: [...values].sort((a, b) => a.localeCompare(b)) });
    } else if (textFields < MAX_TEXT_FIELDS) {
      fields.push({ key: col.key, label: col.label, kind: 'text', options: [] });
      textFields += 1;
    }
  }
  return fields;
}

/** Indexes of the rows that pass every filter. A select matches the whole cell; a text find matches part of it, ignoring case. */
export function applyFilters(rows: TableRow[], fields: FilterField[], state: TableFilterState, cellText: (row: TableRow, key: string) => string): number[] {
  const active = fields.map(f => ({ f, q: (state[f.key] ?? '').trim() })).filter(a => a.q !== '');
  const out: number[] = [];
  rows.forEach((row, i) => {
    const ok = active.every(({ f, q }) => {
      const text = cellText(row, f.key).trim();
      return f.kind === 'select' ? text === q : text.toLowerCase().includes(q.toLowerCase());
    });
    if (ok) out.push(i);
  });
  return out;
}

export function hasActiveFilters(state: TableFilterState): boolean {
  return Object.values(state).some(v => v.trim() !== '');
}

/** "5 of 40 rows", "1 of 1 row" never happens (short tables have no filters), "No rows match" is written by the table. */
export function rowCountLabel(shown: number, total: number): string {
  return `${shown.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} ${total === 1 ? 'row' : 'rows'}`;
}
