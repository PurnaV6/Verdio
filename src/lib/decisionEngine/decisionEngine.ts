/* ================================================================
   VERDIO — decisionEngine.ts
   
   NOTE: With the full FDIF engine now inside calculateMetrics.ts,
   this file is a thin pass-through. All intelligence (health score,
   risks, recommendations, ML models) is computed directly in
   calculateMetrics and stored on the BusinessMetrics object.
   
   The decision engine is kept for backward compatibility and
   can be used to re-run intelligence on already-parsed data.
   ================================================================ */
import type { BusinessMetrics } from "../../types/metrics";

export function runDecisionEngine(metrics: BusinessMetrics): BusinessMetrics {
  // All intelligence is already computed in calculateMetrics.
  // This function exists for any future post-processing or
  // re-scoring without re-parsing the CSV.
  return metrics;
}
