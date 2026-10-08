import { describe, expect, it } from "vitest";
import { PAGES, pageLabel } from "./navigation";

describe("pageLabel", () => {
  it("returns the navigation label for every page id", () => {
    for (const page of PAGES) expect(pageLabel(page.id)).toBe(page.label);
  });

  it("uses the navigation names rather than the older page headings", () => {
    expect(pageLabel("analyses")).toBe("Intelligence");
    expect(pageLabel("health")).toBe("Health Detail");
  });

  it("falls back to the id for an unknown page", () => {
    expect(pageLabel("nope")).toBe("nope");
  });

  it("has unique page ids", () => {
    expect(new Set(PAGES.map(page => page.id)).size).toBe(PAGES.length);
  });
});

// Page ids are routing keys in App.tsx; the rail may regroup or relabel them but never drop or repeat one.
const PAGE_IDS = [
  "overview", "analyses", "forecast", "risks", "recs", "execution", "advisor", "scenarios",
  "customers", "seasonality", "products", "health",
  "profile", "connections", "relationships", "governance", "alerts",
];

describe("workspace navigation", () => {
  it("lists every page id exactly once", () => {
    const ids = PAGES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PAGE_IDS].sort());
  });

  it("groups every page under Decide, Predict, Explore or Data", () => {
    const groups = new Set(PAGES.map(p => p.group));
    expect([...groups].sort()).toEqual(["Data", "Decide", "Explore", "Predict"]);
  });

  it("keeps the page labels", () => {
    expect(PAGES.map(p => p.label)).toEqual([
      "Executive Workspace", "Intelligence", "Predictions", "Risks & Opportunities", "Decisions", "Execution", "AI Advisor", "Scenario Planning",
      "Customer Intelligence", "Seasonality", "Products & Markets", "Health Detail",
      "Data Hub", "Connections", "Data Relationships", "Governance", "Alerts & Reports",
    ]);
  });
});
