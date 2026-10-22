import { parseDataset } from "./parseDataset";
import { toDatasetSource } from "./workbook";
import { profileDataset } from "./profileDataset";
import { cleanDataset } from "./cleanDataset";
import { applyRoleAwareSteps } from "./roleAwareSteps";
import { buildColumnReport } from "./cleaningReport";
import { salesSummary, EMPTY_EXCLUDED } from "../analysis/salesSummary";

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
import type { DatasetSource } from "../../types/dataPipeline";
import type { MLResults } from "../../types/ml";
import type { PipelineOutcome } from "../../types/pipeline";
import type { BusinessRole } from "../../types/semantic";

/* ================================================================
   VERDIO — runDataPipeline() v2 — Endorsable Version
   Upgraded with autonomous Model Manager and VDE financial ranking.
   This is the full file, replace your existing file completely.
   ================================================================ */

/** 2 from the blank-aware pipeline on. Results saved before it have no version. */
export const PIPELINE_VERSION = 2;

export async function runDataPipeline(input: File | DatasetSource, semanticOverrides: Partial<Record<string, BusinessRole>> = {}): Promise<PipelineOutcome> {
  /* 1. Parse */
  const { file, sheet } = toDatasetSource(input);
  const parsed = await parseDataset(file, sheet);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };

  /* 2. Profile (raw) → 3. Clean (structure only) → re-profile */
  const rawProfile = profileDataset(parsed.data.rows);
  const { rows: tidiedRows, sourceRows, report: cleaning } = cleanDataset(parsed.data.rows, rawProfile);
  const tidiedProfile = profileDataset(tidiedRows);

  if (!tidiedRows.length) {
    return { ok: false, error: 'No usable rows remained after cleaning. Please check the file and try again.' };
  }

  /* 4. Semantic detection, on the real values only */
  const semantics = classifyColumns(tidiedRows, tidiedProfile, semanticOverrides);
  const index = buildSemanticIndex(semantics);

  /* 5. Role-aware steps. Roles are final only here, because the role-mapping screen runs this pipeline
        again with the user's overrides. Nothing is filled in: a blank stays blank. Revenue is calculated
        from price x quantity where it can be, and rows that cannot count toward sales are set aside
        with their row number and reason. Every row stays in `cleanedRows`. */
  const steps = applyRoleAwareSteps(tidiedRows, tidiedProfile, index, sourceRows);
  cleaning.actions.push(...steps.actions);
  const cleanedRows = steps.rows;
  const profile = steps.calculatedCount > 0 ? profileDataset(cleanedRows) : tidiedProfile;

  /* 6. Quality → Capabilities */
  const quality = assessDataQuality(cleanedRows, profile, semantics);
  const capabilities = detectCapabilities(profile, index);

  /* 7. Feature engineering (on the rows that count toward sales) → 8. Statistics */
  const { rows: engineeredRows, addedFeatures } = engineerFeatures(steps.analysisRows, index);
  steps.calculated.forEach((wasCalculated, i) => { if (wasCalculated) engineeredRows[i]['__revenueCalculated'] = true; });
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
  const risks = detectRisks(engineeredRows, capabilities, statistics, quality, ml);
  const recommendations = generateRecommendations(risks, statistics, quality, ml);

  const vde = buildVerdioDecisions({
    risks,
    recommendations,
    ml,
    statistics,
    quality,
    engineeredRows,
    index
  });

  /* The cleaning report says, per column and in total, what was left blank, calculated or left out. */
  const sales = salesSummary({ semantics, engineeredRows, excludedRows: steps.excludedRows, returnRows: steps.returnRows, cleaning: { ...cleaning, rowsCalculated: steps.calculatedCount } });
  cleaning.columns = buildColumnReport(rawProfile, profile, semantics, steps, cleanedRows.length);
  cleaning.rowsExcluded = { ...EMPTY_EXCLUDED, ...sales.excluded };
  cleaning.rowsCalculated = steps.calculatedCount;
  cleaning.returns = { count: sales.returnCount, total: sales.returnsTotal };
  if (steps.calculatedCount > 0) cleaning.calculatedCells = steps.calculatedCells;
  if (steps.duplicateCount > 0) {
    cleaning.duplicateRowCount = steps.duplicateCount;
    cleaning.duplicateHandling = steps.duplicateHandling ?? undefined;
    cleaning.duplicateRows = steps.duplicateRows;
  }

  return {
    ok: true,
    result: {
      source: { fileName: parsed.data.fileName, fileType: parsed.data.fileType, rowCount: cleanedRows.length },
      pipelineVersion: PIPELINE_VERSION,
      analysisRowCount: engineeredRows.length,
      excludedRows: steps.excludedRows,
      returnRows: steps.returnRows,
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
