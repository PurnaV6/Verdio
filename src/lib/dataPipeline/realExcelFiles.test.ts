import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { listWorkbookSheets, planUpload } from "./workbook";
import { parseDataset } from "./parseDataset";
import { cellValueText } from "./excelCells";

/* ================================================================
   Excel-authored files, written part by part.
   The other Excel tests build their files with the library's own writer, which can only produce what the library
   itself understands. These build the XML parts the way Excel stores them (styles with custom number formats, shared
   strings, a 1904 flag, a hidden sheet, merged cells, a sheet whose range covers the whole grid) and zip them without
   the library, so a library upgrade is checked against files it did not write.
   What this cannot cover: .xls (the binary BIFF container), password-protected files and files saved by Excel itself.
   ================================================================ */

/* ---------- a minimal zip writer (stored entries, no compression) ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(parts: Record<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const push = (chunk: Uint8Array) => { chunks.push(chunk); offset += chunk.length; };
  for (const [name, text] of Object.entries(parts)) {
    const nameBytes = encoder.encode(name), data = encoder.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(10, 0x21, true); // time (any valid value)
    local.setUint16(12, 0x21, true); // date
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(12, 0x21, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    push(new Uint8Array(local.buffer)); push(nameBytes); push(data);
  }
  const centralStart = offset;
  for (const chunk of central) push(chunk);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(parts).length, true);
  end.setUint16(10, Object.keys(parts).length, true);
  end.setUint32(12, offset - centralStart, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

/* ---------- the XML parts of a workbook, as Excel lays them out ---------- */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Style indexes used by the sheets below (cellXfs order). */
const S = { general: 0, shortDate: 1, currency: 2, accounting: 3, dateTime: 4, clock: 5 } as const;

const STYLES = `${XML}<styleSheet xmlns="${MAIN}">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="&quot;£&quot;#,##0.00"/>
<numFmt numFmtId="165" formatCode="_(&quot;£&quot;* #,##0.00_);_(&quot;£&quot;* \\(#,##0.00\\);_(&quot;£&quot;* &quot;-&quot;??_);_(@_)"/>
</numFmts>
<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="21" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

type SheetPart = { name: string; xml: string; hidden?: boolean };

const sheetXml = (dimension: string, body: string, extras = "") =>
  `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><dimension ref="${dimension}"/>${extras.startsWith("<cols") ? extras : ""}<sheetData>${body}</sheetData>${extras.startsWith("<cols") ? "" : extras}</worksheet>`;

function xlsxFile(name: string, sheets: SheetPart[], strings: string[], options: { date1904?: boolean } = {}): File {
  const parts: Record<string, string> = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><workbookPr${options.date1904 ? ' date1904="1"' : ""} defaultThemeVersion="124226"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}"${sheet.hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="152511"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/styles.xml": STYLES,
    "xl/sharedStrings.xml": `${XML}<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings.map(s => `<si><t>${s}</t></si>`).join("")}</sst>`,
  };
  sheets.forEach((sheet, i) => { parts[`xl/worksheets/sheet${i + 1}.xml`] = sheet.xml; });
  return new File([zip(parts)], name);
}

/* ---------- the fixtures ---------- */

// Shared strings, in index order.
const STRINGS = ["Order Date", "Placed At", "Region", "Revenue", "Balance", "Opens", "Note", "North", "South", "Region ", "Target", "Code", "Label", "A1", "Alpha", "B2", "Beta"];
const sst = (text: string) => STRINGS.indexOf(text);
const str = (ref: string, text: string, style = 0) => `<c r="${ref}" s="${style}" t="s"><v>${sst(text)}</v></c>`;
const num = (ref: string, value: number | string, style = 0) => `<c r="${ref}" s="${style}"><v>${value}</v></c>`;

/**
 * Sales: a 1900-system sheet whose used range is A1:G5 but whose stored range is the whole grid (Excel does this
 * after a column or row is formatted), with a vertical merge, currency, accounting and date-time formats.
 */
const sales: SheetPart = {
  name: "Sales",
  xml: sheetXml("A1:XFD1048576", [
    `<row r="1">${["Order Date", "Placed At", "Region", "Revenue", "Balance", "Opens", "Note"].map((h, c) => str(`${"ABCDEFG"[c]}1`, h)).join("")}</row>`,
    `<row r="2">${num("A2", 45292, S.shortDate)}${num("B2", 45292.75, S.dateTime)}${str("C2", "North")}${num("D2", 1234.567, S.currency)}${num("E2", -1250.5, S.accounting)}${num("F2", 0.375, S.clock)}<c r="G2" t="inlineStr"><is><t>first</t></is></c></row>`,
    `<row r="3">${num("A3", 45293, S.shortDate)}${num("B3", 45293.5, S.dateTime)}${num("D3", 99.9, S.currency)}${num("E3", 0, S.accounting)}${num("F3", 0.375, S.clock)}<c r="G3" t="str"><f>"x"&amp;"y"</f><v>xy</v></c></row>`,
    `<row r="4">${num("A4", 45294, S.shortDate)}${num("B4", 45294 + 86399 / 86400, S.dateTime)}${num("D4", 5, S.currency)}${num("E4", -0.004, S.accounting)}${num("F4", 0.5, S.clock)}<c r="G4" s="${S.accounting}"/></row>`,
    `<row r="5">${num("A5", 45295, S.shortDate)}${num("B5", 45295.25, S.dateTime)}${str("C5", "South")}${num("D5", 10, S.currency)}${num("E5", 20.126, S.accounting)}${num("F5", 0.999988425926, S.clock)}<c r="G5" t="inlineStr"><is><t>last</t></is></c></row>`,
    `<row r="30" s="${S.shortDate}" customFormat="1"><c r="A30" s="${S.shortDate}"/><c r="D30" s="${S.currency}"/></row>`,
    `<row r="1048576"><c r="XFD1048576" s="${S.currency}"/></row>`,
  ].join(""), `<cols><col min="1" max="16384" width="14" style="${S.accounting}" customWidth="1"/></cols>`)
    .replace("</sheetData></worksheet>", '</sheetData><mergeCells count="1"><mergeCell ref="C2:C4"/></mergeCells></worksheet>'),
};

const targets: SheetPart = {
  name: "Targets",
  xml: sheetXml("A1:B3", `<row r="1">${str("A1", "Region")}${str("B1", "Target")}</row><row r="2">${str("A2", "North")}${num("B2", 100, S.currency)}</row><row r="3">${str("A3", "South")}${num("B3", 200, S.currency)}</row>`),
};

const lookup: SheetPart = {
  name: "Lookup",
  hidden: true,
  xml: sheetXml("A1:B3", `<row r="1">${str("A1", "Code")}${str("B1", "Label")}</row><row r="2">${str("A2", "A1")}${str("B2", "Alpha")}</row><row r="3">${str("A3", "B2")}${str("B3", "Beta")}</row>`),
};

const salesWorkbook = () => xlsxFile("Sales.xlsx", [sales, lookup, targets], STRINGS);

/** A 1904-system workbook (a Mac Excel default for old files). 44000 in this system is 2024-06-19. */
const log1904: SheetPart = {
  name: "Log",
  xml: sheetXml("A1:C4", [
    `<row r="1">${str("A1", "Order Date")}${str("B1", "Placed At")}${str("C1", "Revenue")}</row>`,
    `<row r="2">${num("A2", 44000, S.shortDate)}${num("B2", 44000.5, S.dateTime)}${num("C2", 7.5, S.currency)}</row>`,
    `<row r="3">${num("A3", 44001, S.shortDate)}${num("B3", 44001.25, S.dateTime)}${num("C3", -3, S.accounting)}</row>`,
    `<row r="4"><c r="A4" s="${S.shortDate}" t="d"><v>2024-06-21T00:00:00</v></c><c r="B4" s="${S.dateTime}" t="d"><v>2024-06-21T08:30:00</v></c>${num("C4", 1, S.currency)}</row>`,
  ].join("")),
};

async function read(file: File, sheet?: string) {
  const result = await parseDataset(file, sheet);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

describe("Excel-authored files (raw OOXML parts)", () => {
  it("reads currency, accounting, date-time, clock, merged and text cells exactly as stored", async () => {
    const data = await read(salesWorkbook(), "Sales");
    expect(data.headers).toEqual(["Order Date", "Placed At", "Region", "Revenue", "Balance", "Opens", "Note"]);
    expect(data.rows).toEqual([
      { "Order Date": "2024-01-01", "Placed At": "2024-01-01 18:00:00", Region: "North", Revenue: "1234.567", Balance: "-1250.5", Opens: "09:00:00", Note: "first" },
      { "Order Date": "2024-01-02", "Placed At": "2024-01-02 12:00:00", Region: "North", Revenue: "99.9", Balance: "0", Opens: "09:00:00", Note: "xy" },
      { "Order Date": "2024-01-03", "Placed At": "2024-01-03 23:59:59", Region: "North", Revenue: "5", Balance: "-0.004", Opens: "12:00:00", Note: "" },
      { "Order Date": "2024-01-04", "Placed At": "2024-01-04 06:00:00", Region: "South", Revenue: "10", Balance: "20.126", Opens: "23:59:59", Note: "last" },
    ]);
  });

  it("is not thrown by a sheet whose stored range is the whole grid (A1:XFD1048576)", async () => {
    const data = await read(salesWorkbook(), "Sales");
    expect(data.rows).toHaveLength(4);
  });

  it("lists the visible sheets and skips the hidden one", async () => {
    const listing = await listWorkbookSheets(salesWorkbook());
    expect(listing.ok).toBe(true);
    if (!listing.ok) return;
    expect(listing.data.totalSheets).toBe(3);
    expect(listing.data.sheets.map(s => [s.name, s.rowCount, s.columnCount, s.headerRow])).toEqual([["Sales", 4, 7, 1], ["Targets", 2, 2, 1]]);
    expect(listing.data.skipped).toEqual([{ name: "Lookup", reason: "hidden sheet" }]);
  });

  it("makes one dataset per visible sheet when planning an upload", async () => {
    const plan = await planUpload([salesWorkbook()]);
    expect(plan.sources.map(s => s.sheet)).toEqual(["Sales", "Targets"]);
  });

  it("reads the plain first sheet without a sheet name, as before", async () => {
    const data = await read(salesWorkbook());
    expect(data.fileName).toBe("Sales.xlsx");
    expect(data.rows[0]["Order Date"]).toBe("2024-01-01");
  });

  it("applies the 1904 date system to serial dates and to ISO date cells", async () => {
    const data = await read(xlsxFile("Log.xlsx", [log1904], STRINGS, { date1904: true }));
    expect(data.rows).toEqual([
      { "Order Date": "2024-06-19", "Placed At": "2024-06-19 12:00:00", Revenue: "7.5" },
      { "Order Date": "2024-06-20", "Placed At": "2024-06-20 06:00:00", Revenue: "-3" },
      { "Order Date": "2024-06-21", "Placed At": "2024-06-21 08:30:00", Revenue: "1" },
    ]);
  });

  it("reads the same serials, and the same ISO date cells, in the 1900 system when the flag is absent", async () => {
    const data = await read(xlsxFile("Log.xlsx", [log1904], STRINGS));
    expect(data.rows[0]["Order Date"]).toBe("2020-06-18"); // 1462 days earlier than with the 1904 flag
    expect(data.rows[2]).toEqual({ "Order Date": "2024-06-21", "Placed At": "2024-06-21 08:30:00", Revenue: "1" });
  });

  it("reads a Date cell as the UTC calendar day, in every timezone", () => {
    // SheetJS 0.20 makes Date cells UTC instants. This path is only reached if a workbook is ever read with cellDates.
    expect(cellValueText(XLSX, { t: "d", v: new Date(Date.UTC(2024, 5, 21)) })).toBe("2024-06-21");
    expect(cellValueText(XLSX, { t: "d", v: new Date(Date.UTC(2024, 11, 31, 23, 59)) })).toBe("2024-12-31");
  });
});
