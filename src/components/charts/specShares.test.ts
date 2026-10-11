import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../../types/analysis";
import { buildBarChart, buildHorizontalBarChart, buildLineChart, buildPieChart, buildTable } from "../../lib/analysis/buildChartSpecs";
import { canRing } from "./kit/ring";
import { specShares } from "./specShares";

describe('specShares', () => {
  it('reads a pie spec', () => {
    const chart = buildPieChart('Revenue Concentration', [{ label: 'Advisory', value: 50 }, { label: 'Other', value: 25 }], 'label', 'value', 'currency');
    expect(specShares(chart)).toEqual({ items: [{ label: 'Advisory', value: 50 }, { label: 'Other', value: 25 }], categoryLabel: 'Category', valueLabel: 'Value' });
  });

  it('reads the customer-segment counts the pipeline emits as a bar', () => {
    const chart = buildBarChart('Customer Segments', [{ segment: 'Champions', count: 46 }, { segment: 'Loyal', count: 32 }], 'segment', 'count', 'count');
    const s = specShares(chart)!;
    expect(s.items).toEqual([{ label: 'Champions', value: 46 }, { label: 'Loyal', value: 32 }]);
    expect(s.valueLabel).toBe('Customers');
    expect(canRing(s.items)).toBe(true);
  });

  it('leaves time series, rankings, other bars and tables to the renderer', () => {
    expect(specShares(buildLineChart('Trend', [{ period: 'Jan', value: 1 }], 'period', ['value'], 'currency'))).toBeNull();
    expect(specShares(buildHorizontalBarChart('Revenue by Product', [{ label: 'A', value: 1 }], 'label', 'value', 'currency'))).toBeNull();
    expect(specShares(buildBarChart('Revenue by Month', [{ label: 'Jan', value: 1 }], 'label', 'value', 'currency'))).toBeNull();
    expect(specShares(buildBarChart('Distribution', [{ label: '0-10', value: 3 }], 'label', 'value', 'count'))).toBeNull();
    expect(specShares(buildTable('T', [{ a: 1 }], [{ key: 'a', label: 'A' }]))).toBeNull();
  });

  it('keeps unusable values so the ring can refuse them', () => {
    const neg = buildPieChart('P', [{ label: 'A', value: 5 }, { label: 'B', value: -2 }], 'label', 'value', 'count');
    expect(canRing(specShares(neg)!.items)).toBe(false);
    const nan = { ...neg, data: [{ label: 'A', value: 'n/a' }, { label: 'B', value: 2 }] } as ChartSpec;
    expect(canRing(specShares(nan)!.items)).toBe(false);
    expect(specShares({ ...neg, data: [] })).toBeNull();
  });

  it('uses the spec\'s own keys and skips rows with no label', () => {
    const chart = buildPieChart('P', [{ region: 'North', total: '30' }, { region: '', total: 5 }, { region: 'South', total: 10 }], 'region', 'total', 'currency');
    expect(specShares(chart)).toEqual({ items: [{ label: 'North', value: 30 }, { label: 'South', value: 10 }], categoryLabel: 'Region', valueLabel: 'Total' });
  });
});
