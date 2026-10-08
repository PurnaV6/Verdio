import { expect } from "vitest";
import { createSampleBusinessFile } from "../demo/sampleBusinessDataset";
import { runDataPipeline } from "../dataPipeline/runDataPipeline";
import type { PipelineResult } from "../../types/pipeline";
import { findBannedWords, sentenceCount, wordCount } from "./text";
import type { StoryOutcome, StoryResult } from "./types";
import { validateNumbers } from "./validateNumbers";

/* Test helpers for the story engine: real pipeline runs, no mocks. */

let demo: Promise<PipelineResult> | undefined;

/** The demo workspace, computed once per test file. Treat it as read-only; use cloneResult to change it. */
export function demoResult(): Promise<PipelineResult> {
  demo ??= runDataPipeline(createSampleBusinessFile()).then(outcome => {
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.result;
  });
  return demo;
}

/** Runs a small CSV through the real pipeline. */
export async function resultFromCsv(csv: string, name = 'test.csv'): Promise<PipelineResult> {
  const outcome = await runDataPipeline(new File([csv], name, { type: 'text/csv' }));
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

/** Deep copy that keeps the extra fields the pipeline attaches (_vdeMeta, _modelMeta). */
export function cloneResult(result: PipelineResult): PipelineResult {
  return structuredClone(result);
}

/** Builds a CSV of monthly sales rows. Optional columns can be left out to test degraded files. */
export function salesCsv(options: {
  months: number; rowsPerMonth?: number; date?: boolean; revenue?: boolean; customer?: boolean; cost?: boolean; product?: boolean;
  monthly?: (month: number) => number;
}): string {
  const { months, rowsPerMonth = 4, date = true, revenue = true, customer = true, cost = true, product = true } = options;
  const headers = ['Order ID', ...(date ? ['Order Date'] : []), ...(product ? ['Product'] : []), ...(customer ? ['Customer ID'] : []), ...(revenue ? ['Revenue'] : []), ...(cost ? ['Cost'] : []), 'Units'];
  const lines = [headers.join(',')];
  for (let month = 0; month < months; month += 1) {
    for (let order = 0; order < rowsPerMonth; order += 1) {
      const day = String(1 + ((order * 3) % 27)).padStart(2, "0");
      const monthly = (options.monthly?.(month) ?? 1000 + month * 40) / rowsPerMonth;
      const when = new Date(Date.UTC(2023 + Math.floor(month / 12), month % 12, 1)).toISOString().slice(0, 8) + day;
      const row = [
        `O-${month}-${order}`,
        ...(date ? [when] : []),
        ...(product ? [['Alpha', 'Beta', 'Gamma'][(month + order) % 3]] : []),
        ...(customer ? [`CUST-${String(1 + ((month * rowsPerMonth + order) % 25)).padStart(3, '0')}`] : []),
        ...(revenue ? [String(Math.round(monthly))] : []),
        ...(cost ? [String(Math.round(monthly * 0.6))] : []),
        String(1 + order),
      ];
      lines.push(row.join(','));
    }
  }
  return lines.join('\n');
}

/** Every sentence a story shows, in one string. */
export function storyText(story: StoryResult): string {
  return [story.happened, story.why, story.next ?? '', story.confidence.caveat, story.source, ...story.notes].join(' ');
}

const IMPERATIVE_VERBS = ['Re-engage', 'Investigate', 'Run', 'Reduce', 'Accelerate', 'Validate', 'Implement', 'Build', 'Improve', 'Complete', 'Close', 'Record', 'Review', 'Ask', 'Confirm'];

/**
 * The checks every page must pass on every file: clean text, no banned words, part limits,
 * and every number backed by a recorded fact. Returns the outcome so callers can add more.
 */
export function expectHealthy(outcome: StoryOutcome, label: string): void {
  const text = outcome.kind === 'story' ? storyText(outcome) : `${outcome.reason} ${outcome.fix}`;
  expect(text.trim(), `${label}: not blank`).not.toBe('');
  expect(text, `${label}: no broken values`).not.toMatch(/\b(NaN|undefined|null|Infinity)\b|\[object|\{\w+\}/);
  expect(findBannedWords(text), `${label}: banned words`).toEqual([]);
  expect(validateNumbers(text, outcome.facts), `${label}: numbers without a fact`).toEqual([]);
  if (outcome.kind !== 'story') return;

  expect(sentenceCount(outcome.happened), `${label}: happened sentences`).toBeLessThanOrEqual(2);
  expect(wordCount(outcome.happened), `${label}: happened words`).toBeLessThanOrEqual(35);
  expect(outcome.happened.length, `${label}: happened present`).toBeGreaterThan(0);
  expect(sentenceCount(outcome.why), `${label}: why sentences`).toBeLessThanOrEqual(2);
  expect(wordCount(outcome.why), `${label}: why words`).toBeLessThanOrEqual(30);
  expect(outcome.why.length, `${label}: why present`).toBeGreaterThan(0);
  if (outcome.next !== null) {
    expect(sentenceCount(outcome.next), `${label}: next sentences`).toBe(1);
    expect(wordCount(outcome.next), `${label}: next words`).toBeLessThanOrEqual(25);
    expect(IMPERATIVE_VERBS, `${label}: next starts with a verb`).toContain(outcome.next.split(' ')[0]);
  }
  expect(['High', 'Medium', 'Low']).toContain(outcome.confidence.label);
  expect(outcome.confidence.caveat.length).toBeGreaterThan(0);
  expect(outcome.source).toMatch(/^Source: /);
}
