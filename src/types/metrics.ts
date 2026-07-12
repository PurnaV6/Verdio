/* ================================================================
   VERDIO — BusinessMetrics Type
   Full mirror of Flora's G object + ML outputs + AI insights
   ================================================================ */

export interface HealthPillar {
  name:  string;
  score: number;
  max:   number;
  color: string;
}

export interface Health {
  total:   number;
  pillars: HealthPillar[];
}

export interface Risk {
  level: 'high' | 'medium' | 'low';
  icon:  string;
  title: string;
  desc:  string;   // populated by AI after load; empty string until then
}

export interface Rec {
  title:  string;
  desc:   string;  // populated by AI after load; empty string until then
  impact: 'high' | 'medium';
}

export interface QualityMetric {
  col: string;
  pct: number;
}

export interface ForecastPoint {
  value: number;
  low:   number;
  high:  number;
}

export interface AnomalyPoint {
  month:      string;
  revenue:    number;
  expected:   number;
  zScore:     number;
  isAnomaly:  boolean;
}

export interface CustomerSegment {
  id:       string;
  spend:    number;
  orders:   number;
  segment:  'champion' | 'loyal' | 'atRisk' | 'new' | 'lost';
  rfmScore: number;
}

/* ── AI-generated insight types ── */

export interface AIRiskExplanation {
  title:   string;   // matches the risk title from detectRisks
  impact:  string;   // "If UK demand drops 20% you lose £56,800/month"
  action:  string;   // "Open a German channel targeting £28,000 within 90 days"
}

export interface AIRecommendation {
  title:       string;   // short label
  action:      string;   // specific thing to do
  poundImpact: string;   // "£12,400 additional revenue"
  timeline:    string;   // "within 60 days"
  priority:    'high' | 'medium';
}

export interface AIAnomalyExplanation {
  month:       string;   // e.g. "Mar 23"
  explanation: string;   // why it likely happened
  action:      string;   // what to do about it
}

export interface AISegmentInstruction {
  segment:     string;   // "At Risk" / "Lapsed" etc
  count:       number;
  instruction: string;   // specific campaign or action
  poundValue:  string;   // "£4,800 recoverable revenue"
}

export interface AIInsights {
  executiveSummary:     string;                    // full narrative paragraph
  riskExplanations:     AIRiskExplanation[];       // one per detected risk
  recommendations:      AIRecommendation[];        // 4–6 prioritised actions
  keyInsights:          string[];                  // 4–5 specific insight sentences
  anomalyExplanations:  AIAnomalyExplanation[];    // one per flagged anomaly month
  segmentInstructions:  AISegmentInstruction[];    // one per RFM segment with customers
}

/* ── Main metrics object ── */

export interface BusinessMetrics {
  /* Core KPIs */
  revenue:        number;
  orders:         number;
  customers:      number;
  avgOrderValue:  number;
  revenueChange:  number;
  healthScore:    number;
  topProduct:     string;
  repeatRate:     number;

  /* Chart-ready arrays */
  topProducts:    { name: string; revenue: number }[];
  topMarkets:     { name: string; revenue: number }[];
  monthlyRevenue: { month: string; revenue: number }[];

  /* Flora G-object mirrors */
  monthLabels:     string[];
  monthRevs:       number[];
  months:          string[];
  topProductsRaw:  [string, number][];
  topCountriesRaw: [string, number][];
  qualityMetrics:  QualityMetric[];
  qualityScore:    number;
  uniqueCustomers: number;
  repeatCustomers: number;
  newCustomers:    number;
  custSpend:       Record<string, number>;
  custOrdCnt:      Record<string, number>;
  prodOrd:         Record<string, number>;
  countryOrd:      Record<string, number>;
  dowRev:          number[];
  dowOrd:          number[];
  momRev:          number[];
  ovBuckets:       number[];
  clvBuckets:      number[];
  newCustByMonth:  Record<string, number>;
  forecastLabels:  string[];
  forecastTotal:   number;
  totalLines:      number;
  headers:         string[];
  hasCust:         boolean;
  hasDate:         boolean;
  hasProd:         boolean;

  /* Intelligence — flags only, prose comes from AI */
  health:  Health;
  risks:   Risk[];   // level/icon/title set by FDIF; desc set by AI
  recs:    Rec[];    // title/impact set by FDIF; desc set by AI

  /* ML outputs */
  forecast:          ForecastPoint[];
  anomalies:         AnomalyPoint[];
  segments:          CustomerSegment[];
  growthRate:        number;
  churnRisk:         number;
  revenueAtRisk:     number;
  nextMonthForecast: number;

  /* AI layer — null until Groq responds */
  aiInsights: AIInsights | null;
  aiLoading:  boolean;
}
