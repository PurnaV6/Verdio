import type { EngineeredRow } from "../../types/features";
import type { SemanticIndex } from "../../types/semantic";
import type { CapabilityReport, DataQualityReport } from "../../types/dataPipeline";
import type { StatisticsResult } from "../../types/statistics";
import type { MLResults } from "../../types/ml";
import type { Risk } from "../../types/decision";
import { labelForMeasure } from "../labels";

/* ================================================================
   VERDIO — Decision: Risk Detection
   Generalized from calculateMetrics.ts's detectRisks(). No fixed
   "market"/"product" assumption — it inspects whichever category
   dimension the concentration_analysis capability actually found,
   and skips any risk type whose prerequisite capability is absent.
   ================================================================ */

function aggregateByCategory(rows: EngineeredRow[], categoryCol: string, measureCol: string): { label: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[categoryCol] ?? '').trim();
    const v = Number(row[measureCol]);
    if (!label || !Number.isFinite(v)) continue;
    sums.set(label, (sums.get(label) || 0) + v);
  }
  return Array.from(sums.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function detectRisks(
  rows: EngineeredRow[],
  index: SemanticIndex,
  capabilities: CapabilityReport,
  statistics: StatisticsResult,
  quality: DataQualityReport,
  ml: MLResults
): Risk[] {
  const risks: Risk[] = [];
  const has = (t: string) => capabilities.available.find(c => c.type === t);

  /* Concentration risk — whichever category dimension was detected */
  const concentration = has('concentration_analysis');
  if (concentration) {
    const [catCol, measureCol] = concentration.columns;
    const agg = aggregateByCategory(rows, catCol, measureCol);
    const measureLabel = labelForMeasure(measureCol);
    const total = agg.reduce((s, a) => s + a.value, 0);
    if (agg.length && total > 0) {
      const p = (agg[0].value / total) * 100;
      risks.push(p > 60
        ? { level: 'high', icon: '📊', title: `Critical ${catCol} Concentration`, desc: `${Math.round(p)}% of ${measureLabel} comes from "${agg[0].label}". A single disruption there could seriously damage the business. Diversify within the next quarter.`, sourceColumns: [catCol, measureCol] }
        : p > 40
        ? { level: 'medium', icon: '📊', title: `${catCol} Concentration Risk`, desc: `"${agg[0].label}" accounts for ${Math.round(p)}% of ${measureLabel}. Healthy to diversify before this becomes critical.`, sourceColumns: [catCol, measureCol] }
        : { level: 'low', icon: '📊', title: `${catCol} Diversification`, desc: `${measureLabel} is well spread across "${catCol}" values — "${agg[0].label}" leads at a healthy ${Math.round(p)}%.`, sourceColumns: [catCol, measureCol] }
      );
    }
  }

  /* Volatility risk — from the primary time series */
  const ts = statistics.timeSeries[0];
  if (ts && ts.points.length > 2) {
    const values = ts.points.map(p => p.value);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const cv = mean ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) / mean : 0;
    const measureLabel = labelForMeasure(ts.measureColumn);
    const swingPct = Math.round(cv * 100);
    risks.push(cv > 0.4
      ? { level: 'high', icon: '📉', title: 'Elevated Revenue Variability', desc: `"${measureLabel}" shows approximately ${swingPct}% period-to-period variability. Use scenario ranges in cash-flow and capacity planning, and validate the operational drivers behind the largest movements.`, sourceColumns: [ts.measureColumn] }
      : cv > 0.2
      ? { level: 'medium', icon: '📉', title: 'Revenue Variability Requires Monitoring', desc: `"${measureLabel}" shows approximately ${swingPct}% period-to-period variability. Incorporate sensitivity ranges into cash-flow and capacity planning, and evaluate recurring-revenue opportunities where commercially appropriate.`, sourceColumns: [ts.measureColumn] }
      : { level: 'low', icon: '📈', title: 'Stable Revenue Profile', desc: `"${measureLabel}" remains comparatively stable between periods, supporting more reliable planning against the current operating baseline.`, sourceColumns: [ts.measureColumn] }
    );
  }

  /* Customer base risk — from segmentation */
  if (ml.segmentation) {
    const n = ml.segmentation.segments.length;
    risks.push(n < 20
      ? { level: 'high', icon: '👥', title: 'Critical Customer Dependency', desc: `Only ${n} customers detected. Losing 2–3 could materially impact revenue. Acquisition should be an immediate priority.`, sourceColumns: [ml.segmentation.customerColumn] }
      : n < 50
      ? { level: 'medium', icon: '👥', title: 'Limited Customer Base', desc: `${n} customers — growing but still concentrated risk. Prioritise acquisition and retention.`, sourceColumns: [ml.segmentation.customerColumn] }
      : { level: 'low', icon: '👥', title: 'Healthy Customer Base', desc: `${n.toLocaleString()} customers provides reasonable diversification.`, sourceColumns: [ml.segmentation.customerColumn] }
    );

    if (ml.segmentation.churnRiskScore >= 60) {
      risks.push({ level: 'high', icon: '⚠️', title: 'High Churn Risk', desc: `Churn risk scores ${ml.segmentation.churnRiskScore}/100. Low repeat rate and/or a small customer base signal significant vulnerability.`, sourceColumns: [ml.segmentation.customerColumn] });
    } else if (ml.segmentation.churnRiskScore >= 35) {
      risks.push({ level: 'medium', icon: '⚠️', title: 'Moderate Churn Risk', desc: `Churn risk scores ${ml.segmentation.churnRiskScore}/100. Monitor retention closely.`, sourceColumns: [ml.segmentation.customerColumn] });
    }
  }

  /* Anomaly risk */
  if (ml.anomalies) {
    const negative = ml.anomalies.points.filter(p => p.isAnomaly && p.actual < p.expected);
    if (negative.length >= 2) {
      risks.push({ level: 'medium', icon: '🔍', title: 'Unexplained Revenue Drops', desc: `${negative.length} period(s) came in well below what the trend would predict, including ${negative[0].periodLabel}. Worth investigating what happened then — a one-off event, a stockout, or a genuine problem worth fixing.`, sourceColumns: [ml.anomalies.measureColumn] });
    }
  }

  /* Data quality risk */
  if (quality.overallScore < 70) {
    risks.push({ level: 'high', icon: '🗄️', title: 'Data Quality Risk', desc: `Data quality scores ${quality.overallScore}/100. Missing or inconsistent fields reduce the reliability of every downstream insight.`, sourceColumns: [] });
  } else if (quality.overallScore < 88) {
    risks.push({ level: 'medium', icon: '🗄️', title: 'Data Quality Warning', desc: `Data quality scores ${quality.overallScore}/100 — some gaps exist. See the Data Quality page for specifics.`, sourceColumns: [] });
  }

  return risks.sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level));
}
