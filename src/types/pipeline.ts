import type { ParsedDataset, DatasetProfile, CleaningReport, DataQualityReport, CapabilityReport } from "./dataPipeline";
import type { SemanticResult } from "./semantic";
import type { EngineeredDataset, EngineeredRow } from "./features";
import type { StatisticsResult } from "./statistics";
import type { AnalysisCandidate } from "./analysis";
import type { MLResults } from "./ml";
import type { DecisionResult } from "./decision";
import type { AIInsights } from "./aiInsights";
import type { OrganizationContext } from "./organization";

/* ================================================================
   VERDIO — Pipeline Result (Stage 13 output)
   App.tsx receives one of these and acts only as a renderer.
   ================================================================ */

export interface PipelineResult {
  source:       { fileName: string; fileType: ParsedDataset['fileType']; rowCount: number };
  profile:      DatasetProfile;
  cleaning:     CleaningReport;
  semantics:    SemanticResult;
  quality:      DataQualityReport;
  capabilities: CapabilityReport;
  features:     EngineeredDataset['addedFeatures'];
  engineeredRows: EngineeredRow[];       // exposed so pages can compute on-demand breakdowns (e.g. full ranked tables)
  statistics:   StatisticsResult;
  analyses:     AnalysisCandidate[];     // ranked, top N
  ml:           MLResults;
  decision:     DecisionResult;

  /* AI layer — populated in the background after the rest renders */
  aiInsights: AIInsights | null;
  aiLoading:  boolean;
  organization?: OrganizationContext;
}

export type PipelineOutcome =
  | { ok: true;  result: PipelineResult }
  | { ok: false; error: string };
