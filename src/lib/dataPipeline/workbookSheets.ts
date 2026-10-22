import Papa from "papaparse";

/* ================================================================
   VERDIO — Excel workbook sheets
   A workbook with more than one sheet is read sheet by sheet. Each
   readable sheet becomes its own CSV "file" named `<file> / <sheet>`
   so it can follow the same path as any other uploaded file.
   This module is pure: it takes an already-read workbook and never
   touches the network or the file system.
   ================================================================ */

type XlsxModule = typeof import("xlsx");

/** Upper bound on sheets loaded from one workbook. The organisation screen shows one card per dataset and
 *  relationship matching compares every pair of datasets, so ten keeps both readable and fast. */
export const MAX_SHEETS_PER_WORKBOOK = 10;

const HEADER_SEARCH_ROWS = 50;
const HEADER_FILL_RATIO = 0.5;

export interface WorkbookSheetEntry {
  sheetName: string;
  /** Unique within the workbook (duplicates get " (2)", " (3)"). */
  displayName: string;
  rowCount: number;
  /** 1-based sheet row that holds the column headers. 1 unless title text sits above the table. */
  headerRow: number;
  csv: string;
}

export interface SkippedSheet {
  sheetName: string;
  reason: string;
}

export interface WorkbookRead {
  fileName: string;
  totalSheets: number;
  sheets: WorkbookSheetEntry[];
  skipped: SkippedSheet[];
}

export interface WorkbookNote {
  summary: string;
  skipped: string[];
}

/** `Sales.xlsx / Orders` -> the sheet files this module produces. Sheet names cannot contain "/" in Excel. */
const SHEET_FILE_PATTERN = /^(.+?\.(xlsx|xls)) \/ (.+)$/i;

export function parseSheetFileName(name: string): { workbookName: string; fileType: "xlsx" | "xls"; sheetName: string } | null {
  const match = SHEET_FILE_PATTERN.exec(name);
  if (!match) return null;
  return { workbookName: match[1], fileType: match[2].toLowerCase() as "xlsx" | "xls", sheetName: match[3] };
}

/** The part of a dataset name that describes the content: the sheet name for sheet files, else the file name. */
export function datasetLabel(fileName: string): string {
  return parseSheetFileName(fileName)?.sheetName ?? fileName;
}

export function sheetFileName(workbookName: string, displayName: string): string {
  return `${workbookName} / ${displayName}`;
}

function isBlank(value: string | undefined) {
  return value === undefined || value.trim() === "";
}

function nonEmptyCount(row: string[]) {
  let n = 0;
  for (const cell of row) if (!isBlank(cell)) n += 1;
  return n;
}

/** First row (within the first rows) that is at least half as wide as the widest of them. Skips title lines. */
function findHeaderIndex(grid: string[][]): number {
  const counts = grid.slice(0, HEADER_SEARCH_ROWS).map(nonEmptyCount);
  const widest = Math.max(0, ...counts);
  if (widest === 0) return -1;
  const threshold = widest === 1 ? 1 : Math.max(2, Math.ceil(widest * HEADER_FILL_RATIO));
  return counts.findIndex(count => count >= threshold);
}

function uniqueName(name: string, used: Set<string>) {
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) { candidate = `${name} (${n})`; n += 1; }
  used.add(candidate.toLowerCase());
  return candidate;
}

type SheetOutcome = { entry: Omit<WorkbookSheetEntry, "displayName"> } | { reason: string };

function readSheet(XLSX: XlsxModule, worksheet: import("xlsx").WorkSheet | undefined): SheetOutcome {
  if (!worksheet || !worksheet["!ref"]) return { reason: "empty" };

  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const grid = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false }).data;
  const headerIndex = findHeaderIndex(grid);
  if (headerIndex < 0) return { reason: "empty" };

  /* A merged block only holds its value in the top-left cell. Spread vertical merges down the data so the
     blank cells below do not read as missing values. Merges above the header (titles) are left alone. */
  const origin = XLSX.utils.decode_range(worksheet["!ref"]).s;
  for (const merge of worksheet["!merges"] ?? []) {
    if (merge.e.r <= merge.s.r) continue;
    const top = merge.s.r - origin.r;
    if (top < headerIndex) continue;
    const value = grid[top]?.[merge.s.c - origin.c];
    if (isBlank(value)) continue;
    for (let r = top; r <= merge.e.r - origin.r && r < grid.length; r += 1) {
      for (let c = merge.s.c - origin.c; c <= merge.e.c - origin.c; c += 1) {
        if (!grid[r]) continue;
        if (isBlank(grid[r][c])) grid[r][c] = value as string;
      }
    }
  }

  const body = grid.slice(headerIndex).filter(row => nonEmptyCount(row) > 0);
  const width = body.reduce((max, row) => Math.max(max, row.length), 0);
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1) if (body.some(row => !isBlank(row[c]))) keep.push(c);

  const table = body.map((row, rowIndex) => keep.map((c, position) => {
    const cell = row[c] ?? "";
    return rowIndex === 0 && isBlank(cell) ? `Column ${position + 1}` : cell;
  }));
  const rowCount = table.length - 1;
  if (rowCount < 1) return { reason: "header row only, no data rows" };

  return { entry: { sheetName: "", rowCount, headerRow: headerIndex + 1, csv: Papa.unparse(table, { newline: "\n" }) } };
}

export function readWorkbookSheets(XLSX: XlsxModule, workbook: import("xlsx").WorkBook, fileName: string): WorkbookRead {
  const names = workbook.SheetNames ?? [];
  const hiddenState = workbook.Workbook?.Sheets ?? [];
  const sheets: WorkbookSheetEntry[] = [];
  const skipped: SkippedSheet[] = [];
  const usedNames = new Set<string>();

  names.forEach((name, index) => {
    if (hiddenState[index]?.Hidden) { skipped.push({ sheetName: name, reason: "hidden sheet" }); return; }
    if (sheets.length >= MAX_SHEETS_PER_WORKBOOK) {
      skipped.push({ sheetName: name, reason: `over the limit of ${MAX_SHEETS_PER_WORKBOOK} sheets per workbook` });
      return;
    }
    let outcome: SheetOutcome;
    try { outcome = readSheet(XLSX, workbook.Sheets[name]); }
    catch { outcome = { reason: "could not be read" }; }
    if ("reason" in outcome) { skipped.push({ sheetName: name, reason: outcome.reason }); return; }
    sheets.push({ ...outcome.entry, sheetName: name, displayName: uniqueName(name, usedNames) });
  });

  return { fileName, totalSheets: names.length, sheets, skipped };
}

function plural(n: number, word: string) { return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`; }

export function describeWorkbookRead(read: WorkbookRead): WorkbookNote {
  const parts = read.sheets.map(sheet => {
    const detail = `${plural(sheet.rowCount, "row")}${sheet.headerRow > 1 ? `, headers on row ${sheet.headerRow}` : ""}`;
    return `${sheet.displayName} (${detail})`;
  });
  return {
    summary: `Read ${plural(read.sheets.length, "sheet")} from ${read.fileName}${parts.length ? `: ${parts.join(", ")}` : ""}`,
    skipped: read.skipped.map(sheet => `Skipped ${sheet.sheetName}: ${sheet.reason}.`),
  };
}
