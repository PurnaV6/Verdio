/* ================================================================
   VERDIO — Verdio Decision Engine (VDE) v2
   This is the upgrade that turns risks + recommendations into
   financially ranked business actions, which is what endorsing bodies
   require for "decision intelligence" not "BI dashboard".

   Drop in: src/lib/decision/verdioDecisionEngine.ts
   Types are backward compatible with your existing DecisionResult.

   Usage in runDataPipeline.ts:
   import { buildVerdioDecisions } from "../decision/verdioDecisionEngine";
   const vde = buildVerdioDecisions({ risks, recommendations, ml, statistics, quality, engineeredRows, index });
   return { ... decision: { health, risks, recommendations: vde.rankedActions } , vde }

   ================================================================ */

import type { EngineeredRow } from "../../types/features";
import type { SemanticIndex } from "../../types/semantic";
import type { StatisticsResult } from "../../types/statistics";
import type { DataQualityReport } from "../../types/dataPipeline";
import type { MLResults } from "../../types/ml";
import type { Risk, Recommendation } from "../../types/decision";
import { labelForMeasure } from "../labels";

export interface FinancialImpact {
  estimatedValue: number; // GBP estimate of value at risk or opportunity
  currency: 'GBP';
  basis: string; // how it was calculated, for explainability
  rangeLow: number;
  rangeHigh: number;
}

export interface EnrichedRecommendation extends Recommendation {
  financialImpact: FinancialImpact;
  urgency: 'immediate' | 'this_month' | 'this_quarter';
  effort: 'low' | 'medium' | 'high'; // days of work
  effortDays: number;
  confidence: number; // 0-1, based on data quality and evidence strength
  priorityScore: number; // 0-100, final ranking score
  relatedRiskTitles: string[];
}

export interface VDEResult {
  rankedActions: EnrichedRecommendation[];
  totalValueAtRisk: number;
  totalOpportunityValue: number;
  summary: string;
}

function calcTotalMeasure(rows: EngineeredRow[], measureCol: string): number {
  let sum = 0;
  for (const r of rows) {
    const v = Number(r[measureCol]);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

function scoreFinancialImpact(
  rec: Recommendation,
  risks: Risk[],
  ml: MLResults,
  stats: StatisticsResult,
  rows: EngineeredRow[],
  index: SemanticIndex
): FinancialImpact {
  const primaryMeasure = index.best('revenue')?.columnName || index.best('price')?.columnName || index.best('quantity')?.columnName;
  const total = primaryMeasure ? calcTotalMeasure(rows, primaryMeasure) : 0;
  const measureLabel = primaryMeasure ? labelForMeasure(primaryMeasure) : 'value';

  // Concentration risk -> value = top share % * total
  if (rec.title.toLowerCase().includes('concentration')) {
    const related = risks.find(r=>r.title.toLowerCase().includes('concentration'));
    const pctMatch = related?.desc.match(/(\d+)%/);
    const pct = pctMatch ? Number(pctMatch[1])/100 : 0.5;
    const atRisk = total * pct;
    return {
      estimatedValue: Math.round(atRisk),
      currency: 'GBP',
      basis: `${pctMatch?.[1] || '50'}% of total ${measureLabel} (£${Math.round(total).toLocaleString()}) is concentrated in one ${related?.sourceColumns[0] || 'dimension'}`,
      rangeLow: Math.round(atRisk*0.7),
      rangeHigh: Math.round(atRisk*1.3)
    };
  }

  // Churn / retention
  if (rec.title.toLowerCase().includes('re-engage') || rec.title.toLowerCase().includes('churn') || rec.title.toLowerCase().includes('retention')) {
    const revenueAtRisk = ml.segmentation?.revenueAtRisk || total * 0.15;
    return {
      estimatedValue: Math.round(revenueAtRisk),
      currency: 'GBP',
      basis: `RFM segmentation shows ${ml.segmentation?.segments.filter(s=>s.segment==='atRisk' || s.segment==='lost').length || 0} at-risk customers, churn score ${ml.segmentation?.churnRiskScore || 0}/100`,
      rangeLow: Math.round(revenueAtRisk*0.5),
      rangeHigh: Math.round(revenueAtRisk*1.2)
    };
  }

  // Forecast uplift
  if (rec.title.toLowerCase().includes('forecast') || rec.title.toLowerCase().includes('uplift')) {
    const forecastVal = ml.forecast?.holtNextPeriod || 0;
    const lastVal = stats.timeSeries[0]?.points.slice(-1)[0]?.value || 0;
    const uplift = Math.max(0, forecastVal - lastVal);
    return {
      estimatedValue: Math.round(uplift * 3), // 3 months capacity value
      currency: 'GBP',
      basis: `Forecast ${forecastVal.toLocaleString()} vs last period ${lastVal.toLocaleString()}, 3-month opportunity`,
      rangeLow: Math.round(uplift*2),
      rangeHigh: Math.round(uplift*4)
    };
  }

  // Growth
  if (rec.title.toLowerCase().includes('growth') || rec.title.toLowerCase().includes('accelerate')) {
    const growthOpp = total * 0.12; // 12% growth target is typical SME goal
    return {
      estimatedValue: Math.round(growthOpp),
      currency: 'GBP',
      basis: `12% growth target on current base of £${Math.round(total).toLocaleString()} ${measureLabel}`,
      rangeLow: Math.round(growthOpp*0.6),
      rangeHigh: Math.round(growthOpp*1.5)
    };
  }

  // Default: data quality improvement
  return {
    estimatedValue: Math.round(total * 0.05),
    currency: 'GBP',
    basis: `Conservative 5% improvement in decision accuracy from better data on £${Math.round(total).toLocaleString()} base`,
    rangeLow: Math.round(total*0.02),
    rangeHigh: Math.round(total*0.08)
  };
}

function deriveUrgency(riskLevel: Risk['level'] | undefined, recTitle: string): EnrichedRecommendation['urgency'] {
  if (riskLevel === 'high' || /critical|immediate|churn|concentration/i.test(recTitle)) return 'immediate';
  if (riskLevel === 'medium' || /forecast|re-engage|growth/i.test(recTitle)) return 'this_month';
  return 'this_quarter';
}

function deriveEffort(recTitle: string): { effort: EnrichedRecommendation['effort']; days: number } {
  if (/monthly reviews|run monthly/i.test(recTitle)) return { effort: 'low', days: 1 };
  if (/re-engage|loyalty|retention/i.test(recTitle)) return { effort: 'medium', days: 5 };
  if (/reduce concentration|implement.*prevention|improve data/i.test(recTitle)) return { effort: 'medium', days: 7 };
  if (/accelerate growth|capacity/i.test(recTitle)) return { effort: 'high', days: 14 };
  return { effort: 'medium', days: 5 };
}

function calcConfidence(quality: DataQualityReport, rec: Recommendation): number {
  const base = quality.overallScore / 100;
  const sourceCols = rec.sourceColumns.length || 1;
  // More source columns with high quality = higher confidence, but cap
  const colQuality = rec.sourceColumns.length
    ? rec.sourceColumns.reduce((sum, col) => {
        const q = quality.columns.find(c=>c.column===col)?.overall || 80;
        return sum + q;
      }, 0) / rec.sourceColumns.length / 100
    : 0.75;
  return Math.round(Math.min(0.95, (base*0.6 + colQuality*0.4)) * 100) / 100;
}

export function buildVerdioDecisions(params: {
  risks: Risk[];
  recommendations: Recommendation[];
  ml: MLResults;
  statistics: StatisticsResult;
  quality: DataQualityReport;
  engineeredRows: EngineeredRow[];
  index: SemanticIndex;
}): VDEResult {
  const { risks, recommendations, ml, statistics, quality, engineeredRows, index } = params;

  const enriched: EnrichedRecommendation[] = recommendations.map(rec => {
    const relatedRisks = risks.filter(r =>
      r.sourceColumns.some(c=>rec.sourceColumns.includes(c)) ||
      rec.desc.toLowerCase().includes(r.title.toLowerCase().split(' ')[0])
    );
    const highestRiskLevel = relatedRisks.sort((a,b)=>
      (a.level==='high'?0:a.level==='medium'?1:2) - (b.level==='high'?0:b.level==='medium'?1:2)
    )[0]?.level;

    const financialImpact = scoreFinancialImpact(rec, risks, ml, statistics, engineeredRows, index);
    const urgency = deriveUrgency(highestRiskLevel, rec.title);
    const { effort, days } = deriveEffort(rec.title);
    const confidence = calcConfidence(quality, rec);

    // Priority score: (value * confidence) / effort, normalised to 0-100
    // urgency multiplier: immediate 1.3, this_month 1.1, this_quarter 1.0
    const urgencyMult = urgency==='immediate'?1.3:urgency==='this_month'?1.1:1.0;
    const effortDiv = effort==='low'?1:effort==='medium'?2.5:5;
    const raw = (Math.log10(financialImpact.estimatedValue+100) * 10 * confidence * urgencyMult * 10) / effortDiv;
    const priorityScore = Math.min(100, Math.max(5, Math.round(raw)));

    return {
      ...rec,
      financialImpact,
      urgency,
      effort,
      effortDays: days,
      confidence,
      priorityScore,
      relatedRiskTitles: relatedRisks.map(r=>r.title)
    };
  });

  const ranked = enriched.sort((a,b)=>b.priorityScore - a.priorityScore);

  const totalValueAtRisk = ranked
    .filter(r=>r.relatedRiskTitles.length>0)
    .reduce((s,r)=>s+r.financialImpact.estimatedValue,0);

  const totalOpportunityValue = ranked
    .filter(r=>/growth|forecast|uplift|re-engage/i.test(r.title))
    .reduce((s,r)=>s+r.financialImpact.estimatedValue,0);

  const top = ranked[0];
  const summary = top
    ? `Top priority is "${top.title}" with £${top.financialImpact.estimatedValue.toLocaleString()} estimated impact, ${top.confidence*100}% confidence, ${top.effortDays} day effort. Total value at risk across all actions is £${totalValueAtRisk.toLocaleString()}.`
    : 'No prioritised actions generated. Upload a dataset with monetary and date columns for full decision ranking.';

  return {
    rankedActions: ranked,
    totalValueAtRisk: Math.round(totalValueAtRisk),
    totalOpportunityValue: Math.round(totalOpportunityValue),
    summary
  };
}
