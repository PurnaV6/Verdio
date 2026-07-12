import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type UploadPageProps = {
  onDataLoaded: (rows: Record<string, string>[]) => void;
};

export default function UploadPage({ onDataLoaded }: UploadPageProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file) return;
    setError(null);
    setLoading(true);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          parseCSV(csv, file.name);
        } catch {
          setError("Could not read Excel file. Please check it is a valid .xlsx or .xls file.");
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setError("Failed to read file.");
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.data || results.data.length === 0) {
            setError("The CSV file appears to be empty.");
            setLoading(false);
            return;
          }
          onDataLoaded(results.data as Record<string, string>[]);
        },
        error: (err) => {
          setError(`CSV error: ${err.message}`);
          setLoading(false);
        },
      });
    } else {
      setError("Please upload a CSV (.csv) or Excel (.xlsx, .xls) file.");
      setLoading(false);
    }
  }

  function parseCSV(csv: string, _filename: string) {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setError("The file appears to be empty or has no data rows.");
          setLoading(false);
          return;
        }
        onDataLoaded(results.data as Record<string, string>[]);
      },
      error: (err) => {
        setError(`Parse error: ${err.message}`);
        setLoading(false);
      },
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-sm p-10 text-center">

        {/* Logo mark */}
        <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-[#0F172A] flex items-center justify-center text-[#16A34A] font-black text-3xl shadow-lg">
          V
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Verdio</h1>
        <p className="text-xs font-bold tracking-[0.25em] text-slate-400 mt-1 mb-2">
          DECISION INTELLIGENCE
        </p>

        <p className="mt-3 text-slate-500 text-sm leading-6">
          Upload your business data and Verdio will analyse it and generate
          your Executive Decision Brief — no analyst required.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-8 cursor-pointer rounded-2xl border-2 border-dashed p-10 transition-all ${
            dragging
              ? "border-[#16A34A] bg-emerald-50"
              : "border-slate-300 bg-slate-50 hover:border-[#16A34A] hover:bg-emerald-50/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onInputChange}
          />

          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-slate-200 border-t-[#16A34A] rounded-full animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Analysing your data…</p>
            </div>
          ) : (
            <>
              <div className="text-3xl mb-3">📁</div>
              <p className="font-semibold text-slate-700">
                Drag and drop your file here
              </p>
              <p className="mt-2 text-sm text-slate-500">
                or click to choose a file
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Supports CSV, Excel (.xlsx) and XLS
              </p>
            </>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        {/* What columns are detected */}
        <div className="mt-6 text-left rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
          <p className="text-xs font-bold tracking-[0.15em] text-slate-500 mb-3">
            AUTO-DETECTED COLUMNS
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-500">
            {[
              ["Revenue", "revenue, UnitPrice × Qty, sales, amount"],
              ["Date", "date, InvoiceDate, OrderDate"],
              ["Product", "description, product, item, SKU"],
              ["Customer", "CustomerID, customer, email"],
              ["Country", "country, region, market"],
              ["Orders", "each row counts as one order"],
            ].map(([col, variants]) => (
              <div key={col} className="flex gap-1.5">
                <span className="font-semibold text-slate-700 whitespace-nowrap">{col}:</span>
                <span>{variants}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          Your data is processed locally in your browser and never sent to any server.
        </p>
      </div>
    </div>
  );
}
