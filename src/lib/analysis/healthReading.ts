/* ================================================================
   VERDIO — Business health label (pure)
   Moved here from components/workspace/status.ts so library code (the
   story engine) can use it without importing from components.
   status.ts re-exports it; the thresholds and labels are unchanged.
   ================================================================ */

// Same thresholds the Overview has always used for the business health label.
export function healthReading(total: number): { tone: 'ok' | 'watch' | 'risk'; label: string } {
  if (total >= 80) return { tone: 'ok', label: 'Strong' };
  if (total >= 60) return { tone: 'watch', label: 'Monitored' };
  return { tone: 'risk', label: 'Needs attention' };
}
