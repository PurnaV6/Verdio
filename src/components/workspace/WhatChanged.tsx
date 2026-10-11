import { useId } from "react";
import type { UploadComparison } from "../../lib/compare/uploadComparison";

/* ================================================================
   VERDIO — What changed since your last upload
   Shows the comparison compareUploads() made between the file open
   now and the one uploaded before it in this session. Every word and
   number is the comparison's own; this only lays them out. Each
   change has an arrow or equals sign and a word, never colour alone.
   ================================================================ */

export function WhatChanged({ comparison }: { comparison: UploadComparison }) {
  const headingId = useId();
  return (
    <section className="v2-ov-panel v2-wc" aria-labelledby={headingId}>
      <h2 id={headingId} className="v2-ov-h">What changed since your last upload</h2>
      {comparison.kind === 'cannotCompare' && (
        <>
          <p className="v2-wc-lead">{comparison.headline}</p>
          <p className="v2-ov-sub">{comparison.reason}</p>
        </>
      )}
      {comparison.kind === 'same' && (
        <>
          <p className="v2-wc-lead">{comparison.headline}</p>
          <p className="v2-ov-sub">{comparison.detail}</p>
        </>
      )}
      {comparison.kind === 'changed' && (
        <>
          <p className="v2-ov-sub">{comparison.headline}</p>
          {comparison.spanNote && <p className="v2-wc-note">{comparison.spanNote}</p>}
          <ul className="v2-wc-rows">
            {comparison.rows.map(item => (
              <li key={item.id} className="v2-wc-row">
                <span className="v2-wc-name">{item.label}</span>
                <span className="v2-wc-move">{item.glyph && <span className="v2-wc-glyph" aria-hidden="true">{item.glyph}</span>}{item.glyph && ' '}{item.word}</span>
                <span className="v2-wc-detail">{item.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
