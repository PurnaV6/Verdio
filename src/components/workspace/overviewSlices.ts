import { useCallback, useMemo } from "react";
import type { PipelineResult } from "../../types/pipeline";
import type { TimeSeriesSummary } from "../../types/statistics";
import { bestColumnOfRole } from "../../lib/analysis/pickColumns";
import {
  LONG_SERIES_PERIODS, buildSalesCube, findSliceDimensions, initialSlice, normaliseSlice,
  type CubeDimension, type SalesCube, type SliceState,
} from "../../lib/analysis/slicing";
import { useSlicers } from "../charts/kit/useSlicers";

/* ================================================================
   VERDIO — Overview slices
   Wires the pure slicing module to the Overview: the month x dimension
   cube is summed once from the file's own rows (engineeredRows are on
   the PipelineResult, so no raw rows are passed around the page), and
   one slicer state is shared by the trend and the share ring.
   Slicers choose which actuals are drawn. They never feed the forecast,
   the Health score or the risks.
   ================================================================ */

export interface OverviewSlices {
  cube: SalesCube | null;           // null when the file has no dated series, or nothing worth slicing
  show: boolean;                    // render the slicer bar
  hasPeriods: boolean;              // more than 12 periods: Period and Month slicers
  dimensions: CubeDimension[];
  state: SliceState;
  set: (patch: Partial<SliceState>) => void;
  reset: () => void;
  changed: boolean;
}

/** The column the share chart splits by before any slicer is used: the concentration column, else the product column. */
export function preferredShareColumn(r: PipelineResult): string | null {
  const concentration = r.capabilities.capabilities.find(item => item.type === 'concentration_analysis' && item.available && item.columns.length >= 2);
  return concentration ? concentration.columns[0] : bestColumnOfRole(r.semantics.columns, 'product');
}

export function useOverviewSlices(r: PipelineResult, series: TimeSeriesSummary | undefined): OverviewSlices {
  const measure = series?.measureColumn ?? null;
  const periods = series?.points.length ?? 0;
  const dims = useMemo(() => findSliceDimensions(r.semantics.columns, r.engineeredRows), [r.semantics.columns, r.engineeredRows]);
  const cube = useMemo(
    () => (measure && (periods > LONG_SERIES_PERIODS || dims.length > 0) ? buildSalesCube(r.engineeredRows, measure, dims) : null),
    [r.engineeredRows, measure, periods, dims],
  );
  const preferred = preferredShareColumn(r);
  const defaultDimension = cube ? (cube.dimensions.find(d => d.column === preferred) ?? cube.dimensions[0] ?? null)?.column ?? null : null;
  const initial = useMemo(() => initialSlice(defaultDimension), [defaultDimension]);
  const normalise = useCallback((s: SliceState) => (cube ? normaliseSlice(cube, s, defaultDimension) : s), [cube, defaultDimension]);
  const { state, set, reset, changed } = useSlicers(initial, normalise);

  const hasPeriods = !!cube && cube.months.length > LONG_SERIES_PERIODS;
  const dimensions = cube?.dimensions ?? [];
  return { cube, show: !!cube && (hasPeriods || dimensions.length > 0), hasPeriods, dimensions, state, set, reset, changed };
}
