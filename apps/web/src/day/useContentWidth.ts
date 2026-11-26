import type { RefObject } from "react";

import { rootRem, useContentBox } from "./useContentBox";

/** Content-box width of `element` in rem right now: `clientWidth` minus the inline padding. */
export function measureContentWidthRem(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const padding =
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.paddingRight) || 0);
  return Math.max(0, element.clientWidth - padding) / rootRem();
}

function widthFromEntry(entry: ResizeObserverEntry): number | undefined {
  const next = entry.contentRect.width;
  return Number.isFinite(next) ? next / rootRem() : undefined;
}

/**
 * Content-box width of `ref`'s element in rem, kept up to date with a `ResizeObserver`;
 * measured synchronously before the first paint (like `useContentHeight`). `null` where
 * `ResizeObserver` is missing (callers then fall back to their fixed maximum). The
 * element's width must not depend on its content (e.g. `flex-1 basis-0 min-w-0`).
 */
export function useContentWidth(
  ref: RefObject<HTMLElement | null>,
): number | null {
  return useContentBox(ref, measureContentWidthRem, widthFromEntry, Object.is);
}
