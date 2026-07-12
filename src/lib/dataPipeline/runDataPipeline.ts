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
import { runForecast } from "../ml/forecastEngine";
import { runAnomalyDetection } from "../ml/anomalyEngine";
import { runSegmentation } from "../ml/segmentationEngine";
import { computeHealthScore } from "../decision/healthScoreEngine";
import { detectRisks } from "../decision/riskEngine";
import { generateRecommendations } from "../decision/recommendationEngine";
import type { MLResults } from "../../types/ml";
import type { PipelineOutcome } from "../../types/pipeline";

/* ================================================================
   VERDIO — runDataPipeline()
   The single entry point App.tsx should call on file upload. Runs
   stages 1–11 synchronously and returns a fully-formed PipelineResult
   with aiLoading:true — the caller is responsible for then calling
   generateAIInsights() (services/ai.ts) in the background, exactly
   as the retail-specific build did with calculateMetrics()/ai.ts.
   ================================================================ */

export async function runDataPipeline(file: File): Promise<PipelineOutcome> {
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
  const semantics = classifyColumns(cleanedRows, profile);
  const index = buildSemanticIndex(semantics);
  const quality = assessDataQuality(cleanedRows, profile, semantics);
  const capabilities = detectCapabilities(profile, index);

  /* 7. Feature engineering → 8. Statistics */
  const { rows: engineeredRows, addedFeatures } = engineerFeatures(cleanedRows, index);
  const statistics = computeStatistics(engineeredRows, index);

  /* 9. Baseline analysis candidates (statistics-driven) */
  const baseAnalyses = generateAnalysisCandidates(engineeredRows, index, capabilities, statistics);

  /* 10. ML — each model only runs if its capability was confirmed available */
  const ml: MLResults = { forecast: null, anomalies: null, segmentation: null };
  const primaryTS = statistics.timeSeries[0];

  if (capabilities.available.some(c => c.type === 'forecasting') && primaryTS) {
    ml.forecast = runForecast(primaryTS);
  }
  if (capabilities.available.some(c => c.type === 'anomaly_detection') && primaryTS) {
    ml.anomalies = runAnomalyDetection(primaryTS);
  }
  const segCap = capabilities.available.find(c => c.type === 'segmentation');
  if (segCap) {
    const [customerCol, dateCol, measureCol] = segCap.columns;
    ml.segmentation = runSegmentation(engineeredRows, customerCol, dateCol, measureCol, primaryTS?.points.map(p => p.value) || []);
  }

  /* 9 (cont.) ML-driven analysis candidates, then rank everything together */
  const mlAnalyses = generateMLAnalysisCandidates(capabilities, ml, statistics);
  const analyses = rankAnalyses([...baseAnalyses, ...mlAnalyses], 10);

  /* 11. Decision engine */
  const health = computeHealthScore(quality, statistics, ml);
  const risks = detectRisks(engineeredRows, index, capabilities, statistics, quality, ml);
  const recommendations = generateRecommendations(risks, capabilities, statistics, quality, ml);

  return {
    ok: true,
    result: {
      source: { fileName: parsed.data.fileName, fileType: parsed.data.fileType, rowCount: cleanedRows.length },
      profile, cleaning, semantics, quality, capabilities,
      features: addedFeatures, engineeredRows, statistics, analyses, ml,
      decision: { health, risks, recommendations },
      aiInsights: null,
      aiLoading: true,
    },
  };
}
