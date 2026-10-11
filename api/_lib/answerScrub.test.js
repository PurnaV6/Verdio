import { describe, expect, it } from 'vitest';
import {
  chartNamesFromContext, isEffectivelyEmpty, normaliseTypography, removeInventedReferences,
} from './answerScrub.js';

const CONTEXT = [
  'You are Verd.io Advisor LLM. Full analysis:',
  'Rows=100 Health=72',
  'RISKS: [high] Concentration: top customer 50%',
  'CHARTS: ID="revenue_trend" Title="Revenue Trend"',
  'ID="concentration" Title="Revenue Concentration by Product Category"',
  'If chart helps, add [CHART:id] at end.',
].join('\n');
const CHARTS = chartNamesFromContext(CONTEXT);

const scrub = text => removeInventedReferences(normaliseTypography(text), CHARTS);

describe('normaliseTypography', () => {
  it('turns non-breaking and other typographic hyphens into plain hyphens', () => {
    expect(normaliseTypography('a mid‑sized and well‐known firm')).toBe('a mid-sized and well-known firm');
  });

  it('turns spaced en and em dashes into commas', () => {
    expect(normaliseTypography('Revenue is flat – costs are not')).toBe('Revenue is flat, costs are not');
    expect(normaliseTypography('Revenue is flat — costs are not')).toBe('Revenue is flat, costs are not');
    expect(normaliseTypography('actions—without delay')).toBe('actions, without delay');
  });

  it('keeps a dash after punctuation as a plain space and an unspaced range as a hyphen', () => {
    expect(normaliseTypography('Risky. — Act now.')).toBe('Risky. Act now.');
    expect(normaliseTypography('2020–2021')).toBe('2020-2021');
  });

  it('closes the gap in "50 %" including non-breaking spaces and never touches the number', () => {
    expect(normaliseTypography('top customer is 50 % of revenue, 41.5 %, 12 %, 3 %')).toBe('top customer is 50% of revenue, 41.5%, 12%, 3%');
    expect(normaliseTypography('Rows=1,234 Health=72 -5.2% 50%')).toBe('Rows=1,234 Health=72 -5.2% 50%');
  });
});

describe('chartNamesFromContext', () => {
  it('reads ids and titles from the CHARTS block only', () => {
    expect(CHARTS.has('revenue concentration by product category')).toBe(true);
    expect(CHARTS.has('revenue trend')).toBe(true);
    expect(CHARTS.has('concentration')).toBe(true);
    expect(chartNamesFromContext('no charts here').size).toBe(0);
    expect(chartNamesFromContext('RISKS: ID="x" Title="Y"').size).toBe(0);
  });
});

describe('removeInventedReferences', () => {
  const EVIDENCE = 'Your biggest risk is customer concentration: the top customer is 50 % of revenue – well above a safe level. '
    + 'To see this, go to the *Concentration* page, view the \'Revenue Concentration by Product Category\' chart. '
    + 'Next action: diversify by adding two mid‑sized accounts so no customer exceeds 25%. [CHART:concentration]';

  it('drops the invented page instruction from the evidence answer and keeps the figure and advice', () => {
    const out = scrub(EVIDENCE);
    expect(out).toBe('Your biggest risk is customer concentration: the top customer is 50% of revenue, well above a safe level. '
      + 'Next action: diversify by adding two mid-sized accounts so no customer exceeds 25%. [CHART:concentration]');
    expect(out).not.toMatch(/\*Concentration\*|page/);
  });

  it('keeps a sentence that only names a chart that is in the CHARTS list', () => {
    const text = 'The "Revenue Concentration by Product Category" chart shows the top customer at 50%. Add two accounts. [CHART:concentration]';
    expect(scrub(text)).toBe(text);
    const unquoted = 'Open the Revenue Concentration by Product Category chart to see the split.';
    expect(scrub(unquoted)).toBe(unquoted);
  });

  it('keeps sentences that point to real pages, in any emphasis, and the "and" spelling', () => {
    for (const text of [
      'Go to the *Risks & Opportunities* page and review the top item.',
      'Open the "Products & Markets" page to compare categories.',
      'Open the Products & Markets page to compare categories.',
      'See the **Risks and Opportunities** section for the full list.',
      'Check the Executive Workspace page first.',
      'Use the page called "Data Hub" to review the file.',
    ]) expect(scrub(text)).toBe(text);
  });

  it('drops sentences that send the user to a page, tab or section that does not exist', () => {
    expect(scrub('Revenue is steady. Go to the "Dashboard" tab for more. Add two accounts.')).toBe('Revenue is steady. Add two accounts.');
    expect(scrub('Revenue is steady. Visit the **Insights Hub** section. Add two accounts.')).toBe('Revenue is steady. Add two accounts.');
    expect(scrub('Revenue is steady. Open the Concentration page. Add two accounts.')).toBe('Revenue is steady. Add two accounts.');
    expect(scrub('Revenue is steady. Look at the page called “Trends”. Add two accounts.')).toBe('Revenue is steady. Add two accounts.');
  });

  it('drops a sentence naming a chart that is not in the CHARTS list', () => {
    expect(scrub('Revenue is steady. View the "Churn Heatmap" chart. Add two accounts.')).toBe('Revenue is steady. Add two accounts.');
  });

  it('drops the whole sentence when a real chart sits next to a fake page, leaving a clean answer', () => {
    const out = scrub('Go to the *Concentration* page and open the "Revenue Trend" chart. Add two accounts.');
    expect(out).toBe('Add two accounts.');
  });

  it("does not drop a tab or section in the user's own file", () => {
    const text = 'Your "Sales" tab in the spreadsheet has the figure.';
    expect(scrub(text)).toBe(text);
  });

  it('keeps list items and paragraphs intact around a removed item', () => {
    const text = '1. Add two accounts.\n2. Go to the *Concentration* page.\n3. Review pricing.\n\nThen re-upload.';
    expect(scrub(text)).toBe('1. Add two accounts.\n3. Review pricing.\n\nThen re-upload.');
  });

  it('never edits numbers or chart tokens, and keeps the token of a removed sentence', () => {
    const text = 'Top customer is 41.5% of 1,234 rows. Open the Concentration page [CHART:concentration]. Done.';
    const out = scrub(text);
    expect(out).toContain('41.5% of 1,234 rows.');
    expect(out).toContain('[CHART:concentration]');
    expect(out).not.toContain('Concentration page');
  });

  it('reports an answer that is nothing but tokens as empty', () => {
    expect(isEffectivelyEmpty(scrub('Go to the *Concentration* page. [CHART:concentration]'))).toBe(true);
    expect(isEffectivelyEmpty('Add two accounts.')).toBe(false);
  });
});
