import type { RawRow } from "../../types/dataPipeline";
import type { SemanticIndex } from "../../types/semantic";
import type { EngineeredRow, EngineeredDataset, FeatureDefinition } from "../../types/features";

/* ================================================================
   VERDIO — Stage 7: Adaptive Feature Engineering
   Every derived feature is gated on the source columns actually
   being present with reasonable confidence — nothing here assumes a
   fixed retail schema. Feature names are fixed (__year, __monthKey,
   etc.) so downstream stages don't need to know the original header.
   ================================================================ */

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function engineerFeatures(rows: RawRow[], index: SemanticIndex): EngineeredDataset {
  const addedFeatures: FeatureDefinition[] = [];
  const working: EngineeredRow[] = rows.map(r => ({ ...r }));
  if (!working.length) return { rows: working, addedFeatures };

  const dateCol     = index.best('date');
  const priceCol     = index.best('price');
  const qtyCol       = index.best('quantity');
  const revenueCol   = index.best('revenue');
  const costCol      = index.best('cost');

  /* ── 1. Date parts ── */
  if (dateCol) {
    let converted = 0;
    for (const row of working) {
      const raw = String(row[dateCol.columnName] ?? '');
      const d = raw ? new Date(raw) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      row['__year']       = d.getFullYear();
      row['__month']      = d.getMonth() + 1;
      row['__monthLabel'] = `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      row['__dayOfWeek']  = d.getDay();
      row['__quarter']    = Math.floor(d.getMonth() / 3) + 1;
      row['__monthKey']   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      converted++;
    }
    if (converted > 0) {
      addedFeatures.push({
        name: '__year, __month, __monthLabel, __dayOfWeek, __quarter, __monthKey',
        kind: 'date_part', sourceColumns: [dateCol.columnName],
        description: `Derived calendar parts from "${dateCol.columnName}" for ${converted} row(s).`,
      });
    }
  }

  /* ── 2. Transaction total = price × quantity, only if no revenue column already exists ── */
  if (priceCol && qtyCol && !revenueCol) {
    let computed = 0;
    for (const row of working) {
      const p = Number(row[priceCol.columnName]);
      const q = Number(row[qtyCol.columnName]);
      if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
      row['__transactionValue'] = Math.round(p * q * 100) / 100;
      computed++;
    }
    if (computed > 0) {
      addedFeatures.push({
        name: '__transactionValue', kind: 'total',
        sourceColumns: [priceCol.columnName, qtyCol.columnName],
        description: `Computed "${priceCol.columnName}" × "${qtyCol.columnName}" for ${computed} row(s) — no revenue/total column was present.`,
      });
    }
  }

  /* ── 3. Margin = revenue − cost, only if both exist ── */
  const moneyCol = revenueCol || priceCol;
  if (moneyCol && costCol) {
    let computed = 0;
    for (const row of working) {
      const rev = Number(row[moneyCol.columnName]);
      const cost = Number(row[costCol.columnName]);
      if (!Number.isFinite(rev) || !Number.isFinite(cost)) continue;
      row['__margin'] = Math.round((rev - cost) * 100) / 100;
      row['__marginPct'] = rev !== 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : 0;
      computed++;
    }
    if (computed > 0) {
      addedFeatures.push({
        name: '__margin, __marginPct', kind: 'difference',
        sourceColumns: [moneyCol.columnName, costCol.columnName],
        description: `Computed margin as "${moneyCol.columnName}" − "${costCol.columnName}" for ${computed} row(s).`,
      });
    }
  }

  /* ── 4. Band the primary numeric measure into Low/Medium/High/Very High quartiles ── */
  const primaryMeasure = revenueCol || priceCol || qtyCol;
  const primaryKey = (primaryMeasure && !working.some(r => r['__transactionValue'] !== undefined)) ? primaryMeasure.columnName : (working.some(r => r['__transactionValue'] !== undefined) ? '__transactionValue' : primaryMeasure?.columnName);

  if (primaryKey) {
    const nums = working.map(r => Number(r[primaryKey])).filter(Number.isFinite).sort((a, b) => a - b);
    if (nums.length >= 8) {
      const q1 = quantile(nums, 0.25), q2 = quantile(nums, 0.5), q3 = quantile(nums, 0.75);
      let banded = 0;
      for (const row of working) {
        const v = Number(row[primaryKey]);
        if (!Number.isFinite(v)) continue;
        row['__band'] = v <= q1 ? 'Low' : v <= q2 ? 'Medium' : v <= q3 ? 'High' : 'Very High';
        banded++;
      }
      if (banded > 0) {
        addedFeatures.push({
          name: '__band', kind: 'band', sourceColumns: [primaryKey],
          description: `Bucketed "${primaryKey}" into Low/Medium/High/Very High quartile bands for ${banded} row(s).`,
        });
      }
    }
  }

  return { rows: working, addedFeatures };
}
