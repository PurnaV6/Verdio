import Papa from "papaparse";
import type { ParsedDataset, ParseError, RawRow } from "../../types/dataPipeline";

/* ================================================================
   VERDIO — Stage 1: File Validation & Parsing
   Accepts a CSV or Excel File, validates it, and returns a normalised
   ParsedDataset (or a typed error — this function never throws).
   Headers are trimmed; row values are left as raw strings — type
   coercion happens later, in cleanDataset.ts, once we've profiled
   the column.
   ================================================================ */

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB — raised from 25MB; still client-side/in-browser processing, see note below

export type ParseResult =
  | { ok: true;  data: ParsedDataset }
  | { ok: false; error: ParseError };

function normaliseHeaders(rows: Record<string, string>[]): { rows: RawRow[]; headers: string[] } {
  if (!rows.length) return { rows: [], headers: [] };
  const rawHeaders = Object.keys(rows[0]);
  const headerMap = new Map(rawHeaders.map(h => [h, h.trim()]));
  const headers = Array.from(headerMap.values());

  const cleaned = rows.map(row => {
    const out: RawRow = {};
    for (const raw of rawHeaders) {
      out[headerMap.get(raw)!] = (row[raw] ?? '').toString();
    }
    return out;
  });

  return { rows: cleaned, headers };
}

function parseCSVText(text: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data as Record<string, string>[]),
      error: (e: Error) => reject(e),
    });
  });
}

export async function parseDataset(file: File): Promise<ParseResult> {
  if (!file || file.size === 0) {
    return { ok: false, error: { code: 'EMPTY_FILE', message: 'The selected file is empty.' } };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: { code: 'TOO_LARGE', message: `File is larger than ${MAX_FILE_BYTES / (1024 * 1024)}MB. Please split it into smaller files.` } };
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const fileType: ParsedDataset['fileType'] = ext === 'xlsx' ? 'xlsx' : ext === 'xls' ? 'xls' : 'csv';

  try {
    let rawRows: Record<string, string>[];

    if (fileType === 'xlsx' || fileType === 'xls') {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (!firstSheet) return { ok: false, error: { code: 'NO_ROWS', message: 'The workbook has no readable sheets.' } };
      const csv = XLSX.utils.sheet_to_csv(firstSheet);
      rawRows = await parseCSVText(csv);
    } else {
      const text = await file.text();
      rawRows = await parseCSVText(text);
    }

    if (!rawRows.length) {
      return { ok: false, error: { code: 'NO_ROWS', message: 'No data rows were found in this file.' } };
    }

    const { rows, headers } = normaliseHeaders(rawRows);
    if (!headers.length) {
      return { ok: false, error: { code: 'NO_ROWS', message: 'Could not detect any columns in this file.' } };
    }

    return { ok: true, data: { rows, headers, fileName: file.name, fileType } };
  } catch (e: any) {
    return { ok: false, error: { code: 'PARSE_FAILED', message: e?.message || 'Could not read this file.' } };
  }
}
