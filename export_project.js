/**
 * Run this in your Verdio project root to create one uploadable file
 * Usage: node export_project.js
 */
import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '.vite', 'build']);
const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
const MAX_SIZE_KB = 400;

const root = process.cwd();
const outPath = path.join(root, 'verdio_full_code.txt');
const out = fs.createWriteStream(outPath, { encoding: 'utf-8' });

out.write('# Verdio Full Code Export\n');
out.write(`# Generated: ${new Date().toISOString()}\n`);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else {
      const ext = path.extname(entry.name);
      if (!INCLUDE_EXTS.has(ext)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);
      if (relPath === 'verdio_full_code.txt' || relPath === 'export_project.js' || relPath === 'export_project_for_review.py') continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size / 1024 > MAX_SIZE_KB) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        out.write(`\n\n${'='.repeat(80)}\n`);
        out.write(`FILE: ${relPath.replaceAll('\\', '/')}\n`);
        out.write(`${'='.repeat(80)}\n\n`);
        out.write(content);
      } catch (e) {
        out.write(`\n[Could not read ${relPath}: ${e.message}]\n`);
      }
    }
  }
}

walk(root);
out.end(() => {
  console.log(`Done! Created ${outPath}`);
  console.log('Now upload verdio_full_code.txt here in the chat.');
});
