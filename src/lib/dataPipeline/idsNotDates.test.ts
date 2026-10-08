import { describe, expect, it } from "vitest";
import { runDataPipeline } from "./runDataPipeline";
import { profileDataset } from "./profileDataset";
import { cleanDataset } from "./cleanDataset";
import { createSampleBusinessFile } from "../demo/sampleBusinessDataset";
import type { RawRow } from "../../types/dataPipeline";

function clean(header: string, values: string[]) {
  const rows: RawRow[] = values.map(v => ({ [header]: v, n: "1" }));
  const profile = profileDataset(rows);
  return {
    cleaned: cleanDataset(rows, profile).rows.map(r => r[header]),
    col: profile.columns.find(c => c.name === header)!,
  };
}

describe("identifier-like text is never typed as a date or rewritten", () => {
  const textCases: Record<string, string[]> = {
    "customer ids": ["C-0136", "C-0013", "C-0001", "C-1969", "C-2038", "C-0145", "C-0007"],
    "product labels": ["Product 12", "Product 3", "Product 99", "Product 1"],
    "order refs": ["Order-2024", "Order-2023", "Order-2025", "Order-1999"],
    "short codes": ["A1", "B2", "C3", "Q3", "Q4"],
    "mixed ids and labels": ["C-0136", "C-0013", "Product 12", "Order-2024", "A1", "Q3"],
  };

  it.each(Object.entries(textCases))("%s pass through byte-for-byte", (_name, values) => {
    const { col, cleaned } = clean("id", values);
    expect(col.inferredType).toBe("string");
    expect(cleaned).toEqual(values);
  });

  it.each([
    ["plain integers", ["12", "7", "2024", "13"]],
    ["decimals", ["1.5", "2.25", "3.75"]],
  ])("%s are numbers, not dates", (_name, values) => {
    const { col } = clean("id", values);
    expect(col.inferredType).toBe("number");
  });
});

describe("genuine date columns are still detected and normalised", () => {
  it("normalises mixed real formats to ISO", () => {
    const values = ["2024-03-05", "2024-03-05T10:00:00Z", "25/03/2024", "5 Mar 2024", "Mar 5, 2024", "2024-3-5"];
    const { col, cleaned } = clean("when", values);
    expect(col.inferredType).toBe("date");
    expect(cleaned).toEqual(["2024-03-05", "2024-03-05", "2024-03-25", "2024-03-05", "2024-03-05", "2024-03-05"]);
  });

  it("reads dd/mm/yyyy when the day exceeds 12 and mm/dd/yyyy when the month does", () => {
    const { cleaned } = clean("when", ["05/03/2024", "13/03/2024", "03/25/2024"]);
    expect(cleaned).toEqual(["2024-05-03", "2024-03-13", "2024-03-25"]);
  });
});

describe("demo dataset through the real pipeline", () => {
  it("keeps every customer id in C-0001 form and the customer count unchanged", async () => {
    const out = await runDataPipeline(createSampleBusinessFile());
    if (!out.ok) throw new Error(String(out.error));
    const segments = out.result.ml.segmentation?.segments ?? [];
    expect(segments.length).toBe(145);
    for (const s of segments) expect(s.id).toMatch(/^C-\d{4}$/);
    const idCol = out.result.profile.columns.find(c => c.name === "Customer ID")!;
    expect(idCol.inferredType).toBe("string");
    const dateCol = out.result.profile.columns.find(c => c.name === "Order Date")!;
    expect(dateCol.inferredType).toBe("date");
  });
});
