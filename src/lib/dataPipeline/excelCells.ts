import type { CellObject, WorkSheet } from "xlsx";

/* ================================================================
   VERDIO — Real Excel cell values
   `sheet_to_csv` writes the text Excel DISPLAYS: "£1,234.00" for 1234,
   "(5.00)" for -5 and "3/5/24" for a date, which rounds amounts and
   makes dates ambiguous. This module reads what the cell actually
   holds: the stored number, the stored text, and dates as calendar
   text computed from the serial number (no timezone involved).
   The workbook must be read with `cellNF: true` and without
   `cellDates`, so date cells arrive as numbers that carry their format.
   ================================================================ */

type Xlsx = typeof import("xlsx");

/** A merged block larger than this many cells is ignored (a whole-column merge is never data). */
const MAX_MERGE_CELLS = 100_000;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function numberText(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(15))); // drops binary noise such as 0.30000000000000004
}

function dateText(XLSX: Xlsx, serial: number, date1904: boolean): string | null {
  const parts = XLSX.SSF.parse_date_code(serial, { date1904 });
  if (!parts) return null;
  const hasTime = parts.H !== 0 || parts.M !== 0 || parts.S !== 0;
  const time = `${pad(parts.H)}:${pad(parts.M)}:${pad(parts.S)}`;
  if (serial >= 0 && serial < 1 && !date1904) return time; // a time of day without a date
  const day = `${pad(parts.y, 4)}-${pad(parts.m)}-${pad(parts.d)}`;
  return hasTime ? `${day} ${time}` : day;
}

/** The stored value of a cell as text. Dates become YYYY-MM-DD (plus HH:MM:SS when there is a time). */
export function cellValueText(XLSX: Xlsx, cell: CellObject | undefined, date1904 = false): string {
  if (!cell) return "";
  switch (cell.t) {
    case "n": {
      const value = cell.v as number;
      if (cell.z && XLSX.SSF.is_date(cell.z)) {
        const asDate = dateText(XLSX, value, date1904);
        if (asDate !== null) return asDate;
      }
      return numberText(value);
    }
    case "d": {
      const d = cell.v as Date;
      return Number.isNaN(d.getTime()) ? "" : `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case "b": return cell.v ? "TRUE" : "FALSE";
    case "e": return cell.w ?? "";
    case "z": return "";
    default: return cell.v === undefined || cell.v === null ? "" : String(cell.v);
  }
}

/** Rows and columns that hold a value. Ignores formatting-only ranges such as A1:XFD1048576. */
export function usedBounds(XLSX: Xlsx, ws: WorkSheet) {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (const key in ws) {
    if (key.charCodeAt(0) === 33) continue; // "!ref", "!merges", ...
    const cell = ws[key] as CellObject | undefined;
    if (!cell || cell.t === "z" || cell.v === undefined || cell.v === null || cell.v === "") continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return maxR < 0 ? null : { minR, maxR, minC, maxC };
}

/**
 * Yields the rows of a sheet as text, top to bottom, covering the cells that hold values.
 * Cells below the top row of a vertically merged block repeat that block's value, except when the block starts
 * on or above `fillBelowRow` (a 0-based sheet row, the first used row by default): titles and headers are not data.
 */
export function* sheetRows(XLSX: Xlsx, ws: WorkSheet, date1904 = false, fillBelowRow?: number): Generator<string[]> {
  const bounds = usedBounds(XLSX, ws);
  if (!bounds) return;

  const mergeSource = new Map<string, string>();
  for (const merge of ws["!merges"] ?? []) {
    const rows = merge.e.r - merge.s.r + 1, cols = merge.e.c - merge.s.c + 1;
    if (rows < 2 || merge.s.r <= (fillBelowRow ?? bounds.minR) || rows * cols > MAX_MERGE_CELLS) continue;
    const origin = XLSX.utils.encode_cell(merge.s);
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (r !== merge.s.r || c !== merge.s.c) mergeSource.set(XLSX.utils.encode_cell({ r, c }), origin);
      }
    }
  }

  for (let r = bounds.minR; r <= bounds.maxR; r += 1) {
    const row: string[] = [];
    for (let c = bounds.minC; c <= bounds.maxC; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = (ws[address] as CellObject | undefined) ?? (mergeSource.has(address) ? (ws[mergeSource.get(address)!] as CellObject | undefined) : undefined);
      row.push(cellValueText(XLSX, cell, date1904));
    }
    yield row;
  }
}

export function isBlankCell(value: string | undefined) {
  return value === undefined || value.trim() === "";
}

export function nonEmptyCount(row: string[]) {
  let n = 0;
  for (const cell of row) if (!isBlankCell(cell)) n += 1;
  return n;
}

const HEADER_SEARCH_ROWS = 50;

function looksLikeData(cell: string) {
  return Number.isFinite(Number(cell.replace(/[£$€,%\s]/g, ""))) || /^\d{4}-\d{2}-\d{2}/.test(cell.trim());
}

/**
 * Where the header row is, among the first rows that hold anything: the first one with at least two names, spanning at
 * least half the widest of those rows, and no number or date among its names. Title text above a table is passed over.
 * Returns the 0-based sheet row and the number of columns, or null when no row looks like a header.
 */
export function locateHeader(XLSX: Xlsx, ws: WorkSheet, date1904 = false): { row: number; columnCount: number } | null {
  const bounds = usedBounds(XLSX, ws);
  if (!bounds) return null;
  const sample: Array<{ row: number; cells: string[]; width: number }> = [];
  let index = 0;
  for (const cells of sheetRows(XLSX, ws, date1904, Infinity)) {
    const width = nonEmptyCount(cells);
    if (width > 0) sample.push({ row: bounds.minR + index, cells, width });
    index += 1;
    if (sample.length >= HEADER_SEARCH_ROWS) break;
  }
  const widest = sample.reduce((max, entry) => Math.max(max, entry.width), 0);
  const found = sample.find(entry => entry.width >= 2 && entry.width >= Math.ceil(widest / 2) && entry.cells.every(cell => isBlankCell(cell) || !looksLikeData(cell)));
  return found ? { row: found.row, columnCount: found.width } : null;
}

/** Header cleaning that matches what the CSV path produced: trimmed names, repeats suffixed _1, _2. */
function buildHeaders(first: string[], keep: number[]): string[] {
  const seen = new Map<string, number>();
  return keep.map((c, position) => {
    const trimmed = (first[c] ?? "").trim();
    const base = trimmed || `Column ${position + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count}`;
  });
}

/** First non-blank row is the header; blank rows and columns with no header and no data are dropped. */
export function rowsToTable(rows: Iterable<string[]>, skipRows = 0): { headers: string[]; rows: Record<string, string>[] } {
  let first: string[] | null = null;
  const body: string[][] = [];
  let seen = 0;
  for (const row of rows) {
    if (seen++ < skipRows) continue; // rows above the header (titles)
    if (nonEmptyCount(row) === 0) continue;
    if (!first) first = row; else body.push(row);
  }
  if (!first) return { headers: [], rows: [] };

  const width = body.reduce((max, row) => Math.max(max, row.length), first.length);
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1) {
    if (!isBlankCell(first[c]) || body.some(row => !isBlankCell(row[c]))) keep.push(c);
  }
  const headers = buildHeaders(first, keep);
  return {
    headers,
    rows: body.map(row => {
      const out: Record<string, string> = {};
      keep.forEach((c, i) => { out[headers[i]] = row[c] ?? ""; });
      return out;
    }),
  };
}
