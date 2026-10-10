import { healthReading } from "../../analysis/healthReading";
import { getRevenueView } from "../../analysis/revenueView";
import { runForecast } from "../../ml/forecastEngine";
import { CONFIDENCE_THRESHOLDS } from "../confidence";
import {
  CANNOT_SAY_HOW_SALES_MOVE, NO_EARLIER_MONTH, cannotSay, compose, firstUnavailableReason, nextFromRecommendation, roleColumn, salesMove,
  type Ctx,
} from "../context";
import { formatCount, formatPercent, formatPounds, pluralise } from "../formatters";
import { asSentence } from "../text";
import type { StoryOutcome } from "../types";
import { joinNames, readRisk, reasonText, recommendationForRisk, recommendationMatching } from "./shared";

/** anomalyEngine flags months beyond this many standard deviations from the series mean. */
const ANOMALY_Z = 1.8;

/* ── Overview ── */

export function overviewStory(c: Ctx): StoryOutcome {
  const { f, r, H, N, file } = c;
  const reading = healthReading(f.n('health', H, 'decision.health.total'));
  const health = `Business health is ${formatCount(H)}/100 (${f.s('healthLabel', reading.label, 'healthReading(health).label')})`;
  const rows = `from ${formatCount(N)} rows in ${file}`;

  const view = getRevenueView(r);
  const series = view.series;
  const move = series ? salesMove(c, series.points, `statistics.timeSeries[${series.measureColumn}]`) : null;

  let happened: string[][];
  if (!move) {
    happened = [[`${health} ${rows}.`, `${health}.`], [CANNOT_SAY_HOW_SALES_MOVE]];
  } else if (move.noEarlierMonth) {
    // One sentence for health and sales, so the cannot-say sentence still fits the two-sentence limit.
    happened = [[`${health} ${rows}, and sales were ${move.clause}.`, `${health}, and sales were ${move.clause}.`], [NO_EARLIER_MONTH]];
  } else {
    happened = [[`${health} ${rows}.`, `${health}.`], [`Sales were ${move.clause}.`]];
  }

  let why: string[][];
  if (c.r1) {
    const risk = readRisk(c, c.r1);
    const lead = risk.level === 'low' ? `No high or medium risk was found; the leading item is ${risk.title}` : `Biggest risk: ${risk.title}`;
    why = [
      [...(risk.columns.length ? [`${lead}, drawn from ${joinNames(risk.columns)}.`] : []), `${lead}.`],
      [risk.first, ''],
    ];
  } else {
    const reason = firstUnavailableReason(c);
    why = [[reason ? `The risk checks could not run on this file: ${f.s('capabilityReason', reasonText(reason), 'capabilities.capabilities[].reason')}.` : 'No risks were found in this file.']];
  }

  return compose(c, 'overview', {
    happened, why, next: nextFromRecommendation(c, c.a1),
    columns: [view.revenueColumn, series?.measureColumn, series?.dateColumn],
    calculatedSales: !!series && !c.semNames.has(series.measureColumn),
    timeBased: true,
  });
}

/* ── Revenue ── */

export function revenueStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const view = getRevenueView(r);
  if (!view.revenueColumn && view.connectedRevenue === undefined) {
    return cannotSay(c, 'revenue', 'Revenue data is not available.', 'Map a numeric sales field in Data Hub.');
  }
  const series = view.series;
  const total = formatPounds(f.n('totalSales', view.total, 'getRevenueView().total'));
  const move = series ? salesMove(c, series.points, `statistics.timeSeries[${series.measureColumn}]`) : null;

  const forecast = view.revenueForecast;
  const forecastSentence = forecast
    ? `Next month is expected near ${formatPounds(f.n('nextMonthExpected', forecast.holtNextPeriod, 'ml.forecast.holtNextPeriod'))} (${f.s('forecastScenario', forecast.scenario, 'ml.forecast.scenario')} case).`
    : '';

  const notes: string[] = [];
  let happened: string[][];
  if (!move) {
    happened = [[`Total sales in your file are ${total}.`], [CANNOT_SAY_HOW_SALES_MOVE]];
  } else if (move.noEarlierMonth) {
    happened = [[`Total sales in your file are ${total}; sales were ${move.clause}.`], [NO_EARLIER_MONTH]];
    if (forecastSentence) notes.push(forecastSentence);
  } else {
    happened = [[`Total sales in your file are ${total}; sales were ${move.clause}.`], [forecastSentence, '']];
  }

  // Why: only a computed driver, namely anomaly months or the variability risk.
  const anomalies = r.ml.anomalies && series && r.ml.anomalies.measureColumn === series.measureColumn
    ? r.ml.anomalies.points.filter(point => point.isAnomaly) : [];
  const variability = r.decision.risks.find(risk => /variab/i.test(risk.title) && risk.level !== 'low');
  const why: string[][] = [];
  if (anomalies.length) {
    const shown = anomalies.slice(0, 3).map((point, i) => f.s(`anomalyPeriod${i + 1}`, point.periodLabel, 'ml.anomalies.points[].periodLabel'));
    const others = anomalies.length - shown.length;
    f.n('anomalyZThreshold', ANOMALY_Z, 'anomalyEngine Z_THRESHOLD');
    const list = others > 0 ? `${shown.join(', ')} and ${pluralise(f.n('anomalyOtherCount', others, 'ml.anomalies.points[].isAnomaly'), 'other month')}` : joinNames(shown);
    why.push([`${list} ${shown.length === 1 && others === 0 ? 'was' : 'were'} more than ${ANOMALY_Z} standard deviations from the average month.`]);
  }
  if (variability) why.push([readRisk(c, variability).first, '']);

  const next = (variability ? recommendationForRisk(c, variability.title) : undefined)
    ?? recommendationMatching(c, /^(validate near-term growth scenario|accelerate growth)$/i);

  return compose(c, 'revenue', {
    happened, why: why.length ? why : undefined, next: nextFromRecommendation(c, next), notes,
    columns: [view.revenueColumn, series?.dateColumn],
    timeBased: true,
  });
}

/* ── Intelligence ── */

export function analysesStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const top = r.analyses[0];
  if (!top) {
    const reason = firstUnavailableReason(c);
    return cannotSay(
      c, 'analyses',
      reason ? `No analysis could be built: ${f.s('capabilityReason', reasonText(reason), 'capabilities.capabilities[].reason')}.` : 'No analysis could be built from this file.',
      'Add a date column and a sales amount column in Data Hub.',
    );
  }
  const ran = f.n('checksRun', r.capabilities.available.length, 'capabilities.available.length');
  const total = f.n('checksTotal', r.capabilities.capabilities.length, 'capabilities.capabilities.length');
  const title = f.s('analysisTitle', top.title, 'analyses[0].title');
  const explanation = f.s('analysisExplanation', top.explanation, 'analyses[0].explanation');
  const capability = r.capabilities.capabilities.find(item => item.type === top.capability);
  return compose(c, 'analyses', {
    happened: [[`Verd.io ran ${formatCount(ran)} of ${formatCount(total)} checks your file supports; strongest finding: ${title}.`], [explanation, '']],
    next: nextFromRecommendation(c, c.a1),
    columns: capability?.columns ?? [],
  });
}

/* ── Predictions ── */

export function forecastStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const forecast = r.ml.forecast;
  if (!forecast || !forecast.points.length) {
    const min = f.n('minMonthsForForecast', CONFIDENCE_THRESHOLDS.minMonthsForForecast, 'detectCapabilities MIN_MONTHS_FOR_FORECAST');
    const dateColumn = roleColumn(c, 'date');
    const months = dateColumn ? (r.profile.columns.find(column => column.name === dateColumn)?.dateStats?.distinctMonths ?? 0) : 0;
    const have = dateColumn ? `Your file has ${pluralise(f.n('distinctMonths', months, 'profile.columns[date].dateStats.distinctMonths'), 'month')}.` : 'Your file has no date column.';
    return cannotSay(c, 'forecast', `A forecast needs at least ${formatCount(min)} months of dated sales. ${have}`, `Add dated sales covering at least ${formatCount(min)} months.`);
  }

  const series = r.statistics.timeSeries.find(item => item.measureColumn === forecast.measureColumn);
  const scenario = c.inputs.forecastScenario ?? forecast.scenario;
  // Same as the page: another scenario is the forecast engine re-run on the series.
  const shown = scenario !== forecast.scenario && series ? runForecast(series, scenario) : forecast;
  const first = shown.points[0];
  const at = 'ml.forecast';

  const label = f.s('nextPeriodLabel', first.periodLabel, `${at}.points[0].periodLabel`);
  const expected = formatPounds(f.n('nextMonthExpected', shown.holtNextPeriod, `${at}.holtNextPeriod`));
  const low = formatPounds(f.n('rangeLow', first.low, `${at}.points[0].low`));
  const high = formatPounds(f.n('rangeHigh', first.high, `${at}.points[0].high`));
  const scenarioName = f.s('forecastScenario', shown.scenario, `${at}.scenario`);
  const trend = f.n('monthlyTrendPct', shown.monthlyTrendPct, `${at}.monthlyTrendPct`);
  const months = pluralise(c.P, 'month');

  const trendSentence = trend > 0 ? `Sales are rising about ${formatPercent(trend)} a month, based on ${months}.`
    : trend < 0 ? `Sales are falling about ${formatPercent(Math.abs(trend))} a month, based on ${months}.`
    : `The model finds no steady monthly trend, based on ${months}.`;
  const why = trend === 0 ? undefined
    : [[`The trend line fitted to ${months} slopes ${trend > 0 ? 'up' : 'down'} by ${formatPercent(Math.abs(trend))} of the latest month.`]];

  return compose(c, 'forecast', {
    happened: [[`Next month (${label}) we expect about ${expected}, within a planning range of ${low}-${high} (${scenarioName}).`], [trendSentence]],
    why,
    next: nextFromRecommendation(c, recommendationMatching(c, /forecast|growth/i) ?? c.a1),
    columns: [forecast.measureColumn, series?.dateColumn],
    timeBased: true,
  });
}

/* ── Risks & Opportunities ── */

export function risksStory(c: Ctx): StoryOutcome {
  const { f, risks } = c;
  if (!risks.length) {
    const reasons = c.r.capabilities.capabilities.filter(item => !item.available).slice(0, 2)
      .map((item, i) => f.s(`capabilityReason${i + 1}`, reasonText(item.reason), 'capabilities.capabilities[].reason'));
    return cannotSay(c, 'risks', reasons.length ? `No risk checks could run: ${reasons.join('; ')}.` : 'No risk checks found anything in this file.', 'Add a date column, a sales amount column and a customer column in Data Hub.');
  }
  const count = (level: string) => risks.filter(risk => risk.level === level).length;
  const high = f.n('highRisks', count('high'), 'decision.risks[].level');
  const medium = f.n('mediumRisks', count('medium'), 'decision.risks[].level');
  const low = f.n('lowRisks', count('low'), 'decision.risks[].level');
  const total = f.n('riskCount', risks.length, 'decision.risks.length');

  const risk = readRisk(c, risks[0]);
  const summary = `${pluralise(total, 'risk')} found: ${formatCount(high)} high, ${formatCount(medium)} medium, ${formatCount(low)} low`;
  const lead = risk.level === 'low' ? `Nothing high or medium was found; the leading item is ${risk.title}.` : `Most serious: ${risk.title}.`;
  const notes = low > 0 ? [`${pluralise(low, 'low-level item')} ${low === 1 ? 'is' : 'are'} counted as good news.`] : [];

  return compose(c, 'risks', {
    happened: [[`${summary}.`], [lead]],
    why: [[risk.desc, risk.first]],
    next: nextFromRecommendation(c, recommendationForRisk(c, risks[0].title)),
    notes,
    columns: risk.columns,
  });
}

/* ── Decisions ── */

export function recsStory(c: Ctx): StoryOutcome {
  const { f, recs } = c;
  const top = c.a1;
  if (!top) {
    return cannotSay(c, 'recs', 'No actions could be ranked from this file.', 'Check the columns in Data Hub, then run the analysis again.');
  }
  const count = pluralise(f.n('actionCount', recs.length, 'decision.recommendations.length'), 'action');
  const title = f.s('actionTitle', top.title, 'decision.recommendations[0].title');
  const impact = top.financialImpact;
  const atRisk = c.vde && c.vde.totalValueAtRisk > 0 ? f.n('totalValueAtRisk', c.vde.totalValueAtRisk, '_vdeMeta.totalValueAtRisk') : null;
  const when = { immediate: 'immediately', this_month: 'this month', this_quarter: 'this quarter' }[top.urgency];
  if (top.urgency) f.s('actionUrgency', top.urgency, 'decision.recommendations[0].urgency');

  const happenedFirst = atRisk !== null
    ? [`${count} ranked, with ${formatPounds(atRisk)} at risk in total (planning estimate).`, `${count} ranked, with ${formatPounds(atRisk)} at risk in total.`, `${count} ranked.`]
    : [`${count} ranked.`];
  const days = Number.isFinite(top.effortDays) ? pluralise(f.n('effortDays', top.effortDays, 'decision.recommendations[0].effortDays'), 'day') : null;
  const needed = when ? `, needed ${when}` : '';
  const effort = days ? `, about ${days}` : '';
  const second: string[] = [];
  if (impact && Number.isFinite(impact.estimatedValue)) {
    const value = formatPounds(f.n('actionEstimate', impact.estimatedValue, 'decision.recommendations[0].financialImpact.estimatedValue'));
    const range = Number.isFinite(impact.rangeLow) && Number.isFinite(impact.rangeHigh)
      ? ` (range ${formatPounds(f.n('rangeLow', impact.rangeLow, 'decision.recommendations[0].financialImpact.rangeLow'))}-${formatPounds(f.n('rangeHigh', impact.rangeHigh, 'decision.recommendations[0].financialImpact.rangeHigh'))})` : '';
    second.push(`Do first: ${title}, a planning estimate of about ${value}${range}${effort}${needed}.`);
    second.push(`Do first: ${title}, a planning estimate of about ${value}${effort}${needed}.`);
    second.push(`Do first: ${title}, a planning estimate of about ${value}${needed}.`);
  }
  second.push(`Do first: ${title}${needed}.`, `Do first: ${title}.`);

  const why: string[][] = [];
  if (impact?.basis) why.push([asSentence(f.s('impactBasis', impact.basis, 'decision.recommendations[0].financialImpact.basis'))]);
  const related = (top.relatedRiskTitles ?? []).map((name, i) => f.s(`relatedRisk${i + 1}`, name, 'decision.recommendations[0].relatedRiskTitles'));
  if (related.length) why.push([`Related risks: ${related.join(', ')}.`, `Related risk: ${related[0]}.`, '']);

  return compose(c, 'recs', {
    happened: [happenedFirst, second],
    why: why.length ? why : undefined,
    next: nextFromRecommendation(c, top),
    columns: top.sourceColumns,
  });
}

/* ── AI Advisor opening ── */

export function advisorStory(c: Ctx): StoryOutcome {
  const { f, H, N, Q, file } = c;
  f.n('health', H, 'decision.health.total');
  const ask = c.r1 ? `Ask me about ${f.s('riskTitle', c.r1.title, 'decision.risks[0].title')}.` : 'Ask me what the file says about sales, customers or data quality.';
  return compose(c, 'advisor', {
    happened: [[`I've read ${file}: ${formatCount(N)} rows, health ${formatCount(H)}/100, data quality ${formatCount(Q)}/100.`]],
    next: ask,
  });
}
