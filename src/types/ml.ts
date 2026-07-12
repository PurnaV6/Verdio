/* ================================================================
   VERDIO — ML Types (Stage 10)
   Each of these is only populated when detectCapabilities confirms
   the underlying data supports it — the pipeline sets the relevant
   field to null rather than fabricating output from insufficient data.
   ================================================================ */

export interface ForecastPoint { periodLabel: string; value: number; low: number; high: number }

export interface ForecastResult {
  measureColumn: string;
  scenario:      'base' | 'optimistic' | 'conservative';
  points:        ForecastPoint[];
  monthlyTrendPct: number;      // slope as % of latest period value
  holtNextPeriod:  number;
}

export interface AnomalyPoint {
  periodLabel: string;
  actual:      number;
  expected:    number;
  zScore:      number;
  isAnomaly:   boolean;
}

export interface AnomalyResult {
  measureColumn: string;
  points: AnomalyPoint[];
}

export type CustomerSegmentLabel = 'champion' | 'loyal' | 'atRisk' | 'new' | 'lost';

export interface CustomerSegment {
  id:       string;
  monetary: number;
  frequency: number;
  segment:  CustomerSegmentLabel;
  rfmScore: number;
}

export interface SegmentationResult {
  customerColumn: string;
  dateColumn:     string;
  measureColumn:  string;
  segments:       CustomerSegment[];
  churnRiskScore: number;        // 0-100
  revenueAtRisk:  number;
}

export interface MLResults {
  forecast:      ForecastResult | null;
  anomalies:     AnomalyResult | null;
  segmentation:  SegmentationResult | null;
}
