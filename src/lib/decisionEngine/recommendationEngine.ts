import type { BusinessMetrics } from "../../types/metrics";
import type { RecommendedDecision } from "../../types/decision";

export function generateRecommendations(metrics: BusinessMetrics): RecommendedDecision[] {
  const recommendations: RecommendedDecision[] = [];

  // ── Strong growth momentum ──
  if (metrics.revenueChange > 15) {
    recommendations.push({
      title: "Scale sales capacity while momentum is strong",
      impact: `+£${Math.round(metrics.revenue * 0.12).toLocaleString()}`,
      confidence: "91%",
      reason:
        "Revenue is growing at " +
        metrics.revenueChange.toFixed(1) +
        "%. Increasing stock, fulfilment or marketing spend now will capture demand before it peaks.",
    });
    recommendations.push({
      title: "Launch a targeted marketing campaign",
      impact: `+£${Math.round(metrics.revenue * 0.07).toLocaleString()}`,
      confidence: "84%",
      reason:
        "Strong sales momentum indicates customer appetite. A targeted campaign can extend the growth window.",
    });
  }

  // ── Revenue decline ──
  if (metrics.revenueChange < -5) {
    recommendations.push({
      title: "Investigate and address revenue decline",
      impact: `+£${Math.round(Math.abs(metrics.revenue * metrics.revenueChange / 100)).toLocaleString()}`,
      confidence: "88%",
      reason:
        "Revenue has dropped " +
        Math.abs(metrics.revenueChange).toFixed(1) +
        "%. Reviewing by product, customer segment and time period will identify the cause.",
    });
  }

  // ── Low average order value ──
  if (metrics.avgOrderValue < 50) {
    recommendations.push({
      title: "Increase average order value with bundles or upsells",
      impact: `+£${Math.round(metrics.revenue * 0.10).toLocaleString()}`,
      confidence: "82%",
      reason:
        `Current average order value is £${metrics.avgOrderValue.toFixed(2)}. ` +
        "Product bundles, minimum order incentives or volume discounts can push this up significantly.",
    });
  }

  // ── Low repeat rate ──
  if (metrics.repeatRate < 25) {
    recommendations.push({
      title: "Re-engage lapsed customers with a loyalty offer",
      impact: `+£${Math.round(metrics.revenue * 0.09).toLocaleString()}`,
      confidence: "79%",
      reason:
        `Only ${metrics.repeatRate}% of customers have ordered more than once. ` +
        "A targeted win-back campaign or loyalty programme would improve retention significantly.",
    });
  }

  // ── Top product opportunity ──
  if (metrics.topProduct && metrics.topProduct !== "Top Product") {
    recommendations.push({
      title: `Prioritise ${metrics.topProduct} in stock and promotions`,
      impact: `+£${Math.round(metrics.revenue * 0.08).toLocaleString()}`,
      confidence: "86%",
      reason:
        `${metrics.topProduct} is your highest-revenue product. ` +
        "Ensuring availability, featuring it prominently and testing price sensitivity can increase returns.",
    });
  }

  // ── Market concentration ──
  if (metrics.topMarkets.length === 1) {
    recommendations.push({
      title: "Expand into a second market to reduce concentration risk",
      impact: `+£${Math.round(metrics.revenue * 0.15).toLocaleString()}`,
      confidence: "74%",
      reason:
        `All revenue comes from ${metrics.topMarkets[0]?.name || "one market"}. ` +
        "Entering a second geography reduces risk and creates a new growth channel.",
    });
  }

  // ── Fallback ──
  if (recommendations.length === 0) {
    recommendations.push({
      title: "Continue monitoring sales performance",
      impact: "Ongoing",
      confidence: "—",
      reason:
        "Current metrics are stable. Upload richer data (date, product, customer columns) to unlock more specific recommendations.",
    });
  }

  return recommendations.slice(0, 3);
}
