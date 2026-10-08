import type { AIInsights } from "../../types/aiInsights";

export function findRiskExplanation(ai: AIInsights | null, title: string, idx: number) { if (!ai) return null; return ai.riskExplanations[idx] || ai.riskExplanations.find(r => r.title === title) || null; }
export function findRecommendation(ai: AIInsights | null, title: string, idx: number) { if (!ai) return null; return ai.recommendations[idx] || ai.recommendations.find(r => r.title === title) || null; }
export function findNarrative(ai: AIInsights | null, id: string, idx: number) { if (!ai) return null; return ai.analysisNarratives[idx] || ai.analysisNarratives.find(n => n.analysisId === id) || null; }
