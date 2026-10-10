import { bestColumnOfRole } from "../analysis/pickColumns";
import { computeConfidence } from "./confidence";
import { FactBook } from "./facts";
import { formatCount, formatPercent, formatPounds, pluralise, roundPercent } from "./formatters";
import { findBannedWords, fitPart, hasBrokenValue, LIMITS } from "./text";
import { validateNumbers } from "./validateNumbers";
import type { EnrichedRecommendation, VDEResult } from "../decision/verdioDecisionEngine";
import type { ModelSelection } from "../ml/modelManager";
import type { Risk } from "../../types/decision";
import type { PipelineResult } from "../../types/pipeline";
import type { TimePoint, TimeSeriesSummary } from "../../types/statistics";
import type { CannotSayResult, StoryInputs, StoryPageId, StoryResult } from "./types";

/* ================================================================
   VERDIO — Story context
   The slots the page templates share (spec aliases):
     H = health total, Q = data quality, N = rows, TS = first time series,
     P = months in TS, R1 = first risk, A1 = first recommendation.
   ================================================================ */

type ModelMeta = ModelSelection & { seasonalityStrength?: number; volatility?: number };

/** PipelineResult as runDataPipeline really returns it: two extra, untyped fields ride along. */
type ResultWithMeta = PipelineResult & {
  _vdeMeta?: VDEResult;
  _modelMeta?: { forecast?: ModelMeta | null; anomaly?: ModelMeta | null };
};

export interface Ctx {
  r: PipelineResult;
  f: FactBook;
  inputs: StoryInputs;
  H: number;
  Q: number;
  N: number;
  file: string;
  ts: TimeSeriesSummary | undefined;
  P: number;
  risks: Risk[];
  r1: Risk | undefined;
  recs: EnrichedRecommendation[];
  a1: EnrichedRecommendation | undefined;
  vde: VDEResult | undefined;
  modelMeta: ResultWithMeta['_modelMeta'];
  semNames: Set<string>;
}

export function makeCtx(r: PipelineResult, inputs: StoryInputs = {}): Ctx {
  const meta = r as ResultWithMeta;
  const ts = r.statistics.timeSeries[0];
  const risks = r.decision.risks;
  const recs = r.decision.recommendations as EnrichedRecommendation[];
  return {
    r, f: new FactBook(), inputs,
    H: r.decision.health.total, Q: r.quality.overallScore, N: r.source.rowCount, file: r.source.fileName,
    ts, P: ts?.points.length ?? 0,
    risks, r1: risks[0], recs, a1: recs[0],
    vde: meta._vdeMeta, modelMeta: meta._modelMeta,
    semNames: new Set(r.semantics.columns.map(column => column.columnName)),
  };
}

/** The column that plays this role in r.semantics, or null. */
export function roleColumn(c: Ctx, role: string): string | null {
  return bestColumnOfRole(c.r.semantics.columns, role);
}

/** Pure-text reason of the first capability that is not available, or null. */
export function firstUnavailableReason(c: Ctx): string | null {
  return c.r.capabilities.capabilities.find(capability => !capability.available)?.reason ?? null;
}

/* ── Period-over-period change, computed from the series points ── */

export interface PeriodChange {
  latest: TimePoint;
  previous: TimePoint;
  /** Signed percentage change of latest on previous. */
  pct: number;
  direction: 'up' | 'down' | 'level';
}

/** null when there is no earlier period, or it is 0 or not a number (then the change cannot be stated). */
export function periodChange(points: TimePoint[]): PeriodChange | null {
  const latest = points.at(-1);
  const previous = points.at(-2);
  if (!latest || !previous) return null;
  if (!Number.isFinite(latest.value) || !Number.isFinite(previous.value) || previous.value === 0) return null;
  const pct = ((latest.value - previous.value) / Math.abs(previous.value)) * 100;
  const direction = roundPercent(pct) === 0 ? 'level' : pct > 0 ? 'up' : 'down';
  return { latest, previous, pct, direction };
}

export const NO_EARLIER_MONTH = 'There is no earlier month to compare with.';

export interface SalesMove {
  /** "£41,200 in Mar 24, down 8.1% on Feb 24" (no capital, no full stop). */
  clause: string;
  /** True when there is no earlier month to compare with, so the clause states no change. */
  noEarlierMonth: boolean;
}

/**
 * The latest period's sales and its change on the previous period, computed from the points.
 * Records the facts. Returns null when the series has no usable latest point.
 */
export function salesMove(c: Ctx, points: TimePoint[], sourcePath: string): SalesMove | null {
  const latest = points.at(-1);
  if (!latest || !Number.isFinite(latest.value)) return null;
  const change = periodChange(points);
  const amount = formatPounds(c.f.n('latestSales', latest.value, `${sourcePath}.points[last].value`));
  const label = c.f.s('latestPeriod', latest.label, `${sourcePath}.points[last].label`);
  if (!change) return { clause: `${amount} in ${label}`, noEarlierMonth: true };
  const prevLabel = c.f.s('previousPeriod', change.previous.label, `${sourcePath}.points[last-1].label`);
  if (change.direction === 'level') return { clause: `${amount} in ${label}, level with ${prevLabel}`, noEarlierMonth: false };
  c.f.n('latestSalesChangePct', change.pct, `computed from ${sourcePath}.points[last] and points[last-1]`);
  return { clause: `${amount} in ${label}, ${change.direction} ${formatPercent(Math.abs(change.pct))} on ${prevLabel}`, noEarlierMonth: false };
}

export const CANNOT_SAY_HOW_SALES_MOVE = "I can't say how sales are moving, as the file has no date paired with a sales amount.";

/* ── Next step, always taken from an existing recommendation ── */

const WHEN: Record<EnrichedRecommendation['urgency'], string> = {
  immediate: 'immediately',
  this_month: 'this month',
  this_quarter: 'this quarter',
};

/** "Reduce concentration risk, with a planning estimate of about £12,000, to start immediately." */
export function nextFromRecommendation(c: Ctx, rec: EnrichedRecommendation | undefined): string | null {
  if (!rec?.title) return null;
  const index = c.recs.indexOf(rec);
  const path = `decision.recommendations[${index < 0 ? 0 : index}]`;
  const title = c.f.s('actionTitle', rec.title, `${path}.title`);
  const when = rec.urgency ? WHEN[rec.urgency] : undefined;
  if (rec.urgency) c.f.s('actionUrgency', rec.urgency, `${path}.urgency`);
  const estimate = rec.financialImpact && Number.isFinite(rec.financialImpact.estimatedValue) && rec.financialImpact.estimatedValue > 0
    ? c.f.n('actionEstimate', rec.financialImpact.estimatedValue, `${path}.financialImpact.estimatedValue`) : null;
  const startPhrase = when ? `, to start ${when}` : '';
  return fitPart([[
    ...(estimate !== null ? [`${title}, with a planning estimate of about ${formatPounds(estimate)}${startPhrase}.`] : []),
    `${title}${startPhrase}.`,
    `${title}.`,
  ]], LIMITS.next);
}

/* ── Building the final story ── */

export interface Draft {
  /** Groups of alternative wordings for "what happened", fullest first (see fitPart). */
  happened: string[][];
  /** Groups for "why". Defaults to the honest "cannot show why". */
  why?: string[][];
  next?: string | null;
  notes?: string[];
  /** Columns the page cites; only those that exist in r.semantics are listed. */
  columns?: Array<string | null | undefined>;
  /** The page uses a calculated sales amount that is not a column of the file. */
  calculatedSales?: boolean;
  timeBased?: boolean;
  customers?: number;
  forceLow?: { reason: string; missing: string };
}

export const CANNOT_SHOW_WHY = 'This file cannot show why.';
export const UNRELIABLE_REASON = "I can't build a reliable summary of this page from the file.";
export const UNRELIABLE_FIX = 'Check the file in Data Hub, then run the analysis again.';

export function cannotSay(c: Ctx, pageId: StoryPageId, reason: string, fix: string): CannotSayResult {
  return { kind: 'cannotSay', pageId, reason, fix, facts: c.f.facts };
}

export function compose(c: Ctx, pageId: StoryPageId, draft: Draft): StoryResult | CannotSayResult {
  const { f } = c;
  f.n('rows', c.N, 'source.rowCount');
  f.n('dataQuality', c.Q, 'quality.overallScore');
  f.scale100();
  if (c.P > 0) f.n('months', c.P, 'statistics.timeSeries[0].points.length');
  f.s('file', c.file, 'source.fileName');

  const columns = [...new Set((draft.columns ?? []).filter((name): name is string => !!name && c.semNames.has(name)))];
  columns.forEach((name, i) => f.s(`column${i + 1}`, name, 'semantics.columns[].columnName'));
  const reviewByName = new Map(c.r.semantics.columns.map(column => [column.columnName, column.needsReview]));
  const confidence = computeConfidence({
    quality: c.Q, rows: c.N, months: c.P,
    timeBased: draft.timeBased, customerBased: draft.customers !== undefined, customers: draft.customers,
    citedColumns: columns.map(name => ({ name, needsReview: reviewByName.get(name) === true })),
    forceLow: draft.forceLow,
  });

  const listed = [...columns, ...(draft.calculatedSales ? ['calculated sales amount'] : [])];
  const span = c.P > 0 ? `, ${pluralise(c.P, 'month')}` : '';
  const source = `Source: ${c.file}. ${listed.length ? `Columns: ${listed.join(', ')}. ` : ''}${pluralise(c.N, 'row')}${span}.`;

  const happened = fitPart(draft.happened, LIMITS.happened);
  const why = fitPart(draft.why ?? [[CANNOT_SHOW_WHY]], LIMITS.why);
  const next = draft.next ?? null;
  const notes = draft.notes ?? [];

  // Last line of defence: never show a story with a broken value, a banned word (quoted prose can carry
  // one) or a number no fact backs. The fallback carries no facts, so the rejected text is not kept either.
  const everything = [happened, why, next ?? '', confidence.caveat, source, ...notes].join(' ');
  if (!happened || hasBrokenValue(everything) || findBannedWords(everything).length > 0 || validateNumbers(everything, f.facts).length > 0) {
    return { kind: 'cannotSay', pageId, reason: UNRELIABLE_REASON, fix: UNRELIABLE_FIX, facts: {} };
  }
  return { kind: 'story', pageId, happened, why, next, confidence, source, notes, facts: f.facts };
}

/* Shared small formatters that also record the fact. */

export function money(c: Ctx, name: string, value: number, source: string): string {
  return formatPounds(c.f.n(name, value, source));
}

export function whole(c: Ctx, name: string, value: number, source: string): string {
  return formatCount(c.f.n(name, value, source));
}
