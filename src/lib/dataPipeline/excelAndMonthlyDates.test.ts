import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseDataset } from "./parseDataset";
import { profileDataset } from "./profileDataset";
import { cleanDataset } from "./cleanDataset";
import { runDataPipeline } from "./runDataPipeline";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Local-time Date objects: the xlsx library writes cell dates in local time, so this
   round-trips identically in every timezone. */
function buildWorkbook(withPeriod = true) {
  // "Period" holds Excel-style text labels (Jan-24). The pipeline test leaves it out so the
  // best date column is the real order date and day-of-week is meaningful.
  const optionalPeriod = (month: number) => (withPeriod ? [`${MONTH_ABBR[month]}-24`] : []);
  const aoa: unknown[][] = [["Order ID", "Order Date", "Order Time", ...(withPeriod ? ["Period"] : []), "Customer ID", "Revenue"]];
  for (let i = 0; i < 72; i += 1) {
    const month = i % 12;
    const day = 1 + (i % 20);
    aoa.push([
      `O-${1000 + i}`,
      new Date(2024, month, day),
      new Date(2024, month, day, 9 + (i % 8), 30),
      ...optionalPeriod(month),
      `C-${String(1 + (i % 18)).padStart(4, "0")}`,
      100 + i * 3,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  for (let r = 1; r < aoa.length; r += 1) ws[`C${r + 1}`].z = "m/d/yyyy h:mm";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
  return new File([buf], "orders.xlsx", { type: XLSX_TYPE });
}

describe("real .xlsx round trip", () => {
  it("emits text the strict parser accepts and keeps ID columns untouched", async () => {
    const parsed = await parseDataset(buildWorkbook());
    if (!parsed.ok) throw new Error(parsed.error.message);
    const { rows } = parsed.data;

    // sheet_to_csv writes Date cells as m/d/yy (default format) or the cell's own format.
    expect(rows[0]["Order Date"]).toMatch(/^\d{1,2}\/\d{1,2}\/\d{2}$/);
    expect(rows[0]["Order Time"]).toMatch(/^\d{1,2}\/\d{1,2}\/\d{2,4} \d{1,2}:\d{2}$/);
    expect(rows[0]["Period"]).toBe("Jan-24");

    const profile = profileDataset(rows);
    const type = (name: string) => profile.columns.find(c => c.name === name)!.inferredType;
    expect(type("Order Date")).toBe("date");
    expect(type("Order Time")).toBe("date");
    expect(type("Period")).toBe("date");
    expect(type("Customer ID")).toBe("string");
    expect(type("Order ID")).toBe("string");

    const cleaned = cleanDataset(rows, profile).rows;
    expect(cleaned.map(r => r["Customer ID"])).toEqual(rows.map(r => r["Customer ID"]));
    expect(cleaned.map(r => r["Order ID"])).toEqual(rows.map(r => r["Order ID"]));
    expect(cleaned[0]["Order Date"]).toBe("2024-01-01");
    expect(cleaned[0]["Order Time"]).toBe("2024-01-01");
    expect(cleaned[0]["Period"]).toBe("2024-01-01");
  });

  it("drives day-of-week and monthly bucketing through the full pipeline", async () => {
    const out = await runDataPipeline(buildWorkbook(false));
    if (!out.ok) throw new Error(String(out.error));
    const { statistics } = out.result;

    const ts = statistics.timeSeries[0];
    expect(ts.dateColumn).toBe("Order Date");
    expect(ts.points).toHaveLength(12);
    expect(ts.points.map(p => p.periodKey)[0]).toBe("2024-01");
    expect(ts.points.reduce((s, p) => s + p.count, 0)).toBe(72);

    const dow = statistics.seasonality!.byDayOfWeek;
    expect(dow.reduce((s, p) => s + p.count, 0)).toBe(72);
    // 1 Jan 2024 is a Monday and is the first order.
    expect(dow.find(p => p.label.startsWith("Mon"))!.count).toBeGreaterThan(0);
    expect(out.result.ml.forecast).not.toBeNull();
  });
});

describe("monthly report with a YYYY-MM period column", () => {
  it("still produces 12 monthly points and enables forecasting", async () => {
    const lines = ["period,revenue,region"];
    for (let m = 1; m <= 12; m += 1) {
      for (const region of ["North", "South"]) {
        lines.push(`2024-${String(m).padStart(2, "0")},${1000 + m * 50 + (region === "North" ? 120 : 0)},${region}`);
      }
    }
    const out = await runDataPipeline(new File([lines.join("\n")], "monthly.csv", { type: "text/csv" }));
    if (!out.ok) throw new Error(String(out.error));
    expect(out.result.profile.columns.find(c => c.name === "period")!.inferredType).toBe("date");
    expect(out.result.statistics.timeSeries[0].points).toHaveLength(12);
    expect(out.result.statistics.timeSeries[0].points[0].periodKey).toBe("2024-01");
    expect(out.result.capabilities.available.some(c => c.type === "forecasting")).toBe(true);
    expect(out.result.ml.forecast).not.toBeNull();
  });
});
