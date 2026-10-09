/* ================================================================
   VERDIO — chart theme
   Resolves the --vc-* console tokens (src/app/index.css) into plain
   values for libraries that take colour props instead of CSS
   variables (Recharts). The pure part lives here so it can be tested;
   useChartTheme.ts reads the real document.
   ================================================================ */

const TOKENS = ['accent', 'accent-2', 'accent-tint', 'ok', 'watch', 'risk', 'panel', 'bg', 'line', 'ink', 'muted'] as const;

export interface ChartTheme {
  accent: string;
  accent2: string;
  accentTint: string;
  ok: string;
  watch: string;
  risk: string;
  panel: string;
  bg: string;
  line: string;
  ink: string;
  muted: string;
  // Series colours for charts with several series or slices. Each is at least 3:1 against the panel.
  palette: string[];
  tooltip: { borderRadius: number; border: string; boxShadow: string; color: string; fontSize: number; background: string };
}

// `read` returns the computed value of a token (for example "--vc-accent"), or '' when it is not set.
// An unset token falls back to the var() reference itself, which SVG paint attributes also accept.
export function buildChartTheme(read: (token: string) => string): ChartTheme {
  const v: Record<string, string> = {};
  for (const t of TOKENS) v[t] = read(`--vc-${t}`).trim() || `var(--vc-${t})`;
  const { accent, ink } = v;
  return {
    accent, accent2: v['accent-2'], accentTint: v['accent-tint'], ok: v.ok, watch: v.watch, risk: v.risk,
    panel: v.panel, bg: v.bg, line: v.line, ink, muted: v.muted,
    palette: [
      accent,
      v['accent-2'],
      v.watch,
      v.risk,
      `color-mix(in srgb, ${ink} 70%, ${accent})`,
      `color-mix(in srgb, ${accent} 70%, ${ink})`,
      v.muted,
      `color-mix(in srgb, ${v['accent-2']} 80%, ${ink})`,
    ],
    tooltip: {
      borderRadius: 4,
      border: `1px solid ${v.line}`,
      boxShadow: `0 8px 24px color-mix(in srgb, ${ink} 14%, transparent)`,
      color: ink,
      fontSize: 12,
      background: v.panel,
    },
  };
}

export function themeKey(theme: ChartTheme): string {
  return [theme.accent, theme.accent2, theme.accentTint, theme.ok, theme.watch, theme.risk, theme.panel, theme.bg, theme.line, theme.ink, theme.muted].join('|');
}
