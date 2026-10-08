import type { ReactNode } from "react";
import { StateMark } from "../workspace/StateMark";
import type { Tone } from "../workspace/status";

// Shared page furniture for the insight pages (v2 language: semibold heading, ruled sections, mono figures).
export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <header className="v2-view-head"><p className="v2-eyebrow">{eyebrow}</p><h1>{title}</h1>{children&&<p>{children}</p>}</header>;
}

export function PageEmpty({ message }: { message: string }) {
  return <div className="v2-view"><section className="v2-empty" role="status"><div><h2>{message}</h2></div></section></div>;
}

export function Figure({ label, value, unit, sub, tone, toneLabel }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: Tone; toneLabel?: string }) {
  return <div className="v2-fig"><dt>{label}</dt><dd className="v2-fig-val">{value}{unit&&<span className="v2-unit">{unit}</span>}</dd>{tone&&toneLabel&&<dd><StateMark tone={tone} label={toneLabel}/></dd>}{sub&&<dd className="v2-tag">{sub}</dd>}</div>;
}

export function Figures({ label, children }: { label: string; children: ReactNode }) {
  return <dl className="v2-figs" aria-label={label}>{children}</dl>;
}

// Neutral counterpart of StateMark for "not started / not connected / pending" states: still a word plus a shape.
export function IdleMark({ label }: { label: string }) {
  return <span className="v2-state is-idle"><span aria-hidden="true">○</span> {label}</span>;
}

// Empty or loading message that sits inside an existing .v2-view (PageEmpty wraps its own).
export function InlineEmpty({ message }: { message: string }) {
  return <section className="v2-empty" role="status"><div><h2>{message}</h2></div></section>;
}
