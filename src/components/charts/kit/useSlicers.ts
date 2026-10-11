import { useCallback, useMemo, useState } from "react";

/* The state behind a set of slicers. `initial` is the "nothing sliced" state and `normalise` must be stable
   (memoise both). `normalise` runs on every change so a choice that no longer makes sense (a month outside
   the period) is cleared in the same step, and again on read so a new file cannot leave a stale choice.
   `changed` is true when anything differs from `initial`. */
export function useSlicers<S extends object>(initial: S, normalise?: (next: S) => S) {
  const [state, setState] = useState<S>(initial);
  const set = useCallback((patch: Partial<S>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      return normalise ? normalise(next) : next;
    });
  }, [normalise]);
  const reset = useCallback(() => setState(initial), [initial]);
  const shown = useMemo(() => (normalise ? normalise(state) : state), [state, normalise]);
  const changed = (Object.keys(initial) as (keyof S)[]).some(k => shown[k] !== initial[k]);
  return { state: shown, set, reset, changed };
}
