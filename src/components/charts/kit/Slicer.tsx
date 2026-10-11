import { useId, type ReactNode } from "react";

/* ================================================================
   VERDIO — Slicer
   A labelled native select, or chips when there are only a few
   values. A slicer chooses which actuals a chart or table shows; it
   never touches a forecast or a score. SlicerBar holds the slicers
   of one view with a reset and a live summary of what is selected.
   ================================================================ */

export interface SlicerOption { value: string; label: string }

export interface SlicerProps {
  label: string;                       // "Period", "Product Category"
  value: string;
  options: SlicerOption[];             // the first is normally the "all" choice
  onChange: (value: string) => void;
  display?: 'select' | 'chips';        // chips only up to MAX_SLICER_CHIPS values plus the "all" choice, otherwise a select
}

export const MAX_SLICER_CHIPS = 6;

export function Slicer({ label, value, options, onChange, display = 'select' }: SlicerProps) {
  const id = useId();
  const asChips = display === 'chips' && options.length <= MAX_SLICER_CHIPS + 1;

  if (asChips) {
    return (
      <div className="v2-sl-field" role="group" aria-labelledby={id}>
        <span id={id} className="v2-sl-label">{label}</span>
        <div className="v2-sl-chips">
          {options.map(o => (
            <button key={o.value} type="button" className="v2-sl-chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <label className="v2-sl-field">
      <span className="v2-sl-label">{label}</span>
      <select className="v2-sl-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export interface SlicerBarProps {
  label: string;                       // names the group for assistive tech: "Slicers for the sales trend and shares"
  summary: string;                     // what is selected and the figure it gives; announced politely when it changes
  changed: boolean;                    // anything other than the starting choice
  onReset: () => void;
  className?: string;
  children: ReactNode;                 // the Slicers
}

export function SlicerBar({ label, summary, changed, onReset, className, children }: SlicerBarProps) {
  return (
    <section className={className ? `v2-sl-bar ${className}` : 'v2-sl-bar'} aria-label={label}>
      <div className="v2-sl-fields">{children}</div>
      <button type="button" className="v2-sl-reset" aria-disabled={!changed} onClick={() => { if (changed) onReset(); }}>Reset slicers</button>
      <p className="v2-sl-summary" role="status" aria-live="polite">{summary}</p>
    </section>
  );
}
