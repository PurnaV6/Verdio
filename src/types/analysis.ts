import type { CapabilityType } from "./dataPipeline";

/* ================================================================
   VERDIO — Analysis & Chart Types (Stage 9)
   App.tsx should render ChartSpec objects rather than containing
   fixed Recharts implementations per page.
   ================================================================ */

export type ChartType = 'line' | 'bar' | 'horizontal_bar' | 'scatter' | 'pie' | 'table';
export type ValueFormat = 'currency' | 'count' | 'percentage' | 'plain';

export interface ChartSpec {
  chartType:    ChartType;
  title:        string;
  subtitle?:    string;
  xKey?:        string;
  yKey?:        string;
  seriesKeys?:  string[];       // for multi-line/multi-bar charts (e.g. historical + forecast)
  data:         Record<string, any>[];
  formatValue:  ValueFormat;
  columns?:     { key: string; label: string; format?: ValueFormat }[]; // for 'table' chartType
}

export interface AnalysisCandidate {
  id:          string;
  capability:  CapabilityType;
  title:       string;
  explanation: string;          // why this analysis was surfaced, in plain language
  score:       number;          // 0–100 ranking score, set by rankAnalyses
  chart:       ChartSpec;
}
