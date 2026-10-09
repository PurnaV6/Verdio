import type { ValueFormat } from "../../../types/analysis";

/* Number formatting for chart labels. `full` is for tables, tooltips and the live region ("£152,588");
   `compact` is for axes and the generated summary ("£149k"). */

const sign = (v: number) => (v < 0 ? '-' : '');

function trimmed(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

export function formatFull(v: number, format: ValueFormat): string {
  if (!Number.isFinite(v)) return '—';
  switch (format) {
    case 'currency':   return sign(v) + '£' + Math.round(Math.abs(v)).toLocaleString('en-GB');
    case 'count':      return Math.round(v).toLocaleString('en-GB');
    case 'percentage': return Math.round(v * 10) / 10 + '%';
    default:           return v.toLocaleString('en-GB');
  }
}

export function formatCompact(v: number, format: ValueFormat): string {
  if (!Number.isFinite(v)) return '—';
  if (format === 'percentage') return Math.round(v * 10) / 10 + '%';
  const a = Math.abs(v);
  const prefix = format === 'currency' ? '£' : '';
  let body: string;
  if (a >= 1e9) body = trimmed(a / 1e9, 1) + 'bn';
  else if (a >= 1e6) body = trimmed(a / 1e6, 1) + 'm';
  else if (a >= 1e5) body = trimmed(a / 1e3, 0) + 'k';
  else if (a >= 1e3) body = trimmed(a / 1e3, 1) + 'k';
  else body = trimmed(a, a < 10 && format === 'plain' ? 2 : 0);
  return sign(v) + prefix + body;
}
