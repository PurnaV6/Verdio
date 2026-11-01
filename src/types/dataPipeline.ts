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

/** Where a dataset comes from: a whole file, or one sheet of an Excel workbook. */
export interface DatasetSource {
  file:   File;
  sheet?: string;
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
         | 'convert_numeric' | 'convert_date'
         | 'calculate_revenue' | 'flag_undated_rows' | 'exclude_rows' | 'flag_possible_duplicates' | 'flag_returns'
         // Verdio no longer fills a missing value, so the three impute_* types are never written now.
         // They stay in the union so projects saved before that change still type-check.
         | 'impute_numeric_median' | 'impute_numeric_mean' | 'impute_categorical_mode';
  column?: string;
  count:   number;                  // how many cells/rows this action affected
  detail:  string;                  // human-readable summary shown to the user
}

/** A repeated row: `row` is its position among the file's data rows (the first is 1); `sameAs` is the earlier row it repeats. */
export interface DuplicateRow {
  row:    number;
  sameAs: number;
}

/** Why a row is left out of every sales measure. It stays in the data; only the totals skip it. */
export type ExcludedReason = 'zero_quantity' | 'zero_price' | 'zero_revenue' | 'missing_measure' | 'duplicate';

export interface ExcludedRow {
  row:        number;       // original position among the file's data rows (the first is 1)
  reason:     ExcludedReason;
  reasonText: string;       // plain words, for example "Quantity is 0" or "Duplicate of row 12"
  duplicateOf?: number;     // for reason 'duplicate': the row it repeats
  values:     RawRow;       // the row as the cleaning stage left it
}

/** A row with a negative revenue or quantity. It is summed separately from sales, as a positive amount. */
export interface ReturnRow {
  row:    number;
  amount: number;           // absolute value of the row's sales amount
  values: RawRow;
}

/** A cell Verdio calculated from the file's own numbers (a blank revenue as price x quantity), by original row number. */
export interface CalculatedCell {
  row:    number;
  column: string;
  value:  number;
}

/** Rows that hold a sales amount but no usable date: in total sales, not in the monthly trend, forecast or seasonality. */
export interface UndatedRows {
  count:         number;
  value:         number;     // their sales amount, which is in the total but not in the monthly series
  measureColumn: string;
  sentence:      string;     // plain sentence for the user
}

/** What Verdio did about the blanks in one column. */
export type ColumnCleaningAction =
  | 'none'                  // nothing is missing
  | 'left_blank'            // left blank (nothing in the analysis depends on it)
  | 'shown_as_missing'      // left blank; breakdowns show a "(Missing)" group
  | 'calculated'            // blank revenue calculated from price x quantity where possible
  | 'rows_left_out';        // rows with a blank here are left out of sales totals

export interface ColumnCleaning {
  name:             string;
  role:             string;           // the business role the semantic engine gave the column
  missingBefore:    number;           // blank cells in the file as uploaded
  missingBeforePct: number;           // 0-100
  missingAfter:     number;           // blank cells after cleaning and calculating
  missingAfterPct:  number;
  action:           ColumnCleaningAction;
  actionText:       string;           // plain sentence for the user
  calculated:       number;           // cells calculated (revenue only)
  rowsLeftOut:      number;           // rows left out of sales totals because of this column
  rowsLeftOutPct:   number;           // share of all rows, 0-100
  unreliable:       boolean;          // more than 40% of the column is missing
}

export interface CleaningReport {
  actions:        CleaningAction[];
  rowsBefore:     number;
  rowsAfter:      number;
  cellsImputed:   number;             // always 0 now: nothing is filled. Kept so older readers still work.
  /* Added later. Results saved before these existed do not have them, so read them as optional. */
  columns?:           ColumnCleaning[];                 // every column with any missing value
  rowsExcluded?:      Record<ExcludedReason, number>;   // rows left out of sales totals, by reason
  rowsCalculated?:    number;                           // rows where a blank revenue was calculated
  undatedRows?:       UndatedRows;                      // rows with a sales amount but no date
  calculatedCells?:   CalculatedCell[];                 // the first calculated cells, with original row numbers
  returns?:           { count: number; total: number }; // negative-revenue or negative-quantity rows, total as a positive amount
  duplicateRowCount?: number;                           // exact duplicate rows found
  duplicateHandling?: 'excluded' | 'flagged';           // excluded when the file has a unique ID column, else only flagged as possible duplicates
  duplicateRows?:     DuplicateRow[];                   // the first duplicates, with their original row numbers
}

/** What the file's rows add up to. Sales are positive rows that count; returns are summed apart as a positive amount. */
export interface SalesSummary {
  measureColumn:  string | null;      // the column the totals are summed from; null when the file has no sales measure
  salesTotal:     number;
  salesRows:      number;
  returnsTotal:   number;
  returnCount:    number;
  netTotal:       number;             // salesTotal minus returnsTotal
  excluded:       Record<ExcludedReason, number>;
  excludedCount:  number;
  calculatedCount: number;            // rows where a blank revenue was calculated from price x quantity
}

export interface CleanedDataset {
  rows:   RawRow[];                 // still string-keyed/valued — numeric & date columns are normalised strings (e.g. "1234.5", "2024-03-01")
  sourceRows: number[];             // parallel to rows: each kept row's position among the file's data rows (the first is 1)
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
