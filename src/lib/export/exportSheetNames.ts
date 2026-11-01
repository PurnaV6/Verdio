/* ================================================================
   VERDIO — Sheet names for Excel exports
   Excel rejects sheet names that are longer than 31 characters,
   contain [ ] : * ? / \, start or end with an apostrophe, are empty,
   or repeat another sheet's name ignoring case. Verd.io also writes
   a fixed set of sheets of its own, so a name taken from the user's
   data must not collide with those either.
   ================================================================ */

export const MAX_SHEET_NAME_LENGTH = 31;

/** Sheets the export generates itself. */
export const RESERVED_EXPORT_SHEET_NAMES: readonly string[] = ["Cleaning log", "Rows left out", "Calendar", "Products", "Customers", "Regions"];

const FALLBACK_NAME = "Sheet";

function clean(name: string): string {
  const withoutForbidden = name.replace(/[\][:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
  const withoutApostrophes = withoutForbidden.replace(/^'+|'+$/g, "").trim();
  return (withoutApostrophes || FALLBACK_NAME).slice(0, MAX_SHEET_NAME_LENGTH).trim() || FALLBACK_NAME;
}

/**
 * One valid, unique Excel sheet name for each requested name, in the same order.
 * A name that is already taken (by an earlier name, or by a reserved generated sheet) gets " (2)", " (3)", ...
 * and its base is shortened so the result still fits in 31 characters. The same input always gives the same output.
 * Reserved names are for the export's own sheets: pass them in `reserved`, and request your own names here.
 */
export function makeExportSheetNames(requested: readonly string[], reserved: readonly string[] = RESERVED_EXPORT_SHEET_NAMES): string[] {
  const taken = new Set(reserved.map(name => name.toLowerCase()));
  return requested.map(raw => {
    const base = clean(raw);
    let candidate = base;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      candidate = `${base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length).trim()}${suffix}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
