import { useTranslation } from "react-i18next";

import { ChildAvatar } from "./ChildAvatar";
import type { TileTint } from "./childTint";

/**
 * The children's signs on a tile: one badge per child (up to `MAX_BADGES`), overlapping,
 * each with a ring that separates it from its neighbour; more children are counted as
 * "+N". Decorative: the tile's accessible name names every child.
 */
export function ChildBadges({
  tint,
  size,
  text,
}: {
  tint: TileTint;
  /** Badge size, e.g. `size-badge`. */
  size: string;
  /** Emoji size inside a badge, e.g. `text-title`. */
  text: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (tint.badges.length === 0) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="child-badges"
      className="flex items-center"
    >
      {tint.badges.map((child) => (
        <ChildAvatar
          key={child.id}
          decorative
          child={child}
          className={`ring-on-child night:ring-surface -ms-3 ring-3 first:ms-0 ${size} ${text}`}
        />
      ))}
      {tint.overflow > 0 && (
        <span
          data-testid="child-badges-more"
          className={`bg-surface-raised text-text ring-border rounded-pill text-meta -ms-3 inline-flex shrink-0 items-center justify-center font-black ring-3 ${size}`}
        >
          {t("event.moreChildren", { count: tint.overflow })}
        </span>
      )}
    </span>
  );
}
