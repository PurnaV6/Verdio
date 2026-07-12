import type { AnalysisCandidate } from "../../types/analysis";
import type { CapabilityType } from "../../types/dataPipeline";

/* ================================================================
   VERDIO — Analysis Ranking
   Combines candidates from generateAnalysisCandidates() and
   generateMLAnalysisCandidates(), applies a priority weighting per
   capability type (executive-relevant analyses first), and returns
   the top N for display.
   ================================================================ */

const PRIORITY_WEIGHT: Partial<Record<CapabilityType, number>> = {
  trend_analysis:  1.15,
  forecasting:      1.15,
  segmentation:     1.1,
  concentration_analysis: 1.05,
  anomaly_detection: 1.05,
};

export function rankAnalyses(candidates: AnalysisCandidate[], limit = 10): AnalysisCandidate[] {
  return candidates
    .map(c => ({ ...c, score: Math.min(100, Math.round(c.score * (PRIORITY_WEIGHT[c.capability] ?? 1))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
