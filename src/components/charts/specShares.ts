import type { ChartSpec } from "../../types/analysis";
import type { RingItem } from "./kit/ring";
import { parseAmount } from "../../lib/dataPipeline/profileDataset";

/* Which ChartSpecs are a share of ONE whole, so the AI Advisor may draw them as a ring: the pipeline's
   'pie' charts (concentration), and the customer-segment counts the segmentation step emits as a bar
   (xKey 'segment', yKey 'count'). Every other spec (time series, rankings, distributions, tables) is
   left to the ChartRenderer. The ring itself still refuses negative, all-zero or single-part data. */

export interface SpecShares {
  items: RingItem[];
  categoryLabel: string;
  valueLabel: string;
}

const NICE: Record<string, string> = { label: 'Category', segment: 'Segment', value: 'Value', count: 'Customers' };
const nice = (key: string) => NICE[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

export function specShares(chart: ChartSpec): SpecShares | null {
  let labelKey: string;
  let valueKey: string;
  if (chart.chartType === 'pie') {
    labelKey = chart.xKey ?? 'label';
    valueKey = chart.yKey ?? 'value';
  } else if (chart.chartType === 'bar' && chart.xKey === 'segment' && chart.yKey === 'count') {
    labelKey = 'segment';
    valueKey = 'count';
  } else {
    return null;
  }
  const items: RingItem[] = [];
  for (const row of chart.data) {
    const label = row[labelKey] === null || row[labelKey] === undefined ? '' : String(row[labelKey]).trim();
    if (!label) continue;
    const raw = row[valueKey];
    items.push({ label, value: parseAmount(raw) ?? Number.NaN });
  }
  if (items.length === 0) return null;
  return { items, categoryLabel: nice(labelKey), valueLabel: nice(valueKey) };
}
