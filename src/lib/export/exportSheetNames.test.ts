import { describe, expect, it } from "vitest";
import { MAX_SHEET_NAME_LENGTH, RESERVED_EXPORT_SHEET_NAMES, makeExportSheetNames } from "./exportSheetNames";

describe("makeExportSheetNames", () => {
  it("keeps ordinary names as they are", () => {
    expect(makeExportSheetNames(["Orders", "Q1 Sales"])).toEqual(["Orders", "Q1 Sales"]);
  });

  it("removes characters Excel forbids", () => {
    expect(makeExportSheetNames(["Q1/Q2: [draft]*?", "a\\b"])).toEqual(["Q1 Q2 draft", "a b"]);
  });

  it("strips leading and trailing apostrophes and falls back for empty names", () => {
    expect(makeExportSheetNames(["'Quoted'", "", "  ", "///"])).toEqual(["Quoted", "Sheet", "Sheet (2)", "Sheet (3)"]);
  });

  it("shortens to 31 characters", () => {
    const [name] = makeExportSheetNames(["A very long sheet name that goes past the limit"]);
    expect(name).toBe("A very long sheet name that goe");
    expect(name.length).toBe(MAX_SHEET_NAME_LENGTH);
  });

  it("makes names unique ignoring case, numbering in order", () => {
    expect(makeExportSheetNames(["Orders", "orders", "ORDERS", "Orders (2)"])).toEqual(["Orders", "orders (2)", "ORDERS (3)", "Orders (2) (2)"]);
  });

  it("keeps a numbered name inside 31 characters", () => {
    const long = "x".repeat(40);
    const names = makeExportSheetNames([long, long, long]);
    expect(names).toEqual(["x".repeat(31), `${"x".repeat(27)} (2)`, `${"x".repeat(27)} (3)`]);
    expect(names.every(name => name.length <= MAX_SHEET_NAME_LENGTH)).toBe(true);
  });

  it("does not use the sheets the export generates, ignoring case", () => {
    expect(makeExportSheetNames(["Products", "customers", "Calendar", "Regions"])).toEqual(["Products (2)", "customers (2)", "Calendar (2)", "Regions (2)"]);
    for (const reserved of RESERVED_EXPORT_SHEET_NAMES) expect(makeExportSheetNames([reserved])[0]).not.toBe(reserved);
  });

  it("never collides with a reserved name that is a suffix result either", () => {
    expect(makeExportSheetNames(["Cleaning log", "Cleaning log"], ["Cleaning log", "Cleaning log (2)"])).toEqual(["Cleaning log (3)", "Cleaning log (4)"]);
  });

  it("gives the same result every time", () => {
    const input = ["Orders", "orders", "Products", "a/b", "a:b"];
    expect(makeExportSheetNames(input)).toEqual(makeExportSheetNames(input));
    expect(makeExportSheetNames(input)).toEqual(["Orders", "orders (2)", "Products (2)", "a b", "a b (2)"]);
  });
});
