import { Figure } from "./PageParts";

// Tone has always been part of this component's API; it is now shown as word + shape + colour.
const TONE = { green: 'ok', amber: 'watch', red: 'risk' } as const;

export function MetricCard({ label, value, sub, tone, toneLabel }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber'; toneLabel?: string }) {
  return <Figure label={label} value={value} sub={sub} tone={tone ? TONE[tone] : undefined} toneLabel={toneLabel} />;
}
