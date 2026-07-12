import type { BusinessMetrics } from "../../types/metrics";
import type { RiskItem } from "../../types/decision";

export function detectBiggestRisk(metrics: BusinessMetrics): RiskItem {
  // Severe revenue decline
  if (metrics.revenueChange < -15) {
    return {
      title: "Significant revenue decline",
      severity: "high",
      reason:
        `Revenue has fallen ${Math.abs(metrics.revenueChange).toFixed(1)}% compared to the previous period. ` +
        "Pricing, demand, product availability or customer churn should be reviewed urgently.",
    };
  }

  // Weak health
  if (metrics.healthScore < 45) {
    return {
      title: "Weak overall business health",
      severity: "high",
      reason:
        `Health score is ${metrics.healthScore}/100. ` +
        "Multiple indicators are below healthy levels. Executive attention is needed across revenue, retention and data quality.",
    };
  }

  // Very low customer base
  if (metrics.customers < 10) {
    return {
      title: "Critically low customer base",
      severity: "high",
      reason:
        `Only ${metrics.customers} unique customers detected. ` +
        "Losing any single customer would have a disproportionate impact on revenue.",
    };
  }

  // Moderate revenue decline
  if (metrics.revenueChange < -5) {
    return {
      title: "Revenue trending downward",
      severity: "medium",
      reason:
        `Revenue is down ${Math.abs(metrics.revenueChange).toFixed(1)}%. ` +
        "This warrants a review of recent sales by product and customer segment before it becomes more serious.",
    };
  }

  // Single market concentration
  if (metrics.topMarkets.length === 1) {
    return {
      title: "Single-market revenue concentration",
      severity: "medium",
      reason:
        `100% of revenue comes from ${metrics.topMarkets[0].name}. ` +
        "Any disruption in this market — regulatory, economic or competitive — would directly threaten the entire business.",
    };
  }

  // Low order volume
  if (metrics.orders < 20) {
    return {
      title: "Low order volume",
      severity: "medium",
      reason:
        `Only ${metrics.orders} orders detected. ` +
        "Low volume reduces the statistical reliability of every other metric and creates unstable revenue patterns.",
    };
  }

  // Low repeat rate
  if (metrics.repeatRate < 15 && metrics.customers > 10) {
    return {
      title: "Poor customer retention",
      severity: "medium",
      reason:
        `Only ${metrics.repeatRate}% of customers have ordered more than once. ` +
        "Heavy reliance on new customer acquisition is expensive and fragile. Retention should be prioritised.",
    };
  }

  return {
    title: "No critical risk detected",
    severity: "low",
    reason:
      "Current metrics do not show an urgent risk. Continue monitoring monthly and upload fresh data regularly.",
  };
}
