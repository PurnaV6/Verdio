export type Tone = 'ok' | 'watch' | 'risk';

export const TONE_GLYPH: Record<Tone, string> = { ok: '✓', watch: '●', risk: '▲' };

// Same thresholds the Overview has always used for the business health label.
export { healthReading } from "../../lib/analysis/healthReading";
