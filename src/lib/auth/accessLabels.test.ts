import { describe, expect, it } from "vitest";
import { accessLevelLabel, projectStorageLabel } from "./accessLabels";

describe("accessLevelLabel", () => {
  it.each([
    ["owner", "Organisation owner"],
    ["admin", "Organisation admin"],
    ["analyst", "Analyst"],
    ["viewer", "Viewer (read-only)"],
  ] as const)("shows the real %s role", (role, label) => {
    expect(accessLevelLabel(role, false)).toBe(label);
  });

  it("does not claim ownership when the user has no organisation role", () => {
    expect(accessLevelLabel(null, false)).not.toMatch(/owner/i);
  });

  it("does not show a role while it is still loading", () => {
    expect(accessLevelLabel("owner", true)).not.toMatch(/owner/i);
  });
});

describe("projectStorageLabel", () => {
  it("keeps saved projects on this device for users outside an organisation", () => {
    const text = projectStorageLabel(null, false);
    expect(text).toMatch(/this device/);
    expect(text).toMatch(/not shared/);
  });

  it("says a copy is shared with the organisation for roles that can save", () => {
    for (const role of ["owner", "admin", "analyst"] as const) {
      expect(projectStorageLabel(role, false)).toMatch(/uploads a copy to your organisation/);
    }
  });

  it("explains that viewers cannot save to the organisation", () => {
    expect(projectStorageLabel("viewer", false)).toMatch(/cannot save projects to the organisation/);
  });
});
