import type { WorkBook, WorkSheet } from "xlsx";
import type { DatasetSource, ParseError } from "../../types/dataPipeline";
import { locateHeader, nonEmptyCount, sheetRows, usedBounds } from "./excelCells";

/* ================================================================
   VERDIO — Excel workbooks with several sheets
   A workbook is read once per File (cached), and each sheet that
   looks like a table is offered as its own dataset: a DatasetSource
   of { file, sheet }. Nothing here keeps rows: listing only counts
   them, and parseDataset(file, sheet) builds the rows of one sheet.
   ================================================================ */

type Xlsx = typeof import("xlsx");

/** Excel files only. SheetJS holds one JS object per cell, so a workbook takes several times the memory of the
 *  zipped file plus its unzipped XML. 25MB is the cap this app had before it was raised to 100MB for CSV, where
 *  rows are read as flat text; a larger workbook is better exported to CSV first. */
export const MAX_EXCEL_BYTES = 25 * 1024 * 1024;
/** Sheets offered from one workbook. The review screen shows one card per sheet and relationships are matched pairwise. */
export const MAX_SHEETS = 25;
/** Rows across all sheets of one workbook. The first usable sheet is always kept, even when it alone is larger. */
export const MAX_TOTAL_ROWS = 500_000;

/** headerRow is the 1-based sheet row that holds the column names. */
export interface SheetSummary { name: string; rowCount: number; columnCount: number; headerRow: number }
export interface SkippedSheet { name: string; reason: string }
export interface WorkbookListing { fileName: string; totalSheets: number; sheets: SheetSummary[]; skipped: SkippedSheet[] }
export interface WorkbookNote { summary: string; adjusted: string[]; skipped: string[] }
export type WorkbookListResult = { ok: true; data: WorkbookListing } | { ok: false; error: ParseError };

export function isExcelName(name: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return ext === "xlsx" || ext === "xls";
}

export function excelSizeError(file: File): ParseError | null {
  if (file.size <= MAX_EXCEL_BYTES) return null;
  return { code: "TOO_LARGE", message: `Excel files larger than ${MAX_EXCEL_BYTES / (1024 * 1024)}MB are too big to open in the browser. Export the sheet you need as CSV, or split the workbook.` };
}

export function toDatasetSource(input: File | DatasetSource): DatasetSource {
  return input instanceof File ? { file: input } : input;
}

/** `Book.xlsx · Sheet` for a sheet, the file name otherwise. */
export function datasetDisplayName(fileName: string, sheet?: string) {
  return sheet === undefined ? fileName : `${fileName} · ${sheet}`;
}

const workbooks = new WeakMap<File, Promise<WorkBook>>();

/** The workbook of a File, read at most once. cellNF keeps number formats so dates can be told from numbers. */
export function loadWorkbook(file: File): Promise<WorkBook> {
  let loaded = workbooks.get(file);
  if (!loaded) {
    loaded = (async () => {
      const XLSX = await import("xlsx");
      return XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellNF: true });
    })();
    workbooks.set(file, loaded);
    loaded.catch(() => workbooks.delete(file));
  }
  return loaded;
}

export const workbookUses1904 = (workbook: WorkBook) => !!workbook.Workbook?.WBProps?.date1904;

/** Counts a sheet's data rows below its header and decides whether it is a table: a header-like row within the first
 *  rows (title text above it is allowed), with at least two columns and at least two data rows below it. */
function summariseSheet(XLSX: Xlsx, ws: WorkSheet | undefined, date1904: boolean): SheetSummary | { reason: string } {
  const bounds = ws ? usedBounds(XLSX, ws) : null;
  if (!ws || !bounds) return { reason: "empty" };
  const header = locateHeader(XLSX, ws, date1904);
  if (!header) return { reason: "not a table" };

  let rowCount = 0, index = 0;
  for (const row of sheetRows(XLSX, ws, date1904, header.row)) {
    if (bounds.minR + index > header.row && nonEmptyCount(row) > 0) rowCount += 1;
    index += 1;
  }
  if (rowCount < 2) return { reason: "not a table" };
  return { name: "", rowCount, columnCount: header.columnCount, headerRow: header.row + 1 };
}

/** Which sheets of a workbook are loaded, and why the others are not. Never throws. */
export async function listWorkbookSheets(file: File, limits: { maxSheets?: number; maxTotalRows?: number } = {}): Promise<WorkbookListResult> {
  const maxSheets = limits.maxSheets ?? MAX_SHEETS, maxTotalRows = limits.maxTotalRows ?? MAX_TOTAL_ROWS;
  if (!file || file.size === 0) return { ok: false, error: { code: "EMPTY_FILE", message: "The selected file is empty." } };
  const tooLarge = excelSizeError(file);
  if (tooLarge) return { ok: false, error: tooLarge };

  try {
    const XLSX = await import("xlsx");
    const workbook = await loadWorkbook(file);
    const names = workbook.SheetNames ?? [];
    const hidden = workbook.Workbook?.Sheets ?? [];
    const date1904 = workbookUses1904(workbook);
    const sheets: SheetSummary[] = [];
    const skipped: SkippedSheet[] = [];
    const seen = new Set<string>();
    let totalRows = 0;

    names.forEach((name, index) => {
      if (seen.has(name.toLowerCase())) { skipped.push({ name, reason: "same name as an earlier sheet" }); return; }
      seen.add(name.toLowerCase());
      if (hidden[index]?.Hidden) { skipped.push({ name, reason: "hidden sheet" }); return; }
      if (sheets.length >= maxSheets) { skipped.push({ name, reason: `over the limit of ${maxSheets} sheets` }); return; }
      let summary: ReturnType<typeof summariseSheet>;
      try { summary = summariseSheet(XLSX, workbook.Sheets[name], date1904); }
      catch { skipped.push({ name, reason: "could not be read" }); return; }
      if ("reason" in summary) { skipped.push({ name, reason: summary.reason }); return; }
      if (sheets.length > 0 && totalRows + summary.rowCount > maxTotalRows) {
        skipped.push({ name, reason: `over the limit of ${maxTotalRows.toLocaleString("en-US")} rows across sheets` });
        return;
      }
      totalRows += summary.rowCount;
      sheets.push({ ...summary, name });
    });

    return { ok: true, data: { fileName: file.name, totalSheets: names.length, sheets, skipped } };
  } catch (e: unknown) {
    return { ok: false, error: { code: "PARSE_FAILED", message: (e as Error)?.message || "Could not read this file." } };
  }
}

function plural(n: number, word: string) { return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`; }

/** The two lines the upload screens show: what was read, and what was skipped and why. */
export function describeWorkbookListing(listing: WorkbookListing): WorkbookNote {
  const parts = listing.sheets.map(sheet => `${sheet.name} (${plural(sheet.rowCount, "row")})`);
  return {
    summary: `Read ${plural(listing.sheets.length, "sheet")} from ${listing.fileName}${parts.length ? `: ${parts.join(", ")}` : ""}`,
    adjusted: listing.sheets.filter(sheet => sheet.headerRow > 1).map(sheet => `${sheet.name}: headers found on row ${sheet.headerRow}.`),
    skipped: listing.skipped.map(sheet => `Skipped ${sheet.name} (${sheet.reason}).`),
  };
}

export interface UploadPlan { sources: DatasetSource[]; notes: WorkbookNote[] }

/**
 * Turns the dropped files into datasets. A workbook with more than one sheet becomes one source per usable sheet;
 * everything else (CSV, TSV, JSON, single-sheet workbooks, unreadable files) stays one source per file and is
 * handled by parseDataset exactly as before. Throws only when a multi-sheet workbook has no usable sheet.
 */
export async function planUpload(files: File[]): Promise<UploadPlan> {
  const sources: DatasetSource[] = [];
  const notes: WorkbookNote[] = [];
  for (const file of files) {
    if (!isExcelName(file.name)) { sources.push({ file }); continue; }
    const listing = await listWorkbookSheets(file);
    if (!listing.ok || listing.data.totalSheets < 2) { sources.push({ file }); continue; } // parseDataset reports read errors
    if (!listing.data.sheets.length) {
      const reasons = listing.data.skipped.map(sheet => `${sheet.name} (${sheet.reason})`).join(", ");
      throw new Error(`No sheet in ${file.name} looks like a table with a header row and data. Skipped: ${reasons}.`);
    }
    for (const sheet of listing.data.sheets) sources.push({ file, sheet: sheet.name });
    notes.push(describeWorkbookListing(listing.data));
  }
  return { sources, notes };
}
