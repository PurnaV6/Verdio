import { useMemo } from "react";
import { describeSlice, periodOptions, periodRange } from "../../lib/analysis/slicing";
import { formatters } from "../../lib/story";
import { Slicer, SlicerBar, type SlicerOption } from "../charts/kit";
import type { OverviewSlices } from "./overviewSlices";

const { formatPounds } = formatters;
const NONE = '';

/* The slicers for the Overview trend and share ring: Period and Month when the series is long, and the
   columns of the file the sales can be cut by (product, category, region, channel). */
export function OverviewSlicers({ slices, measureName = 'sales' }: { slices: OverviewSlices; measureName?: string }) {
  const { cube, state, set, reset, changed, hasPeriods, dimensions } = slices;

  const periods = useMemo(() => (cube ? periodOptions(cube.months) : []), [cube]);
  const monthOptions = useMemo<SlicerOption[]>(() => {
    if (!cube) return [];
    const range = periodRange(cube.months, state.period);
    const inPeriod = range ? cube.months.slice(range.start, range.end + 1) : [];
    return [{ value: NONE, label: 'All months in period' }, ...inPeriod.map(m => ({ value: m.key, label: m.label }))];
  }, [cube, state.period]);

  if (!slices.show || !cube) return null;
  const dimension = dimensions.find(d => d.column === state.dimension);
  const valueOptions: SlicerOption[] = dimension ? [{ value: NONE, label: 'All' }, ...dimension.values.map(v => ({ value: v, label: v }))] : [];

  return (
    <SlicerBar className="v2-ov-panel" label={`Slicers for the ${measureName} trend and where ${measureName} come from`}
      summary={describeSlice(cube, state, formatPounds, measureName)} changed={changed} onReset={reset}>
      {hasPeriods && <Slicer label="Period" value={state.period} options={periods} onChange={period => set({ period })} />}
      {hasPeriods && <Slicer label="Month" value={state.month ?? NONE} options={monthOptions} onChange={month => set({ month: month === NONE ? null : month })} />}
      {dimensions.length > 1 && (
        <Slicer label="Split by" value={state.dimension ?? NONE} options={dimensions.map(d => ({ value: d.column, label: d.column }))}
          onChange={column => set({ dimension: column, value: null })} />
      )}
      {dimension && (
        <Slicer label={dimension.column} value={state.value ?? NONE} options={valueOptions} display="chips" onChange={value => set({ value: value === NONE ? null : value })} />
      )}
    </SlicerBar>
  );
}
