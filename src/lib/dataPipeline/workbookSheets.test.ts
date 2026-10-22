import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { expandWorkbookFiles } from "./expandWorkbookFiles";
import { parseDataset } from "./parseDataset";
import { prepareOrganizationWorkspace } from "../organization/prepareOrganizationWorkspace";
import { MAX_SHEETS_PER_WORKBOOK, datasetLabel, describeWorkbookRead, parseSheetFileName, readWorkbookSheets } from "./workbookSheets";

type Cell = string | number | null;
type SheetSpec = { name: string; rows: Cell[][]; hidden?: 1 | 2; merges?: XLSX.Range[] };

function workbookFile(name: string, sheets: SheetSpec[]): File {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.merges) ws["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  if (sheets.some(sheet => sheet.hidden)) {
    wb.Workbook = { Sheets: sheets.map(sheet => ({ Hidden: sheet.hidden ?? 0 })) };
  }
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

async function parseSheets(file: File) {
  const { files, notes } = await expandWorkbookFiles([file]);
  const parsed = await Promise.all(files.map(parseDataset));
  return { files, notes, parsed };
}

describe("expandWorkbookFiles: reading every sheet", () => {
  it("reads all sheets of a three-sheet workbook with their row counts", async () => {
    const { files, notes, parsed } = await parseSheets(workbookFile("Sales.xlsx", threeSheets));
    expect(files.map(f => f.name)).toEqual(["Sales.xlsx / Orders", "Sales.xlsx / Customers", "Sales.xlsx / Products"]);
    expect(parsed.map(p => p.ok && p.data.rows.length)).toEqual([24, 5, 4]);
    expect(parsed.map(p => p.ok && p.data.headers)).toEqual([
      ["Order Date", "Customer ID", "Product ID", "Quantity", "Revenue"],
      ["Customer ID", "Customer Name", "City"],
      ["Product ID", "Product Name", "Unit Price"],
    ]);
    expect(notes).toEqual([{ summary: "Read 3 sheets from Sales.xlsx: Orders (24 rows), Customers (5 rows), Products (4 rows)", skipped: [] }]);
  });

  it("keeps the workbook file type and name on each sheet", async () => {
    const { parsed } = await parseSheets(workbookFile("Sales.xlsx", threeSheets));
    if (!parsed[1].ok) throw new Error("parse failed");
    expect(parsed[1].data.fileName).toBe("Sales.xlsx / Customers");
    expect(parsed[1].data.fileType).toBe("xlsx");
  });

  it("skips empty sheets and sheets with only a header row, and says why", async () => {
    const { files, notes } = await parseSheets(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(6) },
      { name: "Blank", rows: [[]] },
      { name: "Template", rows: [["Customer ID", "Name"]] },
    ]));
    expect(files.map(f => f.name)).toEqual(["Sales.xlsx / Orders"]);
    expect(notes[0].summary).toBe("Read 1 sheet from Sales.xlsx: Orders (6 rows)");
    expect(notes[0].skipped).toEqual(["Skipped Blank: empty.", "Skipped Template: header row only, no data rows."]);
  });

  it("skips hidden and very hidden sheets", async () => {
    const { files, notes } = await parseSheets(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(3) },
      { name: "Lookups", rows: customers, hidden: 1 },
      { name: "Cache", rows: products, hidden: 2 },
      { name: "Customers", rows: customers },
    ]));
    expect(files.map(f => f.name)).toEqual(["Sales.xlsx / Orders", "Sales.xlsx / Customers"]);
    expect(notes[0].skipped).toEqual(["Skipped Lookups: hidden sheet.", "Skipped Cache: hidden sheet."]);
  });

  it("finds the header below title text and reports where it was", async () => {
    const titled: Cell[][] = [
      ["Customer list, Q1"], [], ["Exported by finance"],
      ...customers,
    ];
    const { parsed, notes } = await parseSheets(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(4) },
      { name: "Customers", rows: titled },
    ]));
    if (!parsed[1].ok) throw new Error("parse failed");
    expect(parsed[1].data.headers).toEqual(["Customer ID", "Customer Name", "City"]);
    expect(parsed[1].data.rows).toHaveLength(5);
    expect(notes[0].summary).toContain("Customers (5 rows, headers on row 4)");
    expect(notes[0].summary).toContain("Orders (4 rows)");
  });

  it("spreads vertically merged cells down their rows and ignores merged titles", async () => {
    const regional: Cell[][] = [
      ["Regional sales"],
      ["Region", "Product ID", "Revenue"],
      ["North", "P-1", 10], [null, "P-2", 20], [null, "P-3", 30],
      ["South", "P-1", 40], [null, "P-2", 50],
    ];
    const { parsed } = await parseSheets(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(3) },
      {
        name: "Regional", rows: regional,
        merges: [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
          { s: { r: 2, c: 0 }, e: { r: 4, c: 0 } },
          { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },
        ],
      },
    ]));
    if (!parsed[1].ok) throw new Error("parse failed");
    expect(parsed[1].data.headers).toEqual(["Region", "Product ID", "Revenue"]);
    expect(parsed[1].data.rows.map(r => r.Region)).toEqual(["North", "North", "North", "South", "South"]);
  });

  it("names unnamed columns that have data", async () => {
    const { parsed } = await parseSheets(workbookFile("Sales.xlsx", [
      { name: "Orders", rows: orders(3) },
      { name: "Notes", rows: [["Customer ID", null, "City"], ["C-1", "x", "Leeds"], ["C-2", "y", "York"]] },
    ]));
    if (!parsed[1].ok) throw new Error("parse failed");
    expect(parsed[1].data.headers).toEqual(["Customer ID", "Column 2", "City"]);
  });

  it(`reads at most ${MAX_SHEETS_PER_WORKBOOK} sheets and says which were left out`, async () => {
    const many: SheetSpec[] = Array.from({ length: 12 }, (_, i) => ({ name: `S${i + 1}`, rows: customers }));
    const { files, notes } = await parseSheets(workbookFile("Big.xlsx", many));
    expect(files).toHaveLength(MAX_SHEETS_PER_WORKBOOK);
    expect(notes[0].skipped).toEqual([
      `Skipped S11: over the limit of ${MAX_SHEETS_PER_WORKBOOK} sheets per workbook.`,
      `Skipped S12: over the limit of ${MAX_SHEETS_PER_WORKBOOK} sheets per workbook.`,
    ]);
  });

  it("refuses a workbook where no sheet has data", async () => {
    await expect(expandWorkbookFiles([workbookFile("Empty.xlsx", [
      { name: "A", rows: [[]] }, { name: "B", rows: [["Only", "headers"]] },
    ])])).rejects.toThrow("No sheet in Empty.xlsx has data to read. Skipped: A (empty), B (header row only, no data rows).");
  });
});

describe("readWorkbookSheets: duplicate names", () => {
  it("numbers sheets that share a name, ignoring case", () => {
    const ws = XLSX.utils.aoa_to_sheet(customers);
    const wb: XLSX.WorkBook = { SheetNames: ["Orders", "orders", "Orders"], Sheets: { Orders: ws, orders: ws } };
    const read = readWorkbookSheets(XLSX, wb, "Dup.xlsx");
    expect(read.sheets.map(s => s.displayName)).toEqual(["Orders", "orders (2)", "Orders (3)"]);
    expect(describeWorkbookRead(read).summary).toBe("Read 3 sheets from Dup.xlsx: Orders (5 rows), orders (2) (5 rows), Orders (3) (5 rows)");
  });

  it("reports a missing sheet object as unreadable-empty rather than throwing", () => {
    const wb: XLSX.WorkBook = { SheetNames: ["Orders", "Ghost"], Sheets: { Orders: XLSX.utils.aoa_to_sheet(customers) } };
    const read = readWorkbookSheets(XLSX, wb, "G.xlsx");
    expect(read.sheets).toHaveLength(1);
    expect(read.skipped).toEqual([{ sheetName: "Ghost", reason: "empty" }]);
  });
});

describe("files that must behave as before", () => {
  it("returns a single-sheet workbook untouched and parses it as before", async () => {
    const file = workbookFile("One.xlsx", [{ name: "Data", rows: [["Title row"], ["a", "b"], ["1", "2"]] }]);
    const { files, notes } = await expandWorkbookFiles([file]);
    expect(files).toEqual([file]);
    expect(files[0]).toBe(file);
    expect(notes).toEqual([]);
    const result = await parseDataset(files[0]);
    if (!result.ok) throw new Error("parse failed");
    expect(result.data.fileName).toBe("One.xlsx");
    expect(result.data.headers[0]).toBe("Title row"); // the first row is still the header, exactly as before
  });

  it("passes CSV, TSV and JSON files through unchanged", async () => {
    const inputs = [new File(["a,b\n1,2\n"], "a.csv"), new File(["a\tb\n1\t2\n"], "a.tsv"), new File(['[{"a":1}]'], "a.json")];
    const { files, notes } = await expandWorkbookFiles(inputs);
    expect(files).toEqual(inputs);
    expect(notes).toEqual([]);
  });

  it("hands a corrupt workbook to parseDataset so its error message is unchanged", async () => {
    const bad = new File(["not a workbook"], "Bad.xlsx");
    const { files } = await expandWorkbookFiles([bad]);
    expect(files).toEqual([bad]);
  });

  it("expands several uploads at once, keeping non-workbook files in order", async () => {
    const csv = new File(["a,b\n1,2\n"], "extra.csv");
    const { files, notes } = await expandWorkbookFiles([csv, workbookFile("Sales.xlsx", threeSheets)]);
    expect(files.map(f => f.name)).toEqual(["extra.csv", "Sales.xlsx / Orders", "Sales.xlsx / Customers", "Sales.xlsx / Products"]);
    expect(notes).toHaveLength(1);
  });
});

describe("sheet file names", () => {
  it("round-trips workbook and sheet names", () => {
    expect(parseSheetFileName("Sales.xlsx / Orders")).toEqual({ workbookName: "Sales.xlsx", fileType: "xlsx", sheetName: "Orders" });
    expect(parseSheetFileName("Old Data.XLS / Q1.2024")).toEqual({ workbookName: "Old Data.XLS", fileType: "xls", sheetName: "Q1.2024" });
    expect(parseSheetFileName("sales.csv")).toBeNull();
    expect(datasetLabel("Sales.xlsx / Orders")).toBe("Orders");
    expect(datasetLabel("sales.csv")).toBe("sales.csv");
  });

  it("treats a sheet whose name ends in .json as CSV text", async () => {
    const result = await parseDataset(new File(["a,b\n1,2\n"], "Sales.xlsx / export.json"));
    if (!result.ok) throw new Error("parse failed");
    expect(result.data.rows).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("workbook sheets in the organisation flow", () => {
  it("makes each sheet a dataset, picks the sales-like sheet as primary and relates the sheets", async () => {
    const { files } = await expandWorkbookFiles([workbookFile("Sales.xlsx", [threeSheets[2], threeSheets[1], threeSheets[0]])]);
    const workspace = await prepareOrganizationWorkspace(files);
    const datasets = workspace.context.datasets;
    expect(datasets.map(d => d.fileName)).toEqual(["Sales.xlsx / Products", "Sales.xlsx / Customers", "Sales.xlsx / Orders"]);
    expect(datasets.map(d => d.purpose)).toEqual(["products", "customers", "sales"]);
    expect(datasets.map(d => d.rowCount)).toEqual([4, 5, 24]);
    expect(datasets.filter(d => d.primary).map(d => d.fileName)).toEqual(["Sales.xlsx / Orders"]);
    expect(new Set(datasets.map(d => d.id)).size).toBe(3);
    expect(workspace.context.relationships.length).toBeGreaterThan(0);
    expect(Object.keys(workspace.files)).toHaveLength(3);
  });

  it("does not let the workbook name decide a sheet's purpose", async () => {
    const { files } = await expandWorkbookFiles([workbookFile("Customer Sales.xlsx", [
      { name: "Notes", rows: [["Topic", "Detail"], ["a", "b"], ["c", "d"]] },
      { name: "Lines", rows: [["Topic", "Detail"], ["e", "f"], ["g", "h"]] },
    ])]);
    const workspace = await prepareOrganizationWorkspace(files);
    expect(workspace.context.datasets.map(d => d.purpose)).toEqual(["operations", "operations"]);
  });
});
