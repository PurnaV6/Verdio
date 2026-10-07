import { describe, expect, it } from "vitest";
import { runDataPipeline } from "./runDataPipeline";

function csv(rows: number, customers: number, idHeader: string) {
  const lines = [`order_id,${idHeader},order_date,product,quantity,revenue`];
  for (let i = 0; i < rows; i++) {
    const d = new Date(2024, 0, 1 + (i % 400)).toISOString().slice(0, 10);
    lines.push(`ORD-${1000 + i},C${(i * 7) % customers},${d},Prod ${i % 12},${1 + (i % 5)},${20 + (i % 90)}`);
  }
  return lines.join("\n");
}

async function roleOf(header: string, rows = 2000, customers = 150) {
  const out = await runDataPipeline(new File([csv(rows, customers, header)], "t.csv", { type: "text/csv" }));
  if (!out.ok) throw new Error(JSON.stringify(out.error));
  return { col: out.result.semantics.columns.find(c => c.columnName === header)!, result: out.result };
}

describe("customer key detection", () => {
  it.each(["customer_id", "Customer ID", "CustomerID", "customer_number", "client_id", "account_no"])(
    "classifies repeat-purchase %s as a customer column and enables segmentation",
    async header => {
      const { col, result } = await roleOf(header);
      expect(col.businessRole).toBe("customer");
      expect(result.ml.segmentation?.segments.length ?? 0).toBeGreaterThan(0);
    },
  );

  it("still treats order_id as the generic identifier", async () => {
    const { result } = await roleOf("customer_id");
    expect(result.semantics.columns.find(c => c.columnName === "order_id")!.businessRole).toBe("identifier");
  });

  it("does not mistake words that merely contain 'id' (paid, valid) for identifiers", async () => {
    const { col } = await roleOf("paid");
    expect(col.businessRole).not.toBe("identifier");
  });
});
