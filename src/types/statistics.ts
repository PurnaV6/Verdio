/* ================================================================
   VERDIO — Statistics Engine Types (Stage 8)
   ================================================================ */

export interface NumericStatSummary {
  column:   string;
  count:    number;
  mean:     number;
  median:   number;
  mode:     number | null;
  q1:       number;
  q3:       number;
  stdDev:   number;
  variance: number;
  min:      number;
  max:      number;
  outlierCount: number;
  outlierValues: number[];   // up to 10 sample outlier values
}

export interface CategoryFrequency {
  column: string;
  totalRows: number;
  frequencies: { value: string; count: number; pct: number }[]; // top 15, sorted desc
}

export type CorrelationStrength = 'negligible' | 'weak' | 'moderate' | 'strong' | 'very_strong';

export interface CorrelationPair {
  columnA: string;
  columnB: string;
  coefficient: number;       // Pearson r, -1..1
  strength: CorrelationStrength;
  direction: 'positive' | 'negative' | 'none';
}

export interface TimePoint {
  periodKey: string;   // "2024-03"
  label:     string;   // "Mar 24"
  value:     number;   // sum of the measure for this period
  count:     number;   // row count in this period
}

export interface TimeSeriesSummary {
  measureColumn: string;
  dateColumn:    string;
  points:        TimePoint[];
}

export interface SeasonalityPoint { label: string; value: number; count: number }

export interface SeasonalitySummary {
  measureColumn: string;
  dateColumn:    string;
  byDayOfWeek:   SeasonalityPoint[];   // Sun..Sat, always 7 entries
  byMonthOfYear: SeasonalityPoint[];   // Jan..Dec, always 12 entries
}

export interface CategoryBreakdownRow {
  label: string;
  value: number;   // sum of the measure for this category
  count: number;   // row count for this category
  pct:   number;    // value as % of total across all categories
}

export interface StatisticsResult {
  numeric:      NumericStatSummary[];
  categorical:  CategoryFrequency[];
  correlations: CorrelationPair[];
  timeSeries:   TimeSeriesSummary[];
  seasonality:  SeasonalitySummary | null;
}
