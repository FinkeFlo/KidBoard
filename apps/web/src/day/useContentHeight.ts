import type { RefObject } from "react";

import { rootRem, useContentBox } from "./useContentBox";

export interface ContentSize {
  /** Content-box height of the element in px. */
  height: number;
  /** Root font size in px (1rem), read at the same time: the board's rem scale. */
  rem: number;
}

/** Content-box height right now: `clientHeight` minus the vertical padding. */
export function measureContentHeight(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const padding =
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0);
  return Math.max(0, element.clientHeight - padding);
}

function measureSize(element: HTMLElement): ContentSize {
  return { height: measureContentHeight(element), rem: rootRem() };
}

function sizeFromEntry(entry: ResizeObserverEntry): ContentSize {
  return { height: entry.contentRect.height, rem: rootRem() };
}

function sameSize(previous: ContentSize, next: ContentSize): boolean {
  return previous.height === next.height && previous.rem === next.rem;
}

/**
 * Content-box height of `ref`'s element, kept up to date with a `ResizeObserver`, plus the
 * root font size. The first value is measured synchronously in the layout effect, before
 * the browser paints, so the first frame is already fitted (no flash of the unfitted
 * column); the observer keeps it current afterwards. `null` where `ResizeObserver` is
 * missing (callers then show everything). The element's height must not depend on its
 * content (e.g. `flex-1 min-h-0`), or measuring and laying out would feed each other.
 */
export function useContentHeight(
  ref: RefObject<HTMLElement | null>,
): ContentSize | null {
  return useContentBox(ref, measureSize, sizeFromEntry, sameSize);
}
