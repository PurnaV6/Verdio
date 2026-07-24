/* ================================================================
   VERDIO — Data Pipeline Types
   Shared shapes for stages 1–5 (parse, profile, clean, semantic,
   quality). These types intentionally know nothing about "revenue"
   or "customers" — that vocabulary only enters at the semantic
   detection stage (see types/semantic.ts).
   ================================================================ */

export type RawRow = Record<string, string>;

/* ── Stage 1: Parsing ── */

export interface ParsedDataset {
  rows:    RawRow[];
  headers: string[];      // normalised (trimmed) header order as they appeared in the file
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'xls' | 'tsv' | 'json';
}

export interface ParseError {
  code:    'EMPTY_FILE' | 'NO_ROWS' | 'TOO_LARGE' | 'UNREADABLE' | 'PARSE_FAILED';
  message: string;
}

/* ── Stage 2: Profiling ── */

export type InferredType = 'number' | 'date' | 'boolean' | 'string' | 'empty';

export interface ColumnProfile {
  name:            string;
  inferredType:    InferredType;
  nonEmptyCount:   number;
  missingCount:    number;
  missingPct:      number;          // 0–100
  uniqueCount:     number;
  uniquenessRatio: number;          // uniqueCount / nonEmptyCount, 0–1
  isConstant:      boolean;         // every non-empty value identical
  sampleValues:    string[];        // up to 8 distinct sample values, in encounter order
  numericStats?:   { min: number; max: number; mean: number; median: number; stdDev: number };
  dateStats?:      { min: string; max: string; distinctMonths: number };
  avgLength:       number;          // average string length of non-empty values — helps distinguish codes from free text
}

export interface DatasetProfile {
  rowCount:          number;
  columnCount:       number;
  columns:           ColumnProfile[];
  duplicateRowCount: number;
  generatedAt:       string;        // ISO timestamp
}

/* ── Stage 3: Cleaning ── */

export interface CleaningAction {
  type:    'trim_headers' | 'trim_values' | 'remove_duplicate_rows' | 'standardise_missing'
         | 'convert_numeric' | 'convert_date' | 'impute_numeric_median' | 'impute_numeric_mean'
         | 'impute_categorical_mode';
  column?: string;
  count:   number;                  // how many cells/rows this action affected
  detail:  string;                  // human-readable summary shown to the user
}

export interface CleaningReport {
  actions:        CleaningAction[];
  rowsBefore:     number;
  rowsAfter:      number;
  cellsImputed:   number;
}

export interface CleanedDataset {
  rows:   RawRow[];                 // still string-keyed/valued — numeric & date columns are normalised strings (e.g. "1234.5", "2024-03-01")
  report: CleaningReport;
}

/* ── Stage 5: Data Quality ── */

export interface ColumnQualityScore {
  column:      string;
  completeness: number;   // 0–100, based on missingPct
  validity:     number;   // 0–100, % of values matching the inferred/semantic type
  consistency:  number;   // 0–100, format uniformity (e.g. one date format, not three)
  uniqueness:   number;   // 0–100, inverse of unexpected duplication for identifier-like columns; 100 if not applicable
  overall:      number;   // weighted combination
}

export interface DataQualityReport {
  issues: any;
  overallScore:      number;        // 0–100
  completenessScore: number;
  validityScore:     number;
  consistencyScore:  number;
  uniquenessScore:   number;
  duplicateRowPct:   number;
  columns:           ColumnQualityScore[];
  flags:             string[];      // human-readable warnings, e.g. "3 columns have >30% missing data"
}

/* ── Stage 6: Capability Detection ── */

export type CapabilityType =
  | 'trend_analysis' | 'comparison' | 'distribution' | 'correlation'
  | 'segmentation' | 'anomaly_detection' | 'forecasting'
  | 'concentration_analysis' | 'cohort_analysis' | 'transaction_analysis'
  | 'seasonality';

export interface Capability {
  type:       CapabilityType;
  available:  boolean;
  reason:     string;       // why this is (or isn't) available, shown to the user
  columns:    string[];     // column names that support this capability
  confidence: number;       // 0–1, derived from the confidence of the underlying semantic matches
}

export interface CapabilityReport {
  capabilities: Capability[];
  available:    Capability[];   // convenience filter: capabilities where available === true
}
