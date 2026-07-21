import { parseDataset } from "./parseDataset";
import { profileDataset } from "./profileDataset";
import { cleanDataset } from "./cleanDataset";
import { classifyColumns, buildSemanticIndex } from "./semanticEngine";
import { assessDataQuality } from "./dataQualityEngine";
import { detectCapabilities } from "./detectCapabilities";
import { engineerFeatures } from "./engineerFeatures";
import { computeStatistics } from "./statisticsEngine";
import { generateAnalysisCandidates, generateMLAnalysisCandidates } from "../analysis/generateAnalysisCandidates";
import { rankAnalyses } from "../analysis/rankAnalyses";
import { runSegmentation } from "../ml/segmentationEngine";
import { runForecastWithSelection, runAnomalyWithSelection } from "../ml/modelManager";
import { computeHealthScore } from "../decision/healthScoreEngine";
import { detectRisks } from "../decision/riskEngine";
import { generateRecommendations } from "../decision/recommendationEngine";
import { buildVerdioDecisions } from "../decision/verdioDecisionEngine";
import type { MLResults } from "../../types/ml";
import type { PipelineOutcome } from "../../types/pipeline";
import type { BusinessRole } from "../../types/semantic";

/* ================================================================
   VERDIO — runDataPipeline() v2 — Endorsable Version
   Upgraded with autonomous Model Manager and VDE financial ranking.
   This is the full file, replace your existing file completely.
   ================================================================ */

export async function runDataPipeline(file: File, semanticOverrides: Partial<Record<string, BusinessRole>> = {}): Promise<PipelineOutcome> {
  /* 1. Parse */
  const parsed = await parseDataset(file);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };

  /* 2. Profile (raw) → 3. Clean → 2. Re-profile (cleaned) */
  const rawProfile = profileDataset(parsed.data.rows);
  const { rows: cleanedRows, report: cleaning } = cleanDataset(parsed.data.rows, rawProfile);
  const profile = profileDataset(cleanedRows);

  if (!cleanedRows.length) {
    return { ok: false, error: 'No usable rows remained after cleaning. Please check the file and try again.' };
  }

  /* 4. Semantic detection → 5. Quality → 6. Capabilities */
  const semantics = classifyColumns(cleanedRows, profile, semanticOverrides);
  const index = buildSemanticIndex(semantics);
  const quality = assessDataQuality(cleanedRows, profile, semantics);
  const capabilities = detectCapabilities(profile, index);

  /* 7. Feature engineering → 8. Statistics */
  const { rows: engineeredRows, addedFeatures } = engineerFeatures(cleanedRows, index);
  const statistics = computeStatistics(engineeredRows, index);

  /* 9. Baseline analysis candidates (statistics-driven) */
  const baseAnalyses = generateAnalysisCandidates(engineeredRows, index, capabilities, statistics);

  /* 10. ML — autonomous selection with transparency metadata */
  const ml: MLResults = { forecast: null, anomalies: null, segmentation: null } as any;
  const primaryTS = statistics.timeSeries[0];

  let forecastMeta: any = null;
  let anomalyMeta: any = null;

  if (capabilities.available.some(c => c.type === 'forecasting') && primaryTS) {
    const withMeta = runForecastWithSelection(primaryTS, statistics.seasonality);
    forecastMeta = withMeta.meta;
    const { meta: _meta, ...rest } = withMeta as any;
    ml.forecast = rest;
  }
  if (capabilities.available.some(c => c.type === 'anomaly_detection') && primaryTS) {
    const withMeta = runAnomalyWithSelection(primaryTS);
    anomalyMeta = withMeta.meta;
    const { meta: _meta, ...rest } = withMeta as any;
    ml.anomalies = rest;
  }
  const segCap = capabilities.available.find(c => c.type === 'segmentation');
  if (segCap) {
    const [customerCol, dateCol, measureCol] = segCap.columns;
    ml.segmentation = runSegmentation(engineeredRows, customerCol, dateCol, measureCol, primaryTS?.points.map(p => p.value) || []);
  }

  /* 9 (cont.) ML-driven analysis candidates, then rank */
  const mlAnalyses = generateMLAnalysisCandidates(capabilities, ml, statistics);
  const analyses = rankAnalyses([...baseAnalyses, ...mlAnalyses], 10);

  /* 11. Decision engine — health, risks, recommendations + VDE v2 */
  const health = computeHealthScore(quality, statistics, ml);
  const risks = detectRisks(engineeredRows, index, capabilities, statistics, quality, ml);
  const recommendations = generateRecommendations(risks, capabilities, statistics, quality, ml);

  const vde = buildVerdioDecisions({
    risks,
    recommendations,
    ml,
    statistics,
    quality,
    engineeredRows,
    index
  });

  return {
    ok: true,
    result: {
      source: { fileName: parsed.data.fileName, fileType: parsed.data.fileType, rowCount: cleanedRows.length },
      profile,
      cleaning,
      semantics,
      quality,
      capabilities,
      features: addedFeatures,
      engineeredRows,
      statistics,
      analyses,
      ml,
      decision: { health, risks, recommendations: vde.rankedActions as any },
      aiInsights: null,
      aiLoading: true,
      // Exposed for UI transparency and endorsement demo
      _vdeMeta: vde,
      _modelMeta: { forecast: forecastMeta, anomaly: anomalyMeta }
    } as any,
  };
}
