import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseDataset } from "./parseDataset";

function file(name: string, content: string | Uint8Array, type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("parseDataset", () => {
  it("parses a CSV file, trimming header whitespace", async () => {
    const result = await parseDataset(file("sales.csv", "date, revenue\n2024-01-01,100\n2024-01-02,200\n"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fileType).toBe("csv");
    expect(result.data.headers).toEqual(["date", "revenue"]);
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[0]).toEqual({ date: "2024-01-01", revenue: "100" });
  });

  it("parses a tab-separated TSV file", async () => {
    const tsv = "date\tproduct\trevenue\n2024-01-01\tWidget A\t1200\n2024-01-02\tWidget B\t950\n";
    const result = await parseDataset(file("sales.tsv", tsv));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fileType).toBe("tsv");
    expect(result.data.headers).toEqual(["date", "product", "revenue"]);
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[1]).toEqual({ date: "2024-01-02", product: "Widget B", revenue: "950" });
  });

  it("parses a JSON array of records", async () => {
    const json = JSON.stringify([
      { date: "2024-01-01", product: "Widget A", revenue: 1200 },
      { date: "2024-01-02", product: "Widget B", revenue: 950 },
    ]);
    const result = await parseDataset(file("sales.json", json, "application/json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fileType).toBe("json");
    expect(result.data.headers.sort()).toEqual(["date", "product", "revenue"]);
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[0].revenue).toBe("1200"); // numbers stringified, consistent with the CSV path
  });

  it("parses a JSON object with one array-valued field", async () => {
    const json = JSON.stringify({ meta: { source: "export" }, records: [{ date: "2024-01-01", revenue: 100 }] });
    const result = await parseDataset(file("sales.json", json, "application/json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(1);
  });

  it("fills missing keys with empty strings when JSON records have inconsistent shapes", async () => {
    const json = JSON.stringify([
      { date: "2024-01-01", revenue: 100 },
      { date: "2024-01-02", revenue: 200, note: "promo" },
    ]);
    const result = await parseDataset(file("sales.json", json, "application/json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.headers.sort()).toEqual(["date", "note", "revenue"]);
    expect(result.data.rows[0].note).toBe("");
    expect(result.data.rows[1].note).toBe("promo");
  });

  it("rejects invalid JSON with a typed parse error", async () => {
    const result = await parseDataset(file("broken.json", "{not valid json", "application/json"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_FAILED");
  });

  it("rejects JSON that isn't an array of records", async () => {
    const result = await parseDataset(file("scalar.json", JSON.stringify({ count: 5 }), "application/json"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_FAILED");
  });

  it("parses an XLSX workbook via the dynamic xlsx import", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["date", "revenue"], ["2024-01-01", 100], ["2024-01-02", 200]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const result = await parseDataset(new File([buf], "sales.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fileType).toBe("xlsx");
    expect(result.data.headers).toEqual(["date", "revenue"]);
    expect(result.data.rows).toHaveLength(2);
  });

  it("rejects an empty file", async () => {
    const result = await parseDataset(file("empty.csv", ""));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMPTY_FILE");
  });

  it("rejects a CSV with a header row but no data rows", async () => {
    const result = await parseDataset(file("headers-only.csv", "date,revenue\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NO_ROWS");
  });
});
