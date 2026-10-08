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
