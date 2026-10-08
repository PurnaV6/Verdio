import { describe, expect, it } from "vitest";
import { dayOfWeek, isStrictDate, parseStrictDate, toIsoDateString } from "./dateParsing";

describe("toIsoDateString accepts well-defined formats", () => {
  it.each([
    ["2024-03-05", "2024-03-05"],
    ["2024-3-5", "2024-03-05"],
    ["2024/03/05", "2024-03-05"],
    ["2024-03-05T10:00:00Z", "2024-03-05"],
    ["2024-03-05T10:00:00.123Z", "2024-03-05"],
    ["2024-03-05 10:00:00", "2024-03-05"],
    ["2024-03-05T23:30:00-05:00", "2024-03-06"],
    ["2024-03-05T00:30:00+02:00", "2024-03-04"],
    ["03/25/2024", "2024-03-25"],
    ["25/03/2024", "2024-03-25"],
    ["05/03/2024", "2024-05-03"],
    ["25.03.2024", "2024-03-25"],
    ["05.03.2024", "2024-03-05"],
    ["25-03-2024", "2024-03-25"],
    ["5/3/24", "2024-05-03"],
    ["5/3/99", "1999-05-03"],
    ["5 Mar 2024", "2024-03-05"],
    ["5 March 2024", "2024-03-05"],
    ["05-Mar-2024", "2024-03-05"],
    ["Mar 5, 2024", "2024-03-05"],
    ["March 5 2024", "2024-03-05"],
    ["Sept 5, 2024", "2024-09-05"],
    ["29 Feb 2024", "2024-02-29"],
    ["  2024-03-05  ", "2024-03-05"],
  ])("%s -> %s", (input, expected) => {
    expect(toIsoDateString(input)).toBe(expected);
  });
});

describe("toIsoDateString rejects everything else", () => {
  it.each([
    "", "   ", "C-0136", "C-0013", "C-2038", "Product 12", "Order-2024", "A1", "Q3", "Q3 2024",
    "12", "1.5", "2024", "45000", "20240305", "-1",
    "2024-03-05foo", "foo 2024-03-05", "2024-03-05T10:00:00 UTC", "2024-03-05T25:00:00Z",
    "2023-02-29", "2024-13-01", "2024-00-10", "31 Apr 2024", "32/01/2024",
    "1850-01-01", "0136-01-01", "2200-01-01", "1/1/2101",
    "5 Foo 2024", "Foo 5, 2024", "Marching 5, 2024", "12-34-56", "1-2-24",
    "INV-2024-03-05", "SKU 12/03/2024 A",
  ])("rejects %j", input => {
    expect(isStrictDate(input)).toBe(false);
    expect(toIsoDateString(input)).toBeNull();
  });
});

describe("calendar helpers", () => {
  it("returns components without timezone shifts", () => {
    expect(parseStrictDate("2024-01-01")).toEqual({ year: 2024, month: 1, day: 1 });
  });

  it("computes day of week from the calendar date", () => {
    expect(dayOfWeek({ year: 2024, month: 3, day: 5 })).toBe(2); // Tuesday
  });
});
