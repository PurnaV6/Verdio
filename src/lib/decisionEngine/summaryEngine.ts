import type { BusinessMetrics } from "../../types/metrics";
import type { DecisionItem, RiskItem } from "../../types/decision";

export function generateExecutiveSummary(
  metrics: BusinessMetrics,
  opportunity: DecisionItem,
  risk: RiskItem
): string {
  const parts: string[] = [];

  // Revenue headline
  parts.push(
    `Revenue stands at £${metrics.revenue.toLocaleString()} across ${metrics.orders.toLocaleString()} orders` +
    (metrics.customers > 0 ? ` from ${metrics.customers.toLocaleString()} customers` : "") +
    "."
  );

  // Trend
  if (metrics.revenueChange > 0) {
    parts.push(
      `Revenue is up ${metrics.revenueChange.toFixed(1)}% compared to the previous period, showing positive momentum.`
    );
  } else if (metrics.revenueChange < 0) {
    parts.push(
      `Revenue has fallen ${Math.abs(metrics.revenueChange).toFixed(1)}% compared to the previous period — this needs attention.`
    );
  } else {
    parts.push("Revenue is currently stable with no significant change detected.");
  }

  // Top product
  if (metrics.topProduct && metrics.topProduct !== "Top Product") {
    parts.push(
      `${metrics.topProduct} is the top-performing product at £${metrics.topProducts[0]?.revenue.toLocaleString() ?? "—"}.`
    );
  }

  // Retention
  if (metrics.repeatRate > 0) {
    if (metrics.repeatRate >= 30) {
      parts.push(`Customer retention is strong at ${metrics.repeatRate}% repeat purchase rate.`);
    } else {
      parts.push(
        `Customer retention is ${metrics.repeatRate}% — improving this should be a near-term priority.`
      );
    }
  }

  // Risk and opportunity
  parts.push(
    `The main risk to address is ${risk.title.toLowerCase()}. ` +
    `The biggest opportunity is to ${opportunity.title.toLowerCase()}.`
  );

  return parts.join(" ");
}
