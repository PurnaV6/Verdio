import { useMemo, useState } from "react";
import type { ValueFormat } from "../../../types/analysis";
import { formatFull } from "./format";
import { applyFilters, hasActiveFilters, planFilters, rowCountLabel, type TableFilterState, type TableRow } from "./tableFilter";

/* ================================================================
   VERDIO — FilterableTable
   A long table (more than 12 rows) with a select for each repeating
   text column, a text find for names, and a live "x of y rows" count.
   Used only past that size: a short table has no filters, and the
   caller decides by planFilters().
   ================================================================ */

export interface FilterableTableProps {
  caption: string;
  columns: { key: string; label: string; format?: ValueFormat }[];
  rows: TableRow[];
}

export function FilterableTable({ caption, columns, rows }: FilterableTableProps) {
  const formatOf = useMemo(() => new Map(columns.map(c => [c.key, c.format ?? 'plain'])), [columns]);
  const cellText = useMemo(() => (row: TableRow, key: string): string => {
    const v = row[key];
    if (typeof v === 'number') return formatFull(v, formatOf.get(key) ?? 'plain');
    return v === null || v === undefined ? '' : String(v);
  }, [formatOf]);
  const fields = useMemo(() => planFilters(columns, rows, cellText), [columns, rows, cellText]);
  const [state, setState] = useState<TableFilterState>({});
  const shown = useMemo(() => applyFilters(rows, fields, state, cellText), [rows, fields, state, cellText]);
  const active = hasActiveFilters(state);

  return (
    <div className="v2-sl-tf">
      {fields.length > 0 && (
        <div className="v2-sl-tfbar">
          {fields.map(f => (
            <label key={f.key} className="v2-sl-field">
              <span className="v2-sl-label">{f.kind === 'text' ? `Find in ${f.label}` : f.label}</span>
              {f.kind === 'select'
                ? (
                  <select className="v2-sl-select" value={state[f.key] ?? ''} onChange={e => setState(s => ({ ...s, [f.key]: e.target.value }))}>
                    <option value="">All</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
                : <input className="v2-sl-select" type="search" value={state[f.key] ?? ''} onChange={e => setState(s => ({ ...s, [f.key]: e.target.value }))} />}
            </label>
          ))}
          <button type="button" className="v2-sl-reset" aria-disabled={!active} onClick={() => { if (active) setState({}); }}>Clear filters</button>
          <p className="v2-sl-summary" role="status" aria-live="polite">{rowCountLabel(shown.length, rows.length)}</p>
        </div>
      )}
      <div className="v2-sl-tbl" tabIndex={0} role="region" aria-label={`${caption}, scrollable table`}>
        <table>
          <caption>{caption}</caption>
          <thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
          <tbody>
            {shown.length === 0
              ? <tr><td colSpan={columns.length}>No rows match these filters. Clear the filters to see all {rows.length.toLocaleString('en-GB')} rows.</td></tr>
              : shown.map(i => (
                <tr key={i}>
                  {columns.map((c, j) => {
                    const cell = cellText(rows[i], c.key);
                    const cls = typeof rows[i][c.key] === 'number' ? 'is-num' : undefined;
                    return j === 0 ? <th key={c.key} scope="row" className={cls}>{cell}</th> : <td key={c.key} className={cls}>{cell}</td>;
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
