import type { RawRow, DatasetProfile, CleaningAction, CleanedDataset } from "../../types/dataPipeline";
import { isMissingValue, parseAmount } from "./profileDataset";
import { toIsoDateString } from "./dateParsing";

/* ================================================================
   VERDIO — Stage 3: Data Cleaning
   Every action taken here is recorded in a CleaningReport so the UI
   can show the user exactly what Verdio changed before analysis.

   This stage only tidies structure: whitespace, missing markers, number and
   date formats. It never fills a missing value and never removes a row.
   Anything that depends on what a column means (duplicates, calculated
   revenue, rows left out of sales) lives in roleAwareSteps.ts and runs once
   the semantic engine has assigned roles.
   ================================================================ */

export function cleanDataset(rows: RawRow[], profile: DatasetProfile): CleanedDataset {
  const actions: CleaningAction[] = [];
  const rowsBefore = rows.length;

  if (!rows.length) {
    return { rows: [], sourceRows: [], report: { actions, rowsBefore: 0, rowsAfter: 0, cellsImputed: 0 } };
  }

  const headers = Object.keys(rows[0]);

  /* ── 1. Trim header/value whitespace ── */
  let trimmedCells = 0;
  let working: RawRow[] = rows.map(row => {
    const out: RawRow = {};
    for (const h of headers) {
      const v = row[h] ?? '';
      const t = v.trim();
      if (t !== v) trimmedCells++;
      out[h] = t;
    }
    return out;
  });
  if (trimmedCells > 0) {
    actions.push({ type: 'trim_values', count: trimmedCells, detail: `Trimmed leading/trailing whitespace from ${trimmedCells} cell(s).` });
  }

  /* ── 2. Standardise missing-value markers to '' ── */
  let standardised = 0;
  working = working.map(row => {
    const out: RawRow = {};
    for (const h of headers) {
      const v = row[h];
      if (v !== '' && isMissingValue(v)) { out[h] = ''; standardised++; }
      else out[h] = v;
    }
    return out;
  });
  if (standardised > 0) {
    actions.push({ type: 'standardise_missing', count: standardised, detail: `Standardised ${standardised} missing-value marker(s) (e.g. "N/A", "null", "-") to a consistent blank.` });
  }

  /* ── 3. Exact duplicate rows are NOT removed here ──
     Whether a repeated row is a duplicate or a genuine second identical sale depends on whether the file
     has a unique order or transaction ID, which needs the column roles. See roleAwareSteps.ts. */

  /* ── 4. Convert & normalise numeric / date columns ── */
  const colProfileByName = new Map(profile.columns.map(c => [c.name, c]));
  for (const h of headers) {
    const cp = colProfileByName.get(h);
    if (!cp) continue;

    if (cp.inferredType === 'number') {
      let converted = 0;
      working = working.map(row => {
        const v = row[h];
        if (v === '') return row;
        const n = parseAmount(v);
        if (n === null) return row;
        const normalised = String(n);
        if (normalised !== v) converted++;
        return { ...row, [h]: normalised };
      });
      if (converted > 0) actions.push({ type: 'convert_numeric', column: h, count: converted, detail: `Normalised ${converted} value(s) in "${h}" to plain numeric form.` });
    }

    if (cp.inferredType === 'date') {
      let converted = 0;
      working = working.map(row => {
        const v = row[h];
        if (v === '') return row;
        const iso = toIsoDateString(v);
        if (!iso || iso === v) return row;
        converted++;
        return { ...row, [h]: iso };
      });
      if (converted > 0) actions.push({ type: 'convert_date', column: h, count: converted, detail: `Normalised ${converted} value(s) in "${h}" to ISO date format (YYYY-MM-DD).` });
    }
  }

  return {
    rows: working,
    sourceRows: working.map((_, i) => i + 1),
    report: { actions, rowsBefore, rowsAfter: working.length, cellsImputed: 0 },
  };
}
