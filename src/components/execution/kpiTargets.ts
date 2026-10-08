import type { PipelineResult } from '../../types/pipeline';
import type { ModelSelection } from '../../lib/ml/modelManager';

export interface KpiTarget {
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  direction: 'up' | 'down';
  /** One line explaining what the measure is, shown under the label. */
  hint?: string;
}

/** The health pillar that measures growth of the primary time series (see healthScoreEngine). */
const TREND_PILLAR = 'Performance Trend';

/** Default KPI rows and their baselines, computed from the active analysis. */
export function buildKpiTargets(r: PipelineResult): KpiTarget[] {
  const modelMeta = (r as PipelineResult & { _modelMeta?: { forecast?: ModelSelection } })._modelMeta;
  const targets: KpiTarget[] = [
    { id: 'health', label: 'Business health', current: r.decision.health.total, target: Math.min(100, Math.max(75, r.decision.health.total + 10)), unit: '/100', direction: 'up' },
    { id: 'quality', label: 'Data quality', current: r.quality.overallScore, target: Math.min(100, Math.max(90, r.quality.overallScore + 5)), unit: '/100', direction: 'up' },
  ];

  const trend = r.decision.health.pillars.find(item => item.name === TREND_PILLAR);
  if (trend) {
    targets.push({ id: 'trend', label: 'Performance trend', current: trend.score, target: Math.min(trend.max, Math.max(18, trend.score + 4)), unit: `/${trend.max}`, direction: 'up', hint: 'Health pillar: growth of the main measure from the first to the last period.' });
  }

  const suitability = modelMeta?.forecast?.confidence;
  if (typeof suitability === 'number') {
    const modelFit = Math.round(suitability * 100);
    targets.push({ id: 'modelfit', label: 'Model fit', current: modelFit, target: Math.min(100, Math.max(80, modelFit + 8)), unit: '%', direction: 'up', hint: 'How well the chosen forecasting method suits the shape of this data. Not a measure of forecast accuracy.' });
  }

  return targets;
}

/**
 * Current values, labels and hints always come from the live analysis. Only the user's edited target
 * is taken from saved state, so stale saved baselines or retired rows cannot show up.
 */
export function mergeSavedTargets(defaults: KpiTarget[], saved: KpiTarget[] | undefined): KpiTarget[] {
  if (!saved?.length) return defaults;
  const savedTarget = new Map(saved.map(item => [item.id, item.target]));
  return defaults.map(item => {
    const target = savedTarget.get(item.id);
    return typeof target === 'number' && Number.isFinite(target) ? { ...item, target } : item;
  });
}
