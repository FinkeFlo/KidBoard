import type { CalendarEvent, Child } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { type FormatContext, formatTime } from "../i18n/format";
import type { DayBand } from "../time";
import { ChildBadges } from "./ChildBadges";
import { resolveTileTint, type TileTint, tileTintStyle } from "./childTint";
import { Emoji } from "./Emoji";
import { AllDayIcon, TimeOfDayIcon } from "./TimeOfDayIcon";

export type EventStatus = "upcoming" | "current" | "past";

/**
 * Tile sizes: `large` / `dense` in today's column (dense from 6 events or when space is
 * short), `compact` / `compact-dense` on the other days, `week` / `week-dense` for the
 * seven narrow week columns (stacked: emoji above time, no visible title). Heights are fixed, so a column
 * can derive how many tiles fit from its height ({@link TILE_HEIGHT_REM}).
 */
export type TileSize =
  "large" | "dense" | "compact" | "compact-dense" | "week" | "week-dense";

/** Tile heights in rem; `large` and `compact` are `--spacing-tile(-compact)`. */
export const TILE_HEIGHT_REM: Record<TileSize, number> = {
  large: 5,
  dense: 3.75,
  compact: 4.75,
  "compact-dense": 3.75,
  week: 5.75,
  "week-dense": 4.5,
};

// Full class names so Tailwind can see them. Today's large emoji stay >= 3.5rem, dense ones are 3rem.
const SIZES: Record<
  TileSize,
  {
    tile: string;
    emoji: string;
    title: string;
    badge: string;
    badgeText: string;
    /** Emoji above the time (week columns) instead of beside the title. */
    stacked: boolean;
  }
> = {
  large: {
    tile: "h-tile gap-3 ps-3 pe-4",
    emoji: "text-[3.5rem]",
    title: "text-tile",
    badge: "size-badge",
    badgeText: "text-title",
    stacked: false,
  },
  dense: {
    // 3.75rem holds the 3rem emoji line box (leading-none) with 0.25rem to spare inside
    // the 4px edge; the glyph's slightly taller ink stays below the edge overlay.
    tile: "h-15 gap-3 ps-3 pe-4",
    emoji: "text-[3rem]",
    title: "text-tile-compact",
    badge: "size-8",
    badgeText: "text-body",
    stacked: false,
  },
  compact: {
    tile: "h-tile-compact gap-2 ps-2.5 pe-3",
    emoji: "text-[2.5rem]",
    title: "text-tile-compact",
    badge: "size-9",
    badgeText: "text-body",
    stacked: false,
  },
  "compact-dense": {
    tile: "h-15 gap-2 ps-2.5 pe-3",
    emoji: "text-[2.25rem]",
    title: "text-tile-compact",
    badge: "size-8",
    badgeText: "text-body",
    stacked: false,
  },
  week: {
    tile: "h-23 flex-col justify-center gap-1 px-1.5",
    emoji: "text-[2.75rem]",
    title: "text-tile-compact",
    badge: "size-7",
    badgeText: "text-caption",
    stacked: true,
  },
  "week-dense": {
    tile: "h-18 flex-col justify-center gap-0.5 px-1.5",
    emoji: "text-[2.25rem]",
    title: "text-tile-compact",
    badge: "size-7",
    badgeText: "text-caption",
    stacked: true,
  },
};

/** Overlay that carries the tile edge on top of the tile's content. */
const EDGE_OVERLAY =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-tile";

/**
 * Status look. Past events recede through surface/text tokens, never opacity (merge
 * rule 4); the current event keeps its accent ring and the next upcoming one gets a ring
 * in the "now" colour (merge rule 3), so "now" and "next" read without words.
 */
function statusClasses(
  status: EventStatus,
  next: boolean,
  tint: TileTint,
): string {
  if (status === "past") return "bg-surface-sunken text-text-muted";
  // The edge is drawn by an overlay above the content (`after:`), so a large emoji glyph
  // can never paint over the child's edge.
  const edge =
    tint.edge !== null
      ? `${EDGE_OVERLAY} after:inset-ring-4 after:inset-ring-(color:--child-color)`
      : tint.kind === "split"
        ? ""
        : `${EDGE_OVERLAY} after:inset-ring-2 after:inset-ring-border`;
  const emphasis =
    status === "current"
      ? "ring-accent shadow-raised ring-4"
      : next
        ? "ring-now ring-offset-surface-raised shadow-raised ring-3 ring-offset-2"
        : "";
  return `text-text ${edge} ${emphasis}`;
}

/** Configured children of an event, in the event's order (unknown ids skipped). */
export function childrenOf(
  event: CalendarEvent,
  childList: readonly Child[],
): Child[] {
  return event.childIds.flatMap((id) => {
    const child = childList.find((c) => c.id === id);
    return child === undefined ? [] : [child];
  });
}

/** Joins the parts of a tile's accessible name ("Ballett, 15:30, For Mia"), skipping gaps. */
export function tileName(parts: readonly (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined).join(", ");
}

export interface EventTileProps {
  event: CalendarEvent;
  /** Configured children; `event.childIds` are looked up here (unknown ids skipped). */
  childList: readonly Child[];
  format: FormatContext;
  /** Relative to now; computed by the caller (the tile is presentational). */
  status?: EventStatus;
  /** Timed event that began on an earlier day: shows "continues" instead of the start. */
  continues?: boolean;
  /** Time of day for the icon next to the time; `null` for all-day events. */
  timeOfDay?: DayBand | null;
  size?: TileSize;
  /** The next event that has not started yet (today only). */
  next?: boolean;
}

/**
 * An event as a picture tile: emoji, one-line title, time-of-day icon with the time, and
 * the children's signs in the corner. The fill is the child's tint (one child, with an
 * edge), split tints (two) or neutral (none, three and more). The accessible name says
 * title, time, children and state ("Ballett, 15:30, Für Mia"); emoji and badges are
 * decorative. Not interactive.
 */
export function EventTile({
  event,
  childList,
  format,
  status = "upcoming",
  continues = false,
  timeOfDay = null,
  size = "large",
  next = false,
}: EventTileProps): React.JSX.Element {
  const { t } = useTranslation();
  const kids = childrenOf(event, childList);
  const tint = resolveTileTint(kids);
  const sizes = SIZES[size];
  const past = status === "past";
  const time = event.allDay
    ? t("event.allDay")
    : continues
      ? t("event.continues")
      : formatTime(event.start, format);
  const name = tileName([
    event.title,
    time,
    kids.length === 0
      ? t("event.forEveryone")
      : t("event.forChildren", { names: kids.map((child) => child.name) }),
    status === "upcoming"
      ? next
        ? t("event.status.next")
        : undefined
      : t(`event.status.${status}`),
  ]);
  return (
    // The badges sit beside the tile (not inside), so they may poke over its corner
    // without making the tile itself overflow.
    <div className="relative min-w-0">
      <article
        aria-label={name}
        data-testid="event-tile"
        data-status={status}
        data-next={next}
        data-all-day={event.allDay}
        data-size={size}
        data-tint={past ? "past" : tint.kind}
        style={past ? undefined : tileTintStyle(tint)}
        className={`${statusClasses(status, next, tint)} ${sizes.tile} rounded-tile relative flex items-center`}
      >
        <Emoji
          emoji={event.icon}
          className={`${sizes.emoji} ${past ? "grayscale" : ""}`}
        />
        <div className={sizes.stacked ? "min-w-0" : "min-w-0 flex-1"}>
          {/* Week tiles are picture-first: the title is in the accessible name only. */}
          {!sizes.stacked && (
            // Room for the corner badges only when there are any.
            <p
              className={`${sizes.title} truncate ${tint.badges.length > 0 ? "pe-5" : ""}`}
            >
              {event.title}
            </p>
          )}
          <p
            className={`text-meta text-text-muted flex min-w-0 items-center gap-1.5 ${sizes.stacked ? "justify-center" : ""}`}
          >
            {event.allDay ? (
              <AllDayIcon />
            ) : timeOfDay !== null ? (
              <TimeOfDayIcon timeOfDay={timeOfDay} />
            ) : null}
            <span className="truncate">{time}</span>
          </p>
        </div>
      </article>
      <span className="pointer-events-none absolute -end-1.5 -top-2">
        <ChildBadges tint={tint} size={sizes.badge} text={sizes.badgeText} />
      </span>
    </div>
  );
}
