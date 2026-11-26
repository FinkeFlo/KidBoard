import { type RefObject, useLayoutEffect, useState } from "react";

/** Root font size in px (1rem), 16 when it cannot be read: the board's rem scale. */
export function rootRem(): number {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * Shared skeleton of the content-box hooks (`useContentHeight`, `useContentWidth`): a
 * value derived from `ref`'s element, kept up to date with a `ResizeObserver`. The first
 * value is measured synchronously in the layout effect (`measure`), before the browser
 * paints, so the first frame is already fitted; a state update in a layout effect
 * re-renders before the paint, so the observer's first (asynchronous) callback is not
 * awaited. Afterwards each observer callback maps its last entry through `fromEntry`
 * (`undefined`: ignore it). A value `same` as the previous one keeps the previous state.
 * `null` where `ResizeObserver` is missing.
 *
 * `measure`, `fromEntry` and `same` must be stable (module-level functions), as they are
 * effect dependencies.
 */
export function useContentBox<T>(
  ref: RefObject<HTMLElement | null>,
  measure: (element: HTMLElement) => T,
  fromEntry: (entry: ResizeObserverEntry) => T | undefined,
  same: (previous: T, next: T) => boolean,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const update = (next: T): void => {
      setValue((previous) =>
        previous !== null && same(previous, next) ? previous : next,
      );
    };
    update(measure(element));
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      const next = fromEntry(entry);
      if (next !== undefined) update(next);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, measure, fromEntry, same]);
  return value;
}
