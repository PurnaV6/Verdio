import { computeCategoryBreakdown } from "../../analysis/categoryBreakdown";
import { primaryMeasureColumn } from "../../analysis/pickColumns";
import { labelForMeasure } from "../../labels";
import { CONFIDENCE_THRESHOLDS } from "../confidence";
import { CANNOT_SHOW_WHY, cannotSay, compose, nextFromRecommendation, roleColumn, type Ctx } from "../context";
import { formatCount, formatPercent, formatPounds, fullMonthName, fullWeekdayName, pluralise } from "../formatters";
import type { StoryOutcome } from "../types";
import { joinNames, readRisk, recommendationMatching } from "./shared";

/* ── Scenario Planning ──
   Mirrors the arithmetic of PageScenarioPlanner (components/operational/OperationalPages.tsx).
   Keep the two in step; the page was left untouched on purpose. */

const ASSUMED_COST_SHARE = 0.55;

export interface ScenarioModel {
  measure: string | null;
  costColumn: string | undefined;
  baselineRevenue: number;
  baselineProfit: number;
  projectedProfit: number;
}

export function scenarioModel(c: Ctx): ScenarioModel {
  const { r } = c;
  const levers = c.inputs.scenarioLevers ?? { price: 0, volume: 0, cost: 0, retention: 0 };
  const measure = primaryMeasureColumn(r.semantics.columns, r.engineeredRows);
  const baselineRevenue = measure ? r.engineeredRows.reduce((sum, row) => sum + (Number(row[measure]) || 0), 0) : 0;
  const costColumn = r.semantics.columns.find(column => column.businessRole === 'cost')?.columnName;
  const baselineCost = costColumn ? r.engineeredRows.reduce((sum, row) => sum + (Number(row[costColumn]) || 0), 0) : baselineRevenue * ASSUMED_COST_SHARE;
  const projectedRevenue = baselineRevenue * (1 + levers.price / 100) * (1 + levers.volume / 100) * (1 + levers.retention / 100 * 0.35);
  const projectedCost = baselineCost * (1 + levers.volume / 100) * (1 + levers.cost / 100);
  return { measure, costColumn, baselineRevenue, baselineProfit: baselineRevenue - baselineCost, projectedProfit: projectedRevenue - projectedCost };
}

export function scenariosStory(c: Ctx): StoryOutcome {
  const { f } = c;
  const model = scenarioModel(c);
  // primaryMeasureColumn falls back to a quantity column; units are not pounds, so that is not a sales amount.
  const measureRole = c.r.semantics.columns.find(column => column.columnName === model.measure)?.businessRole;
  if (!model.measure || !model.baselineRevenue || measureRole === 'quantity') {
    return cannotSay(c, 'scenarios', "I can't model this without a sales amount column.", 'Map a numeric sales field in Data Hub.');
  }
  const baseline = formatPounds(f.n('baselineProfit', model.baselineProfit, 'scenario baseline: sales total minus cost'));
  const projected = formatPounds(f.n('projectedProfit', model.projectedProfit, 'scenario projection from the levers'));
  const diffValue = f.n('profitChange', model.projectedProfit - model.baselineProfit, 'projectedProfit minus baselineProfit');
  const diff = Math.round(diffValue) > 0 ? `+${formatPounds(diffValue)}` : formatPounds(diffValue);

  const notes: string[] = [];
  const levers = c.inputs.scenarioLevers;
  if (!levers || Object.values(levers).every(value => value === 0)) notes.push('No levers are changed yet, so the projection matches today.');
  let forceLow: { reason: string; missing: string } | undefined;
  if (!model.costColumn) {
    const share = f.n('assumedCostSharePct', ASSUMED_COST_SHARE * 100, 'PageScenarioPlanner: cost = sales x 0.55 when there is no cost column');
    notes.unshift(`Cost is assumed at ${formatCount(share)}% of sales since the file has no cost column.`);
    forceLow = { reason: 'Cost is assumed, not measured', missing: 'a cost column' };
  }

  return compose(c, 'scenarios', {
    happened: [[`With your changes, projected contribution is ${projected} against ${baseline} today, a change of ${diff}.`]],
    why: [['This is an illustration, so it has no driver to explain.']],
    next: null, notes, forceLow,
    columns: [model.measure, model.costColumn],
    calculatedSales: !c.semNames.has(model.measure),
  });
}

/* ── Customer Intelligence ── */

const SEGMENT_NAMES = [
  ['champion', 'champion'], ['loyal', 'loyal'], ['atRisk', 'at risk'], ['new', 'new'], ['lost', 'lost'],
] as const;

export function customersStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const seg = r.ml.segmentation;
  if (!seg || !seg.segments.length) {
    const missing = [
      roleColumn(c, 'customer') ? null : 'customer',
      roleColumn(c, 'date') ? null : 'date',
      roleColumn(c, 'revenue') || roleColumn(c, 'price') || roleColumn(c, 'cost') ? null : 'amount',
    ].filter((name): name is string => !!name);
    return cannotSay(
      c, 'customers',
      missing.length ? `Customer analysis needs a customer, date and amount column. Missing: ${missing.join(', ')}.` : 'Customer analysis found no customers to score in this file.',
      missing.length ? `Map a ${joinNames(missing)} column in Data Hub.` : 'Check the customer column in Data Hub.',
    );
  }
  const total = f.n('customerCount', seg.segments.length, 'ml.segmentation.segments.length');
  const column = f.s('customerColumn', seg.customerColumn, 'ml.segmentation.customerColumn');
  const churn = f.n('churnRiskScore', seg.churnRiskScore, 'ml.segmentation.churnRiskScore');
  const lowScorers = f.n('lowScoringCustomers', seg.segments.filter(s => s.segment === 'atRisk' || s.segment === 'lost').length, 'ml.segmentation.segments[].segment (atRisk + lost)');
  const atRisk = formatPounds(f.n('revenueAtRisk', seg.revenueAtRisk, 'ml.segmentation.revenueAtRisk'));

  const counts = SEGMENT_NAMES.map(([key, name]) => `${formatCount(f.n(`segment_${key}`, seg.segments.filter(s => s.segment === key).length, `ml.segmentation.segments[].segment = ${key}`))} ${name}`);
  const notes = total >= 500 ? [`Only the first ${formatCount(f.n('customerScoringCap', 500, 'segmentationEngine keeps 500 customers'))} customers are scored.`] : [];
  const rec = c.recs.find(item => item.sourceColumns?.includes(seg.customerColumn));

  return compose(c, 'customers', {
    happened: [[`${pluralise(total, 'customer')} in ${column}; churn risk is ${formatCount(churn)}/100.`], [`${formatCount(lowScorers)} score low on spend, orders and recent activity, with about ${atRisk} of spend at risk.`]],
    why: [[`By segment: ${counts.join(', ')}.`]],
    next: nextFromRecommendation(c, rec),
    notes,
    columns: [seg.customerColumn, seg.dateColumn, seg.measureColumn],
    calculatedSales: !c.semNames.has(seg.measureColumn),
    customers: total,
  });
}

/* ── Seasonality ── */

export function seasonalityStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const seasonality = r.statistics.seasonality;
  const minRows = CONFIDENCE_THRESHOLDS.minRows;
  if (!seasonality || c.N < minRows) {
    f.n('minRows', minRows, 'detectCapabilities (seasonality needs 30 rows)');
    return cannotSay(c, 'seasonality', `Seasonality needs a date, an amount and at least ${formatCount(minRows)} rows.`, `Add a date column and a sales amount column, with at least ${formatCount(minRows)} rows.`);
  }
  const months = seasonality.byMonthOfYear;
  if (c.P < CONFIDENCE_THRESHOLDS.fullYearMonths || months.some(month => month.count === 0)) {
    return cannotSay(c, 'seasonality', 'Months are not all covered, so peaks may be misleading.', 'Add data that covers every month of the year.');
  }
  const sum = months.reduce((total, month) => total + month.value, 0);
  const days = seasonality.byDayOfWeek.filter(day => day.count > 0);
  if (!(sum > 0) || !days.length) {
    return cannotSay(c, 'seasonality', 'Seasonality needs positive sales amounts across the year.', 'Check the sales amount column in Data Hub.');
  }
  const peak = months.reduce((best, month) => (month.value > best.value ? month : best));
  const low = months.reduce((best, month) => (month.value < best.value ? month : best));
  const busiest = days.reduce((best, day) => (day.value > best.value ? day : best));
  f.s('peakMonth', peak.label, 'statistics.seasonality.byMonthOfYear (largest value)');
  f.s('lowestMonth', low.label, 'statistics.seasonality.byMonthOfYear (smallest value)');
  f.s('busiestWeekday', busiest.label, 'statistics.seasonality.byDayOfWeek (largest value)');
  const peakPct = f.n('peakMonthSharePct', (peak.value / sum) * 100, 'byMonthOfYear peak value / sum of byMonthOfYear');
  const lowPct = f.n('lowestMonthSharePct', (low.value / sum) * 100, 'byMonthOfYear lowest value / sum of byMonthOfYear');

  return compose(c, 'seasonality', {
    happened: [
      [`Sales peak in ${fullMonthName(peak.label)} (${formatPercent(peakPct)} of the total) and are lowest in ${fullMonthName(low.label)}.`],
      [`Busiest weekday: ${fullWeekdayName(busiest.label)}.`],
    ],
    why: [[`${fullMonthName(low.label)} brings ${formatPercent(lowPct)} of the total.`]],
    columns: [seasonality.dateColumn, seasonality.measureColumn],
    calculatedSales: !c.semNames.has(seasonality.measureColumn),
    timeBased: true,
  });
}

/* ── Products & Markets ── */

export function productsStory(c: Ctx): StoryOutcome {
  const { f, r } = c;
  const measure = primaryMeasureColumn(r.semantics.columns, r.engineeredRows);
  const productColumn = roleColumn(c, 'product');
  const rows = measure && productColumn ? computeCategoryBreakdown(r.engineeredRows, productColumn, measure) : [];
  if (!measure || !productColumn || !rows.length) {
    return cannotSay(c, 'products', 'No product column or amount column found.', 'Map a product column and a sales amount column in Data Hub.');
  }
  const top = rows[0];
  const label = f.s('topProduct', top.label, 'computeCategoryBreakdown()[0].label');
  const topPct = f.n('topProductSharePct', top.pct, 'computeCategoryBreakdown()[0].pct');
  const measureName = f.s('measureName', labelForMeasure(measure), 'primaryMeasureColumn');

  const happened: string[][] = [[`${label} brings ${formatPercent(topPct)} of ${measureName}.`]];
  if (rows.length > 3) {
    // Summed from the values, not from the rounded shares, so the total never drifts by 0.1.
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const topThree = total > 0 ? f.n('topThreeSharePct', (rows.slice(0, 3).reduce((sum, row) => sum + row.value, 0) / total) * 100, 'computeCategoryBreakdown()[0..2].value / total') : null;
    if (topThree !== null) happened.push([`The top three bring ${formatPercent(topThree)}.`]);
  }

  const risk = c.risks.find(item => /concentration|diversification/i.test(item.title) && item.sourceColumns.includes(productColumn));
  const why = risk ? [[readRisk(c, risk).first]] : [[CANNOT_SHOW_WHY]];
  const next = topPct >= 60 ? nextFromRecommendation(c, recommendationMatching(c, /^reduce concentration risk$/i)) : null;

  return compose(c, 'products', { happened, why, next, columns: [productColumn, measure], calculatedSales: !c.semNames.has(measure) });
}

/* ── Health Detail ── */

const PILLAR_ACTIONS: Record<string, RegExp> = {
  'Data Quality': /data collection/i,
  'Customer Strength': /loyalty|retention|re-engage|churn/i,
  'Performance Trend': /growth/i,
};

export function healthStory(c: Ctx): StoryOutcome {
  const { f, r, H } = c;
  const pillars = r.decision.health.pillars;
  if (!pillars.length) return cannotSay(c, 'health', 'The health score has no parts to show.', 'Run the analysis again.');
  f.n('health', H, 'decision.health.total');

  const seg = r.ml.segmentation;
  const assumed = new Set<string>();
  if (!(c.ts && c.ts.points.length > 1)) assumed.add('Performance Trend');
  if (!(c.ts && c.ts.points.length > 2)) assumed.add('Stability');
  if (!(seg && seg.segments.length)) assumed.add('Customer Strength');

  const read = (pillar: typeof pillars[number], key: string) => ({
    name: f.s(`${key}Name`, pillar.name, 'decision.health.pillars[].name'),
    score: f.n(`${key}Score`, pillar.score, 'decision.health.pillars[].score'),
    max: f.n(`${key}Max`, pillar.max, 'decision.health.pillars[].max'),
  });
  const strongest = pillars.reduce((best, pillar) => (pillar.score > best.score ? pillar : best));
  const weakest = pillars.reduce((best, pillar) => (pillar.score < best.score ? pillar : best));
  const strong = read(strongest, 'strongest');
  const weak = read(weakest, 'weakest');
  const second = strongest.score === weakest.score
    ? `All ${formatCount(f.n('pillarCount', pillars.length, 'decision.health.pillars.length'))} parts score ${formatCount(strong.score)}/${formatCount(strong.max)}.`
    : `Strongest: ${strong.name} (${formatCount(strong.score)}/${formatCount(strong.max)}), weakest: ${weak.name} (${formatCount(weak.score)}/${formatCount(weak.max)}).`;

  const assumedSentences = pillars.filter(pillar => assumed.has(pillar.name)).map(pillar => `${pillar.name} is assumed, not measured.`);
  const action = PILLAR_ACTIONS[weakest.name];

  return compose(c, 'health', {
    happened: [[`Health is ${formatCount(H)}/100.`], [second]],
    // The first two sit in "why"; any further ones go to notes (below).
    why: assumedSentences.length ? assumedSentences.map((sentence, i) => (i < 2 ? [sentence] : [sentence, ''])) : undefined,
    notes: assumedSentences.slice(2),
    next: action ? nextFromRecommendation(c, recommendationMatching(c, action)) : null,
    columns: [c.ts?.dateColumn, c.ts?.measureColumn, seg?.customerColumn],
    calculatedSales: !!c.ts && !c.semNames.has(c.ts.measureColumn),
  });
}
