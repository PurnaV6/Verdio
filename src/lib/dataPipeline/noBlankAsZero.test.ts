import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* A blank cell read with Number() is 0, so a gap becomes a sale. Every row cell is read with
   parseAmount instead. ESLint bans the same pattern (no-restricted-syntax); this keeps it banned
   even where lint is not run. src/lib/calculateMetrics.ts is legacy code that nothing imports. */

const SRC = join(process.cwd(), 'src');
const BANNED = /\bNumber\(\s*(row|r)\s*\[/;
const SKIP = new Set([join(SRC, 'lib', 'calculateMetrics.ts')]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !SKIP.has(path) ? [path] : [];
  });
}

describe("reading row cells", () => {
  it("never uses Number(row[...]) in src", () => {
    const offenders = sourceFiles(SRC).filter(file => readFileSync(file, 'utf8').split('\n').some(line => BANNED.test(line)));
    expect(offenders.map(file => file.slice(SRC.length + 1))).toEqual([]);
  });
});
