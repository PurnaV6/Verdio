import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { nextIndex, type KeyOptions } from "./geometry";

// The one activeIndex a chart draws its crosshair and tooltip from. Pointer handlers call setActive directly;
// plotProps carries the keyboard model (focus selects the first point, arrows/Home/End step, Escape clears).
export function useActiveIndex(count: number, opts: KeyOptions = {}) {
  const [active, setActive] = useState<number | null>(null);
  // Keep the index valid if the data shrinks underneath it.
  const current = active !== null && active < count ? active : null;
  const { series, vertical } = opts;

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const handled = e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || (e.key === 'Escape' && current !== null);
    if (!handled) return;
    e.preventDefault(); // stop the arrows and Home/End scrolling the page
    const next = nextIndex(e.key, current, count, { series, vertical });
    if (next !== current) setActive(next);
  }, [current, count, series, vertical]);

  const plotProps = {
    tabIndex: 0,
    onKeyDown,
    onFocus: () => setActive(a => (a === null && count > 0 ? 0 : a)),
    onBlur: () => setActive(null),
    onPointerLeave: (e: PointerEvent<HTMLElement>) => { if (document.activeElement !== e.currentTarget) setActive(null); },
  };
  return { active: current, setActive, plotProps };
}

// Measures an element's width (and keeps it current) so the SVG viewBox matches the pixels on screen.
// That keeps 11px text at 11px on a 375px phone instead of scaling it down with the viewBox.
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0) setWidth(Math.round(el.clientWidth)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// Pointer x in SVG user units (the viewBox is `width` wide, the element may be a few pixels off).
export function pointerX(e: PointerEvent<Element>, width: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  return rect.width > 0 ? ((e.clientX - rect.left) * width) / rect.width : 0;
}
