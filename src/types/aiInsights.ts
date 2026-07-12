/* ================================================================
   VERDIO — AI Insights Types (generic pipeline version)
   Unlike the retail-specific AIInsights (executiveSummary +
   fixed riskExplanations/recommendations/anomalyExplanations/
   segmentInstructions arrays), this version narrates whatever risks,
   recommendations and analyses the pipeline actually produced for
   THIS dataset — it doesn't assume anomalies or RFM segments exist.
   ================================================================ */

export interface AIRiskExplanation { title: string; impact: string; action: string }
export interface AIRecommendationDetail { title: string; action: string; impactEstimate: string; timeline: string; priority: 'high' | 'medium' }
export interface AIAnalysisNarrative { analysisId: string; title: string; narrative: string }

export interface AIInsights {
  executiveSummary:    string;
  riskExplanations:    AIRiskExplanation[];        // one per Risk produced by the decision engine
  recommendations:     AIRecommendationDetail[];   // one per Recommendation produced by the decision engine
  keyInsights:          string[];
  analysisNarratives:  AIAnalysisNarrative[];       // one per top-ranked AnalysisCandidate actually shown
}
