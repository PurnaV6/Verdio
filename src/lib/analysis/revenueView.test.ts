import { describe, expect, it } from "vitest";
import { getRevenueView as fromComponents } from "../../components/workspace/revenue";
import { healthReading as healthFromComponents } from "../../components/workspace/status";
import { demoResult } from "../story/testkit";
import { healthReading } from "./healthReading";
import { getRevenueView } from "./revenueView";

/* The pure helpers moved out of components/workspace so library code can use them.
   These tests pin their behaviour so the move is provably a no-op. */

describe('getRevenueView', () => {
  it('is the same function the workspace imports', () => {
    expect(fromComponents).toBe(getRevenueView);
  });

  it('keeps its behaviour: total, latest, previous-based change and forecast', async () => {
    const result = await demoResult();
    const view = getRevenueView(result);
    const column = result.semantics.columns.find(c => c.businessRole === 'revenue')!.columnName;
    const total = result.engineeredRows.reduce((sum, row) => sum + (Number(row[column]) || 0), 0);
    const points = result.statistics.timeSeries.find(item => item.measureColumn === column)!.points;
    const latest = points.at(-1)!.value, previous = points.at(-2)!.value;

    expect(view.revenueColumn).toBe(column);
    expect(view.total).toBeCloseTo(total, 6);
    expect(view.latest).toBe(latest);
    expect(view.changePct).toBeCloseTo(((latest - previous) / Math.abs(previous)) * 100, 9);
    expect(view.revenueForecast).toBe(result.ml.forecast);
  });

  it('still reports a 0 change when the previous period is 0 (the story engine does not rely on it)', async () => {
    const result = structuredClone(await demoResult());
    const series = getRevenueView(result).series!;
    series.points[series.points.length - 2].value = 0;
    expect(getRevenueView(result).changePct).toBe(0);
  });

  it('prefers connected revenue for the total when an organisation provides it', async () => {
    const result = structuredClone(await demoResult());
    result.organization = { name: 'Org', datasets: [], relationships: [], insights: [], createdAt: '', metrics: [{ id: 'connected-revenue', label: 'Connected revenue', value: 777, format: 'currency', evidence: '', sourceDatasetIds: [] }] };
    expect(getRevenueView(result).total).toBe(777);
  });
});

describe('healthReading', () => {
  it('keeps the Overview thresholds', () => {
    expect(healthReading(100)).toEqual({ tone: 'ok', label: 'Strong' });
    expect(healthReading(80)).toEqual({ tone: 'ok', label: 'Strong' });
    expect(healthReading(79)).toEqual({ tone: 'watch', label: 'Monitored' });
    expect(healthReading(60)).toEqual({ tone: 'watch', label: 'Monitored' });
    expect(healthReading(59)).toEqual({ tone: 'risk', label: 'Needs attention' });
    expect(healthReading(0)).toEqual({ tone: 'risk', label: 'Needs attention' });
  });

  it('is the same function the workspace imports', () => {
    expect(healthFromComponents).toBe(healthReading);
  });
});
