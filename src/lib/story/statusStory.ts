import { STATUS_LABEL } from "../dataPipeline/datasetStatus";
import type { StatusTrigger } from "../../types/dataPipeline";
import type { Ctx } from "./context";
import { stripFinalPeriod } from "./text";
import type { StoryOutcome, StoryPageId } from "./types";

/* ================================================================
   VERDIO — Dataset status in the story engine
   The status sentences carry numbers, so every one is recorded as a
   fact before the sentence is used. Results saved before the status
   existed have none, and every function here then says nothing.
   ================================================================ */

export const CANNOT_GIVE_FIGURES = 'Verd.io cannot give reliable sales figures for this file.';

const camel = (id: string) => id.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Records the numbers of these triggers as facts, so their sentences pass the number check. */
export function recordTriggerFacts(c: Ctx, triggers: StatusTrigger[]): void {
  const all = c.r.datasetStatus?.triggers ?? [];
  for (const trigger of triggers) {
    if (trigger.id === 'no_sales_column') continue;
    const name = camel(trigger.id);
    const path = `datasetStatus.triggers[${Math.max(0, all.indexOf(trigger))}]`;
    if (trigger.details) {
      trigger.details.forEach((detail, i) => {
        c.f.s(`${name}Column${i + 1}`, detail.column, `${path}.details[${i}].column`);
        c.f.n(`${name}Column${i + 1}Count`, detail.count, `${path}.details[${i}].count`);
        c.f.n(`${name}Column${i + 1}Total`, detail.total, `${path}.details[${i}].total`);
        c.f.n(`${name}Column${i + 1}Pct`, detail.pct, `${path}.details[${i}].pct`);
      });
      c.f.n(`${name}Columns`, trigger.count, `${path}.count`);
      const unlisted = trigger.count - 3;
      if (unlisted > 0) c.f.n(`${name}MoreColumns`, unlisted, `${path}.count (columns not listed)`);
      continue;
    }
    c.f.n(`${name}Count`, trigger.count, `${path}.count`);
    c.f.n(`${name}Total`, trigger.total, `${path}.total`);
    c.f.n(`${name}Pct`, trigger.pct, `${path}.pct`);
  }
}

/** For an incomplete or not compatible file: the reason a page's confidence is Low, with the numbers recorded. */
export function statusLowConfidence(c: Ctx): { reason: string; missing: string } | undefined {
  const status = c.r.datasetStatus;
  if (!status || (status.status !== 'incomplete' && status.status !== 'not_compatible')) return undefined;
  const severe = status.triggers.filter(trigger => trigger.severity === 'incomplete' || trigger.severity === 'not_compatible');
  recordTriggerFacts(c, severe);
  return { reason: severe.map(trigger => stripFinalPeriod(trigger.reason)).join('. '), missing: 'the missing values' };
}

/** One note for the data pages: the status word and every reason. Nothing when the file is ready or has no status. */
export function statusNotes(c: Ctx): string[] {
  const status = c.r.datasetStatus;
  if (!status || status.status === 'ready') return [];
  recordTriggerFacts(c, status.triggers);
  c.f.s('datasetStatus', STATUS_LABEL[status.status], 'datasetStatus.status');
  return [`Dataset status is ${STATUS_LABEL[status.status].toLowerCase()}. ${status.reasons.join(' ')}`];
}

/** Replaces the Overview story when the file is not compatible: it says so and gives every reason. */
export function notCompatibleStory(c: Ctx, pageId: StoryPageId): StoryOutcome | null {
  const status = c.r.datasetStatus;
  if (!status || status.status !== 'not_compatible') return null;
  recordTriggerFacts(c, status.triggers);
  return {
    kind: 'cannotSay', pageId, facts: c.f.facts,
    reason: `${CANNOT_GIVE_FIGURES} ${status.reasons.join(' ')}`,
    fix: 'Fill in the missing values or add the missing columns, then upload the file again.',
  };
}
