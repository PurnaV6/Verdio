/* ================================================================
   VERDIO — The "(Missing)" group
   A blank category, region or product is never filled in and never
   dropped. Every breakdown that groups by such a column shows its
   blanks as one group with this label, counted and summed like any other.
   ================================================================ */

export const MISSING_LABEL = '(Missing)';

/** The group a cell belongs to: its trimmed text, or "(Missing)" when it is blank. */
export function groupLabel(cell: unknown): string {
  const text = String(cell ?? '').trim();
  return text === '' ? MISSING_LABEL : text;
}
