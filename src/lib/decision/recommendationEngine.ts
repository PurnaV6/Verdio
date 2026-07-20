import type { CapabilityReport, DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";
import type { Risk, Recommendation } from "../../types/decision";
import { labelForMeasure } from "../labels";

/* ================================================================
   VERDIO — Decision: Recommendations
   Generalized from calculateMetrics.ts's generateRecs(). Reacts to
   whichever risks and ML results actually exist for this dataset
   rather than assuming revenue/product/market vocabulary.
   ================================================================ */

export function generateRecommendations(
  risks: Risk[],
  capabilities: CapabilityReport,
  statistics: StatisticsResult,
  quality: DataQualityReport,
  ml: MLResults
): Recommendation[] {
  const recs: Recommendation[] = [];

  const concentrationRisk = risks.find(r => r.level === 'high' && r.title.includes('Concentration'));
  if (concentrationRisk) {
    recs.push({
      title: 'Reduce concentration risk',
      desc: `${concentrationRisk.desc} Set a target to bring the top share below 40% within two quarters by developing alternatives.`,
      impact: 'high', sourceColumns: concentrationRisk.sourceColumns,
    });
  }

  const ts = statistics.timeSeries[0];
  if (ts && ts.points.length > 1) {
    const growth = ((ts.points[ts.points.length - 1].value - ts.points[0].value) / (ts.points[0].value || 1)) * 100;
    if (growth < 5) {
      recs.push({ title: 'Accelerate growth', desc: `"${labelForMeasure(ts.measureColumn)}" growth is flat at ${Math.round(growth)}% over the period. Identify and double down on the highest-performing segment or channel found in the Comparison analysis.`, impact: 'high', sourceColumns: [ts.measureColumn] });
    }
  }

  if (ml.forecast && ts) {
    const last = ts.points[ts.points.length - 1]?.value || 0;
    if (ml.forecast.holtNextPeriod > last * 1.1) {
      const upliftPct = Math.round((ml.forecast.holtNextPeriod / (last || 1) - 1) * 100);
      const forecastValue = Math.round(ml.forecast.holtNextPeriod).toLocaleString();
      recs.push({
        title: 'Validate near-term growth scenario',
        desc: upliftPct > 250
          ? `The current model indicates a material step-change to ${forecastValue} next period. Validate the underlying demand drivers and baseline assumptions before committing capacity or resources.`
          : `The current model indicates ${forecastValue} next period, approximately ${upliftPct}% above the latest observation. Confirm demand drivers and review capacity assumptions before operational planning.`,
        impact: 'high',
        sourceColumns: [ml.forecast.measureColumn],
      });
    }
  }

  if (ml.segmentation) {
    const atRisk = ml.segmentation.segments.filter(s => s.segment === 'atRisk' || s.segment === 'lost').length;
    if (atRisk > 0) {
      recs.push({ title: `Re-engage ${atRisk} at-risk/lapsed customers`, desc: `RFM segmentation identified ${atRisk} customers who were previously active but have gone quiet. A targeted win-back offer typically recovers 20–30% of this group.`, impact: 'high', sourceColumns: [ml.segmentation.customerColumn] });
    }
    if (ml.segmentation.churnRiskScore >= 40) {
      recs.push({ title: 'Implement automated churn prevention', desc: `Churn risk is elevated at ${ml.segmentation.churnRiskScore}/100. Set up re-engagement triggers 30 days after a customer's last purchase.`, impact: 'medium', sourceColumns: [ml.segmentation.customerColumn] });
    }
    if (ml.segmentation.segments.length > 0 && ml.segmentation.segments.length < 100) {
      recs.push({ title: 'Build a loyalty/retention programme', desc: `With ${ml.segmentation.segments.length} customers, every retention matters. Even a 15% retention improvement compounds significantly over 12 months.`, impact: 'medium', sourceColumns: [ml.segmentation.customerColumn] });
    }
  }

  if (quality.overallScore < 80) {
    recs.push({ title: 'Improve data collection', desc: `Data quality scores ${quality.overallScore}/100. Tightening capture of the flagged fields (see Data Quality page) will improve the accuracy of every future analysis.`, impact: 'medium', sourceColumns: [] });
  }

  if (statistics.correlations.some(c => c.strength === 'strong' || c.strength === 'very_strong')) {
    const best = statistics.correlations.find(c => c.strength === 'strong' || c.strength === 'very_strong')!;
    recs.push({ title: `Investigate the ${best.columnA} ↔ ${best.columnB} relationship`, desc: `A ${best.strength.replace('_', ' ')} ${best.direction} correlation (r = ${best.coefficient}) was found — this may be worth building into pricing, forecasting or operational decisions.`, impact: 'medium', sourceColumns: [best.columnA, best.columnB] });
  }

  recs.push({ title: 'Run monthly Verdio reviews', desc: 'Upload fresh data monthly to track how health score, risks and recommendations evolve — this compounds the value of the analysis over time.', impact: 'medium', sourceColumns: [] });

  return recs.slice(0, 6);
}
