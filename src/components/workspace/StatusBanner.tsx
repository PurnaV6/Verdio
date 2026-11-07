import { useId } from "react";
import type { DatasetStatus } from "../../types/dataPipeline";
import { StateMark } from "./StateMark";
import { toStatusBannerView } from "./statusBannerModel";

/* ================================================================
   VERDIO — Status banner
   A calm note at the top of the workspace content when the file's
   numbers come with caveats, are incomplete or cannot be relied on.
   Nothing is drawn for a ready file or a result with no status. The
   status is a word plus a shape plus a colour, never colour alone.
   ================================================================ */

export function StatusBanner({ status, onSeeReport }: { status: DatasetStatus | undefined; onSeeReport: () => void }) {
  const headingId = useId();
  const view = toStatusBannerView(status);
  if (!view) return null;
  return (
    <section className={`v2-ds-banner is-${view.status}`} aria-labelledby={headingId}>
      <div className="v2-ds-head">
        <h2 id={headingId} className="v2-ds-title">Dataset status</h2>
        <StateMark tone={view.tone} label={view.word} />
      </div>
      <ul className="v2-ds-reasons">
        {view.reasons.map(reason => <li key={reason}>{reason}</li>)}
      </ul>
      <button type="button" className="v2-ds-link" onClick={onSeeReport}>{view.linkLabel}</button>
    </section>
  );
}
