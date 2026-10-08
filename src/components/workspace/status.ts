export type Tone = 'ok' | 'watch' | 'risk';

export const TONE_GLYPH: Record<Tone, string> = { ok: '✓', watch: '●', risk: '▲' };

// Same thresholds the Overview has always used for the business health label.
export function healthReading(total: number): { tone: Tone; label: string } {
  if (total >= 80) return { tone: 'ok', label: 'Strong' };
  if (total >= 60) return { tone: 'watch', label: 'Monitored' };
  return { tone: 'risk', label: 'Needs attention' };
}
