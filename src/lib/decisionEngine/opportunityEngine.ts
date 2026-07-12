import type { BusinessMetrics } from "../../types/metrics";
import type { DecisionItem } from "../../types/decision";

export function detectBiggestOpportunity(metrics: BusinessMetrics): DecisionItem {
  // Strong growth — scale it
  if (metrics.revenueChange > 15) {
    return {
      title: "Scale current sales momentum",
      value: `+${metrics.revenueChange.toFixed(1)}%`,
      reason:
        `Revenue is up ${metrics.revenueChange.toFixed(1)}%. ` +
        "This is the right moment to increase stock, marketing spend and fulfilment capacity before demand peaks.",
    };
  }

  // Low repeat rate — retention opportunity
  if (metrics.repeatRate < 20 && metrics.customers > 10) {
    return {
      title: "Improve customer retention",
      value: `${metrics.repeatRate}% repeat rate`,
      reason:
        `Only ${metrics.repeatRate}% of customers have ordered more than once. ` +
        "A loyalty programme or re-engagement campaign could significantly increase lifetime value.",
    };
  }

  // Low average order value — upsell opportunity
  if (metrics.avgOrderValue < 50) {
    return {
      title: "Increase average order value",
      value: `£${metrics.avgOrderValue.toFixed(2)} avg`,
      reason:
        "Customers are placing relatively low-value orders. " +
        "Bundles, minimum-order thresholds or upsell recommendations could materially improve revenue per transaction.",
    };
  }

  // Single market — expansion opportunity
  if (metrics.topMarkets.length === 1) {
    return {
      title: `Expand beyond ${metrics.topMarkets[0].name}`,
      value: "Market expansion",
      reason:
        `All revenue is currently concentrated in ${metrics.topMarkets[0].name}. ` +
        "Entering an adjacent market would diversify risk and open a new revenue channel.",
    };
  }

  // Top product — growth opportunity
  if (metrics.topProduct && metrics.topProduct !== "Top Product") {
    return {
      title: `Grow ${metrics.topProduct}`,
      value: `£${metrics.topProducts[0]?.revenue.toLocaleString() ?? "—"}`,
      reason:
        `${metrics.topProduct} is your highest-revenue product. ` +
        "Ensuring stock availability, featuring it in promotions and testing price points could increase returns.",
    };
  }

  return {
    title: "Improve revenue visibility",
    reason:
      "Upload data with date, product and customer columns to unlock more specific opportunity detection.",
  };
}
