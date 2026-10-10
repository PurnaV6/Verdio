import { CANNOT_SHOW_WHY, cannotSay, compose, type Ctx } from "../context";
import { formatCount, formatPounds, pluralise } from "../formatters";
import { LIMITS, asSentence, fitPart } from "../text";
import type { ApprovalInput, KpiTargetInput, OutcomeInput, StoryOutcome, StoryPageId, TrackedActionInput } from "../types";

/* ================================================================
   Execution hub (Actions, KPI Targets, Outcomes, Approvals) and
   Governance hub (Evidence, Models, Team, Audit, Trust).

   When the page state is not passed in, the defaults below are the
   same starting values the pages build from the PipelineResult
   (components/execution/ExecutionPages.tsx), so counts match the UI
   before anyone edits anything.
   ================================================================ */

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-10-15" -> "15 Oct 2026"; anything that is not an ISO day is returned unchanged. */
function dayText(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match && MONTH_ABBR[Number(match[2]) - 1] ? `${Number(match[3])} ${MONTH_ABBR[Number(match[2]) - 1]} ${match[1]}` : iso;
}

function today(c: Ctx): string {
  return isoDay(c.inputs.today ?? new Date());
}

function actionsFor(c: Ctx): TrackedActionInput[] {
  if (c.inputs.actions) return c.inputs.actions;
  const now = c.inputs.today ?? new Date();
  return c.recs.slice(0, 5).map((rec, index) => {
    const due = new Date(now);
    due.setDate(due.getDate() + (rec.urgency === 'immediate' ? 7 : rec.urgency === 'this_month' ? 30 : 60));
    return { title: rec.title, status: index === 0 ? 'in_progress' : 'planned', dueDate: isoDay(due) };
  });
}

function targetsFor(c: Ctx): KpiTargetInput[] {
  if (c.inputs.targets) return c.inputs.targets;
  const { r } = c;
  const growth = Number(r.decision.health.pillars.find(item => /growth/i.test(item.name))?.score || 0);
  const forecastConfidence = Math.round((c.modelMeta?.forecast?.confidence || 0) * 100);
  return [
    { label: 'Business health', current: c.H, target: Math.min(100, Math.max(75, c.H + 10)), unit: '/100', direction: 'up' },
    { label: 'Data quality', current: c.Q, target: Math.min(100, Math.max(90, c.Q + 5)), unit: '/100', direction: 'up' },
    { label: 'Growth pillar', current: growth, target: Math.min(25, Math.max(18, growth + 4)), unit: '/25', direction: 'up' },
    { label: 'Forecast confidence', current: forecastConfidence, target: Math.min(100, Math.max(80, forecastConfidence + 8)), unit: '%', direction: 'up' },
  ];
}

function outcomesFor(c: Ctx): OutcomeInput[] {
  return c.inputs.outcomes ?? c.recs.slice(0, 5).map(rec => ({ decision: rec.title, expected: rec.financialImpact?.estimatedValue || 0, actual: '' }));
}

function approvalsFor(c: Ctx): ApprovalInput[] {
  return c.inputs.approvals ?? c.recs.slice(0, 5).map(rec => ({ decision: rec.title, state: 'pending' as const }));
}

/* ── Sentences ── */

function actionsPart(c: Ctx) {
  const { f } = c;
  const actions = actionsFor(c);
  const now = today(c);
  const overdue = actions.filter(action => action.status !== 'complete' && !!action.dueDate && action.dueDate < now);
  const completed = actions.filter(action => action.status === 'complete').length;
  const total = f.n('actionCount', actions.length, 'tracked actions');
  const sentence = `${formatCount(f.n('actionsComplete', completed, 'tracked actions with status complete'))}/${formatCount(total)} actions complete, ${formatCount(f.n('actionsOverdue', overdue.length, 'tracked actions with dueDate before today and not complete'))} overdue`;
  const focus = overdue[0] ?? actions.find(action => action.status !== 'complete');
  let next: string | null = null;
  if (focus) {
    const title = f.s('focusActionTitle', focus.title, 'tracked actions[].title');
    const due = focus.dueDate ? f.s('focusActionDue', dayText(focus.dueDate), 'tracked actions[].dueDate') : '';
    next = fitPart([[due ? `Complete ${title}, ${overdue[0] ? 'which was due' : 'due'} ${due}.` : '', `Complete ${title}.`].filter(Boolean)], LIMITS.next);
  }
  return { sentence, total, next };
}

function targetsPart(c: Ctx) {
  const { f } = c;
  const targets = targetsFor(c);
  const met = (item: KpiTargetInput) => (item.direction === 'up' ? item.current >= item.target : item.current <= item.target);
  const onTrack = targets.filter(met).length;
  const sentence = `${formatCount(f.n('targetsMet', onTrack, 'KPI targets met'))} of ${pluralise(f.n('targetCount', targets.length, 'KPI targets'), 'target')} met`;
  const gap = targets.find(item => !met(item));
  let next: string | null = null;
  if (gap) {
    const label = f.s('gapTargetLabel', gap.label, 'KPI targets[].label');
    const unitScale = Number(gap.unit.replace(/[^\d.]/g, ''));
    if (Number.isFinite(unitScale) && /\d/.test(gap.unit)) f.n('gapTargetUnitScale', unitScale, 'KPI targets[].unit');
    const unit = gap.unit === '%' ? '%' : gap.unit;
    const current = formatCount(f.n('gapTargetCurrent', gap.current, 'KPI targets[].current'));
    const target = formatCount(f.n('gapTargetValue', gap.target, 'KPI targets[].target'));
    next = fitPart([[`Close the gap on ${label}: ${current}${unit} now, against a target of ${target}${unit}.`, `Close the gap on ${label}.`]], LIMITS.next);
  }
  return { sentence, total: targets.length, next };
}

function approvalsPart(c: Ctx) {
  const { f } = c;
  const approvals = approvalsFor(c);
  const count = (state: ApprovalInput['state']) => approvals.filter(item => item.state === state).length;
  const declined = count('declined');
  const sentence = `Approved: ${formatCount(f.n('approvedCount', count('approved'), 'approvals with state approved'))}; pending: ${formatCount(f.n('pendingCount', count('pending'), 'approvals with state pending'))}${declined ? `; declined: ${formatCount(f.n('declinedCount', declined, 'approvals with state declined'))}` : ''}`;
  const waiting = approvals.find(item => item.state === 'pending');
  const next = waiting ? fitPart([[`Review ${f.s('pendingDecisionTitle', waiting.decision, 'approvals[].decision')} and record a decision.`, 'Review the pending decisions and record each one.']], LIMITS.next) : null;
  return { sentence, total: approvals.length, next };
}

function outcomesPart(c: Ctx) {
  const { f } = c;
  const recorded = outcomesFor(c).filter(item => item.actual.trim() !== '' && Number.isFinite(Number(item.actual)));
  if (!recorded.length) {
    return { sentence: "No results recorded yet, so I can't say whether decisions paid off.", recorded: 0, next: 'Record the result of each approved decision to see whether it paid off.' };
  }
  const actual = formatPounds(f.n('actualTotal', recorded.reduce((sum, item) => sum + Number(item.actual), 0), 'outcomes[].actual (your entries)'));
  // Compared with the expected value of the same decisions, so the two totals are like for like.
  const expected = formatPounds(f.n('expectedTotal', recorded.reduce((sum, item) => sum + item.expected, 0), 'outcomes[].expected for decisions with a recorded result'));
  return { sentence: `Recorded outcomes: ${actual} against ${expected} expected (your entries).`, recorded: recorded.length, next: null };
}

/* ── Execution hub ── */

export function executionStory(c: Ctx, pageId: StoryPageId): StoryOutcome {
  switch (pageId) {
    case 'actions': {
      const actions = actionsPart(c);
      if (!actions.total) return cannotSay(c, pageId, 'There are no actions to track yet.', 'Run an analysis that produces recommendations.');
      return compose(c, pageId, { happened: [[`${actions.sentence}.`]], next: actions.next });
    }
    case 'targets': {
      const targets = targetsPart(c);
      if (!targets.total) return cannotSay(c, pageId, 'There are no KPI targets yet.', 'Set a target for a measure on the KPI Targets tab.');
      return compose(c, pageId, { happened: [[`${targets.sentence}.`]], next: targets.next });
    }
    case 'outcomes': {
      const outcomes = outcomesPart(c);
      return compose(c, pageId, { happened: [[outcomes.sentence]], next: outcomes.next });
    }
    case 'approvals': {
      const approvals = approvalsPart(c);
      if (!approvals.total) return cannotSay(c, pageId, 'There are no decisions waiting for approval.', 'Run an analysis that produces recommendations.');
      return compose(c, pageId, { happened: [[`${approvals.sentence}.`]], next: approvals.next });
    }
    default: {
      const actions = actionsPart(c);
      if (!actions.total) return cannotSay(c, 'execution', 'There are no actions to track yet.', 'Run an analysis that produces recommendations.');
      const targets = targetsPart(c);
      const approvals = approvalsPart(c);
      const outcomes = outcomesPart(c);
      return compose(c, 'execution', {
        happened: [[targets.total ? `${actions.sentence}; ${targets.sentence}.` : `${actions.sentence}.`], [approvals.total ? `${approvals.sentence}.` : '', '']],
        next: actions.next,
        notes: [outcomes.sentence],
      });
    }
  }
}

/* ── Governance hub ── */

export function evidenceStory(c: Ctx, pageId: 'evidence' | 'governance'): StoryOutcome {
  const { f, r } = c;
  const columns = r.semantics.columns;
  const reviewed = f.n('columnsConfirmed', columns.filter(column => !column.needsReview).length, 'semantics.columns[].needsReview = false');
  const total = f.n('columnsTotal', columns.length, 'semantics.columns.length');
  const received = f.n('rowsReceived', r.cleaning.rowsBefore, 'cleaning.rowsBefore');
  const kept = f.n('rowsKept', r.cleaning.rowsAfter, 'cleaning.rowsAfter');
  const filled = f.n('cellsFilled', r.cleaning.cellsImputed, 'cleaning.cellsImputed');
  return compose(c, pageId, {
    happened: [[`${formatCount(received)} rows received, ${formatCount(kept)} kept, ${formatCount(filled)} cells filled, ${formatCount(reviewed)}/${formatCount(total)} columns confirmed.`]],
  });
}

export function modelsStory(c: Ctx): StoryOutcome {
  const { f } = c;
  const entries = [
    { label: 'For the forecast', key: 'forecast', meta: c.modelMeta?.forecast },
    { label: 'For anomalies', key: 'anomaly', meta: c.modelMeta?.anomaly },
  ].filter(entry => entry.meta && entry.meta.chosenModel);
  if (!entries.length) {
    return cannotSay(c, 'models', 'No forecast or anomaly model ran on this file.', 'Add dated sales covering several months.');
  }
  const sentences = entries.map(({ label, key, meta }) => {
    const model = f.s(`${key}Model`, String(meta!.chosenModel).replaceAll('_', ' '), `_modelMeta.${key}.chosenModel`);
    const fit = formatCount(f.n(`${key}ModelFitPct`, Math.round(meta!.confidence * 100), `_modelMeta.${key}.confidence x 100 (model suitability)`));
    return `${label}, ${model} was chosen for fit to the data's shape (${fit}%).`;
  });
  const reason = entries[0].meta!.reason;
  return compose(c, 'models', {
    happened: sentences.map(sentence => [sentence]),
    why: reason ? [[asSentence(f.s('modelReason', reason, `_modelMeta.${entries[0].key}.reason`))]] : [[CANNOT_SHOW_WHY]],
    next: null,
  });
}

export function organisationCountStory(c: Ctx, pageId: 'team' | 'audit'): StoryOutcome {
  const { f } = c;
  const count = pageId === 'team' ? c.inputs.teamMembers : c.inputs.auditEvents;
  if (count === undefined || !Number.isFinite(count)) {
    return cannotSay(c, pageId, `${pageId === 'team' ? 'Team' : 'Audit'} numbers come from your organisation account, which is not loaded here.`, 'Sign in to an organisation account to see them.');
  }
  const sentence = pageId === 'team'
    ? `${pluralise(f.n('teamMembers', count, 'organisation members'), 'person', 'people')} in your team.`
    : `${pluralise(f.n('auditEvents', count, 'organisation audit events'), 'event')} recorded in your audit log.`;
  return compose(c, pageId, { happened: [[sentence]], next: null });
}

export function trustStory(c: Ctx): StoryOutcome {
  return cannotSay(c, 'trust', 'The Trust Center is fixed text, so there is no data story for it.', 'Open the Evidence tab for the record of how this file was processed.');
}
