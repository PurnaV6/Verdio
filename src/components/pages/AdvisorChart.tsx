import { useMemo, useState } from "react";
import type { ChartSpec } from "../../types/analysis";
import { FilterableTable, RingChart, Slicer, canRing, needsFilters, ringSlices } from "../charts/kit";
import { specShares } from "../charts/specShares";
import { ChartRenderer } from "../workspace/lazy";

/* ================================================================
   VERDIO — one chart in an AI Advisor answer
   A share of a whole becomes a ring with chips to highlight a slice,
   and a table of more than 12 rows gets filters. Everything else goes
   to the ChartRenderer unchanged, with its own table disclosure.
   ================================================================ */

export function AdvisorChart({ chart }: { chart: ChartSpec }) {
  const shares = useMemo(() => specShares(chart), [chart]);
  if (shares && canRing(shares.items)) return <AdvisorRing chart={chart} items={shares.items} categoryLabel={shares.categoryLabel} valueLabel={shares.valueLabel} />;
  if (chart.chartType === 'table' && chart.columns && needsFilters(chart.data.length)) return <AdvisorTable chart={chart} />;
  return <ChartRenderer chart={chart} />;
}

function AdvisorRing({ chart, items, categoryLabel, valueLabel }: { chart: ChartSpec; items: { label: string; value: number }[]; categoryLabel: string; valueLabel: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const slices = useMemo(() => ringSlices(items).slices, [items]);
  const options = useMemo(() => [{ value: '', label: 'All' }, ...slices.map(s => ({ value: s.label, label: s.label }))], [slices]);
  return (
    <div className="v2-rg-chat">
      <RingChart name={chart.title || `Share of the whole by ${categoryLabel.toLowerCase()}`} items={items} format={chart.formatValue} centreLabel="total"
        categoryLabel={categoryLabel} valueLabel={valueLabel} title={chart.title} subtitle={chart.subtitle}
        selectedLabel={picked} onSelect={setPicked} />
      <Slicer label="Highlight a slice" value={picked ?? ''} options={options} display="chips" onChange={v => setPicked(v === '' ? null : v)} />
    </div>
  );
}

function AdvisorTable({ chart }: { chart: ChartSpec }) {
  return (
    <div className="verdio-chart">
      <div className="verdio-chart-heading">
        <span />
        <div>
          <p>{chart.title}</p>
          {chart.subtitle && <small>{chart.subtitle}</small>}
        </div>
      </div>
      <FilterableTable caption={chart.title || 'Table'} columns={chart.columns!} rows={chart.data} />
    </div>
  );
}
