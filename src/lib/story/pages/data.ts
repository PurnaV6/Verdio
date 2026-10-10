import { CANNOT_SHOW_WHY, cannotSay, compose, nextFromRecommendation, roleColumn, type Ctx } from "../context";
import { formatCount, formatPercent, pluralise } from "../formatters";
import { LIMITS, asSentence, firstSentence, fitPart, stripFinalPeriod } from "../text";
import type { AlertPreferencesInput, StoryOutcome } from "../types";
import { joinNames, recommendationMatching } from "./shared";

/* ── Data Profile ── */

export function profileStory(c: Ctx): StoryOutcome {
  const { f, r, file } = c;
  const columns = r.semantics.columns;
  if (!columns.length) return cannotSay(c, 'profile', 'No columns were read from this file.', 'Check the file in Data Hub, then upload it again.');
  const count = pluralise(f.n('columnCount', columns.length, 'semantics.columns.length'), 'column');
  const review = columns.filter(column => column.needsReview).map(column => column.columnName);
  const reviewCount = f.n('reviewColumnCount', review.length, 'semantics.columns[].needsReview');
  const shown = review.slice(0, 3).map((name, i) => f.s(`reviewColumn${i + 1}`, name, 'semantics.columns[].columnName'));
  const more = review.length - shown.length;
  const names = more > 0 ? `${shown.join(', ')} and ${formatCount(f.n('reviewColumnsNotListed', more, 'semantics.columns[].needsReview'))} more` : joinNames(shown);

  const date = roleColumn(c, 'date');
  const sales = roleColumn(c, 'revenue');
  const customer = roleColumn(c, 'customer');
  const found = (name: string | null) => name ?? 'none found';

  const checkPhrase = review.length ? `${formatCount(reviewCount)} need your check` : 'none need your check';
  const notes = r.semantics.warnings.map((warning, i) => f.s(`semanticWarning${i + 1}`, warning, 'semantics.warnings'));

  return compose(c, 'profile', {
    happened: [
      [`${count} read from ${file}; ${checkPhrase}${review.length ? `: ${names}` : ''}.`, `${count} read from ${file}; ${checkPhrase}.`, `${count} read from ${file}.`],
      [`Date: ${found(date)}, sales: ${found(sales)}, customer: ${found(customer)}.`],
    ],
    next: review.length ? fitPart([[`Confirm the role of ${joinNames(shown.slice(0, 2))} in Data Hub.`, 'Confirm the flagged column roles in Data Hub.']], LIMITS.next) : null,
    notes,
    columns: [date, sales, customer],
  });
}

/* ── Data Quality (also the Governance "Data Quality" tab) ── */

export function qualityStory(c: Ctx, pageId: 'quality'): StoryOutcome {
  const { f, r, Q } = c;
  f.n('dataQuality', Q, 'quality.overallScore');
  const areas = [
    { name: 'Completeness', score: r.quality.completenessScore, field: 'completenessScore' },
    { name: 'Validity', score: r.quality.validityScore, field: 'validityScore' },
    { name: 'Consistency', score: r.quality.consistencyScore, field: 'consistencyScore' },
    { name: 'Uniqueness', score: r.quality.uniquenessScore, field: 'uniquenessScore' },
  ];
  const weakest = areas.reduce((best, area) => (area.score < best.score ? area : best));
  const weakScore = f.n('weakestAreaScore', weakest.score, `quality.${weakest.field}`);
  f.s('weakestArea', weakest.name, `quality.${weakest.field} (lowest of the four)`);

  const flags = r.quality.flags.map((flag, i) => f.s(`qualityFlag${i + 1}`, stripFinalPeriod(flag), 'quality.flags'));
  const issueCount = f.n('issueCount', flags.length, 'quality.flags.length');
  const issues = flags.length
    ? [...[3, 2, 1].filter(n => n <= flags.length).map(n => `${pluralise(issueCount, 'issue')}: ${flags.slice(0, n).join('; ')}.`), `${pluralise(issueCount, 'issue')} found.`]
    : ['No quality issues were found.'];
  const filled = f.n('cellsImputed', r.cleaning.cellsImputed, 'cleaning.cellsImputed');
  const filledSentence = filled === 0 ? 'No blank cells were filled.' : `${pluralise(filled, 'blank cell')} ${filled === 1 ? 'was' : 'were'} filled.`;

  return compose(c, pageId, {
    happened: [[`Quality is ${formatCount(Q)}/100.`], [`Weakest area: ${weakest.name} (${formatCount(weakScore)}/100).`]],
    why: [issues, [filledSentence, '']],
    next: nextFromRecommendation(c, recommendationMatching(c, /data collection/i)),
  });
}

/* ── Connections ── */

export function connectionsStory(c: Ctx): StoryOutcome {
  return compose(c, 'connections', {
    happened: [[`Active source: ${c.file}, ${formatCount(c.N)} rows.`], ['Every outside connector is still marked Coming soon.']],
    next: null,
  });
}

/* ── Data Relationships ── */

const INSIGHT_ORDER = ['high', 'medium', 'opportunity'];

export function relationshipsStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const organization = r.organization;
  if (!organization) {
    return cannotSay(c, 'relationships', 'No organisational model is active.', 'Start a new analysis and select sales, stock, customer, product or finance files together.');
  }
  const confirmed = organization.relationships.filter(relationship => relationship.confirmed);
  const insights = (organization.insights ?? [])
    .filter(insight => !insight.relationshipId || confirmed.some(relationship => relationship.id === insight.relationshipId))
    .sort((a, b) => INSIGHT_ORDER.indexOf(a.priority) - INSIGHT_ORDER.indexOf(b.priority));
  const best = [...confirmed].sort((a, b) => b.confidence - a.confidence)[0];
  const top = insights[0];

  const files = pluralise(f.n('datasetCount', organization.datasets.length, 'organization.datasets.length'), 'file');
  const links = pluralise(f.n('confirmedCount', confirmed.length, 'organization.relationships[].confirmed'), 'connection');
  const overlap = best ? ` (${formatPercent(f.n('overlapPct', best.overlapPct, 'organization.relationships[best confirmed].overlapPct'))} overlap)` : '';
  const title = top ? f.s('insightTitle', top.title, 'organization.insights[0].title') : '';

  let next: string | null = null;
  if (top) {
    const action = stripFinalPeriod(f.s('insightAction', top.action, 'organization.insights[0].action'));
    const confidence = formatCount(f.n('insightConfidencePct', Math.round(top.confidence * 100), 'organization.insights[0].confidence x 100'));
    next = fitPart([[`${action} (evidence confidence ${confidence}%).`, `${asSentence(action)}`]], LIMITS.next);
  }

  return compose(c, 'relationships', {
    happened: [[`${files} linked, ${links} confirmed${overlap}.`], [top ? asSentence(title) : '', '']],
    why: top ? [[firstSentence(f.s('insightDescription', top.description, 'organization.insights[0].description'))]] : [[CANNOT_SHOW_WHY]],
    next,
    columns: best ? [best.leftColumn, best.rightColumn] : [],
  });
}

/* ── Alerts & Reports ── */

/** Same starting values as PageAlerts (components/operational/OperationalPages.tsx). */
export const DEFAULT_ALERT_PREFERENCES: AlertPreferencesInput = {
  revenueDropAlert: true, healthAlert: true, qualityAlert: true, healthThreshold: 60, qualityThreshold: 75, reportCadence: 'off',
};

export function alertsStory(c: Ctx): StoryOutcome {
  const { f, r, H, Q } = c;
  const prefs = c.inputs.alertPreferences ?? DEFAULT_ALERT_PREFERENCES;
  const healthLimit = f.n('healthThreshold', prefs.healthThreshold, 'alert preferences: healthThreshold');
  const qualityLimit = f.n('qualityThreshold', prefs.qualityThreshold, 'alert preferences: qualityThreshold');
  f.n('health', H, 'decision.health.total');
  f.s('reportCadence', prefs.reportCadence, 'alert preferences: reportCadence');

  // Same three rules as PageAlerts.
  const signals = [
    prefs.healthAlert && H < healthLimit ? `Business health is below ${formatCount(healthLimit)}` : null,
    prefs.qualityAlert && Q < qualityLimit ? `Data quality is below ${formatCount(qualityLimit)}` : null,
    prefs.revenueDropAlert && r.decision.risks.some(risk => /drop|variability|revenue/i.test(risk.title) && risk.level !== 'low') ? 'A material revenue movement requires review' : null,
  ].filter((signal): signal is string => signal !== null);
  const triggered = f.n('rulesTriggered', signals.length, 'alert rules evaluated against health, quality and risks');

  return compose(c, 'alerts', {
    happened: [
      [triggered ? `${pluralise(triggered, 'rule')} triggered: ${signals.join('; ')}.` : 'No limit is breached.'],
      [`Health ${formatCount(H)} vs limit ${formatCount(healthLimit)}; quality ${formatCount(Q)} vs limit ${formatCount(qualityLimit)}; brief: ${prefs.reportCadence}.`],
    ],
    next: triggered ? nextFromRecommendation(c, c.a1) : null,
  });
}
