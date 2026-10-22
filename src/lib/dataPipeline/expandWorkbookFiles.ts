import { MAX_FILE_BYTES } from "./parseDataset";
import { describeWorkbookRead, readWorkbookSheets, sheetFileName, type WorkbookNote, type WorkbookRead } from "./workbookSheets";

/* ================================================================
   VERDIO — Upload expansion
   Turns every Excel workbook that has more than one sheet into one
   File per readable sheet (named `<file> / <sheet>`, CSV content), so
   each sheet goes through the same flow as a separately uploaded file.
   Everything else (CSV, TSV, JSON, single-sheet workbooks, unreadable
   files) is returned untouched and handled by parseDataset as before.
   ================================================================ */

export interface ExpandedUpload {
  files: File[];
  notes: WorkbookNote[];
}

export async function expandWorkbookFiles(input: File[]): Promise<ExpandedUpload> {
  const files: File[] = [];
  const notes: WorkbookNote[] = [];

  for (const file of input) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if ((ext !== "xlsx" && ext !== "xls") || file.size === 0 || file.size > MAX_FILE_BYTES) { files.push(file); continue; }

    let read: WorkbookRead;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
      if ((workbook.SheetNames ?? []).length < 2) { files.push(file); continue; }
      read = readWorkbookSheets(XLSX, workbook, file.name);
    } catch {
      files.push(file); // parseDataset reports the read error for this file
      continue;
    }

    if (!read.sheets.length) {
      const reasons = read.skipped.map(sheet => `${sheet.sheetName} (${sheet.reason})`).join(", ");
      throw new Error(`No sheet in ${file.name} has data to read. Skipped: ${reasons}.`);
    }
    for (const sheet of read.sheets) {
      files.push(new File([sheet.csv], sheetFileName(file.name, sheet.displayName), { type: "text/csv" }));
    }
    notes.push(describeWorkbookRead(read));
  }

  return { files, notes };
}
