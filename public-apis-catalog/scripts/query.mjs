#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "public-apis.json");
const apis = JSON.parse(readFileSync(dataPath, "utf-8"));

const [, , cmd, ...args] = process.argv;

function printTable(rows) {
  for (const r of rows) {
    console.log(`${r.name} — ${r.description} (${r.auth === "No" ? "no auth" : r.auth}) ${r.link}`);
  }
  console.log(`\n${rows.length} result(s)`);
}

switch (cmd) {
  case "categories": {
    const counts = {};
    for (const a of apis) counts[a.category] = (counts[a.category] || 0) + 1;
    for (const [cat, count] of Object.entries(counts).sort()) {
      console.log(`${cat.padEnd(32)} ${count}`);
    }
    break;
  }
  case "category": {
    const name = args.join(" ");
    if (!name) {
      console.error("Usage: query.mjs category <Category Name>");
      process.exit(1);
    }
    const rows = apis.filter((a) => a.category.toLowerCase() === name.toLowerCase());
    printTable(rows);
    break;
  }
  case "search": {
    const term = args.join(" ").toLowerCase();
    if (!term) {
      console.error("Usage: query.mjs search <term>");
      process.exit(1);
    }
    const rows = apis.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.description.toLowerCase().includes(term) ||
        a.category.toLowerCase().includes(term)
    );
    printTable(rows);
    break;
  }
  case "noauth": {
    const rows = apis.filter((a) => a.auth === "No");
    printTable(rows);
    break;
  }
  default: {
    console.log(`Usage:
  query.mjs categories            list all categories with counts
  query.mjs category <name>       list APIs in a category
  query.mjs search <term>         search name/description/category
  query.mjs noauth                list APIs that need no auth key`);
  }
}
