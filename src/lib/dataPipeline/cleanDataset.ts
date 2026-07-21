import type { RawRow, DatasetProfile, CleaningAction, CleanedDataset } from "../../types/dataPipeline";
import { isMissingValue, looksNumeric, looksDate } from "./profileDataset";

/* ================================================================
   VERDIO — Stage 3: Data Cleaning
   Every action taken here is recorded in a CleaningReport so the UI
   can show the user exactly what Verdio changed before analysis.

   Imputation rules (deliberately conservative):
   • Never impute identifier-like columns (high uniqueness) — a
     fabricated customer ID or SKU is worse than a gap.
   • Never impute date columns — a fabricated date corrupts trend
     and forecasting analysis silently.
   • Only impute a column if <=40% of it is missing. Beyond that,
     the column is left as-is; downstream stages should treat it as
     unreliable rather than trust a mostly-invented column.
   • Numeric columns: median if the distribution is skewed
     (|mean - median| / stdDev > 0.5), otherwise mean.
   • Categorical/string columns: mode (most frequent value).
   ================================================================ */

const IMPUTE_MAX_MISSING_PCT = 40;
const HIGH_UNIQUENESS_SKIP = 0.8; // uniquenessRatio above this => treat as identifier-like, don't impute

function toISODate(v: string): string | null {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mode(values: string[]): string | null {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: string | null = null, bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

export function cleanDataset(rows: RawRow[], profile: DatasetProfile): CleanedDataset {
  const actions: CleaningAction[] = [];
  const rowsBefore = rows.length;

  if (!rows.length) {
    return { rows: [], report: { actions, rowsBefore: 0, rowsAfter: 0, cellsImputed: 0 } };
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

  /* ── 3. Remove exact duplicate rows ── */
  const seen = new Set<string>();
  const deduped: RawRow[] = [];
  let removedDupes = 0;
  for (const row of working) {
    const key = headers.map(h => row[h]).join('\u0001');
    if (seen.has(key)) { removedDupes++; continue; }
    seen.add(key);
    deduped.push(row);
  }
  working = deduped;
  if (removedDupes > 0) {
    actions.push({ type: 'remove_duplicate_rows', count: removedDupes, detail: `Removed ${removedDupes} exact duplicate row(s).` });
  }

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
        const n = looksNumeric(v);
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
        if (v === '' || !looksDate(v)) return row;
        const iso = toISODate(v);
        if (!iso || iso === v) return row;
        converted++;
        return { ...row, [h]: iso };
      });
      if (converted > 0) actions.push({ type: 'convert_date', column: h, count: converted, detail: `Normalised ${converted} value(s) in "${h}" to ISO date format (YYYY-MM-DD).` });
    }
  }

  /* ── 5. Selective imputation ── */
  let cellsImputed = 0;
  for (const h of headers) {
    const cp = colProfileByName.get(h);
    if (!cp) continue;
    if (cp.missingCount === 0) continue;
    if (cp.missingPct > IMPUTE_MAX_MISSING_PCT) continue;
    if (cp.inferredType === 'date') continue;               // never fabricate dates
    if (cp.uniquenessRatio > HIGH_UNIQUENESS_SKIP) continue; // never fabricate identifiers

    if (cp.inferredType === 'number') {
      const nums = working.map(r => r[h]).filter(v => v !== '').map(Number).filter(Number.isFinite);
      if (!nums.length) continue;
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
      const med = median(nums);
      const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length) || 1;
      const skewed = Math.abs(mean - med) / sd > 0.5;
      const fillValue = String(skewed ? med : mean);
      let count = 0;
      working = working.map(row => {
        if (row[h] !== '') return row;
        count++;
        return { ...row, [h]: fillValue };
      });
      if (count > 0) {
        cellsImputed += count;
        actions.push({
          type: skewed ? 'impute_numeric_median' : 'impute_numeric_mean',
          column: h, count,
          detail: `Filled ${count} missing value(s) in "${h}" with the column ${skewed ? 'median' : 'mean'} (${fillValue}) — distribution is ${skewed ? 'skewed' : 'stable'}.`,
        });
      }
    } else if (cp.inferredType === 'string' || cp.inferredType === 'boolean') {
      const nonEmpty = working.map(r => r[h]).filter(v => v !== '');
      const fillValue = mode(nonEmpty);
      if (!fillValue) continue;
      let count = 0;
      working = working.map(row => {
        if (row[h] !== '') return row;
        count++;
        return { ...row, [h]: fillValue };
      });
      if (count > 0) {
        cellsImputed += count;
        actions.push({ type: 'impute_categorical_mode', column: h, count, detail: `Filled ${count} missing value(s) in "${h}" with the most common value ("${fillValue}").` });
      }
    }
  }

  return {
    rows: working,
    report: { actions, rowsBefore, rowsAfter: working.length, cellsImputed },
  };
}
