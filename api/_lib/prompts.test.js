import { describe, expect, it } from 'vitest';
import { ADVISOR_SYSTEM_PROMPT, INSIGHTS_SYSTEM_PROMPT, PAGE_NAMES } from './prompts.js';
import { PAGES } from '../../src/components/workspace/navigation.ts';

describe('page names in the Advisor prompt', () => {
  it('match the real navigation labels exactly, so the prompt cannot drift from the app', () => {
    expect([...PAGE_NAMES].sort()).toEqual(PAGES.map(page => page.label).sort());
  });

  it('are all listed in both system prompts', () => {
    for (const prompt of [ADVISOR_SYSTEM_PROMPT, INSIGHTS_SYSTEM_PROMPT]) {
      for (const page of PAGES) expect(prompt).toContain(page.label);
    }
  });

  it('forbids inventing names and sending users to a page for a chart', () => {
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/Never invent or guess a page, tab, section, chart, button or menu name/);
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/Never tell the user to go to a page to find a chart/);
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/attach it inline/);
  });

  it('keeps the existing scope and number rules', () => {
    expect(ADVISOR_SYSTEM_PROMPT).toContain('no access to any other user');
    expect(ADVISOR_SYSTEM_PROMPT).toContain('Do not invent numbers');
  });
});
