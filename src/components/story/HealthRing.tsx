import { StateMark } from "../workspace/StateMark";
import type { Tone } from "../workspace/status";

/* ================================================================
   VERDIO — HealthRing
   The business health score as a ring: a flat arc on a pale track,
   the number in the middle. The reading is also said in words with a
   shape (StateMark), so the colour never carries it alone.
   ================================================================ */

const SIZE = 132;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HealthRing({ value, label, tone }: { value: number; label: string; tone: Tone }) {
  const clamped = Math.max(0, Math.min(100, value));
  const arc = (CIRCUMFERENCE * clamped) / 100;
  return (
    <svg className="v2-ring" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Business health ${value} out of 100, ${label}`}>
      <circle className="v2-ring-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} />
      <circle className={`v2-ring-arc is-${tone}`} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} strokeLinecap="round"
        strokeDasharray={`${arc} ${CIRCUMFERENCE}`} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
      <text className="v2-ring-num" x={SIZE / 2} y={SIZE / 2 + 5} textAnchor="middle">{value}</text>
      <text className="v2-ring-sub" x={SIZE / 2} y={SIZE / 2 + 24} textAnchor="middle">out of 100</text>
    </svg>
  );
}

export function HealthRingBlock({ value, label, tone }: { value: number; label: string; tone: Tone }) {
  return (
    <div className="v2-ov-story-ring" role="group" aria-label="Business health">
      <HealthRing value={value} label={label} tone={tone} />
      <b><StateMark tone={tone} label={label} /></b>
      <span>Combined operational, quality and risk assessment</span>
    </div>
  );
}
