import type { RawRow, ColumnProfile, DatasetProfile, InferredType } from "../../types/dataPipeline";
import { isStrictDate, parseStrictDate } from "./dateParsing";

/* ================================================================
   VERDIO — Stage 2: Data Profiling
   Describes the dataset objectively: types, missingness, uniqueness,
   distributions. This stage must not interpret a column as "revenue"
   or "customer" — that judgement belongs to semanticEngine.ts, which
   consumes this profile as evidence.
   ================================================================ */

const SAMPLE_SIZE = 500; // cap per-column analysis cost on very wide/long files

const MISSING_MARKERS = new Set(['', 'n/a', 'na', 'null', 'none', '-', '--', 'nan', 'undefined', '?']);

export function isMissingValue(v: string): boolean {
  return MISSING_MARKERS.has(v.trim().toLowerCase());
}

function isMissing(v: string): boolean {
  return isMissingValue(v);
}

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * The one way Verdio reads a money or count cell. A blank, whitespace, text, NaN or Infinity is null, never 0
 * (`Number('')` is 0, which turns a gap into a sale). Accepts currency symbols, thousands commas, spaces,
 * a trailing %, accounting negatives "(1,234.00)" and a trailing minus "1,234-".
 */
export function parseAmount(cell: unknown): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;
  let text = cell.trim();
  if (text === '') return null;
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) { negative = true; text = text.slice(1, -1); }
  text = text.replace(/[£$€¥,\s]/g, '').replace(/%$/, '');
  if (text.endsWith('-')) { negative = !negative; text = text.slice(0, -1); }
  if (!PLAIN_NUMBER.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/** Same reading as parseAmount, so a column is typed as numbers by the rule that later reads its cells. */
export function looksNumeric(v: string): number | null {
  return parseAmount(v);
}

export function looksDate(v: string): boolean {
  return isStrictDate(v);
}

function looksBoolean(v: string): boolean {
  return /^(true|false|yes|no|y|n)$/i.test(v.trim());
}

function inferColumnType(values: string[]): InferredType {
  const nonEmpty = values.filter(v => !isMissing(v));
  if (!nonEmpty.length) return 'empty';

  const sample = nonEmpty.slice(0, SAMPLE_SIZE);
  const numericHits = sample.filter(v => looksNumeric(v) !== null).length;
  if (numericHits / sample.length >= 0.9) return 'number';

  const dateHits = sample.filter(looksDate).length;
  if (dateHits / sample.length >= 0.85) return 'date';

  const boolHits = sample.filter(looksBoolean).length;
  if (boolHits / sample.length >= 0.95) return 'boolean';

  return 'string';
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stdDev(nums: number[], mean: number): number {
  if (nums.length < 2) return 0;
  return Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length);
}

function profileColumn(name: string, values: string[]): ColumnProfile {
  const nonEmptyValues = values.filter(v => !isMissing(v));
  const missingCount = values.length - nonEmptyValues.length;
  const inferredType = inferColumnType(values);

  const distinct = new Set(nonEmptyValues.map(v => v.trim()));
  const sampleValues = Array.from(distinct).slice(0, 8);

  const avgLength = nonEmptyValues.length
    ? Math.round(nonEmptyValues.reduce((s, v) => s + v.length, 0) / nonEmptyValues.length)
    : 0;

  const profile: ColumnProfile = {
    name,
    inferredType,
    nonEmptyCount:   nonEmptyValues.length,
    missingCount,
    missingPct:      values.length ? Math.round((missingCount / values.length) * 1000) / 10 : 0,
    uniqueCount:      distinct.size,
    uniquenessRatio: nonEmptyValues.length ? Math.round((distinct.size / nonEmptyValues.length) * 1000) / 1000 : 0,
    isConstant:      distinct.size <= 1 && nonEmptyValues.length > 0,
    sampleValues,
    avgLength,
  };

  if (inferredType === 'number') {
    const nums = nonEmptyValues.map(looksNumeric).filter((n): n is number => n !== null);
    if (nums.length) {
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
      profile.numericStats = { min: Math.min(...nums), max: Math.max(...nums), mean, median: median(nums), stdDev: stdDev(nums, mean) };
    }
  }

  if (inferredType === 'date') {
    const parsed = nonEmptyValues.map(parseStrictDate).filter((d): d is NonNullable<typeof d> => d !== null);
    if (parsed.length) {
      const keys = parsed.map(d => d.year * 10000 + d.month * 100 + d.day);
      const iso = (k: number) => `${String(Math.floor(k / 10000)).padStart(4, '0')}-${String(Math.floor(k / 100) % 100).padStart(2, '0')}-${String(k % 100).padStart(2, '0')}`;
      const months = new Set(parsed.map(d => `${d.year}-${d.month - 1}`));
      profile.dateStats = {
        min: iso(Math.min(...keys)),
        max: iso(Math.max(...keys)),
        distinctMonths: months.size,
      };
    }
  }

  return profile;
}

export function profileDataset(rows: RawRow[]): DatasetProfile {
  if (!rows.length) {
    return { rowCount: 0, columnCount: 0, columns: [], duplicateRowCount: 0, generatedAt: new Date().toISOString() };
  }

  const headers = Object.keys(rows[0]);
  const columns = headers.map(h => profileColumn(h, rows.map(r => r[h] ?? '')));

  const seen = new Set<string>();
  let duplicateRowCount = 0;
  for (const row of rows) {
    const key = headers.map(h => row[h]).join('\u0001');
    if (seen.has(key)) duplicateRowCount++;
    else seen.add(key);
  }

  return {
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
    duplicateRowCount,
    generatedAt: new Date().toISOString(),
  };
}
