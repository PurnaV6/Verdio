import { READY_REASON, STATUS_LABEL } from "../../lib/dataPipeline/datasetStatus";
import { UNRELIABLE_MISSING_PCT } from "../../lib/dataPipeline/cleaningReport";
import { bestColumnOfRole } from "../../lib/analysis/pickColumns";
import type { ColumnCleaning, DataQualityReport, DatasetStatusKind, ExcludedReason } from "../../types/dataPipeline";
import type { PipelineResult } from "../../types/pipeline";
import type { Tone } from "../workspace/status";

/* ================================================================
   VERDIO — Cleaning report model (pure)
   Everything the Data Hub's "Data cleaning report" shows, built only
   from fields of a PipelineResult. A result saved before those fields
   existed gets the older-version message and nothing else. No number
   is made up here: each is read from the result and written in words.
   ================================================================ */

export const OLDER_VERSION_MESSAGE = 'This file was analysed with an older version of Verd.io, re-upload to see the cleaning report.';
export const UNRELIABLE_LIMIT_NOTE = `A column is flagged unreliable when more than ${UNRELIABLE_MISSING_PCT}% of it is blank.`;

const n = (value: number) => value.toLocaleString('en-GB');
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;
const money = (value: number) => (Math.round(value * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 });

/** 21 -> "21%", 20.5 -> "20.5%". */
export function pctLabel(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

/** True when the result carries the per-column cleaning fields (written by the pipeline from the blank-aware version on). */
export function hasCleaningReport(r: Pick<PipelineResult, 'cleaning'>): boolean {
  return Array.isArray(r.cleaning?.columns) && !!r.cleaning.rowsExcluded;
}

const EXCLUDED_ORDER: ExcludedReason[] = ['duplicate', 'zero_quantity', 'zero_price', 'zero_revenue', 'missing_measure'];

const MAX_MISSING_SENTENCES = 3;

/**
 * "31 rows read. 3 left out (1 duplicate, 1 zero quantity, 1 blank revenue). 1 revenue value calculated from
 * price x quantity. 1 return worth 200 kept apart. 13 blank Product Category values shown as (Missing)."
 */
export function cleaningSummary(r: Pick<PipelineResult, 'cleaning' | 'semantics'>): string {
  const { cleaning } = r;
  const sentences: string[] = [`${plural(cleaning.rowsBefore, 'row', 'rows')} read.`];

  const excluded = cleaning.rowsExcluded;
  const blankLabel = bestColumnOfRole(r.semantics.columns, 'revenue') ? 'blank revenue' : 'blank sales amount';
  const label: Record<ExcludedReason, (count: number) => string> = {
    duplicate: count => (count === 1 ? 'duplicate' : 'duplicates'),
    zero_quantity: () => 'zero quantity',
    zero_price: () => 'zero price',
    zero_revenue: () => 'zero revenue',
    missing_measure: () => blankLabel,
  };
  const parts = EXCLUDED_ORDER.filter(reason => (excluded?.[reason] ?? 0) > 0).map(reason => `${n(excluded![reason])} ${label[reason](excluded![reason])}`);
  const leftOut = EXCLUDED_ORDER.reduce((sum, reason) => sum + (excluded?.[reason] ?? 0), 0);
  sentences.push(leftOut > 0 ? `${n(leftOut)} left out (${parts.join(', ')}).` : 'No rows left out.');

  if ((cleaning.rowsCalculated ?? 0) > 0) sentences.push(`${plural(cleaning.rowsCalculated!, 'revenue value', 'revenue values')} calculated from price x quantity.`);
  if (cleaning.returns && cleaning.returns.count > 0) sentences.push(`${plural(cleaning.returns.count, 'return', 'returns')} worth ${money(cleaning.returns.total)} kept apart.`);
  if (cleaning.undatedRows && cleaning.undatedRows.count > 0) {
    const count = cleaning.undatedRows.count;
    sentences.push(`${plural(count, 'row', 'rows')} ${count === 1 ? 'has' : 'have'} no date and ${count === 1 ? 'is' : 'are'} missing from the monthly trend.`);
  }
  if (cleaning.duplicateHandling === 'flagged' && (cleaning.duplicateRowCount ?? 0) > 0) {
    sentences.push(`${plural(cleaning.duplicateRowCount!, 'possible duplicate row', 'possible duplicate rows')} kept and flagged.`);
  }

  const shown = (cleaning.columns ?? []).filter(column => column.action === 'shown_as_missing' && column.missingBefore > 0);
  for (const column of shown.slice(0, MAX_MISSING_SENTENCES)) {
    sentences.push(`${n(column.missingBefore)} blank ${column.name} ${column.missingBefore === 1 ? 'value' : 'values'} shown as (Missing).`);
  }
  if (shown.length > MAX_MISSING_SENTENCES) sentences.push(`Blanks in ${plural(shown.length - MAX_MISSING_SENTENCES, 'more column', 'more columns')} are also shown as (Missing).`);
  return sentences.join(' ');
}

export interface ColumnRowView {
  key: string;
  name: string;
  role: string;
  before: string;           // "13 (21%)"
  after: string;
  done: string;             // what was done, in words
  leftOut: string;          // "3 (5%)" or "None"
  unreliable: boolean;
}

function columnRow(column: ColumnCleaning): ColumnRowView {
  return {
    key: column.name,
    name: column.name,
    role: column.role,
    before: `${n(column.missingBefore)} (${pctLabel(column.missingBeforePct)})`,
    after: `${n(column.missingAfter)} (${pctLabel(column.missingAfterPct)})`,
    done: column.actionText,
    leftOut: column.rowsLeftOut > 0 ? `${n(column.rowsLeftOut)} (${pctLabel(column.rowsLeftOutPct)})` : 'None',
    unreliable: column.unreliable,
  };
}

export interface QualityViewSide { label: string; overall: number; areas: { name: string; score: number }[] }

function qualitySide(label: string, report: DataQualityReport): QualityViewSide {
  return {
    label, overall: report.overallScore,
    areas: [
      { name: 'Completeness', score: report.completenessScore },
      { name: 'Validity', score: report.validityScore },
      { name: 'Consistency', score: report.consistencyScore },
      { name: 'Uniqueness', score: report.uniquenessScore },
    ],
  };
}

const STATUS_TONE: Record<DatasetStatusKind, Tone> = { ready: 'ok', caveats: 'watch', incomplete: 'risk', not_compatible: 'risk' };

export type CleaningReportView =
  | { kind: 'older'; message: string }
  | {
    kind: 'report';
    summary: string;
    status: { word: string; tone: Tone; reasons: string[] } | null;
    columns: ColumnRowView[];
    noBlanks: boolean;
    quality: { before: QualityViewSide; after: QualityViewSide | null };
    leftOutCount: number;
    unreliableNote: string;
  };

export function toCleaningReportView(r: PipelineResult): CleaningReportView {
  if (!hasCleaningReport(r)) return { kind: 'older', message: OLDER_VERSION_MESSAGE };
  const status = r.datasetStatus;
  const columns = (r.cleaning.columns ?? []).map(columnRow);
  return {
    kind: 'report',
    summary: cleaningSummary(r),
    status: status ? { word: STATUS_LABEL[status.status], tone: STATUS_TONE[status.status], reasons: status.status === 'ready' && status.reasons.length === 0 ? [READY_REASON] : status.reasons } : null,
    columns,
    noBlanks: columns.length === 0,
    quality: {
      before: qualitySide('As uploaded', r.quality),
      after: r.qualityAfter ? qualitySide('Rows used for sales', r.qualityAfter) : null,
    },
    leftOutCount: r.excludedRows?.length ?? 0,
    unreliableNote: UNRELIABLE_LIMIT_NOTE,
  };
}
