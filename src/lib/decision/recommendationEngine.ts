import type { DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";
import type { Risk, Recommendation } from "../../types/decision";
import { labelForMeasure } from "../labels";

/* ================================================================
   VERD.IO — Decision: Recommendations
   Generalized from calculateMetrics.ts's generateRecs(). Reacts to
   whichever risks and ML results actually exist for this dataset
   rather than assuming revenue/product/market vocabulary.
   ================================================================ */

export function generateRecommendations(
  risks: Risk[],
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
    const quiet = ml.segmentation.segments.filter(s => s.segment === 'atRisk' || s.segment === 'lost');
    const atRisk = quiet.length;
    if (atRisk > 0) {
      const atRiskOnly = quiet.filter(s => s.segment === 'atRisk').length;
      const minMonths = Math.min(...quiet.map(s => s.recencyMonths));
      const monthsText = `${minMonths} month${minMonths === 1 ? '' : 's'}`;
      recs.push({ title: `Re-engage ${atRisk} at-risk/lapsed customers`, desc: `${atRisk} customers (${atRiskOnly} at risk, ${atRisk - atRiskOnly} lapsed) have not been active for at least ${monthsText} before the end of the data, putting them among the least recently active customers. The at-risk group has the stronger purchase history, so start there.`, impact: 'high', sourceColumns: [ml.segmentation.customerColumn] });
    }
    if (ml.segmentation.churnRiskScore >= 40) {
      recs.push({ title: 'Implement automated churn prevention', desc: `Churn risk is elevated at ${ml.segmentation.churnRiskScore}/100. Set up re-engagement triggers 30 days after a customer's last purchase.`, impact: 'medium', sourceColumns: [ml.segmentation.customerColumn] });
    }
    if (ml.segmentation.segments.length > 0 && ml.segmentation.segments.length < 100) {
      const total = ml.segmentation.segments.length;
      const repeatPct = Math.round((ml.segmentation.segments.filter(s => s.frequency > 1).length / total) * 100);
      recs.push({ title: 'Build a loyalty/retention programme', desc: `With ${total} customers, each customer who leaves is a visible share of revenue. ${repeatPct}% of them have bought more than once, which is the base a retention programme would build on.`, impact: 'medium', sourceColumns: [ml.segmentation.customerColumn] });
    }
  }

  if (quality.overallScore < 80) {
    recs.push({ title: 'Improve data collection', desc: `Data quality scores ${quality.overallScore}/100. Tightening capture of the flagged fields (see Data Quality page) can improve the accuracy of future analyses.`, impact: 'medium', sourceColumns: [] });
  }

  if (statistics.correlations.some(c => c.strength === 'strong' || c.strength === 'very_strong')) {
    const best = statistics.correlations.find(c => c.strength === 'strong' || c.strength === 'very_strong')!;
    recs.push({ title: `Investigate the ${best.columnA} ↔ ${best.columnB} relationship`, desc: `A ${best.strength.replace('_', ' ')} ${best.direction} correlation (r = ${best.coefficient}) was found — this may be worth building into pricing, forecasting or operational decisions.`, impact: 'medium', sourceColumns: [best.columnA, best.columnB] });
  }

  recs.push({ title: 'Run monthly Verd.io reviews', desc: 'Upload fresh data monthly to track how health score, risks and recommendations change from one upload to the next.', impact: 'medium', sourceColumns: [] });

  return recs.slice(0, 6);
}
