import { describe, expect, it } from "vitest";
import { buildChartTheme, themeKey } from "./chartTheme";

describe("buildChartTheme", () => {
  it("reads every --vc-* token it is given, trimmed", () => {
    const asked: string[] = [];
    const theme = buildChartTheme(t => { asked.push(t); return ` <${t}> `; });
    expect(theme.accent).toBe('<--vc-accent>');
    expect(theme.accent2).toBe('<--vc-accent-2>');
    expect(theme.accentTint).toBe('<--vc-accent-tint>');
    expect(asked.every(t => t.startsWith('--vc-'))).toBe(true);
    expect(asked).toHaveLength(11);
  });
  it("falls back to the var() reference when a token is not set", () => {
    const theme = buildChartTheme(() => '');
    expect(theme.accent).toBe('var(--vc-accent)');
    expect(theme.tooltip.background).toBe('var(--vc-panel)');
  });
  it("builds an eight colour palette from the tokens and no literal colours", () => {
    const theme = buildChartTheme(t => `T(${t})`);
    expect(theme.palette).toHaveLength(8);
    expect(theme.palette[0]).toBe(theme.accent);
    expect(JSON.stringify(theme)).not.toMatch(/#[0-9a-fA-F]{3,8}|rgba?\(/);
  });
  it("changes its key when the accent changes", () => {
    const blue = buildChartTheme(t => (t === '--vc-accent' ? 'blue' : 'x'));
    const green = buildChartTheme(t => (t === '--vc-accent' ? 'green' : 'x'));
    expect(themeKey(blue)).not.toBe(themeKey(green));
    expect(themeKey(blue)).toBe(themeKey(buildChartTheme(t => (t === '--vc-accent' ? 'blue' : 'x'))));
  });
});
