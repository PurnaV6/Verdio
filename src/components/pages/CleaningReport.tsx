import { useId } from "react";
import type { PipelineResult } from "../../types/pipeline";
import { StateMark } from "../workspace/StateMark";
import { toCleaningReportView, type QualityViewSide } from "./cleaningReportModel";

/* ================================================================
   VERDIO — Data cleaning report (Data Hub)
   What Verd.io did to the file, in plain words first and a table
   second: nothing is removed or filled in silently. Every line is
   read from the result by cleaningReportModel.ts.
   ================================================================ */

function QualitySide({ side }: { side: QualityViewSide }) {
  return (
    <div className="v2-cr-q">
      <p className="v2-cr-q-label">{side.label}</p>
      <p className="v2-cr-q-score">{side.overall}<span className="v2-cr-q-unit"> / 100</span></p>
      <dl className="v2-cr-q-areas">
        {side.areas.map(area => <div key={area.name}><dt>{area.name}</dt><dd>{area.score}</dd></div>)}
      </dl>
    </div>
  );
}

export function CleaningReport({ r, onOpenPage }: { r: PipelineResult; onOpenPage?: (page: string) => void }) {
  const headingId = useId();
  const view = toCleaningReportView(r);

  return (
    <section id="v2-cr" tabIndex={-1} className="v2-cr" aria-labelledby={headingId}>
      <h2 id={headingId} className="v2-cr-h">Data cleaning report</h2>
      {view.kind === 'older'
        ? <p className="v2-cr-older" role="status">{view.message}</p>
        : <>
          <p className="v2-cr-summary">{view.summary}</p>

          {view.status && (
            <div className="v2-cr-status">
              <p className="v2-cr-sub">Dataset status</p>
              <p className="v2-cr-status-word"><StateMark tone={view.status.tone} label={view.status.word} /></p>
              <ul className="v2-cr-reasons">
                {view.status.reasons.map(reason => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}

          {view.noBlanks
            ? <p className="v2-cr-none">No column has a blank value.</p>
            : (
              <details className="v2-kc-table v2-cr-table">
                <summary>View the columns as a table</summary>
                <div className="v2-kc-tbl v2-cr-tbl" tabIndex={0}>
                  <table>
                    <caption>Columns with blank values: how many were blank before and after cleaning, and what was done</caption>
                    <thead>
                      <tr>
                        <th scope="col">Column</th><th scope="col" className="is-text">Role</th><th scope="col">Blank before</th><th scope="col">Blank after</th>
                        <th scope="col" className="is-text">What was done</th><th scope="col">Rows left out</th><th scope="col" className="is-text">Reliability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.columns.map(column => (
                        <tr key={column.key}>
                          <th scope="row">{column.name}</th>
                          <td className="is-text">{column.role}</td>
                          <td>{column.before}</td>
                          <td>{column.after}</td>
                          <td className="is-text">{column.done}</td>
                          <td>{column.leftOut}</td>
                          <td className="is-text">{column.unreliable ? <StateMark tone="risk" label="Unreliable" /> : 'Not flagged'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="v2-cr-note">{view.unreliableNote}</p>
              </details>
            )}

          <div className="v2-cr-quality">
            <p className="v2-cr-sub">Data quality before and after</p>
            <div className="v2-cr-q-pair">
              <QualitySide side={view.quality.before} />
              {view.quality.after && <QualitySide side={view.quality.after} />}
            </div>
            {view.shownQuality && (
              <div className="v2-sc-asis">
                <p className="v2-sc-asis-line">{view.shownQuality.asUploaded}</p>
                <p className="v2-cr-note">{view.shownQuality.explanation}</p>
              </div>
            )}
            <p className="v2-cr-note">
              {view.quality.after
                ? 'The first score is for the file exactly as uploaded and is the one the health score uses. The second is for the rows that count toward sales.'
                : 'This score is for the file exactly as uploaded and is the one the health score uses.'}
            </p>
          </div>

          <p className="v2-cr-rows">
            {view.leftOutCount > 0
              ? <>{view.leftOutCount.toLocaleString('en-GB')} {view.leftOutCount === 1 ? 'row is' : 'rows are'} listed with the row number and the reason on the Governance page. </>
              : 'No rows were left out. '}
            {view.leftOutCount > 0 && onOpenPage && <button type="button" className="v2-ds-link" onClick={() => onOpenPage('governance')}>See the rows left out</button>}
          </p>
        </>}
    </section>
  );
}
