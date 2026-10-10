import type { Ctx } from "../context";
import { firstSentence, stripFinalPeriod } from "../text";
import type { EnrichedRecommendation } from "../../decision/verdioDecisionEngine";
import type { Risk } from "../../../types/decision";

/** Records a risk's title, description and source columns as facts, and returns the pieces. */
export function readRisk(c: Ctx, risk: Risk) {
  const index = Math.max(0, c.risks.indexOf(risk));
  const path = `decision.risks[${index}]`;
  const title = c.f.s('riskTitle', risk.title, `${path}.title`);
  const desc = c.f.s('riskDescription', risk.desc, `${path}.desc`);
  const first = c.f.s('riskDescriptionFirstSentence', firstSentence(risk.desc), `${path}.desc (first sentence)`);
  const columns = risk.sourceColumns.filter(name => c.semNames.has(name));
  columns.forEach((name, i) => c.f.s(`riskColumn${i + 1}`, name, `${path}.sourceColumns`));
  return { title, desc, first, columns, level: risk.level };
}

/** The recommendation that answers this risk, or undefined. */
export function recommendationForRisk(c: Ctx, riskTitle: string): EnrichedRecommendation | undefined {
  return c.recs.find(rec => rec.relatedRiskTitles?.includes(riskTitle));
}

/** First recommendation whose title matches. */
export function recommendationMatching(c: Ctx, pattern: RegExp): EnrichedRecommendation | undefined {
  return c.recs.find(rec => pattern.test(rec.title));
}

/** Joins names as "a, b and c". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A capability or risk reason as the middle of a sentence: no trailing full stop. */
export function reasonText(reason: string): string {
  return stripFinalPeriod(reason);
}
