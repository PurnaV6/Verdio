import type { StoryFacts } from "./types";

/* ================================================================
   VERDIO — Fact book
   Story builders read every number and string through here, so the
   text can never use a value that was not recorded with its source.
   ================================================================ */

export class FactBook {
  readonly facts: StoryFacts = {};

  /** Records a number (the raw, unrounded value) and returns it. Non-finite numbers are a bug. */
  n(name: string, value: number, source: string): number {
    if (!Number.isFinite(value)) throw new Error(`Story fact "${name}" (${source}) is not a finite number`);
    this.facts[name] = { value, source };
    return value;
  }

  /** Records a string exactly as it is printed and returns it. */
  s(name: string, value: string, source: string): string {
    this.facts[name] = { value, source };
    return value;
  }

  has(name: string): boolean {
    return name in this.facts;
  }

  /** The "out of 100" and "/100" scale of the scores. */
  scale100(): number {
    return this.n('scoreScale', 100, 'score scale (health and data quality are out of 100)');
  }
}
