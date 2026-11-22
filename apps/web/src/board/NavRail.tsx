import { useTranslation } from "react-i18next";

import { type FormatContext, formatTime } from "../i18n/format";
import { type BoardView, ViewToggle } from "./ViewToggle";

export interface NavRailProps {
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  /** When the shown agenda was fetched (epoch ms, the query's `dataUpdatedAt`); 0: unknown. */
  updatedAt: number;
  format: FormatContext;
}

/**
 * Navigation rail on the right: the two view buttons on top, "Stand 15:18" at the bottom.
 * The "Stand" line is plain text, not a live region (it changes with every refetch and
 * must not chatter). The rail's bottom slot below it belongs to the long-press
 * fullscreen control (merge rule 6), which is a fixed overlay in the reserved bottom
 * strip (see `FullscreenControl`), so the rail never covers it.
 */
export function NavRail({
  view,
  onViewChange,
  updatedAt,
  format,
}: NavRailProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <nav
      data-testid="nav-rail"
      className="w-nav flex shrink-0 flex-col items-center"
    >
      <ViewToggle view={view} onChange={onViewChange} />
      {updatedAt > 0 && (
        <p
          data-testid="updated-at"
          className="text-caption text-text-muted mt-auto text-center"
        >
          {t("board.updated", { time: formatTime(updatedAt, format) })}
        </p>
      )}
    </nav>
  );
}
