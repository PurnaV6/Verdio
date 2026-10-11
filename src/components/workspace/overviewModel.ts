import { formatters } from "../../lib/story";
import type { RiskLevel } from "../../types/decision";
import type { CustomerSegmentLabel, ForecastResult } from "../../types/ml";
import type { Tone } from "./status";

/* ================================================================
   VERDIO — Overview model (pure)
   Small pieces of the Overview that are decisions rather than
   markup: how a move is worded, how a risk level is read, which
   items a share chart lists, how customers are counted by segment.
   Every number comes from a value the pipeline already computed.
   ================================================================ */

export interface MoveReading { tone: Tone; word: string; vs: string }

/**
 * The latest month against the one before it, as "Down 4.8%" "on Nov 25".
 * null when there is no earlier month to compare with (change is null). A change that rounds to 0.0% is level.
 */
export function moveReading(change: number | null, previousLabel: string | undefined): MoveReading | null {
  if (change === null || !Number.isFinite(change) || !previousLabel) return null;
  if (formatters.roundPercent(change) === 0) return { tone: 'ok', word: 'Level', vs: `with ${previousLabel}` };
  const down = change < 0;
  return { tone: down ? 'watch' : 'ok', word: `${down ? 'Down' : 'Up'} ${formatters.formatPercent(Math.abs(change))}`, vs: `on ${previousLabel}` };
}

const RISK_READING: Record<RiskLevel, { tone: Tone; label: string }> = {
  high: { tone: 'risk', label: 'High risk' },
  medium: { tone: 'watch', label: 'Medium risk' },
  low: { tone: 'ok', label: 'Low risk' },
};

/** Severity is a glyph (from the tone) and a word, never colour alone. */
export function riskReading(level: RiskLevel): { tone: Tone; label: string } {
  return RISK_READING[level];
}

export interface RiskCounts { total: number; high: number; medium: number; low: number }

export function riskCounts(risks: { level: RiskLevel }[]): RiskCounts {
  const count = (level: RiskLevel) => risks.filter(risk => risk.level === level).length;
  return { total: risks.length, high: count('high'), medium: count('medium'), low: count('low') };
}

export interface ShareRow { label: string; value: number }

/**
 * The rows a share chart lists: the largest `keep`, then one remainder row so the shares still
 * add up to the whole. Rows are expected largest first, as computeCategoryBreakdown returns them.
 */
export function shareItems(rows: ShareRow[], keep = 5): ShareRow[] {
  const usable = rows.filter(row => Number.isFinite(row.value) && row.value > 0);
  if (usable.length <= keep + 1) return usable;
  const rest = usable.slice(keep);
  const remainder = rest.reduce((sum, row) => sum + row.value, 0);
  return [...usable.slice(0, keep), { label: `All others (${rest.length})`, value: remainder }];
}

const SEGMENT_ORDER: { key: CustomerSegmentLabel; label: string }[] = [
  { key: 'champion', label: 'Champion' },
  { key: 'loyal', label: 'Loyal' },
  { key: 'new', label: 'New' },
  { key: 'atRisk', label: 'At risk' },
  { key: 'lost', label: 'Lost' },
];

export interface SegmentCount { key: CustomerSegmentLabel; label: string; value: number }

/** Customers per segment, in a fixed order, leaving out segments nobody is in. */
export function segmentCounts(segments: { segment: CustomerSegmentLabel }[]): SegmentCount[] {
  return SEGMENT_ORDER
    .map(({ key, label }) => ({ key, label, value: segments.filter(s => s.segment === key).length }))
    .filter(item => item.value > 0);
}

export interface TrendAhead { label: string; value: number; low: number; high: number }

/** The forecast points to draw with a series, only when the forecast is for that same measure. */
export function forecastAhead(measureColumn: string | undefined, forecast: ForecastResult | null): TrendAhead[] {
  if (!forecast || !measureColumn || forecast.measureColumn !== measureColumn) return [];
  return forecast.points.map(p => ({ label: p.periodLabel, value: p.value, low: p.low, high: p.high }));
}
