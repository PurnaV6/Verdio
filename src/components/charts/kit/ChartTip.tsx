import { useLayoutEffect, useRef, type ReactNode } from "react";
import { tooltipLeft } from "./geometry";

// The hover/keyboard tooltip. The live region carries the same words for screen readers, so this is aria-hidden.
// `x` is the anchor in plot pixels; the left edge is set after layout so the tip stays inside the plot box.
export function ChartTip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.style.left = `${tooltipLeft(x, el.offsetWidth, width)}px`;
  });
  return <div className="v2-kc-tip" ref={ref} aria-hidden="true">{children}</div>;
}
