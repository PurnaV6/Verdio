import { formatCount, pluralise } from "./formatters";
import type { StoryConfidence } from "./types";

/* ================================================================
   VERDIO — Story confidence
   The label is the weakest link of the data behind a page. Every
   threshold already exists elsewhere in the code:
     Q < 70   riskEngine 'high' data quality line
     Q >= 88  riskEngine "no data quality warning" line
     N < 30   seasonality minimum rows (detectCapabilities)
     P < 6    forecast minimum (detectCapabilities)
     P >= 12  a full year of months
   Model suitability (_modelMeta.*.confidence) is deliberately NOT used.
   ================================================================ */

export const CONFIDENCE_THRESHOLDS = {
  lowQuality: 70,
  highQuality: 88,
  minRows: 30,
  minMonthsForForecast: 6,
  fullYearMonths: 12,
  minCustomers: 20,
} as const;

export interface CitedColumn { name: string; needsReview: boolean }

export interface ConfidenceInput {
  /** r.quality.overallScore */
  quality: number;
  /** r.source.rowCount */
  rows: number;
  /** r.statistics.timeSeries[0].points.length, or 0 when there is no time series */
  months: number;
  /** The page depends on the time series (Overview, Revenue, Predictions, Seasonality). */
  timeBased?: boolean;
  /** The page depends on customer segmentation. */
  customerBased?: boolean;
  /** Number of customers, for customer-based pages. */
  customers?: number;
  /** The columns the page cites, with their needsReview flag from r.semantics. */
  citedColumns?: CitedColumn[];
  /** Forces Low with a reason, e.g. cost assumed rather than measured. */
  forceLow?: { reason: string; missing: string };
}

function columnReason(flagged: CitedColumn[]): string {
  const names = flagged.slice(0, 2).map(column => column.name);
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0];
  const others = flagged.length > names.length ? ' and others' : '';
  return `${flagged.length === 1 ? 'Column' : 'Columns'} ${list}${others} ${flagged.length === 1 ? 'is' : 'are'} not confirmed`;
}

export function computeConfidence(input: ConfidenceInput): StoryConfidence {
  const { quality, rows, months } = input;
  const timeBased = input.timeBased === true;
  const customers = input.customerBased ? (input.customers ?? 0) : null;
  const cited = input.citedColumns ?? [];
  const flagged = cited.filter(column => column.needsReview);
  const mostFlagged = cited.length > 0 && flagged.length * 2 > cited.length;

  const low = !!input.forceLow
    || quality < CONFIDENCE_THRESHOLDS.lowQuality
    || rows < CONFIDENCE_THRESHOLDS.minRows
    || (timeBased && months < CONFIDENCE_THRESHOLDS.minMonthsForForecast)
    || (customers !== null && customers < CONFIDENCE_THRESHOLDS.minCustomers)
    || mostFlagged;

  if (low) {
    let reason: string; let missing: string;
    if (input.forceLow) { reason = input.forceLow.reason; missing = input.forceLow.missing; }
    else if (rows < CONFIDENCE_THRESHOLDS.minRows) { reason = `The file has only ${pluralise(rows, 'row')}`; missing = 'more rows'; }
    else if (timeBased && months < CONFIDENCE_THRESHOLDS.minMonthsForForecast) { reason = months > 0 ? `The file covers only ${pluralise(months, 'month')}` : 'The file has no monthly history'; missing = 'more months of dated sales'; }
    else if (quality < CONFIDENCE_THRESHOLDS.lowQuality) { reason = `Data quality is ${formatCount(quality)} out of 100`; missing = 'cleaner data'; }
    else if (customers !== null && customers < CONFIDENCE_THRESHOLDS.minCustomers) { reason = `The file has only ${pluralise(customers, 'customer')}`; missing = 'more customers'; }
    else { reason = columnReason(flagged); missing = 'a confirmed column mapping'; }
    return { label: 'Low', caveat: `Do not make a large decision on this alone. ${reason}. Adding ${missing} would make it firmer.` };
  }

  const high = quality >= CONFIDENCE_THRESHOLDS.highQuality
    && rows >= CONFIDENCE_THRESHOLDS.minRows
    && (!timeBased || months >= CONFIDENCE_THRESHOLDS.fullYearMonths)
    && flagged.length === 0;

  if (high) {
    const span = months > 0 ? ` over ${pluralise(months, 'month')}` : '';
    return { label: 'High', caveat: `This rests on ${pluralise(rows, 'row')}${span} and a data quality score of ${formatCount(quality)} out of 100. You can act on it, but check it against what you know.` };
  }

  let reason: string;
  if (quality < CONFIDENCE_THRESHOLDS.highQuality) reason = `Data quality is ${formatCount(quality)} out of 100`;
  else if (timeBased && months < CONFIDENCE_THRESHOLDS.fullYearMonths) reason = `Only ${pluralise(months, 'month')} of history`;
  else reason = columnReason(flagged);
  return { label: 'Medium', caveat: `Treat this as a good guide, not a certainty. ${reason}.` };
}
