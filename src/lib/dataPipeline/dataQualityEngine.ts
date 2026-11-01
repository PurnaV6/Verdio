import type { RawRow, DatasetProfile, ColumnQualityScore, DataQualityReport } from "../../types/dataPipeline";
import type { SemanticResult } from "../../types/semantic";
import { isMissingValue, looksNumeric, looksDate } from "./profileDataset";

/* ================================================================
   VERDIO — Stage 5: Data Quality Assessment
   Domain-independent: this makes no assumption that the dataset is
   sales/retail data. It scores each column on four axes and combines
   them into an overall 0–100 score.
   ================================================================ */

const WEIGHTS = { completeness: 0.4, validity: 0.3, consistency: 0.2, uniqueness: 0.1 };

/** Columns the semantic engine reads as revenue, price, quantity, date or the primary identifier carry the file's sales figures. */
export const KEY_ROLES: readonly string[] = ['revenue', 'price', 'quantity', 'date', 'identifier'];
/** A key column counts this many times in the completeness average, so one mostly blank sales column cannot hide among the others. */
export const KEY_COLUMN_WEIGHT = 3;
/** The worst key column's blank share also docks the overall score directly (like duplicate rows): this share of it, up to the cap. */
export const KEY_GAP_FACTOR = 0.4;
export const KEY_GAP_CAP = 30;

function validityForColumn(values: string[], inferredType: string): number {
  const nonEmpty = values.filter(v => !isMissingValue(v));
  if (!nonEmpty.length) return 100; // nothing to be invalid
  let matches = 0;
  for (const v of nonEmpty) {
    if (inferredType === 'number' && looksNumeric(v) !== null) matches++;
    else if (inferredType === 'date' && looksDate(v)) matches++;
    else if (inferredType === 'boolean' && /^(true|false|yes|no|y|n|0|1)$/i.test(v)) matches++;
    else if (inferredType === 'string') matches++; // any non-empty string is "valid" for a free-text column
  }
  return Math.round((matches / nonEmpty.length) * 1000) / 10;
}

function consistencyForColumn(values: string[], inferredType: string): number {
  const nonEmpty = values.filter(v => !isMissingValue(v));
  if (nonEmpty.length < 2) return 100;

  if (inferredType === 'date') {
    // after cleanDataset normalises to ISO, consistency should be near 100 unless raw/unclean input was passed in
    const isoCount = nonEmpty.filter(v => /^\d{4}-\d{2}-\d{2}/.test(v)).length;
    return Math.round((isoCount / nonEmpty.length) * 1000) / 10;
  }
  if (inferredType === 'number') {
    const plainCount = nonEmpty.filter(v => /^-?\d+(\.\d+)?$/.test(v)).length;
    return Math.round((plainCount / nonEmpty.length) * 1000) / 10;
  }
  // For free text/category columns, consistency isn't well-defined by format — treat as fully consistent
  return 100;
}

function uniquenessForColumn(role: string, uniquenessRatio: number): number {
  if (role === 'identifier') {
    // an identifier column should be ~100% unique; every repeat is a quality issue
    return Math.round(uniquenessRatio * 1000) / 10;
  }
  return 100; // uniqueness isn't a quality dimension for non-identifier columns
}

export function assessDataQuality(rows: RawRow[], profile: DatasetProfile, semantics: SemanticResult): DataQualityReport {
  const semByName = new Map(semantics.columns.map(s => [s.columnName, s]));
  const flags: string[] = [];

  const columns: ColumnQualityScore[] = profile.columns.map(col => {
    const values = rows.map(r => r[col.name] ?? '');
    const completeness = Math.max(0, 100 - col.missingPct);
    const validity = validityForColumn(values, col.inferredType);
    const consistency = consistencyForColumn(values, col.inferredType);
    const role = semByName.get(col.name)?.businessRole || 'unknown';
    const uniqueness = uniquenessForColumn(role, col.uniquenessRatio);

    const overall = Math.round(
      (completeness * WEIGHTS.completeness) +
      (validity * WEIGHTS.validity) +
      (consistency * WEIGHTS.consistency) +
      (uniqueness * WEIGHTS.uniqueness)
    );

    if (completeness < 70) flags.push(`"${col.name}" is ${Math.round(100 - completeness)}% missing.`);
    if (validity < 85 && col.inferredType !== 'string') flags.push(`"${col.name}" contains values inconsistent with its detected type (${Math.round(validity)}% valid).`);
    if (role === 'identifier' && uniqueness < 98) flags.push(`"${col.name}" is used as an identifier but contains duplicate values (${Math.round(uniqueness)}% unique).`);

    return { column: col.name, completeness, validity, consistency, uniqueness, overall };
  });

  const isKey = (name: string) => KEY_ROLES.includes(semByName.get(name)?.businessRole || 'unknown');
  const keyBlankPcts = columns.filter(c => isKey(c.column)).map(c => 100 - c.completeness);
  const keyGapPenalty = Math.min(KEY_GAP_CAP, KEY_GAP_FACTOR * Math.max(0, ...keyBlankPcts));
  const weightOf = (name: string) => (isKey(name) ? KEY_COLUMN_WEIGHT : 1);
  const weightedCompleteness = () => {
    const total = columns.reduce((s, c) => s + weightOf(c.column), 0);
    return total ? Math.round(columns.reduce((s, c) => s + c.completeness * weightOf(c.column), 0) / total) : 0;
  };
  const avg = (key: keyof ColumnQualityScore) => columns.length ? Math.round(columns.reduce((s, c) => s + (c[key] as number), 0) / columns.length) : 0;

  const completenessScore = weightedCompleteness();
  const validityScore     = avg('validity');
  const consistencyScore  = avg('consistency');
  const uniquenessScore   = avg('uniqueness');
  const duplicateRowPct   = profile.rowCount ? Math.round((profile.duplicateRowCount / profile.rowCount) * 1000) / 10 : 0;

  if (duplicateRowPct > 1) flags.push(`${duplicateRowPct}% of rows are exact duplicates.`);

  const overallScore = Math.round(
    (completenessScore * WEIGHTS.completeness) +
    (validityScore * WEIGHTS.validity) +
    (consistencyScore * WEIGHTS.consistency) +
    (uniquenessScore * WEIGHTS.uniqueness) -
    Math.min(15, duplicateRowPct) - // duplicate rows dock the overall score directly, capped
    keyGapPenalty // so does a mostly blank key column
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    completenessScore, validityScore, consistencyScore, uniquenessScore,
    duplicateRowPct, columns, flags,
  };
}
