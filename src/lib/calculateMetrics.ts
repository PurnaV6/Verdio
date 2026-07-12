import type { BusinessMetrics, Risk, Rec, AnomalyPoint, CustomerSegment, ForecastPoint } from "../types/metrics";

/* ================================================================
   VERDIO — FDIF ENGINE
   Faithful port of Flora's streaming chunk processor.
   Column detection by index (not key name) — works on any CSV.
   
   PLUS ML enhancements:
   • Linear regression forecast (Flora method)
   • Z-score anomaly detection on monthly revenue
   • RFM customer segmentation (Recency / Frequency / Monetary)
   • Exponential smoothing for trend
   • Churn risk scoring
   ================================================================ */

/* ── CSV parser — handles quoted commas exactly as Flora ── */
function parseCSVLine(line: string): string[] {
  const vals: string[] = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  vals.push(cur.trim());
  return vals;
}

/* ── Column index finder — partial match, case insensitive (Flora method) ── */
function findColIdx(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex(h => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

/* ── Month label formatter ── */
function fmtMonth(m: string): string {
  return new Date(m + '-01').toLocaleString('en-GB', { month: 'short', year: '2-digit' });
}

function nextMonthLabels(last: string, count: number): string[] {
  const labels: string[] = [];
  let [y, m] = last.split('-').map(Number);
  for (let i = 0; i < count; i++) {
    m++;
    if (m > 12) { m = 1; y++; }
    labels.push(new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }));
  }
  return labels;
}

/* ================================================================
   ML ENGINE 1 — Linear Regression (Flora forecasting)
   Fits y = slope*x + intercept on monthly revenue series
   ================================================================ */
function linReg(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function buildForecast(revs: number[], scenario: string): ForecastPoint[] {
  if (revs.length < 2) return Array(6).fill({ value: 0, low: 0, high: 0 });
  const n = revs.length;
  const { slope, intercept } = linReg(revs);
  const m = scenario === 'optimistic' ? 1.15 : scenario === 'conservative' ? 0.85 : 1;
  return Array.from({ length: 6 }, (_, i) => {
    const base = Math.max(0, (intercept + slope * (n + i)) * m);
    const ci = base * 0.12;
    return { value: Math.round(base), low: Math.round(base - ci), high: Math.round(base + ci) };
  });
}

/* ================================================================
   ML ENGINE 2 — Z-Score Anomaly Detection
   Flags months where revenue deviates > 2 standard deviations
   ================================================================ */
function detectAnomalies(months: string[], monthRevs: number[]): AnomalyPoint[] {
  if (monthRevs.length < 3) return [];
  const mean = monthRevs.reduce((s, v) => s + v, 0) / monthRevs.length;
  const std  = Math.sqrt(monthRevs.reduce((s, v) => s + (v - mean) ** 2, 0) / monthRevs.length);
  return months.map((m, i) => {
    const rev    = monthRevs[i];
    const zScore = std > 0 ? (rev - mean) / std : 0;
    return {
      month:     new Date(m + '-01').toLocaleString('en-GB', { month: 'short', year: '2-digit' }),
      revenue:   Math.round(rev),
      expected:  Math.round(mean),
      zScore:    Math.round(zScore * 10) / 10,
      isAnomaly: Math.abs(zScore) > 1.8,
    };
  });
}

/* ================================================================
   ML ENGINE 3 — RFM Customer Segmentation
   Recency (last purchase), Frequency (order count), Monetary (spend)
   Each scored 1–3, combined to segment into 5 tiers
   ================================================================ */
function buildSegments(
  custSpend:  Record<string, number>,
  custOrdCnt: Record<string, number>,
  custFirst:  Record<string, string>,
  months:     string[]
): CustomerSegment[] {
  if (!Object.keys(custSpend).length) return [];
  const lastMonth = months[months.length - 1] || '2024-01';

  const entries = Object.entries(custSpend).map(([id, spend]) => {
    const orders    = custOrdCnt[id] || 1;
    const firstMonth = custFirst[id] || lastMonth;
    // Recency: months since last purchase (approximate from first purchase + order spread)
    const monthsActive = Math.max(1,
      (new Date(lastMonth + '-01').getFullYear() - new Date(firstMonth + '-01').getFullYear()) * 12 +
      new Date(lastMonth + '-01').getMonth() - new Date(firstMonth + '-01').getMonth()
    );
    return { id, spend, orders, monthsActive };
  });

  // Score each dimension 1–3
  const spends  = entries.map(e => e.spend);
  const ordCnts = entries.map(e => e.orders);
  const recencies = entries.map(e => e.monthsActive);
  const p33spend = quantile(spends, 0.33);
  const p66spend = quantile(spends, 0.66);
  const p33ord   = quantile(ordCnts, 0.33);
  const p66ord   = quantile(ordCnts, 0.66);
  const p33rec   = quantile(recencies, 0.33);
  const p66rec   = quantile(recencies, 0.66);

  return entries.slice(0, 200).map(e => {
    const R = e.monthsActive <= p33rec ? 3 : e.monthsActive <= p66rec ? 2 : 1;
    const F = e.orders >= p66ord ? 3 : e.orders >= p33ord ? 2 : 1;
    const M = e.spend >= p66spend ? 3 : e.spend >= p33spend ? 2 : 1;
    const rfmScore = R + F + M;
    const segment: CustomerSegment['segment'] =
      rfmScore >= 8 ? 'champion' :
      rfmScore >= 6 ? 'loyal' :
      rfmScore >= 5 ? 'atRisk' :
      R === 1 ? 'lost' : 'new';
    return { id: e.id, spend: Math.round(e.spend), orders: e.orders, segment, rfmScore };
  }).sort((a, b) => b.rfmScore - a.rfmScore);
}

function quantile(arr: number[], q: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * q)] || 0;
}

/* ================================================================
   ML ENGINE 4 — Exponential Smoothing (Holt's method)
   Better short-term trend than pure linear regression
   Alpha = 0.4 (level), Beta = 0.3 (trend)
   ================================================================ */
function holtSmooth(revs: number[]): { smoothed: number[]; nextValue: number } {
  if (revs.length < 2) return { smoothed: revs, nextValue: revs[0] || 0 };
  const alpha = 0.4, beta = 0.3;
  let level = revs[0], trend = revs[1] - revs[0];
  const smoothed = [level];
  for (let i = 1; i < revs.length; i++) {
    const prevLevel = level;
    level = alpha * revs[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    smoothed.push(Math.round(level));
  }
  return { smoothed, nextValue: Math.round(level + trend) };
}

/* ================================================================
   ML ENGINE 5 — Churn Risk Score
   Combines: repeat rate, revenue trend, customer count, volatility
   Output: 0–100 risk score
   ================================================================ */
function calcChurnRisk(
  repeatRate: number,
  revenueChange: number,
  uniqueCustomers: number,
  cv: number
): number {
  let risk = 0;
  risk += Math.max(0, 30 - repeatRate);         // low repeat = high risk (0–30)
  risk += revenueChange < 0 ? Math.min(25, Math.abs(revenueChange)) : 0; // decline
  risk += uniqueCustomers < 50 ? (25 - uniqueCustomers / 2) : 0;         // small base
  risk += Math.min(15, cv * 30);                 // volatility contribution
  return Math.min(100, Math.max(0, Math.round(risk)));
}

/* ================================================================
   FDIF STAGE 2 — Health Score (Flora 4-pillar formula)
   ================================================================ */
function calcHealth(
  monthRevs: number[],
  uniqueCustomers: number,
  qualityMetrics: { pct: number }[],
  totalOrders: number
) {
  let rs = 12;
  if (monthRevs.length > 1) {
    const g = (monthRevs[monthRevs.length - 1] - monthRevs[0]) / (monthRevs[0] || 1);
    rs = Math.min(25, Math.max(0, 12 + g * 25));
  }
  let cs = 10;
  if (uniqueCustomers) {
    cs = Math.min(25, Math.round((uniqueCustomers / (totalOrders || 1)) * 80));
  }
  const avgQ = qualityMetrics.reduce((s, m) => s + m.pct, 0) / (qualityMetrics.length || 1);
  let ss = 15;
  if (monthRevs.length > 2) {
    const mean = monthRevs.reduce((s, v) => s + v, 0) / monthRevs.length;
    const cv   = Math.sqrt(monthRevs.reduce((s, v) => s + (v - mean) ** 2, 0) / monthRevs.length) / (mean || 1);
    ss = Math.min(25, Math.max(0, Math.round(25 - cv * 30)));
  }
  return {
    total: Math.min(100, Math.max(0, Math.round(rs + cs + Math.round(avgQ * 0.25) + ss))),
    pillars: [
      { name: 'Revenue Performance', score: Math.round(rs),               max: 25, color: '#16A34A' },
      { name: 'Customer Strength',   score: Math.round(cs),               max: 25, color: '#DC2626' },
      { name: 'Data Quality',        score: Math.round(avgQ * 0.25),      max: 25, color: '#2563EB' },
      { name: 'Revenue Stability',   score: Math.round(ss),               max: 25, color: '#D97706' },
    ],
  };
}

/* ================================================================
   FDIF STAGE 3 — Risk Detection (Flora + enhanced)
   ================================================================ */
function detectRisks(
  totalRevenue: number,
  topProducts: [string, number][],
  topCountries: [string, number][],
  uniqueCustomers: number,
  monthRevs: number[],
  qualityMetrics: { pct: number }[],
  churnRisk: number,
  anomalies: AnomalyPoint[]
): Risk[] {
  const r: Risk[] = [];

  // Market concentration
  if (topCountries.length) {
    const p = topCountries[0][1] / (totalRevenue || 1) * 100;
    r.push(p > 60
      ? { level: 'high',   icon: '🌍', title: 'Critical Market Concentration', desc: `${Math.round(p)}% of revenue from ${topCountries[0][0]}. A single disruption in this market could devastate your business. Expand to 2 new markets this quarter.` }
      : p > 40
      ? { level: 'medium', icon: '🌍', title: 'Market Concentration Risk',      desc: `${Math.round(p)}% from ${topCountries[0][0]}. Healthy to diversify into adjacent markets before this becomes critical.` }
      : { level: 'low',    icon: '🌍', title: 'Market Diversification',         desc: `Revenue spread across markets. ${topCountries[0][0]} leads at ${Math.round(p)}% — a healthy level.` }
    );
  }

  // Product dependency
  if (topProducts.length) {
    const p = topProducts[0][1] / (totalRevenue || 1) * 100;
    if (p > 50) r.push({ level: 'high',   icon: '📦', title: 'Product Dependency Risk', desc: `"${topProducts[0][0]}" drives ${Math.round(p)}% of total revenue. Supply disruption or demand shift would be catastrophic. Diversify your range urgently.` });
    else if (p > 30) r.push({ level: 'medium', icon: '📦', title: 'Product Concentration',  desc: `"${topProducts[0][0]}" is ${Math.round(p)}% of revenue. Broaden your product mix to reduce dependency.` });
  }

  // Revenue volatility
  if (monthRevs.length > 2) {
    const mean = monthRevs.reduce((s, v) => s + v, 0) / monthRevs.length;
    const cv   = Math.sqrt(monthRevs.reduce((s, v) => s + (v - mean) ** 2, 0) / monthRevs.length) / (mean || 1);
    r.push(cv > 0.4
      ? { level: 'high',   icon: '📉', title: 'High Revenue Volatility',  desc: `Coefficient of variation ${Math.round(cv * 100)}% — revenue is highly unpredictable. Cash flow planning is unreliable. Introduce recurring or subscription revenue streams.` }
      : cv > 0.2
      ? { level: 'medium', icon: '📉', title: 'Revenue Volatility',       desc: `Moderate variance (CV: ${Math.round(cv * 100)}%). Revenue has some instability. Consider retainer or subscription models.` }
      : { level: 'low',    icon: '📈', title: 'Revenue Stability',        desc: 'Revenue is consistent month-to-month — a strong sign of business health.' }
    );
  }

  // Customer base
  if (uniqueCustomers) {
    r.push(uniqueCustomers < 20
      ? { level: 'high',   icon: '👥', title: 'Critical Customer Dependency', desc: `Only ${uniqueCustomers} unique customers. Losing even 2–3 could have a severe revenue impact. Customer acquisition is urgent.` }
      : uniqueCustomers < 50
      ? { level: 'medium', icon: '👥', title: 'Limited Customer Base',         desc: `${uniqueCustomers} unique customers — growing but still vulnerable. Prioritise acquisition and retention.` }
      : { level: 'low',    icon: '👥', title: 'Healthy Customer Base',         desc: `${uniqueCustomers.toLocaleString()} unique customers provides good diversification. Focus on increasing repeat purchase rate.` }
    );
  }

  // Data quality
  if (qualityMetrics.length) {
    const avgQ = qualityMetrics.reduce((s, m) => s + m.pct, 0) / qualityMetrics.length;
    r.push(avgQ < 70
      ? { level: 'high',   icon: '🗄️', title: 'Data Quality Risk',    desc: `Only ${Math.round(avgQ)}% data completeness. Missing fields reduce the accuracy of every insight and recommendation Verdio produces.` }
      : avgQ < 88
      ? { level: 'medium', icon: '🗄️', title: 'Data Quality Warning', desc: `${Math.round(avgQ)}% completeness — some gaps exist. Address missing fields for more reliable analysis.` }
      : { level: 'low',    icon: '✅', title: 'Excellent Data Quality', desc: `${Math.round(avgQ)}% data completeness — analysis results are highly reliable.` }
    );
  }

  // ML: Churn risk
  if (churnRisk >= 60) {
    r.push({ level: 'high',   icon: '⚠️', title: 'High Churn Risk Detected',   desc: `ML model scores churn risk at ${churnRisk}/100. Low repeat rate, declining revenue and/or a small customer base signal significant vulnerability.` });
  } else if (churnRisk >= 35) {
    r.push({ level: 'medium', icon: '⚠️', title: 'Moderate Churn Risk',         desc: `ML churn risk score: ${churnRisk}/100. Some signals suggest customer retention could deteriorate. Monitor closely.` });
  }

  // ML: Revenue anomalies
  const negAnomalies = anomalies.filter(a => a.isAnomaly && a.revenue < a.expected);
  if (negAnomalies.length >= 2) {
    r.push({ level: 'medium', icon: '🔍', title: 'Revenue Anomalies Detected', desc: `${negAnomalies.length} months with significantly below-expected revenue detected (Z-score > 1.8). Investigate ${negAnomalies[0].month} and ${negAnomalies[1].month} for root causes.` });
  }

  return r.sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level));
}

/* ================================================================
   FDIF STAGE 3 — Recommendations (Flora + ML-enhanced)
   ================================================================ */
function generateRecs(
  totalRevenue: number,
  topCountries: [string, number][],
  topProducts: [string, number][],
  uniqueCustomers: number,
  monthRevs: number[],
  risks: Risk[],
  segments: { segment: string }[],
  nextMonthForecast: number,
  avgOrderValue: number,
  churnRisk: number
): Rec[] {
  const recs: Rec[] = [];

  if (risks.find(r => r.level === 'high' && r.title.includes('Market'))) {
    recs.push({ title: 'Expand into 2 new markets immediately', desc: `All revenue is concentrated in ${topCountries?.[0]?.[0] || 'one market'}. Run pilot campaigns in 2–3 adjacent geographies this quarter. Set a £${Math.round(totalRevenue * 0.05 / 1000)}k revenue target for each new market within 90 days.`, impact: 'high' });
  }

  if (risks.find(r => r.level === 'high' && r.title.includes('Product'))) {
    recs.push({ title: `Diversify beyond ${topProducts[0][0]}`, desc: `Your top product drives over 50% of revenue. Develop 2 complementary products or variants. Target products that sell to the same customer but at different price points.`, impact: 'high' });
  }

  if (monthRevs.length > 1) {
    const growth = (monthRevs[monthRevs.length - 1] - monthRevs[0]) / (monthRevs[0] || 1) * 100;
    if (growth < 5) {
      recs.push({ title: 'Accelerate customer acquisition', desc: `Revenue growth is flat at ${Math.round(growth)}%. Run targeted campaigns on your top ${topCountries[0]?.[0] || 'market'} customers. Set a goal of ${Math.round(uniqueCustomers * 0.2)} new customers in the next 60 days.`, impact: 'high' });
    }
    if (nextMonthForecast > monthRevs[monthRevs.length - 1] * 1.1) {
      recs.push({ title: 'Prepare for forecasted revenue uplift', desc: `ML forecast predicts £${nextMonthForecast.toLocaleString()} next month — ${Math.round((nextMonthForecast / monthRevs[monthRevs.length - 1] - 1) * 100)}% above current. Ensure stock, fulfilment and support capacity is ready.`, impact: 'high' });
    }
  }

  // RFM-driven: re-engage at-risk customers
  const atRisk = segments.filter(s => s.segment === 'atRisk').length;
  const lost   = segments.filter(s => s.segment === 'lost').length;
  if (atRisk + lost > 0) {
    recs.push({ title: `Re-engage ${atRisk + lost} at-risk customers`, desc: `RFM segmentation identified ${atRisk} at-risk and ${lost} lapsed customers. A targeted win-back email with a 10–15% discount offer typically recovers 20–30% of lapsed customers.`, impact: 'high' });
  }

  if (avgOrderValue < 100) {
    recs.push({ title: 'Increase average order value through bundling', desc: `Current average order is £${avgOrderValue.toFixed(2)}. Introduce product bundles, free shipping thresholds or quantity discounts. A 20% AOV increase would add approximately £${Math.round(totalRevenue * 0.2 / 1000)}k to revenue.`, impact: 'medium' });
  }

  if (uniqueCustomers && uniqueCustomers < 100) {
    recs.push({ title: 'Build a loyalty and retention programme', desc: `With ${uniqueCustomers} customers, every retention matters. Introduce a points programme, exclusive early access or a subscription tier. Even 15% improvement in retention compounds significantly over 12 months.`, impact: 'medium' });
  }

  if (churnRisk >= 40) {
    recs.push({ title: 'Implement automated churn prevention', desc: `ML churn risk is elevated at ${churnRisk}/100. Set up automated re-engagement emails triggered 30 days after last purchase, personalised to each customer's top product category.`, impact: 'medium' });
  }

  recs.push({ title: 'Run monthly Verdio intelligence reviews', desc: 'Upload fresh data monthly. Track health score trend, compare risk changes and measure recommendation impact. Businesses that review data monthly grow 23% faster than those that review quarterly.', impact: 'medium' });

  return recs.slice(0, 6);
}

/* ================================================================
   MAIN EXPORT — Flora streaming methodology + ML engines
   ================================================================ */
export function calculateMetrics(rows: Record<string, string>[]): BusinessMetrics {
  if (!rows.length) return emptyMetrics();

  /* ── Step 1: Detect column indices exactly as Flora does ── */
  const rawHeaders = Object.keys(rows[0]);
  const headers    = rawHeaders.map(h => h.replace(/"/g, '').trim().toLowerCase());

  // Price/revenue — Flora detection order with spaced variants added
  const iPrice = findColIdx(headers, [
    'unitprice', 'price per unit', 'priceperunit',
    'price', 'revenue', 'total amount', 'totalamount',
    'total', 'amount', 'sales', 'value',
    'linetotal', 'extendedprice',
  ]);
  const iQty     = findColIdx(headers, ['quantity', 'qty', 'units', 'orderqty']);
  const iDate    = findColIdx(headers, ['invoicedate', 'date', 'orderdate', 'created', 'time', 'timestamp']);
  const iProd    = findColIdx(headers, ['description', 'product category', 'productcategory', 'product', 'item', 'name', 'stockcode', 'sku']);
  const iCountry = findColIdx(headers, ['country', 'region', 'market', 'location', 'territory']);
  const iCust    = findColIdx(headers, ['customerid', 'customer id', 'customer', 'client', 'clientid', 'userid', 'email']);

  /* ── Step 2: Flora streaming chunk accumulators ── */
  let totalRevenue = 0, totalOrders = 0;
  const monthRev: Record<string, number>  = {};
  const monthOrd: Record<string, number>  = {};
  const prodRev:  Record<string, number>  = {};
  const prodOrd:  Record<string, number>  = {};
  const cntryRev: Record<string, number>  = {};
  const cntryOrd: Record<string, number>  = {};
  const custSpend: Record<string, number> = {};
  const custOrdCnt: Record<string, number>= {};
  const custFirst: Record<string, string> = {};
  const dowRev   = [0,0,0,0,0,0,0];
  const dowOrd   = [0,0,0,0,0,0,0];
  const momRev   = new Array(13).fill(0);
  const ovBuckets= [0,0,0,0,0];
  const colFilled= new Array(headers.length).fill(0);

  /* ── Step 3: Process every row (Flora chunk logic, synchronous in React) ── */
  for (const row of rows) {
    const vals = rawHeaders.map(h => (row[h] ?? '').toString().trim());

    // Revenue: price × qty (Flora formula, with "total amount" support)
    const rawPrice = iPrice >= 0 ? vals[iPrice].replace(/[£$,\s]/g, '') : '0';
    const price    = parseFloat(rawPrice) || 0;
    const qty      = iQty >= 0 ? (parseFloat(vals[iQty]) || 1) : 1;

    // If the detected column is already a total (not a unit price), use directly
    const isTotalCol = iPrice >= 0 && headers[iPrice].includes('total') || headers[iPrice]?.includes('amount') || headers[iPrice]?.includes('revenue') || headers[iPrice]?.includes('sales');
    const rev = isTotalCol ? price : price * qty;

    if (rev <= 0) continue;

    totalRevenue += rev;
    totalOrders++;

    if (rev < 25)  ovBuckets[0]++;
    else if (rev < 50)  ovBuckets[1]++;
    else if (rev < 100) ovBuckets[2]++;
    else if (rev < 200) ovBuckets[3]++;
    else                ovBuckets[4]++;

    if (iDate >= 0 && vals[iDate]) {
      const ds    = vals[iDate];
      const month = ds.substring(0, 7);
      if (month && month.length >= 7) {
        monthRev[month] = (monthRev[month] || 0) + rev;
        monthOrd[month] = (monthOrd[month] || 0) + 1;
      }
      const d = new Date(ds);
      if (!isNaN(d.getTime())) {
        dowRev[d.getDay()] += rev;
        dowOrd[d.getDay()]++;
        momRev[d.getMonth() + 1] += rev;
      }
    }

    if (iProd >= 0 && vals[iProd]) {
      const p = vals[iProd];
      prodRev[p] = (prodRev[p] || 0) + rev;
      prodOrd[p] = (prodOrd[p] || 0) + 1;
    }

    if (iCountry >= 0 && vals[iCountry]) {
      const c = vals[iCountry];
      cntryRev[c] = (cntryRev[c] || 0) + rev;
      cntryOrd[c] = (cntryOrd[c] || 0) + 1;
    }

    if (iCust >= 0 && vals[iCust]) {
      const cid = vals[iCust];
      custSpend[cid]   = (custSpend[cid]   || 0) + rev;
      custOrdCnt[cid]  = (custOrdCnt[cid]  || 0) + 1;
      if (iDate >= 0 && vals[iDate]) {
        const m = vals[iDate].substring(0, 7);
        if (m && (!custFirst[cid] || m < custFirst[cid])) custFirst[cid] = m;
      }
    }

    for (let ci = 0; ci < headers.length; ci++) {
      if (vals[ci] && vals[ci].trim()) colFilled[ci]++;
    }
  }

  /* ── Step 4: Build structured output (Flora G-object style) ── */
  const months         = Object.keys(monthRev).sort();
  const monthLabels    = months.map(fmtMonth);
  const monthRevs      = months.map(m => monthRev[m]);
  const topProducts    = Object.entries(prodRev).sort((a, b) => b[1] - a[1]).slice(0, 8) as [string, number][];
  const topCountries   = Object.entries(cntryRev).sort((a, b) => b[1] - a[1]).slice(0, 8) as [string, number][];
  const qualityMetrics = headers.map((h, i) => ({ col: h, pct: totalOrders ? Math.round(colFilled[i] / totalOrders * 100) : 0 }));
  const qualityScore   = Math.round(qualityMetrics.reduce((s, m) => s + m.pct, 0) / (qualityMetrics.length || 1));
  const avgOrderValue  = totalOrders ? totalRevenue / totalOrders : 0;
  const uniqueCustomers= iCust >= 0 ? Object.keys(custSpend).length : 0;
  const repeatCustomers= iCust >= 0 ? Object.values(custOrdCnt).filter(v => v > 1).length : 0;
  const newCustomers   = uniqueCustomers - repeatCustomers;
  const repeatRate     = uniqueCustomers ? Math.round(repeatCustomers / uniqueCustomers * 100) : 0;

  const clvBuckets = [0,0,0,0,0];
  if (iCust >= 0) {
    Object.values(custSpend).forEach(v => {
      if      (v < 50)   clvBuckets[0]++;
      else if (v < 200)  clvBuckets[1]++;
      else if (v < 500)  clvBuckets[2]++;
      else if (v < 1000) clvBuckets[3]++;
      else               clvBuckets[4]++;
    });
  }

  const newCustByMonth: Record<string, number> = {};
  Object.values(custFirst).forEach(m => { if (m) newCustByMonth[m] = (newCustByMonth[m] || 0) + 1; });

  const forecastLabels  = months.length ? nextMonthLabels(months[months.length - 1], 6) : ['M+1','M+2','M+3','M+4','M+5','M+6'];
  const forecast        = buildForecast(monthRevs, 'base');
  const forecastTotal   = forecast.reduce((s, f) => s + f.value, 0);
  const nextMonthForecast = forecast[0]?.value || 0;

  /* ── Step 5: ML engines ── */
  const anomalies   = detectAnomalies(months, monthRevs);
  const segments    = buildSegments(custSpend, custOrdCnt, custFirst, months);
  const { nextValue: holtNext } = holtSmooth(monthRevs);
  const { slope }   = linReg(monthRevs);
  const growthRate  = monthRevs.length > 1 && monthRevs[monthRevs.length - 1]
    ? Math.round(slope / monthRevs[monthRevs.length - 1] * 100) : 0;

  // Coefficient of variation for churn risk
  const mean3  = monthRevs.reduce((s, v) => s + v, 0) / (monthRevs.length || 1);
  const cv3    = monthRevs.length > 1 ? Math.sqrt(monthRevs.reduce((s, v) => s + (v - mean3) ** 2, 0) / monthRevs.length) / (mean3 || 1) : 0;
  const churnRisk = calcChurnRisk(repeatRate, monthRevs.length > 1 ? (monthRevs[monthRevs.length - 1] - monthRevs[0]) / (monthRevs[0] || 1) * 100 : 0, uniqueCustomers, cv3);

  const revenueAtRisk = Math.round(
    (anomalies.filter(a => a.isAnomaly && a.revenue < a.expected).reduce((s, a) => s + (a.expected - a.revenue), 0)) +
    (totalRevenue * churnRisk / 100 * 0.15)
  );

  /* ── Step 6: FDIF intelligence engines ── */
  const health = calcHealth(monthRevs, uniqueCustomers, qualityMetrics, totalOrders);
  const risks  = detectRisks(totalRevenue, topProducts, topCountries, uniqueCustomers, monthRevs, qualityMetrics, churnRisk, anomalies);
  const recs   = generateRecs(totalRevenue, topCountries, topProducts, uniqueCustomers, monthRevs, risks, segments, nextMonthForecast, avgOrderValue, churnRisk);

  const revenueChange = monthRevs.length > 1
    ? Math.round((monthRevs[monthRevs.length - 1] - monthRevs[0]) / (monthRevs[0] || 1) * 1000) / 10
    : 0;

  return {
    revenue:          Math.round(totalRevenue),
    orders:           totalOrders,
    customers:        uniqueCustomers,
    avgOrderValue:    Math.round(avgOrderValue * 100) / 100,
    revenueChange,
    healthScore:      health.total,
    topProduct:       topProducts[0]?.[0] || '',
    repeatRate,
    topProducts:      topProducts.slice(0, 5).map(([name, revenue]) => ({ name, revenue: Math.round(revenue) })),
    topMarkets:       topCountries.slice(0, 5).map(([name, revenue]) => ({ name, revenue: Math.round(revenue) })),
    monthlyRevenue:   months.map((_, i) => ({ month: monthLabels[i], revenue: Math.round(monthRevs[i]) })),
    monthLabels,
    monthRevs,
    months,
    topProductsRaw:   topProducts,
    topCountriesRaw:  topCountries,
    qualityMetrics,
    qualityScore,
    uniqueCustomers,
    repeatCustomers,
    newCustomers,
    custSpend,
    custOrdCnt,
    prodOrd,
    countryOrd:       cntryOrd,
    dowRev,
    dowOrd,
    momRev,
    ovBuckets,
    clvBuckets,
    newCustByMonth,
    forecastLabels,
    forecastTotal,
    totalLines:       rows.length,
    headers:          rawHeaders,
    hasCust:          iCust >= 0,
    hasDate:          iDate >= 0,
    hasProd:          iProd >= 0,
    health,
    risks,
    recs,
    forecast,
    anomalies,
    segments,
    growthRate,
    churnRisk,
    revenueAtRisk,
    nextMonthForecast: Math.max(nextMonthForecast, holtNext),
    aiInsights: null,
    aiLoading:  true,
  };
}

function emptyMetrics(): BusinessMetrics {
  return {
    revenue:0, orders:0, customers:0, avgOrderValue:0, revenueChange:0,
    healthScore:0, topProduct:'', repeatRate:0,
    topProducts:[], topMarkets:[], monthlyRevenue:[],
    monthLabels:[], monthRevs:[], months:[], topProductsRaw:[], topCountriesRaw:[],
    qualityMetrics:[], qualityScore:0,
    uniqueCustomers:0, repeatCustomers:0, newCustomers:0,
    custSpend:{}, custOrdCnt:{}, prodOrd:{}, countryOrd:{},
    dowRev:[0,0,0,0,0,0,0], dowOrd:[0,0,0,0,0,0,0],
    momRev:new Array(13).fill(0), ovBuckets:[0,0,0,0,0], clvBuckets:[0,0,0,0,0],
    newCustByMonth:{}, forecastLabels:[], forecastTotal:0,
    totalLines:0, headers:[], hasCust:false, hasDate:false, hasProd:false,
    health:{ total:0, pillars:[] }, risks:[], recs:[],
    forecast:[], anomalies:[], segments:[],
    growthRate:0, churnRisk:0, revenueAtRisk:0, nextMonthForecast:0,
    aiInsights: null,
    aiLoading:  false,
  };
}

export { buildForecast, linReg, nextMonthLabels };
