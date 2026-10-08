import type { EngineeredRow } from "../../types/features";
import type { SegmentationResult, CustomerSegment, CustomerSegmentLabel } from "../../types/ml";

/* ================================================================
   VERDIO — ML: RFM Segmentation + Churn Risk
   Generalized from calculateMetrics.ts's buildSegments/calcChurnRisk.
   Only call when detectCapabilities confirms 'segmentation' is
   available (customer + date + monetary columns all present).
   ================================================================ */

function quantile(arr: number[], q: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * q)] || 0;
}

/** "2024-07" becomes a month number that can be subtracted; null when the key is not a year-month. */
function monthIndex(key: string): number | null {
  const m = /^(\d{4})-(\d{1,2})/.exec(key);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

function calcChurnRisk(repeatRate: number, revenueChangePct: number, uniqueCustomers: number, cv: number): number {
  let risk = 0;
  risk += Math.max(0, 30 - repeatRate);
  risk += revenueChangePct < 0 ? Math.min(25, Math.abs(revenueChangePct)) : 0;
  risk += uniqueCustomers < 50 ? (25 - uniqueCustomers / 2) : 0;
  risk += Math.min(15, cv * 30);
  return Math.min(100, Math.max(0, Math.round(risk)));
}

export function runSegmentation(
  rows: EngineeredRow[],
  customerCol: string,
  dateCol: string,
  measureCol: string,
  monthlySeries: number[] = []
): SegmentationResult {
  const custSpend: Record<string, number> = {};
  const custOrders: Record<string, number> = {};
  const custLastIdx: Record<string, number> = {};
  let lastIdx = -Infinity;

  for (const row of rows) {
    const id = String(row[customerCol] ?? '').trim();
    const spend = Number(row[measureCol]);
    const monthKey = String(row['__monthKey'] ?? '').trim() || String(row[dateCol] ?? '').slice(0, 7);
    if (!id || !Number.isFinite(spend)) continue;

    custSpend[id] = (custSpend[id] || 0) + spend;
    custOrders[id] = (custOrders[id] || 0) + 1;
    const idx = monthIndex(monthKey);
    if (idx !== null) {
      if (!(id in custLastIdx) || idx > custLastIdx[id]) custLastIdx[id] = idx;
      if (idx > lastIdx) lastIdx = idx;
    }
  }

  const ids = Object.keys(custSpend);
  if (!ids.length) {
    return { customerColumn: customerCol, dateColumn: dateCol, measureColumn: measureCol, segments: [], churnRiskScore: 0, revenueAtRisk: 0 };
  }

  /* Recency = whole months between the customer's last activity and the last month in the data.
     0 means active in the final month. A customer with no usable date counts as 0. */
  const entries = ids.map(id => {
    const recencyMonths = id in custLastIdx ? Math.max(0, lastIdx - custLastIdx[id]) : 0;
    return { id, spend: custSpend[id], orders: custOrders[id], recencyMonths };
  });

  const spends = entries.map(e => e.spend);
  const orderCounts = entries.map(e => e.orders);
  const recencies = entries.map(e => e.recencyMonths);
  const p33s = quantile(spends, 0.33), p66s = quantile(spends, 0.66);
  const p33o = quantile(orderCounts, 0.33), p66o = quantile(orderCounts, 0.66);
  const p33r = quantile(recencies, 0.33), p66r = quantile(recencies, 0.66);

  /* Every customer is scored and counted; any display limit belongs in the UI. */
  const segments: CustomerSegment[] = entries.map(e => {
    /* Fewer months since the last activity scores higher. */
    const R = e.recencyMonths <= p33r ? 3 : e.recencyMonths <= p66r ? 2 : 1;
    const F = e.orders >= p66o ? 3 : e.orders >= p33o ? 2 : 1;
    const M = e.spend >= p66s ? 3 : e.spend >= p33s ? 2 : 1;
    const rfmScore = R + F + M;
    /* R === 1 means the customer is in the least recently active third and has not been active for
       at least a month. Of those, frequent or high-value customers are at risk and the rest are lapsed. */
    const segment: CustomerSegmentLabel =
      rfmScore >= 8 ? 'champion'
      : R === 1 ? (rfmScore >= 5 ? 'atRisk' : 'lost')
      : rfmScore >= 6 ? 'loyal'
      : 'new';
    return { id: e.id, monetary: Math.round(e.spend), frequency: e.orders, recencyMonths: e.recencyMonths, segment, rfmScore };
  }).sort((a, b) => b.rfmScore - a.rfmScore);

  const repeatRate = ids.length ? Math.round((entries.filter(e => e.orders > 1).length / ids.length) * 100) : 0;
  const revenueChangePct = monthlySeries.length > 1 ? ((monthlySeries[monthlySeries.length - 1] - monthlySeries[0]) / (monthlySeries[0] || 1)) * 100 : 0;
  const mean = monthlySeries.length ? monthlySeries.reduce((s, v) => s + v, 0) / monthlySeries.length : 0;
  const cv = monthlySeries.length > 1 && mean ? Math.sqrt(monthlySeries.reduce((s, v) => s + (v - mean) ** 2, 0) / monthlySeries.length) / mean : 0;

  const churnRiskScore = calcChurnRisk(repeatRate, revenueChangePct, ids.length, cv);
  const totalRevenue = spends.reduce((s, v) => s + v, 0);
  const atRiskCount = segments.filter(s => s.segment === 'atRisk' || s.segment === 'lost').length;
  const revenueAtRisk = Math.round(totalRevenue * (churnRiskScore / 100) * (atRiskCount / (ids.length || 1)) * 0.5 + totalRevenue * churnRiskScore / 100 * 0.1);

  return { customerColumn: customerCol, dateColumn: dateCol, measureColumn: measureCol, segments, churnRiskScore, revenueAtRisk };
}
