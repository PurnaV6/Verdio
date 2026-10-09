import { useEffect, useState } from "react";
import { buildChartTheme, themeKey, type ChartTheme } from "./chartTheme";

function readTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  return buildChartTheme(token => style.getPropertyValue(token));
}

// The --vc-* tokens as plain values, for Recharts. Re-read only when data-accent on <html> changes
// (setAccent in src/lib/theme.ts), so a render never calls getComputedStyle.
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = readTheme();
      setTheme(prev => (themeKey(prev) === themeKey(next) ? prev : next));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
