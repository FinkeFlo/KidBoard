import type { CalendarEvent, Child } from "@kidboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { type FormatContext, formatTime } from "../i18n/format";
import { ChildAvatar } from "./ChildAvatar";
import { childColorStyle } from "./childColor";
import { Emoji } from "./Emoji";

export type EventStatus = "upcoming" | "current" | "past";

export interface EventTileProps {
  event: CalendarEvent;
  /** Configured children; `event.childIds` are looked up here (unknown ids skipped). */
  childList: readonly Child[];
  format: FormatContext;
  /** Relative to now; computed by the caller (the tile is presentational). */
  status?: EventStatus;
  /** Timed event that began on an earlier day: shows "continues" instead of the start. */
  continues?: boolean;
  /**
   * Fill the parent, which must be a size container (`@container-size`) with a definite
   * height: icon, padding and avatars scale with its height (`cqh`), the title drops to
   * one line and the time hides on short tiles, so the tile shrinks instead of clipping.
   */
  fit?: boolean;
}

const STATUS_CLASSES: Record<EventStatus, string> = {
  upcoming: "bg-surface-raised text-text shadow-card",
  current: "bg-surface-raised text-text shadow-raised ring-accent ring-4",
  // Receded via surface/text tokens, not opacity (keeps WCAG AA contrast).
  past: "bg-surface-sunken text-text-muted",
};

/** Natural tile vs. a tile that scales with its size-container parent (`fit`). */
const LAYOUT = {
  natural: {
    tile: "min-h-touch gap-3 p-3",
    icon: "text-display",
    title: "line-clamp-2",
    time: "",
    kids: "flex flex-col gap-1",
    avatar: "size-8 text-body",
  },
  fit: {
    tile: "h-full gap-[clamp(--spacing(1),5cqh,--spacing(3))] p-[clamp(--spacing(1),8cqh,--spacing(3))]",
    // Bounded by height and width, so a narrow two-column cell keeps room for the title.
    icon: "text-[length:clamp(1.25rem,min(50cqh,20cqw),var(--text-display))]",
    // Two lines need about 5.5rem of tile height; narrow cells use the smaller type.
    title:
      "line-clamp-2 hyphens-auto [@container(max-height:5.5rem)]:line-clamp-1 [@container(max-width:14rem)]:text-caption",
    // The time line needs about 3.5rem of tile height.
    time: "[@container(max-height:3.5rem)]:hidden",
    // Two rows at most (more children add columns), sized by the tile.
    kids: "grid grid-flow-col grid-rows-2 gap-[2cqh]",
    avatar:
      "size-[clamp(1rem,min(40cqh,13cqw),--spacing(8))] text-[length:clamp(0.625rem,min(22cqh,7cqw),var(--text-body))]",
  },
} as const;

export function EventTile({
  event,
  childList,
  format,
  status = "upcoming",
  continues = false,
  fit = false,
}: EventTileProps): React.JSX.Element {
  const { t } = useTranslation();
  const layout = LAYOUT[fit ? "fit" : "natural"];
  const titleId = useId();
  const kids = event.childIds.flatMap((id) => {
    const child = childList.find((c) => c.id === id);
    return child === undefined ? [] : [child];
  });
  return (
    <article
      aria-labelledby={titleId}
      data-testid="event-tile"
      data-status={status}
      data-all-day={event.allDay}
      style={childColorStyle(kids[0]?.color)}
      data-fit={fit}
      className={`${STATUS_CLASSES[status]} ${layout.tile} rounded-tile flex items-center border-s-8 border-(color:--child-color)`}
    >
      <Emoji emoji={event.icon} className={layout.icon} />
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          className={`text-body font-bold break-words ${layout.title}`}
        >
          {event.title}
        </p>
        <p className={`text-caption text-text-muted ${layout.time}`}>
          {event.allDay
            ? t("event.allDay")
            : continues
              ? t("event.continues")
              : formatTime(event.start, format)}
        </p>
        {/* Also when every id is unconfigured: no avatar is shown, so it reads as "everyone". */}
        {kids.length === 0 && (
          <p className="sr-only">{t("event.forEveryone")}</p>
        )}
        {status !== "upcoming" && (
          <p className="sr-only">{t(`event.status.${status}`)}</p>
        )}
      </div>
      {kids.length > 0 && (
        <ul className={`${layout.kids} shrink-0`}>
          {kids.map((child) => (
            <li key={child.id}>
              <ChildAvatar child={child} className={layout.avatar} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
