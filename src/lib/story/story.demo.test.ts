import { beforeAll, describe, expect, it } from "vitest";
import { PAGES } from "../../components/workspace/navigation";
import { getRevenueView } from "../analysis/revenueView";
import { computeCategoryBreakdown } from "../analysis/categoryBreakdown";
import { prepareOrganizationWorkspace } from "../organization/prepareOrganizationWorkspace";
import { runDataPipeline } from "../dataPipeline/runDataPipeline";
import { runForecast } from "../ml/forecastEngine";
import type { EnrichedRecommendation, VDEResult } from "../decision/verdioDecisionEngine";
import type { PipelineResult } from "../../types/pipeline";
import { buildStory } from "./buildStory";
import { STORY_PAGE_IDS, type CannotSayResult, type StoryInputs, type StoryOutcome, type StoryPageId, type StoryResult } from "./types";
import { demoResult, expectHealthy, salesCsv, resultFromCsv, storyText } from "./testkit";

/* These tests compute every expected value from the result itself, never from
   hard-coded demo numbers: the demo's segment counts change when the data does. */

const money = (value: number) => `£${Math.round(value).toLocaleString('en-GB')}`;
const percent = (value: number) => `${value.toFixed(1)}%`;
const INPUTS: StoryInputs = { teamMembers: 3, auditEvents: 12, today: new Date('2026-03-10T09:00:00Z') };

let demo: PipelineResult;
beforeAll(async () => { demo = await demoResult(); });

function story(pageId: StoryPageId, result: PipelineResult = demo, inputs: StoryInputs = INPUTS): StoryResult {
  const outcome = buildStory(pageId, result, inputs);
  if (outcome.kind !== 'story') throw new Error(`${pageId} gave a cannot-say: ${outcome.reason}`);
  return outcome;
}

describe('page coverage', () => {
  it('has a page id for every sidebar page and every hub tab', () => {
    for (const page of PAGES) expect(STORY_PAGE_IDS, page.id).toContain(page.id);
    for (const tab of ['revenue', 'actions', 'targets', 'outcomes', 'approvals', 'evidence', 'models', 'quality', 'team', 'audit', 'trust']) {
      expect(STORY_PAGE_IDS, tab).toContain(tab);
    }
  });

  it('answers every page for the demo workspace with a clean, bounded, fully backed story', () => {
    // Without a product column, an organisation or any text to show, three pages honestly say so.
    const cannotSayOnDemo = new Set<StoryPageId>(['products', 'relationships', 'trust']);
    for (const pageId of STORY_PAGE_IDS) {
      const outcome = buildStory(pageId, demo, INPUTS);
      expect(outcome.pageId).toBe(pageId);
      expectHealthy(outcome, pageId);
      expect(outcome.kind === 'cannotSay', pageId).toBe(cannotSayOnDemo.has(pageId));
    }
  });

  it('is deterministic', () => {
    for (const pageId of STORY_PAGE_IDS) expect(buildStory(pageId, demo, INPUTS)).toEqual(buildStory(pageId, demo, INPUTS));
  });

  it('does not change the result it reads', () => {
    const before = JSON.stringify(demo);
    for (const pageId of STORY_PAGE_IDS) buildStory(pageId, demo, INPUTS);
    expect(JSON.stringify(demo)).toBe(before);
  });
});

describe('Overview', () => {
  it('states health, rows, file, and sales movement computed from the series points', () => {
    const s = story('overview');
    const points = getRevenueView(demo).series!.points;
    const latest = points.at(-1)!, previous = points.at(-2)!;
    const pct = ((latest.value - previous.value) / Math.abs(previous.value)) * 100;
    expect(s.happened).toContain(`Business health is ${demo.decision.health.total}/100`);
    expect(s.happened).toContain(`from ${demo.source.rowCount.toLocaleString('en-GB')} rows in ${demo.source.fileName}`);
    expect(s.happened).toContain(`Sales were ${money(latest.value)} in ${latest.label}`);
    expect(s.happened).toContain(`${pct >= 0 ? 'up' : 'down'} ${percent(Math.abs(pct))} on ${previous.label}`);
    expect(s.facts.latestSales.value).toBe(latest.value);
    expect(s.facts.latestSalesChangePct.value).toBeCloseTo(pct, 9);
    expect(s.facts.health.value).toBe(demo.decision.health.total);
  });

  it('names the biggest risk and quotes its description and columns', () => {
    const s = story('overview');
    const risk = demo.decision.risks[0];
    expect(s.why).toContain(risk.title);
    expect(s.why).toContain(risk.desc.split(/(?<=\.)\s/)[0]);
    for (const column of risk.sourceColumns) expect(s.why).toContain(column);
  });

  it('takes the next step from the first recommendation, as a planning estimate', () => {
    const s = story('overview');
    const rec = demo.decision.recommendations[0] as EnrichedRecommendation;
    expect(s.next).toContain(rec.title);
    expect(s.next).toContain(`planning estimate of about ${money(rec.financialImpact.estimatedValue)}`);
    expect(s.next).toContain({ immediate: 'immediately', this_month: 'this month', this_quarter: 'this quarter' }[rec.urgency]);
  });

  it('lists only columns that exist in the semantics, and the row and month counts', () => {
    const s = story('overview');
    const columns = /Columns: (.*?)\. /.exec(s.source)![1].split(', ');
    const known = new Set(demo.semantics.columns.map(column => column.columnName));
    for (const column of columns) expect(known.has(column), column).toBe(true);
    expect(s.source).toContain(`${demo.source.rowCount.toLocaleString('en-GB')} rows`);
    expect(s.source).toContain(`${demo.statistics.timeSeries[0].points.length} months`);
  });
});

describe('Revenue', () => {
  it('states total sales, the latest month and the base-case forecast', () => {
    const s = story('revenue');
    const view = getRevenueView(demo);
    const total = demo.engineeredRows.reduce((sum, row) => sum + (Number(row[view.revenueColumn!]) || 0), 0);
    const latest = view.series!.points.at(-1)!;
    expect(s.happened).toContain(`Total sales in your file are ${money(total)}`);
    expect(s.happened).toContain(`${money(latest.value)} in ${latest.label}`);
    expect(s.happened).toContain(`Next month is expected near ${money(demo.ml.forecast!.holtNextPeriod)} (base case)`);
    expect(s.facts.totalSales.value).toBeCloseTo(total, 6);
  });

  it('gives a why only from anomaly months or the variability risk', () => {
    const s = story('revenue');
    const anomalies = demo.ml.anomalies!.points.filter(point => point.isAnomaly);
    if (anomalies.length) for (const point of anomalies.slice(0, 3)) expect(s.why).toContain(point.periodLabel);
    else expect(s.why).toBe('This file cannot show why.');
  });

  it('says the file cannot show why when there is neither', () => {
    const quiet = structuredClone(demo);
    quiet.ml.anomalies = null;
    quiet.decision.risks = quiet.decision.risks.filter(risk => !/variab/i.test(risk.title));
    expect(story('revenue', quiet).why).toBe('This file cannot show why.');
  });
});

describe('Predictions', () => {
  it('reads the forecast fields', () => {
    const s = story('forecast');
    const fc = demo.ml.forecast!;
    expect(s.happened).toContain(`Next month (${fc.points[0].periodLabel}) we expect about ${money(fc.holtNextPeriod)}`);
    expect(s.happened).toContain(`${money(fc.points[0].low)}-${money(fc.points[0].high)} (${fc.scenario})`);
    const trend = fc.monthlyTrendPct;
    expect(s.happened).toContain(`Sales are ${trend > 0 ? 'rising' : 'falling'} about ${percent(Math.abs(trend))} a month, based on ${demo.statistics.timeSeries[0].points.length} months`);
  });

  it('follows the scenario toggle', () => {
    const series = demo.statistics.timeSeries[0];
    for (const scenario of ['optimistic', 'conservative'] as const) {
      const s = story('forecast', demo, { ...INPUTS, forecastScenario: scenario });
      const expected = runForecast(series, scenario);
      expect(s.happened).toContain(`(${scenario})`);
      expect(s.happened).toContain(money(expected.points[0].low));
      expect(s.happened).toContain(money(expected.holtNextPeriod));
    }
  });

  it('says what is needed when there is no forecast', async () => {
    const short = await resultFromCsv(salesCsv({ months: 4 }));
    const outcome = buildStory('forecast', short) as CannotSayResult;
    expect(outcome.kind).toBe('cannotSay');
    expect(outcome.reason).toBe('A forecast needs at least 6 months of dated sales. Your file has 4 months.');
    expectHealthy(outcome, 'forecast cannot-say');
  });
});

describe('Risks & Opportunities', () => {
  it('counts the risks by level and keeps array order', () => {
    const s = story('risks');
    const risks = demo.decision.risks;
    const count = (level: string) => risks.filter(risk => risk.level === level).length;
    expect(s.happened).toContain(`${risks.length} risks found: ${count('high')} high, ${count('medium')} medium, ${count('low')} low.`);
    expect(s.happened).toContain(risks[0].title);
    expect(s.why).toContain(risks[0].desc.split(/(?<=\.)\s/)[0]);
  });

  it('points at the recommendation that answers the risk', () => {
    const s = story('risks');
    const rec = (demo.decision.recommendations as EnrichedRecommendation[]).find(item => item.relatedRiskTitles.includes(demo.decision.risks[0].title));
    if (rec) expect(s.next).toContain(rec.title); else expect(s.next).toBeNull();
  });

  it('counts low-level items as good news', () => {
    const low = demo.decision.risks.filter(risk => risk.level === 'low').length;
    if (low) expect(story('risks').notes.join(' ')).toContain('good news');
  });
});

describe('Decisions', () => {
  it('ranks in array order and quotes the basis verbatim', () => {
    const s = story('recs');
    const recs = demo.decision.recommendations as EnrichedRecommendation[];
    const vde = (demo as PipelineResult & { _vdeMeta: VDEResult })._vdeMeta;
    const top = recs[0];
    expect(s.happened).toContain(`${recs.length} actions ranked`);
    expect(s.happened).toContain(`Do first: ${top.title}`);
    expect(s.happened).toContain(`${money(top.financialImpact.estimatedValue)} (range ${money(top.financialImpact.rangeLow)}-${money(top.financialImpact.rangeHigh)})`);
    expect(s.happened).toContain(`about ${top.effortDays} day`);
    expect(s.happened).toContain('planning estimate');
    expect(s.happened).toContain(money(vde.totalValueAtRisk));
    expect(s.why).toContain(top.financialImpact.basis);
  });
});

describe('Intelligence, AI Advisor, Connections', () => {
  it('counts the checks and names the strongest finding', () => {
    const s = story('analyses');
    expect(s.happened).toContain(`ran ${demo.capabilities.available.length} of ${demo.capabilities.capabilities.length} checks`);
    expect(s.happened).toContain(demo.analyses[0].title);
    expect(s.happened).toContain(demo.analyses[0].explanation);
  });

  it('opens the advisor with the file, rows, health and quality', () => {
    const s = story('advisor');
    expect(s.happened).toBe(`I've read ${demo.source.fileName}: ${demo.source.rowCount} rows, health ${demo.decision.health.total}/100, data quality ${demo.quality.overallScore}/100.`);
    expect(s.next).toBe(`Ask me about ${demo.decision.risks[0].title}.`);
  });

  it('is honest that every connector is coming soon', () => {
    const s = story('connections');
    expect(s.happened).toContain(`Active source: ${demo.source.fileName}, ${demo.source.rowCount} rows.`);
    expect(s.happened).toContain('Coming soon');
  });
});

describe('Scenario Planning', () => {
  it('follows the levers with the same arithmetic as the page', () => {
    const levers = { price: 10, volume: -5, cost: 3, retention: 8 };
    const s = story('scenarios', demo, { ...INPUTS, scenarioLevers: levers });
    const revenueCol = demo.semantics.columns.find(c => c.businessRole === 'revenue')!.columnName;
    const costCol = demo.semantics.columns.find(c => c.businessRole === 'cost')!.columnName;
    const sum = (col: string) => demo.engineeredRows.reduce((t, row) => t + (Number(row[col]) || 0), 0);
    const baseline = sum(revenueCol) - sum(costCol);
    const projected = sum(revenueCol) * 1.1 * 0.95 * (1 + 0.08 * 0.35) - sum(costCol) * 0.95 * 1.03;
    expect(s.happened).toContain(`projected contribution is ${money(projected)} against ${money(baseline)} today`);
    expect(s.happened).toContain(`a change of ${projected - baseline >= 0 ? '+' : ''}${money(projected - baseline)}`);
    expect(s.notes.join(' ')).not.toContain('assumed');
    expect(s.confidence.label).not.toBe('Low');
  });

  it('assumes cost at 55 percent and forces Low confidence when the file has no cost column', async () => {
    const noCost = await resultFromCsv(salesCsv({ months: 14, cost: false }));
    const s = story('scenarios', noCost);
    expect(s.notes[0]).toBe('Cost is assumed at 55% of sales since the file has no cost column.');
    expect(s.confidence.label).toBe('Low');
    expect(s.confidence.caveat).toContain('Cost is assumed');
    const revenue = noCost.engineeredRows.reduce((t, row) => t + (Number(row['Revenue']) || 0), 0);
    expect(s.happened).toContain(`against ${money(revenue * 0.45)} today`);
  });

  it('cannot model without a sales amount column', async () => {
    const none = await resultFromCsv(salesCsv({ months: 8, revenue: false, cost: false }));
    const outcome = buildStory('scenarios', none) as CannotSayResult;
    expect(outcome.kind).toBe('cannotSay');
    expect(outcome.reason).toBe("I can't model this without a sales amount column.");
  });
});

describe('Customer Intelligence', () => {
  it('matches the segmentation fields', () => {
    const s = story('customers');
    const seg = demo.ml.segmentation!;
    const low = seg.segments.filter(item => item.segment === 'atRisk' || item.segment === 'lost').length;
    expect(s.happened).toContain(`${seg.segments.length} customers in ${seg.customerColumn}`);
    expect(s.happened).toContain(`churn risk is ${seg.churnRiskScore}/100`);
    expect(s.happened).toContain(`${low} score low on spend, orders and recent activity, with about ${money(seg.revenueAtRisk)} of spend at risk`);
    for (const key of ['champion', 'loyal', 'atRisk', 'new', 'lost'] as const) {
      expect(s.facts[`segment_${key}`].value).toBe(seg.segments.filter(item => item.segment === key).length);
    }
  });

  it('states which columns are missing when customers cannot be analysed', async () => {
    const noCustomer = await resultFromCsv(salesCsv({ months: 8, customer: false }));
    const outcome = buildStory('customers', noCustomer) as CannotSayResult;
    expect(outcome.reason).toBe('Customer analysis needs a customer, date and amount column. Missing: customer.');
  });
});

describe('Seasonality', () => {
  it('names the peak and low months and the busiest weekday from the series', () => {
    const s = story('seasonality');
    const { byMonthOfYear: months, byDayOfWeek: days } = demo.statistics.seasonality!;
    const sum = months.reduce((t, m) => t + m.value, 0);
    const peak = months.reduce((a, b) => (b.value > a.value ? b : a));
    const low = months.reduce((a, b) => (b.value < a.value ? b : a));
    const day = days.reduce((a, b) => (b.value > a.value ? b : a));
    const full = (label: string, names: string[]) => names.find(name => name.startsWith(label))!;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(s.happened).toContain(`Sales peak in ${full(peak.label, monthNames)} (${percent((peak.value / sum) * 100)} of the total)`);
    expect(s.happened).toContain(`lowest in ${full(low.label, monthNames)}`);
    expect(s.happened).toContain(`Busiest weekday: ${full(day.label, dayNames)}`);
  });

  it('is blocked with the honest sentence under 12 months', async () => {
    const eight = await resultFromCsv(salesCsv({ months: 8, rowsPerMonth: 5 }));
    const outcome = buildStory('seasonality', eight) as CannotSayResult;
    expect(outcome.reason).toBe('Months are not all covered, so peaks may be misleading.');
  });

  it('needs a date, an amount and 30 rows', async () => {
    const small = await resultFromCsv(salesCsv({ months: 3 }));
    expect((buildStory('seasonality', small) as CannotSayResult).reason).toBe('Seasonality needs a date, an amount and at least 30 rows.');
  });
});

describe('Products & Markets', () => {
  const CSV = [
    'Order ID,Order Date,Product,Revenue',
    ...Array.from({ length: 40 }, (_, i) => `O-${i},2024-${String(1 + (i % 12)).padStart(2, '0')}-10,${['Anvil', 'Bolt', 'Crane', 'Drill', 'Easel'][i % 5]},${100 + i * 7 + (i % 5) * 120}`),
  ].join('\n');

  it('says there is no product column when the file has none', () => {
    const outcome = buildStory('products', demo) as CannotSayResult;
    expect(outcome.kind).toBe('cannotSay');
    expect(outcome.reason).toBe('No product column or amount column found.');
  });

  it('reports the top product and the top three from the category breakdown', async () => {
    const result = await resultFromCsv(CSV);
    const productColumn = result.semantics.columns.find(c => c.businessRole === 'product')!.columnName;
    const rows = computeCategoryBreakdown(result.engineeredRows, productColumn, 'Revenue');
    const total = rows.reduce((t, row) => t + row.value, 0);
    const topThree = (rows.slice(0, 3).reduce((t, row) => t + row.value, 0) / total) * 100;
    const s = story('products', result);
    expect(s.happened).toContain(`${rows[0].label} brings ${percent(rows[0].pct)} of Revenue.`);
    expect(s.happened).toContain(`The top three bring ${percent(topThree)}.`);
    expectHealthy(s, 'products');
  });
});

describe('Health Detail', () => {
  it('names the strongest and weakest pillars with their scores', () => {
    const s = story('health');
    const pillars = demo.decision.health.pillars;
    const strongest = pillars.reduce((a, b) => (b.score > a.score ? b : a));
    const weakest = pillars.reduce((a, b) => (b.score < a.score ? b : a));
    expect(s.happened).toContain(`Health is ${demo.decision.health.total}/100.`);
    expect(s.happened).toContain(`Strongest: ${strongest.name} (${strongest.score}/${strongest.max})`);
    expect(s.happened).toContain(`weakest: ${weakest.name} (${weakest.score}/${weakest.max})`);
  });

  it('labels defaulted pillars as assumed', async () => {
    const noDates = await resultFromCsv(salesCsv({ months: 8, date: false, customer: false }));
    const s = story('health', noDates);
    const text = `${s.why} ${s.notes.join(' ')}`;
    for (const pillar of ['Performance Trend', 'Customer Strength', 'Stability']) expect(text).toContain(`${pillar} is assumed, not measured.`);
    expect(text).not.toContain('Data Quality is assumed');
  });
});

describe('Data Profile and Data Quality', () => {
  it('counts columns, lists the ones to check and names the role columns', () => {
    const s = story('profile');
    const review = demo.semantics.columns.filter(column => column.needsReview);
    expect(s.happened).toContain(`${demo.semantics.columns.length} columns read from ${demo.source.fileName}`);
    expect(s.happened).toContain(`${review.length} need your check`);
    for (const column of review.slice(0, 3)) expect(s.happened).toContain(column.columnName);
    expect(s.happened).toMatch(/Date: .+, sales: .+, customer: .+\./);
    for (const warning of demo.semantics.warnings) expect(s.notes).toContain(warning);
  });

  it('reports the weakest quality area and the filled cells', () => {
    const s = story('quality');
    const areas = [['Completeness', demo.quality.completenessScore], ['Validity', demo.quality.validityScore], ['Consistency', demo.quality.consistencyScore], ['Uniqueness', demo.quality.uniquenessScore]] as const;
    const weakest = areas.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(s.happened).toContain(`Quality is ${demo.quality.overallScore}/100.`);
    expect(s.happened).toContain(`Weakest area: ${weakest[0]} (${weakest[1]}/100)`);
    if (demo.quality.flags.length === 0) expect(s.why).toContain('No quality issues were found.');
    expect(s.why).toContain(demo.cleaning.cellsImputed === 0 ? 'No blank cells were filled.' : 'blank cell');
  });

  it('lists up to three flags verbatim', () => {
    const flagged = structuredClone(demo);
    flagged.quality.flags = ['2 columns have more than 30 percent missing data', 'Revenue has mixed formats'];
    const s = story('quality', flagged);
    expect(s.why).toContain('2 issues:');
    expect(s.why).toContain('Revenue has mixed formats');
    expectHealthy(s, 'quality with flags');
  });
});

describe('Alerts & Reports', () => {
  it('reports triggered rules, limits and the brief cadence', () => {
    const s = story('alerts', demo, { ...INPUTS, alertPreferences: { revenueDropAlert: false, healthAlert: true, qualityAlert: true, healthThreshold: 99, qualityThreshold: 101, reportCadence: 'weekly' } });
    expect(s.happened).toContain('2 rules triggered: Business health is below 99; Data quality is below 101.');
    expect(s.happened).toContain(`Health ${demo.decision.health.total} vs limit 99; quality ${demo.quality.overallScore} vs limit 101; brief: weekly.`);
  });

  it('says no limit is breached when nothing triggers', () => {
    const s = story('alerts', demo, { ...INPUTS, alertPreferences: { revenueDropAlert: false, healthAlert: true, qualityAlert: true, healthThreshold: 1, qualityThreshold: 1, reportCadence: 'off' } });
    expect(s.happened).toContain('No limit is breached.');
  });
});

describe('Execution hub', () => {
  const actions = [
    { title: 'Late one', status: 'planned' as const, dueDate: '2026-03-01' },
    { title: 'Late but done', status: 'complete' as const, dueDate: '2026-02-01' },
    { title: 'Due today', status: 'in_progress' as const, dueDate: '2026-03-10' },
    { title: 'Later', status: 'planned' as const, dueDate: '2026-04-01' },
  ];

  it('counts overdue as due before today and not complete', () => {
    const s = story('actions', demo, { ...INPUTS, actions });
    expect(s.happened).toBe('1/4 actions complete, 1 overdue.');
    expect(s.next).toBe('Complete Late one, which was due 1 Mar 2026.');
  });

  it('counts targets met, approvals and recorded outcomes from the user entries', () => {
    const inputs: StoryInputs = {
      ...INPUTS, actions,
      targets: [
        { label: 'Health', current: 80, target: 75, unit: '/100', direction: 'up' },
        { label: 'Churn', current: 30, target: 20, unit: '%', direction: 'down' },
        { label: 'Quality', current: 90, target: 90, unit: '/100', direction: 'up' },
      ],
      approvals: [{ decision: 'A', state: 'approved' }, { decision: 'B', state: 'pending' }, { decision: 'C', state: 'declined' }],
      outcomes: [{ decision: 'A', expected: 1000, actual: '800' }, { decision: 'B', expected: 5000, actual: '' }, { decision: 'C', expected: 200, actual: '250' }],
    };
    const s = story('execution', demo, inputs);
    expect(s.happened).toBe('1/4 actions complete, 1 overdue; 2 of 3 targets met. Approved: 1; pending: 1; declined: 1.');
    expect(s.notes[0]).toBe('Recorded outcomes: £1,050 against £1,200 expected (your entries).');
    expect(story('targets', demo, inputs).next).toBe('Close the gap on Churn: 30% now, against a target of 20%.');
    expectHealthy(s, 'execution');
  });

  it('does not claim results when none are recorded', () => {
    expect(story('outcomes').happened).toBe("No results recorded yet, so I can't say whether decisions paid off.");
  });
});

describe('Governance hub', () => {
  it('reports the evidence counts', () => {
    const s = story('evidence');
    const reviewed = demo.semantics.columns.filter(column => !column.needsReview).length;
    expect(s.happened).toBe(`${demo.cleaning.rowsBefore} rows received, ${demo.cleaning.rowsAfter} kept, ${demo.cleaning.cellsImputed} cells filled, ${reviewed}/${demo.semantics.columns.length} columns confirmed.`);
    expect(story('governance').happened).toBe(s.happened);
  });

  it('reports the chosen models and their fit', () => {
    const s = story('models');
    const meta = (demo as PipelineResult & { _modelMeta: { forecast: { chosenModel: string; confidence: number }; anomaly: { chosenModel: string; confidence: number } } })._modelMeta;
    expect(s.happened).toContain(`${meta.forecast.chosenModel.replaceAll('_', ' ')} was chosen for fit to the data's shape (${Math.round(meta.forecast.confidence * 100)}%)`);
    expect(s.happened).toContain(`${meta.anomaly.chosenModel.replaceAll('_', ' ')} was chosen`);
  });

  it('gives counts only for team and audit, and needs the organisation account for them', () => {
    expect(story('team').happened).toBe('3 people in your team.');
    expect(story('audit').happened).toBe('12 events recorded in your audit log.');
    expect(buildStory('team', demo).kind).toBe('cannotSay');
  });

  it('has no story for the Trust Center', () => {
    expect(buildStory('trust', demo).kind).toBe('cannotSay');
  });
});

describe('Data Relationships', () => {
  it('uses the existing copy when there is no organisation', () => {
    const outcome = buildStory('relationships', demo) as CannotSayResult;
    expect(outcome.reason).toBe('No organisational model is active.');
    expect(outcome.fix).toBe('Start a new analysis and select sales, stock, customer, product or finance files together.');
  });

  it('counts linked files, confirmed connections, overlap and the top insight', async () => {
    const sales = new File(['date,product id,quantity,revenue\n2026-01-01,SKU-1,10,100\n2026-01-02,SKU-2,5,75\n'], 'sales.csv', { type: 'text/csv' });
    const inventory = new File(['product id,inventory\nSKU-1,4\nSKU-2,20\n'], 'inventory.csv', { type: 'text/csv' });
    const workspace = await prepareOrganizationWorkspace([sales, inventory]);
    const primary = workspace.context.datasets.find(dataset => dataset.primary)!;
    const outcome = await runDataPipeline(workspace.files[primary.id]);
    if (!outcome.ok) throw new Error(outcome.error);
    const withOrg: PipelineResult = { ...outcome.result, organization: workspace.context };

    const context = workspace.context;
    const confirmed = context.relationships.filter(item => item.confirmed);
    const s = story('relationships', withOrg);
    expect(s.happened).toContain(`${context.datasets.length} files linked, ${confirmed.length} connection${confirmed.length === 1 ? '' : 's'} confirmed`);
    const best = [...confirmed].sort((a, b) => b.confidence - a.confidence)[0];
    if (best) expect(s.happened).toContain(`(${percent(best.overlapPct)} overlap)`);
    const order = ['high', 'medium', 'opportunity'];
    const top = [...context.insights].filter(item => !item.relationshipId || confirmed.some(rel => rel.id === item.relationshipId)).sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))[0];
    if (top) {
      expect(s.happened).toContain(top.title);
      expect(s.next).toContain(`evidence confidence ${Math.round(top.confidence * 100)}%`);
    }
    expectHealthy(s, 'relationships');
  });
});

describe('period-over-period change', () => {
  const withSeries = (values: number[]) => {
    const copy = structuredClone(demo);
    const series = getRevenueView(copy).series!;
    series.points = series.points.slice(0, values.length).map((point, i) => ({ ...point, value: values[i] }));
    return copy;
  };

  it('never says flat when the previous month is zero, and says there is no earlier month', () => {
    const zeroPrev = withSeries([100, 0, 250]);
    for (const pageId of ['overview', 'revenue'] as const) {
      const s = story(pageId, zeroPrev);
      expect(s.happened, pageId).toContain('There is no earlier month to compare with.');
      expect(s.happened.toLowerCase(), pageId).not.toContain('flat');
      expect(s.facts.latestSalesChangePct, pageId).toBeUndefined();
      expectHealthy(s, pageId);
    }
    const brief = buildStory('overview', zeroPrev) as StoryResult;
    expect(brief.happened).not.toMatch(/\bNaN\b|Infinity/);
  });

  it('says no earlier month with a single month of data', () => {
    expect(story('overview', withSeries([500])).happened).toContain('There is no earlier month to compare with.');
  });

  it('states a fall as down and a rise as up, computed from the points', () => {
    expect(story('overview', withSeries([200, 100])).happened).toContain('down 50.0%');
    expect(story('overview', withSeries([100, 125.5])).happened).toContain('up 25.5%');
  });

  it('states an unchanged month as level, never as flat', () => {
    const s = story('overview', withSeries([100, 100]));
    expect(s.happened).toContain('level with');
    expect(s.happened.toLowerCase()).not.toContain('flat');
  });
});

describe('outcome shape', () => {
  it('returns a story with every part, or a cannot-say with a reason and a fix', () => {
    for (const pageId of STORY_PAGE_IDS) {
      const outcome: StoryOutcome = buildStory(pageId, demo, INPUTS);
      if (outcome.kind === 'story') {
        expect(Object.keys(outcome).sort()).toEqual(['confidence', 'facts', 'happened', 'kind', 'next', 'notes', 'pageId', 'source', 'why']);
        for (const fact of Object.values(outcome.facts)) {
          expect(fact.source.length).toBeGreaterThan(0);
          if (typeof fact.value === 'number') expect(Number.isFinite(fact.value)).toBe(true);
        }
      } else {
        expect(outcome.reason.length).toBeGreaterThan(0);
        expect(outcome.fix.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the story text out of private fields: it prints only recorded values', () => {
    const text = storyText(story('overview'));
    expect(text).not.toMatch(/__transactionValue/);
  });
});
