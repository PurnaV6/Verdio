import { primaryMeasureColumn } from "./pickColumns";
import { sumColumn } from "../dataPipeline/salesRows";
import { parseAmount } from "../dataPipeline/profileDataset";
import type { PipelineResult } from "../../types/pipeline";
import type { ExcludedReason, SalesSummary } from "../../types/dataPipeline";

/* ================================================================
   VERDIO — Sales summary (pure)
   The one place the sales figure comes from. engineeredRows holds only
   the rows that count toward sales, so sales is their sum; returns and
   left-out rows are read from their own lists. Results saved before
   these lists existed have none, so every one is read as optional.
   ================================================================ */

const round2 = (n: number) => Math.round(n * 100) / 100;

export const EMPTY_EXCLUDED: Record<ExcludedReason, number> = { zero_quantity: 0, zero_price: 0, zero_revenue: 0, missing_measure: 0, duplicate: 0 };

type SummaryInput = Pick<PipelineResult, 'semantics' | 'engineeredRows'> & Partial<Pick<PipelineResult, 'excludedRows' | 'returnRows' | 'cleaning'>>;

/** Sales (positive rows that count), returns (absolute), net, and the rows left out by reason. */
export function salesSummary(result: SummaryInput): SalesSummary {
  const measureColumn = primaryMeasureColumn(result.semantics.columns, result.engineeredRows);
  const excluded = { ...EMPTY_EXCLUDED };
  for (const row of result.excludedRows ?? []) excluded[row.reason] += 1;
  const salesTotal = measureColumn ? sumColumn(result.engineeredRows, measureColumn) : 0;
  const salesRows = measureColumn ? result.engineeredRows.filter(row => parseAmount(row[measureColumn]) !== null).length : 0;
  const returns = result.returnRows ?? [];
  const returnsTotal = returns.reduce((sum, row) => sum + row.amount, 0);
  return {
    measureColumn,
    salesTotal: round2(salesTotal),
    salesRows,
    returnsTotal: round2(returnsTotal),
    returnCount: returns.length,
    netTotal: round2(salesTotal - returnsTotal),
    excluded,
    excludedCount: (result.excludedRows ?? []).length,
    calculatedCount: result.cleaning?.rowsCalculated ?? 0,
  };
}
