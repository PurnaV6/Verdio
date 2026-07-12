import type { DatasetProfile, Capability, CapabilityReport } from "../../types/dataPipeline";
import type { SemanticIndex, ColumnSemantics, BusinessRole } from "../../types/semantic";

/* ================================================================
   VERDIO — Stage 6: Capability Detection
   Instead of assuming one fixed dataset type, Verdio asks: given what
   we actually found, which analyses are valid? Downstream stages
   (feature engineering, analysis candidate generation, ML) should
   check this report before running — an unavailable capability must
   not silently produce a chart or forecast from data that can't
   support it.
   ================================================================ */

const MIN_ROWS_FOR_DISTRIBUTION = 10;
const MIN_ROWS_FOR_CORRELATION  = 15;
const MIN_MONTHS_FOR_ANOMALY    = 3;
const MIN_MONTHS_FOR_FORECAST   = 6;

function avgConfidence(cols: ColumnSemantics[]): number {
  if (!cols.length) return 0;
  return Math.round((cols.reduce((s, c) => s + c.confidence, 0) / cols.length) * 100) / 100;
}

export function detectCapabilities(profile: DatasetProfile, index: SemanticIndex): CapabilityReport {
  const date       = index.best('date');
  const money      = index.best('revenue') || index.best('price') || index.best('cost');
  const quantity   = index.best('quantity');
  const customer   = index.best('customer');
  const identifier = index.best('identifier');
  const categoryDims = [index.best('category'), index.best('product'), index.best('location'), index.best('status')].filter(Boolean) as ColumnSemantics[];
  const numericMeasure = money || quantity;

  const numericRoles: ColumnSemantics[] = (['price', 'cost', 'revenue', 'quantity', 'percentage', 'inventory', 'duration'] as BusinessRole[])
    .flatMap(r => index.get(r));
  const distinctMonths = date ? (profile.columns.find(c => c.name === date.columnName)?.dateStats?.distinctMonths ?? 0) : 0;

  const capabilities: Capability[] = [];

  capabilities.push(date && numericMeasure
    ? { type: 'trend_analysis', available: true, reason: `"${date.columnName}" over time against "${numericMeasure.columnName}".`, columns: [date.columnName, numericMeasure.columnName], confidence: avgConfidence([date, numericMeasure]) }
    : { type: 'trend_analysis', available: false, reason: 'Requires a date column and a numeric measure.', columns: [], confidence: 0 });

  capabilities.push(categoryDims.length && numericMeasure
    ? { type: 'comparison', available: true, reason: `"${numericMeasure.columnName}" broken down by "${categoryDims[0].columnName}".`, columns: [categoryDims[0].columnName, numericMeasure.columnName], confidence: avgConfidence([categoryDims[0], numericMeasure]) }
    : { type: 'comparison', available: false, reason: 'Requires a category-like column (product, location, status) and a numeric measure.', columns: [], confidence: 0 });

  capabilities.push(numericMeasure && profile.rowCount >= MIN_ROWS_FOR_DISTRIBUTION
    ? { type: 'distribution', available: true, reason: `Distribution of "${numericMeasure.columnName}" across ${profile.rowCount} rows.`, columns: [numericMeasure.columnName], confidence: avgConfidence([numericMeasure]) }
    : { type: 'distribution', available: false, reason: `Requires a numeric column and at least ${MIN_ROWS_FOR_DISTRIBUTION} rows.`, columns: [], confidence: 0 });

  capabilities.push(numericRoles.length >= 2 && profile.rowCount >= MIN_ROWS_FOR_CORRELATION
    ? { type: 'correlation', available: true, reason: `Relationship between "${numericRoles[0].columnName}" and "${numericRoles[1].columnName}".`, columns: [numericRoles[0].columnName, numericRoles[1].columnName], confidence: avgConfidence(numericRoles.slice(0, 2)) }
    : { type: 'correlation', available: false, reason: `Requires at least two numeric columns and ${MIN_ROWS_FOR_CORRELATION}+ rows.`, columns: [], confidence: 0 });

  capabilities.push(customer && date && money
    ? { type: 'segmentation', available: true, reason: `RFM segmentation using "${customer.columnName}", "${date.columnName}" and "${money.columnName}".`, columns: [customer.columnName, date.columnName, money.columnName], confidence: avgConfidence([customer, date, money]) }
    : { type: 'segmentation', available: false, reason: 'Requires a customer column, a date column and a monetary column.', columns: [], confidence: 0 });

  capabilities.push(date && numericMeasure && distinctMonths >= MIN_MONTHS_FOR_ANOMALY
    ? { type: 'anomaly_detection', available: true, reason: `Z-score anomaly detection across ${distinctMonths} time periods of "${numericMeasure.columnName}".`, columns: [date.columnName, numericMeasure.columnName], confidence: avgConfidence([date, numericMeasure]) }
    : { type: 'anomaly_detection', available: false, reason: `Requires a date column, a numeric measure, and at least ${MIN_MONTHS_FOR_ANOMALY} distinct time periods.`, columns: [], confidence: 0 });

  capabilities.push(date && numericMeasure && distinctMonths >= MIN_MONTHS_FOR_FORECAST
    ? { type: 'forecasting', available: true, reason: `Regression/Holt forecasting using ${distinctMonths} months of "${numericMeasure.columnName}".`, columns: [date.columnName, numericMeasure.columnName], confidence: avgConfidence([date, numericMeasure]) }
    : { type: 'forecasting', available: false, reason: `Requires at least ${MIN_MONTHS_FOR_FORECAST} distinct time periods of history for a numeric measure.`, columns: [], confidence: 0 });

  capabilities.push(categoryDims.length && money
    ? { type: 'concentration_analysis', available: true, reason: `Share of "${money.columnName}" concentrated in top "${categoryDims[0].columnName}" values.`, columns: [categoryDims[0].columnName, money.columnName], confidence: avgConfidence([categoryDims[0], money]) }
    : { type: 'concentration_analysis', available: false, reason: 'Requires a category-like column and a monetary column.', columns: [], confidence: 0 });

  capabilities.push(customer && date && distinctMonths >= 2
    ? { type: 'cohort_analysis', available: true, reason: `Customer cohorts by first-purchase month using "${customer.columnName}" and "${date.columnName}".`, columns: [customer.columnName, date.columnName], confidence: avgConfidence([customer, date]) }
    : { type: 'cohort_analysis', available: false, reason: 'Requires a customer column and at least 2 distinct time periods.', columns: [], confidence: 0 });

  capabilities.push((identifier || customer) && date && money
    ? { type: 'transaction_analysis', available: true, reason: `Order-level analysis using "${(identifier || customer)!.columnName}", "${date.columnName}" and "${money.columnName}".`, columns: [(identifier || customer)!.columnName, date.columnName, money.columnName], confidence: avgConfidence([identifier || customer!, date, money]) }
    : { type: 'transaction_analysis', available: false, reason: 'Requires an identifier or customer column, a date column and a monetary column.', columns: [], confidence: 0 });

  capabilities.push(date && numericMeasure && profile.rowCount >= 30
    ? { type: 'seasonality', available: true, reason: `Day-of-week and month-of-year patterns in "${numericMeasure.columnName}" using "${date.columnName}".`, columns: [date.columnName, numericMeasure.columnName], confidence: avgConfidence([date, numericMeasure]) }
    : { type: 'seasonality', available: false, reason: 'Requires a date column, a numeric measure, and at least 30 rows for day/month patterns to be meaningful.', columns: [], confidence: 0 });

  return { capabilities, available: capabilities.filter(c => c.available) };
}
