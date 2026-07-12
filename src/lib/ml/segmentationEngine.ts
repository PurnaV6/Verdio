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
  const custFirstMonth: Record<string, string> = {};
  let lastMonthKey = '';

  for (const row of rows) {
    const id = String(row[customerCol] ?? '').trim();
    const spend = Number(row[measureCol]);
    const monthKey = String(row['__monthKey'] ?? '').trim() || String(row[dateCol] ?? '').slice(0, 7);
    if (!id || !Number.isFinite(spend)) continue;

    custSpend[id] = (custSpend[id] || 0) + spend;
    custOrders[id] = (custOrders[id] || 0) + 1;
    if (monthKey) {
      if (!custFirstMonth[id] || monthKey < custFirstMonth[id]) custFirstMonth[id] = monthKey;
      if (monthKey > lastMonthKey) lastMonthKey = monthKey;
    }
  }

  const ids = Object.keys(custSpend);
  if (!ids.length) {
    return { customerColumn: customerCol, dateColumn: dateCol, measureColumn: measureCol, segments: [], churnRiskScore: 0, revenueAtRisk: 0 };
  }

  const entries = ids.map(id => {
    const first = custFirstMonth[id] || lastMonthKey;
    const [fy, fm] = first.split('-').map(Number);
    const [ly, lm] = (lastMonthKey || first).split('-').map(Number);
    const monthsActive = Math.max(1, (ly - fy) * 12 + (lm - fm));
    return { id, spend: custSpend[id], orders: custOrders[id], monthsActive };
  });

  const spends = entries.map(e => e.spend);
  const orderCounts = entries.map(e => e.orders);
  const recencies = entries.map(e => e.monthsActive);
  const p33s = quantile(spends, 0.33), p66s = quantile(spends, 0.66);
  const p33o = quantile(orderCounts, 0.33), p66o = quantile(orderCounts, 0.66);
  const p33r = quantile(recencies, 0.33), p66r = quantile(recencies, 0.66);

  const segments: CustomerSegment[] = entries.slice(0, 500).map(e => {
    const R = e.monthsActive <= p33r ? 3 : e.monthsActive <= p66r ? 2 : 1;
    const F = e.orders >= p66o ? 3 : e.orders >= p33o ? 2 : 1;
    const M = e.spend >= p66s ? 3 : e.spend >= p33s ? 2 : 1;
    const rfmScore = R + F + M;
    const segment: CustomerSegmentLabel =
      rfmScore >= 8 ? 'champion' : rfmScore >= 6 ? 'loyal' : rfmScore >= 5 ? 'atRisk' : R === 1 ? 'lost' : 'new';
    return { id: e.id, monetary: Math.round(e.spend), frequency: e.orders, segment, rfmScore };
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
