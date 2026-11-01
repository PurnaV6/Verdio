import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { rowsToTable, sheetRows } from "./excelCells";
import { parseDataset } from "./parseDataset";

/* Excel shows "£1,234.57", "(5.00)" and "3/5/24"; the cells hold 1234.567, -5.004 and the serial 45356.
   These tests check that parseDataset keeps what the cell holds. */

type Spec = { value: string | number | Date; z?: string };

function workbook(header: string[], rows: Spec[][], options: { date1904?: boolean } = {}): File {
  const ws = XLSX.utils.aoa_to_sheet([header], { cellDates: true });
  rows.forEach((row, r) => row.forEach((spec, c) => {
    const address = XLSX.utils.encode_cell({ r: r + 1, c });
    ws[address] = typeof spec.value === "number" ? { t: "n", v: spec.value } : { t: "s", v: String(spec.value) };
    if (spec.z) ws[address].z = spec.z;
  }));
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  if (options.date1904) wb.Workbook = { WBProps: { date1904: true } };
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "book.xlsx");
}

async function read(file: File) {
  const result = await parseDataset(file);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("Excel cells are read as stored, not as displayed", () => {
  it("keeps the full amount of a currency-formatted number", async () => {
    const data = await read(workbook(["Item", "Amount"], [[{ value: "A" }, { value: 1234.567, z: '"£"#,##0.00' }]]));
    expect(data.rows[0].Amount).toBe("1234.567"); // Excel displays £1,234.57
  });

  it("reads an accounting negative as a negative number, not as '(5.00)'", async () => {
    const data = await read(workbook(["Item", "Amount"], [[{ value: "A" }, { value: -5.004, z: "#,##0.00;(#,##0.00)" }]]));
    expect(data.rows[0].Amount).toBe("-5.004"); // Excel displays (5.00)
  });

  it("turns an ambiguous display date into an unambiguous ISO date", async () => {
    // Excel displays 3/5/24 for the 5th of March; read as text it could be 3 May.
    const data = await read(workbook(["Day", "Day UK"], [[{ value: 45356, z: "m/d/yy" }, { value: 45356, z: "dd/mm/yyyy" }]]));
    expect(data.rows[0]).toEqual({ Day: "2024-03-05", "Day UK": "2024-03-05" });
  });

  it("converts true Excel date serials, with a time of day when there is one", async () => {
    const data = await read(workbook(["Date", "Stamp", "Clock"], [
      [{ value: 44927, z: "yyyy-mm-dd" }, { value: 45356.5, z: "yyyy-mm-dd hh:mm" }, { value: 0.25, z: "h:mm" }],
      [{ value: 60, z: "yyyy-mm-dd" }, { value: 36526, z: "yyyy-mm-dd hh:mm" }, { value: 0.75, z: "h:mm" }],
    ]));
    expect(data.rows[0]).toEqual({ Date: "2023-01-01", Stamp: "2024-03-05 12:00:00", Clock: "06:00:00" });
    expect(data.rows[1].Stamp).toBe("2000-01-01");
    expect(data.rows[1].Clock).toBe("18:00:00");
  });

  it("honours the 1904 date system", async () => {
    const data = await read(workbook(["Date", "Item"], [[{ value: 43465, z: "yyyy-mm-dd" }, { value: "A" }]], { date1904: true }));
    expect(data.rows[0].Date).toBe("2023-01-01");
  });

  it("leaves plain numbers, percentages, text and long ids alone", async () => {
    const data = await read(workbook(["Share", "Sum", "Code", "Text", "Id"], [[
      { value: 0.5, z: "0%" }, { value: 0.1 + 0.2 }, { value: "00123" }, { value: "(5.00)" }, { value: 12345678901234 },
    ]]));
    expect(data.rows[0]).toEqual({ Share: "0.5", Sum: "0.3", Code: "00123", Text: "(5.00)", Id: "12345678901234" });
  });

  it("does not loop over a formatting-only range such as A1:XFD1048576", async () => {
    const file = workbook(["a", "b"], [[{ value: 1 }, { value: 2 }], [{ value: 3 }, { value: 4 }]]);
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellNF: true });
    wb.Sheets.Data["!ref"] = "A1:XFD1048576"; // the range is only changed in memory: writing it back would loop
    expect(rowsToTable(sheetRows(XLSX, wb.Sheets.Data)).rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });

  it("drops blank rows and repeats a vertically merged value down its rows", async () => {
    const file = workbook(["Region", "Revenue"], [
      [{ value: "North" }, { value: 1 }], [{ value: "" }, { value: 2 }], [{ value: "South" }, { value: 3 }],
    ]);
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    delete wb.Sheets.Data.A3;
    wb.Sheets.Data["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const data = await read(new File([bytes], "merged.xlsx"));
    expect(data.rows.map(r => r.Region)).toEqual(["North", "North", "South"]);
  });
});
