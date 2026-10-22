import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MAX_EXCEL_BYTES, MAX_SHEETS, datasetDisplayName, describeWorkbookListing, listWorkbookSheets, loadWorkbook, planUpload } from "./workbook";
import { parseDataset } from "./parseDataset";
import { runDataPipeline } from "./runDataPipeline";
import { prepareOrganizationWorkspace } from "../organization/prepareOrganizationWorkspace";

type Cell = string | number | null;
type SheetSpec = { name: string; rows: Cell[][]; hidden?: 1 | 2; merges?: XLSX.Range[] };

function workbookFile(name: string, sheets: SheetSpec[]): File {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.merges) ws["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  if (sheets.some(sheet => sheet.hidden)) wb.Workbook = { Sheets: sheets.map(sheet => ({ Hidden: sheet.hidden ?? 0 })) };
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], name);
}

function orders(count: number): Cell[][] {
  const rows: Cell[][] = [["Order Date", "Customer ID", "Product ID", "Quantity", "Revenue"]];
  for (let i = 0; i < count; i += 1) {
    rows.push([`2025-${String((i % 12) + 1).padStart(2, "0")}-15`, `C-${(i % 5) + 1}`, `P-${(i % 4) + 1}`, 1 + (i % 3), 100 + i]);
  }
  return rows;
}

const customers: Cell[][] = [
  ["Customer ID", "Customer Name", "City"],
  ["C-1", "Acme", "Leeds"], ["C-2", "Bolt", "York"], ["C-3", "Crest", "Hull"], ["C-4", "Dune", "Bath"], ["C-5", "Elm", "Ely"],
];
const products: Cell[][] = [
  ["Product ID", "Product Name", "Unit Price"],
  ["P-1", "Widget", 10], ["P-2", "Gadget", 20], ["P-3", "Gizmo", 30], ["P-4", "Doohickey", 40],
];

const threeSheets: SheetSpec[] = [
  { name: "Orders", rows: orders(24) },
  { name: "Customers", rows: customers },
  { name: "Products", rows: products },
];

async function list(file: File, limits?: Parameters<typeof listWorkbookSheets>[1]) {
  const result = await listWorkbookSheets(file, limits);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("listWorkbookSheets", () => {
  it("lists every table sheet with its row count and states it in one line", async () => {
    const listing = await list(workbookFile("Sales.xlsx", threeSheets));
    expect(listing.totalSheets).toBe(3);
    expect(listing.sheets.map(s => [s.name, s.rowCount, s.columnCount])).toEqual([["Orders", 24, 5], ["Customers", 5, 3], ["Products", 4, 3]]);
    expect(describeWorkbookListing(listing)).toEqual({
      summary: "Read 3 sheets from Sales.xlsx: Orders (24 rows), Customers (5 rows), Products (4 rows)",
      skipped: [],
    });
  });

  it("skips empty sheets and sheets that are not a table, as skipped and never as errors", async () => {
    const listing = await list(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(6) },
      { name: "Blank", rows: [[]] },
      { name: "One column", rows: [["Name"], ["a"], ["b"], ["c"]] },
      { name: "One row", rows: [["Customer ID", "Name"], ["C-1", "Acme"]] },
      { name: "Notes", rows: [["Prepared by finance"], [], ["Check the totals before sending"]] },
      { name: "Numbers first", rows: [[1, 2], [3, 4], [5, 6]] },
      { name: "Title above table", rows: [["Customer list"], ...customers] },
    ]));
    expect(listing.sheets.map(s => s.name)).toEqual(["Orders"]);
    expect(describeWorkbookListing(listing).skipped).toEqual([
      "Skipped Blank (empty).",
      "Skipped One column (not a table).",
      "Skipped One row (not a table).",
      "Skipped Notes (not a table).",
      "Skipped Numbers first (not a table).",
      "Skipped Title above table (not a table).",
    ]);
  });

  it("skips hidden and very hidden sheets and says so", async () => {
    const listing = await list(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(3) },
      { name: "Lookups", rows: customers, hidden: 1 },
      { name: "Cache", rows: products, hidden: 2 },
      { name: "Customers", rows: customers },
    ]));
    expect(listing.sheets.map(s => s.name)).toEqual(["Orders", "Customers"]);
    expect(describeWorkbookListing(listing).skipped).toEqual(["Skipped Lookups (hidden sheet).", "Skipped Cache (hidden sheet)."]);
  });

  it("does not count blank rows between records", async () => {
    const listing = await list(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: [["Customer ID", "Name"], ["C-1", "Acme"], [], ["C-2", "Bolt"], [null, null], ["C-3", "Crest"]] },
      { name: "Customers", rows: customers },
    ]));
    expect(listing.sheets[0].rowCount).toBe(3);
  });

  it("offers at most the sheet cap and names the sheets left out", async () => {
    const many: SheetSpec[] = Array.from({ length: MAX_SHEETS + 2 }, (_, i) => ({ name: `S${i + 1}`, rows: customers }));
    const listing = await list(workbookFile("Big.xlsx", many));
    expect(listing.sheets).toHaveLength(MAX_SHEETS);
    expect(describeWorkbookListing(listing).skipped).toEqual([
      `Skipped S${MAX_SHEETS + 1} (over the limit of ${MAX_SHEETS} sheets).`,
      `Skipped S${MAX_SHEETS + 2} (over the limit of ${MAX_SHEETS} sheets).`,
    ]);
  });

  it("stops adding sheets past the total row limit but always keeps the first usable sheet", async () => {
    const file = workbookFile("Rows.xlsx", [
      { name: "Big", rows: orders(30) },
      { name: "Fits", rows: customers },
      { name: "Too many", rows: orders(10) },
      { name: "Also fits", rows: products },
    ]);
    const listing = await list(file, { maxTotalRows: 10 });
    expect(listing.sheets.map(s => s.name)).toEqual(["Big"]);
    expect(listing.skipped.map(s => s.name)).toEqual(["Fits", "Too many", "Also fits"]);
    expect(listing.skipped.every(s => s.reason === "over the limit of 10 rows across sheets")).toBe(true);
  });

  it("refuses an Excel file over the Excel size cap with a clear message", async () => {
    const big = new File([new Uint8Array(MAX_EXCEL_BYTES + 1)], "huge.xlsx");
    const listed = await listWorkbookSheets(big);
    expect(listed.ok).toBe(false);
    const parsed = await parseDataset(big);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("TOO_LARGE");
      expect(parsed.error.message).toBe("Excel files larger than 25MB are too big to open in the browser. Export the sheet you need as CSV, or split the workbook.");
    }
  });
});

describe("loadWorkbook", () => {
  it("reads a workbook once per File", async () => {
    const file = workbookFile("Sales.xlsx", threeSheets);
    expect(loadWorkbook(file)).toBe(loadWorkbook(file));
    await list(file);
    await parseDataset(file, "Customers");
    await expect(loadWorkbook(file)).resolves.toBeDefined();
  });
});

describe("parseDataset with a sheet", () => {
  it("parses the chosen sheet and names it Book.xlsx · Sheet", async () => {
    const file = workbookFile("Sales.xlsx", threeSheets);
    const result = await parseDataset(file, "Customers");
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.fileName).toBe("Sales.xlsx · Customers");
    expect(result.data.fileType).toBe("xlsx");
    expect(result.data.headers).toEqual(["Customer ID", "Customer Name", "City"]);
    expect(result.data.rows).toHaveLength(5);
    expect(datasetDisplayName("Sales.xlsx", "Customers")).toBe("Sales.xlsx · Customers");
  });

  it("still reads the first sheet, under the file name, when no sheet is given", async () => {
    const result = await parseDataset(workbookFile("Sales.xlsx", threeSheets));
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.fileName).toBe("Sales.xlsx");
    expect(result.data.rows).toHaveLength(24);
  });

  it("reports a sheet that is not in the workbook", async () => {
    const result = await parseDataset(workbookFile("Sales.xlsx", threeSheets), "Nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('The sheet "Nope" was not found in this workbook.');
  });

  it("repeats a vertically merged value down its rows", async () => {
    const result = await parseDataset(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(3) },
      {
        name: "Regional",
        rows: [["Region", "Product ID", "Revenue"], ["North", "P-1", 10], [null, "P-2", 20], [null, "P-3", 30], ["South", "P-1", 40], [null, "P-2", 50]],
        merges: [{ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } }, { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } }],
      },
    ]), "Regional");
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.rows.map(r => r.Region)).toEqual(["North", "North", "North", "South", "South"]);
  });
});

describe("planUpload", () => {
  it("makes one source per usable sheet of a multi-sheet workbook", async () => {
    const file = workbookFile("Sales.xlsx", threeSheets);
    const plan = await planUpload([file]);
    expect(plan.sources).toEqual([{ file, sheet: "Orders" }, { file, sheet: "Customers" }, { file, sheet: "Products" }]);
    expect(plan.sources.every(source => source.file === file)).toBe(true);
    expect(plan.notes).toEqual([{ summary: "Read 3 sheets from Sales.xlsx: Orders (24 rows), Customers (5 rows), Products (4 rows)", skipped: [] }]);
  });

  it("keeps a single-sheet workbook as the plain file, with no note", async () => {
    const file = workbookFile("One.xlsx", [{ name: "Data", rows: [["Title row"], ["a", "b"], ["1", "2"]] }]);
    const plan = await planUpload([file]);
    expect(plan.sources).toEqual([{ file }]);
    expect(plan.sources[0].file).toBe(file);
    expect(plan.notes).toEqual([]);
    const result = await parseDataset(file);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.fileName).toBe("One.xlsx");
    expect(result.data.headers[0]).toBe("Title row"); // the first row is still the header, exactly as before
  });

  it("returns one sheet source, and a note, when only one sheet of several is a table", async () => {
    const file = workbookFile("Sales.xlsx", [{ name: "Orders", rows: orders(5) }, { name: "Notes", rows: [["Hello"]] }]);
    const plan = await planUpload([file]);
    expect(plan.sources).toEqual([{ file, sheet: "Orders" }]);
    expect(plan.notes[0]).toEqual({ summary: "Read 1 sheet from Sales.xlsx: Orders (5 rows)", skipped: ["Skipped Notes (not a table)."] });
  });

  it("passes CSV, TSV, JSON and corrupt Excel files through untouched", async () => {
    const files = [new File(["a,b\n1,2\n"], "a.csv"), new File(["a\tb\n1\t2\n"], "a.tsv"), new File(['[{"a":1}]'], "a.json"), new File(["not a workbook"], "Bad.xlsx")];
    const plan = await planUpload(files);
    expect(plan.sources).toEqual(files.map(file => ({ file })));
    expect(plan.notes).toEqual([]);
  });

  it("keeps the order of mixed uploads", async () => {
    const csv = new File(["a,b\n1,2\n"], "extra.csv");
    const book = workbookFile("Sales.xlsx", threeSheets);
    const plan = await planUpload([csv, book]);
    expect(plan.sources.map(source => source.sheet ?? source.file.name)).toEqual(["extra.csv", "Orders", "Customers", "Products"]);
  });

  it("throws when no sheet of a multi-sheet workbook is a table", async () => {
    await expect(planUpload([workbookFile("Empty.xlsx", [{ name: "A", rows: [[]] }, { name: "B", rows: [["Only", "headers"]] }])]))
      .rejects.toThrow("No sheet in Empty.xlsx looks like a table with a header row and data. Skipped: A (empty), B (not a table).");
  });
});

describe("workbook sheets in the organisation flow", () => {
  it("makes each sheet a dataset, picks the sales-like sheet as primary and relates the sheets", async () => {
    const file = workbookFile("Book.xlsx", [threeSheets[2], threeSheets[1], threeSheets[0]]);
    const { sources } = await planUpload([file]);
    const workspace = await prepareOrganizationWorkspace(sources);
    const datasets = workspace.context.datasets;
    expect(datasets.map(d => d.fileName)).toEqual(["Book.xlsx · Products", "Book.xlsx · Customers", "Book.xlsx · Orders"]);
    expect(datasets.map(d => d.sheet)).toEqual(["Products", "Customers", "Orders"]);
    expect(datasets.map(d => d.purpose)).toEqual(["products", "customers", "sales"]);
    expect(datasets.map(d => d.rowCount)).toEqual([4, 5, 24]);
    expect(datasets.filter(d => d.primary).map(d => d.sheet)).toEqual(["Orders"]);
    expect(new Set(datasets.map(d => d.id)).size).toBe(3);
    expect(workspace.context.relationships.length).toBeGreaterThan(0);
    expect(workspace.sources[datasets[2].id]).toEqual({ file, sheet: "Orders" });
  });

  it("scores a sheet called Sales as sales from the workbook and sheet names together", async () => {
    const file = workbookFile("Book.xlsx", [
      { name: "Lookup", rows: [["Topic", "Detail"], ["a", "b"], ["c", "d"]] },
      { name: "Sales", rows: [["Topic", "Detail"], ["e", "f"], ["g", "h"]] },
    ]);
    const workspace = await prepareOrganizationWorkspace((await planUpload([file])).sources);
    expect(workspace.context.datasets.find(d => d.sheet === "Sales")?.purpose).toBe("sales");
    expect(workspace.context.datasets.find(d => d.primary)?.sheet).toBe("Sales");
  });

  it("falls back to the sheet with most rows when none looks like sales", async () => {
    const file = workbookFile("Book.xlsx", [
      { name: "Small", rows: [["Topic", "Detail"], ["a", "b"], ["c", "d"]] },
      { name: "Larger", rows: [["Topic", "Detail"], ["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]] },
    ]);
    const workspace = await prepareOrganizationWorkspace((await planUpload([file])).sources);
    expect(workspace.context.datasets.find(d => d.primary)?.sheet).toBe("Larger");
  });

  it("runs the full pipeline for the primary sheet only, from its source", async () => {
    const file = workbookFile("Book.xlsx", threeSheets);
    const workspace = await prepareOrganizationWorkspace((await planUpload([file])).sources);
    const primary = workspace.context.datasets.find(d => d.primary)!;
    const outcome = await runDataPipeline(workspace.sources[primary.id]);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.result.source.fileName).toBe("Book.xlsx · Orders");
    expect(outcome.result.source.fileType).toBe("xlsx");
    expect(outcome.result.source.rowCount).toBe(24);
    expect(JSON.stringify(outcome.result.source)).not.toContain("Customers");
  });

  it("takes sheets from several files and keeps plain files working", async () => {
    const book = workbookFile("Book.xlsx", [threeSheets[0], threeSheets[1]]);
    const csv = new File(["product id,inventory\nP-1,4\nP-2,20\n"], "inventory.csv");
    const workspace = await prepareOrganizationWorkspace((await planUpload([book, csv])).sources);
    expect(workspace.context.datasets.map(d => d.fileName)).toEqual(["Book.xlsx · Orders", "Book.xlsx · Customers", "inventory.csv"]);
    expect(workspace.context.datasets[2].sheet).toBeUndefined();
  });
});
