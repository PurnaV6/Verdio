import type { PipelineResult } from "../../types/pipeline";
import type { CustomerSegmentLabel } from "../../types/ml";
import { getRevenueView } from "../analysis/revenueView";
import { formatters } from "../story";

/* ================================================================
   VERDIO — Upload comparison (pure)
   What changed between the file the user had open and the one they
   loaded next, in the same session. Only a small snapshot of the
   earlier result is kept (names, totals, counts: no rows), in memory,
   and it is never stored or sent anywhere. Two files are compared
   only when they measure the same thing: the same revenue column.
   Every number said is a snapshot value or the difference of two.
   ================================================================ */

const { formatCount, formatPounds, parsePeriodKey, pluralise } = formatters;

const SEGMENTS: CustomerSegmentLabel[] = ['champion', 'loyal', 'new', 'atRisk', 'lost'];

export interface UploadSnapshot {
  fileName: string;
  /** The column the sales figures were read from; null when the file has none. */
  revenueColumn: string | null;
  /** The date column the monthly series was built on; null when there is no series. */
  dateColumn: string | null;
  totalSales: number | null;
  latestMonth: { key: string; value: number } | null;
  /** Every month the sales series covers, as "YYYY-MM", oldest first. */
  monthKeys: string[];
  health: number;
  quality: number;
  risks: { total: number; high: number; medium: number; low: number };
  /** Customers per segment; null when the file has no customer analysis. */
  customers: { total: number; segments: Record<CustomerSegmentLabel, number> } | null;
}

/** The compact, in-memory record of a result, kept so the next upload can be compared with it. */
export function takeSnapshot(result: PipelineResult): UploadSnapshot {
  const view = getRevenueView(result);
  const points = view.series?.points ?? [];
  const latest = points.at(-1);
  const salesKnown = !!view.revenueColumn || view.connectedRevenue !== undefined;
  const segmentation = result.ml.segmentation;
  const level = (name: 'high' | 'medium' | 'low') => result.decision.risks.filter(risk => risk.level === name).length;
  return {
    fileName: result.source.fileName,
    revenueColumn: view.revenueColumn,
    dateColumn: view.series?.dateColumn ?? null,
    totalSales: salesKnown && Number.isFinite(view.total) && view.total ? view.total : null,
    latestMonth: latest && Number.isFinite(latest.value) ? { key: latest.periodKey, value: latest.value } : null,
    monthKeys: points.map(point => point.periodKey),
    health: result.decision.health.total,
    quality: result.quality.overallScore,
    risks: { total: result.decision.risks.length, high: level('high'), medium: level('medium'), low: level('low') },
    customers: segmentation && segmentation.segments.length > 0
      ? {
        total: segmentation.segments.length,
        segments: Object.fromEntries(SEGMENTS.map(key => [key, segmentation.segments.filter(item => item.segment === key).length])) as Record<CustomerSegmentLabel, number>,
      }
      : null,
  };
}

export type ChangeDirection = 'up' | 'down' | 'same';

export interface ChangeRow {
  id: 'sales' | 'latest' | 'months' | 'health' | 'quality' | 'risks' | 'atRisk';
  label: string;
  /** null when the two files cannot be set against each other for this figure. */
  direction: ChangeDirection | null;
  /** The shape that goes with the word: an up arrow, a down arrow or an equals sign. Empty when direction is null. */
  glyph: string;
  /** "Up £1,766", "Down 3 points", "No change". */
  word: string;
  /** "Now £43,001, was £41,235." */
  detail: string;
}

export type UploadComparison =
  | { kind: 'cannotCompare'; previousFile: string; currentFile: string; headline: string; reason: string }
  | { kind: 'same'; previousFile: string; currentFile: string; headline: string; detail: string }
  | { kind: 'changed'; previousFile: string; currentFile: string; headline: string; spanNote: string | null; rows: ChangeRow[] };

export const CANNOT_COMPARE_HEADLINE = 'These files do not measure the same thing, so Verd.io cannot compare them.';

const GLYPH: Record<ChangeDirection, string> = { up: '↑', down: '↓', same: '=' };

function directionOf(delta: number): ChangeDirection {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
}

function row(id: ChangeRow['id'], label: string, direction: ChangeDirection | null, word: string, detail: string): ChangeRow {
  return { id, label, direction, glyph: direction ? GLYPH[direction] : '', word, detail };
}

/** A figure that moved: "Up £1,766" with the numbers it came from; "No change" when the rounded values match. */
function moved(id: ChangeRow['id'], label: string, previous: number, current: number, show: (value: number) => string, unit?: (count: number) => string): ChangeRow {
  const before = Math.round(previous);
  const now = Math.round(current);
  const delta = now - before;
  const direction = directionOf(delta);
  const size = unit ? unit(Math.abs(delta)) : show(Math.abs(delta));
  const word = direction === 'same' ? 'No change' : `${direction === 'up' ? 'Up' : 'Down'} ${size}`;
  return row(id, label, direction, word, `Now ${show(now)}, was ${show(before)}.`);
}

function notCompared(id: ChangeRow['id'], label: string, detail: string): ChangeRow {
  return row(id, label, null, 'Not compared', detail);
}

/** "2024-03" -> "March 2024"; any other key is shown as it is. */
export function periodName(key: string): string {
  const parsed = parsePeriodKey(key);
  return parsed ? `${parsed.month} ${parsed.year}` : key;
}

function spanText(keys: string[]): string {
  const first = periodName(keys[0]);
  const last = periodName(keys[keys.length - 1]);
  return `${first === last ? first : `${first} to ${last}`}, ${pluralise(keys.length, 'month')}`;
}

function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function normalName(column: string): string {
  return column.trim().toLowerCase();
}

function whyNotComparable(previous: UploadSnapshot, current: UploadSnapshot): string | null {
  const before = previous.revenueColumn;
  const now = current.revenueColumn;
  if (before === null && now === null) return `Neither ${previous.fileName} nor ${current.fileName} has a sales column Verd.io could identify.`;
  if (before === null) return `${previous.fileName} has no sales column, and ${current.fileName} measures "${now}".`;
  if (now === null) return `${current.fileName} has no sales column, and ${previous.fileName} measures "${before}".`;
  if (normalName(before) !== normalName(now)) return `${previous.fileName} measures "${before}" and ${current.fileName} measures "${now}".`;
  return null;
}

function riskDetail(counts: UploadSnapshot['risks']): string {
  return `${formatCount(counts.total)} (${formatCount(counts.high)} high, ${formatCount(counts.medium)} medium, ${formatCount(counts.low)} low)`;
}

function identicalNumbers(previous: UploadSnapshot, current: UploadSnapshot): boolean {
  const round = (value: number | null) => (value === null ? null : Math.round(value));
  const risksSame = (['total', 'high', 'medium', 'low'] as const).every(key => previous.risks[key] === current.risks[key]);
  const customersSame = previous.customers === null || current.customers === null
    ? previous.customers === current.customers
    : previous.customers.total === current.customers.total && SEGMENTS.every(key => previous.customers!.segments[key] === current.customers!.segments[key]);
  return round(previous.totalSales) === round(current.totalSales)
    && previous.latestMonth?.key === current.latestMonth?.key
    && round(previous.latestMonth?.value ?? null) === round(current.latestMonth?.value ?? null)
    && sameKeys(previous.monthKeys, current.monthKeys)
    && Math.round(previous.health) === Math.round(current.health)
    && Math.round(previous.quality) === Math.round(current.quality)
    && risksSame && customersSame;
}

/**
 * What changed from `previous` (the file before) to `current`. null when there is no earlier
 * snapshot, so nothing is shown on a first upload.
 */
export function compareUploads(previous: UploadSnapshot | null, current: UploadSnapshot): UploadComparison | null {
  if (!previous) return null;
  const names = { previousFile: previous.fileName, currentFile: current.fileName };

  const reason = whyNotComparable(previous, current);
  if (reason) return { kind: 'cannotCompare', ...names, headline: CANNOT_COMPARE_HEADLINE, reason };

  if (identicalNumbers(previous, current)) {
    const sameName = previous.fileName === current.fileName;
    return {
      kind: 'same', ...names,
      headline: 'Nothing changed.',
      detail: sameName
        ? `${current.fileName} gives the same numbers as the file you uploaded before it.`
        : `${current.fileName} gives the same numbers as ${previous.fileName}, the file you uploaded before it.`,
    };
  }

  const rows: ChangeRow[] = [];
  const sameSpan = sameKeys(previous.monthKeys, current.monthKeys);

  if (previous.totalSales !== null && current.totalSales !== null) {
    rows.push(moved('sales', 'Total sales', previous.totalSales, current.totalSales, formatPounds));
  } else if (previous.totalSales !== null || current.totalSales !== null) {
    rows.push(notCompared('sales', 'Total sales', `${previous.totalSales === null ? previous.fileName : current.fileName} has no sales total.`));
  }

  const before = previous.latestMonth;
  const now = current.latestMonth;
  if (before && now) {
    if (before.key === now.key) {
      rows.push(moved('latest', `Sales in ${periodName(now.key)}`, before.value, now.value, formatPounds));
    } else {
      const base = moved('latest', 'Latest month', before.value, now.value, formatPounds);
      rows.push({ ...base, detail: `${periodName(now.key)} was ${formatPounds(Math.round(now.value))}, ${periodName(before.key)} was ${formatPounds(Math.round(before.value))}.` });
    }
  } else if (before || now) {
    rows.push(notCompared('latest', 'Latest month', `${before ? current.fileName : previous.fileName} has no monthly sales.`));
  }

  if (previous.monthKeys.length > 0 && current.monthKeys.length > 0) {
    const covered = new Set(current.monthKeys);
    const added = current.monthKeys.length - previous.monthKeys.length;
    const detail = `Now ${spanText(current.monthKeys)}; was ${spanText(previous.monthKeys)}.`;
    if (previous.monthKeys.every(key => covered.has(key))) {
      rows.push(row('months', 'New months added', added > 0 ? 'up' : 'same', added > 0 ? `${pluralise(added, 'new month')}` : 'No new months', detail));
    } else {
      rows.push(row('months', 'New months added', null, 'Different months', detail));
    }
  } else if (previous.monthKeys.length > 0 || current.monthKeys.length > 0) {
    rows.push(notCompared('months', 'New months added', `${previous.monthKeys.length === 0 ? previous.fileName : current.fileName} has no dated sales.`));
  }

  rows.push(moved('health', 'Business health', previous.health, current.health, value => `${formatCount(value)} out of 100`, count => pluralise(count, 'point')));
  rows.push(moved('quality', 'Data quality', previous.quality, current.quality, value => `${formatCount(value)} out of 100`, count => pluralise(count, 'point')));

  {
    const delta = current.risks.total - previous.risks.total;
    const direction = directionOf(delta);
    const mixChanged = (['high', 'medium', 'low'] as const).some(key => previous.risks[key] !== current.risks[key]);
    const word = direction !== 'same' ? `${direction === 'up' ? 'Up' : 'Down'} ${pluralise(Math.abs(delta), 'risk')}` : mixChanged ? 'Same number, different levels' : 'No change';
    rows.push(row('risks', 'Risks found', direction, word, `Now ${riskDetail(current.risks)}, was ${riskDetail(previous.risks)}.`));
  }

  if (previous.customers && current.customers) {
    const delta = current.customers.segments.atRisk - previous.customers.segments.atRisk;
    const direction = directionOf(delta);
    const othersChanged = SEGMENTS.some(key => previous.customers!.segments[key] !== current.customers!.segments[key]);
    const word = direction !== 'same' ? `${direction === 'up' ? 'Up' : 'Down'} ${pluralise(Math.abs(delta), 'customer')}` : othersChanged ? 'No change in at risk, other segments changed' : 'No change';
    rows.push(row('atRisk', 'Customers at risk', direction, word,
      `Now ${formatCount(current.customers.segments.atRisk)} of ${pluralise(current.customers.total, 'customer')}, was ${formatCount(previous.customers.segments.atRisk)} of ${pluralise(previous.customers.total, 'customer')}.`));
  } else if (previous.customers || current.customers) {
    rows.push(notCompared('atRisk', 'Customers at risk', `${previous.customers ? current.fileName : previous.fileName} has no customer analysis.`));
  }

  const spanNote = sameSpan || previous.monthKeys.length === 0 || current.monthKeys.length === 0 ? null
    : 'The two files cover different months, so the totals are not like for like.';
  return { kind: 'changed', ...names, headline: `Compared with ${previous.fileName}, the file you uploaded before this one.`, spanNote, rows };
}
