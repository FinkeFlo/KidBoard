import type { CalendarEvent, Child } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { type FormatContext, formatTime } from "../i18n/format";
import type { DayBand } from "../time";
import { ChildBadges } from "./ChildBadges";
import { CHILD_EDGE_AFTER } from "./childColor";
import {
  resolveTileTint,
  stripeStyle,
  type TileTint,
  tileTintStyle,
} from "./childTint";
import { Emoji } from "./Emoji";
import {
  AllDayIcon,
  ClockIcon,
  NextIcon,
  TimeOfDayIcon,
} from "./TimeOfDayIcon";

export type EventStatus = "upcoming" | "current" | "past";

/**
 * Tile sizes: `large` → `medium` → `dense` → `slim` in today's column (it shrinks step by
 * step when space is short; `slim` puts title and time in one row), `compact` / `compact-dense` on the other days, `week` /
 * `week-dense` → `week-mini` for the seven narrow week columns (stacked: emoji, a one-line title where
 * the column is wide enough, then the time). Heights are fixed, so a column can derive how many tiles fit from its height
 * ({@link TILE_HEIGHT_REM}, plus {@link PROMINENT_EXTRA_REM} for a prominent tile).
 */
export type TileSize =
  | "large"
  | "medium"
  | "dense"
  | "slim"
  | "compact"
  | "compact-dense"
  | "week"
  | "week-dense"
  | "week-mini";

/** Tile heights in rem; `large` and `compact` are `--spacing-tile(-compact)`. */
export const TILE_HEIGHT_REM: Record<TileSize, number> = {
  large: 5,
  medium: 4.5,
  dense: 3.5,
  slim: 2.75,
  compact: 4.75,
  "compact-dense": 3.75,
  week: 6.5,
  "week-dense": 5.25,
  "week-mini": 4.25,
};

/**
 * Extra height in rem of a prominent tile (the current event, else the next one, in
 * today's column): about 1.3× the normal tile, with a larger emoji. 0: no prominent look.
 */
export const PROMINENT_EXTRA_REM: Record<TileSize, number> = {
  large: 1.5,
  medium: 1,
  dense: 1,
  slim: 0,
  compact: 0,
  "compact-dense": 0,
  week: 0,
  "week-dense": 0,
  "week-mini": 0,
};

export interface SizeClasses {
  tile: string;
  /** Light disc behind the emoji; `null`: no disc (week tiles). */
  disc: string | null;
  emoji: string;
  /** Title size and how many lines it may wrap to. */
  title: string;
  /** Time-of-day icon next to the time (>= 1.5rem in the overview). */
  timeIcon: string;
  badge: string;
  badgeText: string;
  /** A quarter of `badge`, as a negative start margin. */
  badgeOverlap: string;
  /**
   * Two-line titles: the badges float at the end of the first line (one line high, so a
   * second line runs under them); one-line titles keep the badges in a row beside them.
   */
  badgeFloat: boolean;
  /** Emoji above the time (week columns) instead of beside the title. */
  stacked: boolean;
  /** Stacked tiles: a one-line title between emoji and time (where the column is wide enough). */
  stackedTitle: boolean;
  /** Title, badges and time in one row (the slimmest today tile). */
  inline: boolean;
  /** Size of the "now" / "next" cue on the emoji disc. */
  cue: string;
}

// Full class names so Tailwind can see them. Today's large emoji stay >= 3.5rem, medium
// ones are 3rem and dense ones 2.75rem; slim tiles (the last step before "+N", so a whole
// day still fits) put the title and time in one row next to a 2rem emoji (as on week tiles). The disc
// leaves a thin light ring around the glyph.
const SIZES: Record<TileSize, SizeClasses> = {
  large: {
    tile: "h-tile gap-3 ps-3 pe-3",
    disc: "size-[4.25rem]",
    emoji: "text-[3.5rem]",
    title: "text-tile line-clamp-2",
    timeIcon: "text-[1.5rem]",
    badge: "size-6.5",
    badgeText: "text-meta",
    badgeOverlap: "-ms-1.5",
    badgeFloat: true,
    stacked: false,
    stackedTitle: false,
    inline: false,
    cue: "size-6",
  },
  medium: {
    tile: "h-18 gap-3 ps-3 pe-3",
    disc: "size-[3.75rem]",
    emoji: "text-[3rem]",
    title: "text-tile-compact line-clamp-2",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: true,
    stacked: false,
    stackedTitle: false,
    inline: false,
    cue: "size-6",
  },
  dense: {
    tile: "h-14 gap-2.5 ps-2.5 pe-3",
    disc: "size-[3.125rem]",
    emoji: "text-[2.75rem]",
    title: "text-tile-compact line-clamp-1",
    timeIcon: "text-[1.5rem]",
    badge: "size-7",
    badgeText: "text-body",
    badgeOverlap: "-ms-1.75",
    badgeFloat: false,
    stacked: false,
    stackedTitle: false,
    inline: false,
    cue: "size-6",
  },
  slim: {
    tile: "h-11 gap-2.5 ps-2 pe-3",
    disc: "size-9",
    emoji: "text-[2rem]",
    title: "text-tile-compact",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: false,
    stacked: false,
    stackedTitle: false,
    inline: true,
    cue: "size-4",
  },
  compact: {
    tile: "h-tile-compact gap-1.5 ps-1.5 pe-1.5",
    disc: "size-12",
    emoji: "text-[2.5rem]",
    title: "text-tile-compact line-clamp-2",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: true,
    stacked: false,
    stackedTitle: false,
    inline: false,
    cue: "size-6",
  },
  "compact-dense": {
    tile: "h-15 gap-1.5 ps-1.5 pe-1.5",
    disc: "size-11",
    emoji: "text-[2.25rem]",
    title: "text-tile-compact line-clamp-1",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: false,
    stacked: false,
    stackedTitle: false,
    inline: false,
    cue: "size-6",
  },
  // Week tiles stack emoji, a one-line title and the time; the title shows where the
  // column is wide enough (container query on the column's list), else only the name has it.
  week: {
    tile: "h-26 flex-col justify-center gap-0.5 px-1.5",
    disc: null,
    emoji: "text-[2.5rem]",
    title: "text-meta",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: false,
    stacked: true,
    stackedTitle: true,
    inline: false,
    cue: "size-6",
  },
  "week-dense": {
    tile: "h-21 flex-col justify-center gap-0.5 px-1.5",
    disc: null,
    emoji: "text-[2rem]",
    title: "text-caption",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: false,
    stacked: true,
    stackedTitle: true,
    inline: false,
    cue: "size-6",
  },
  // Last step before "+N" in a week column: emoji and time only (the title stays in the
  // accessible name), so no event is hidden just to keep a title line.
  "week-mini": {
    tile: "h-17 flex-col justify-center gap-0.5 px-1.5",
    disc: null,
    emoji: "text-[2rem]",
    title: "text-caption",
    timeIcon: "text-[1.5rem]",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: false,
    stacked: true,
    stackedTitle: false,
    inline: false,
    cue: "size-6",
  },
};

/** Prominent (now / next) variants of today's sizes: taller, larger emoji and title. */
const PROMINENT: Partial<Record<TileSize, Partial<SizeClasses>>> = {
  large: {
    tile: "h-[6.5rem] gap-4 ps-3 pe-3",
    disc: "size-[5.5rem]",
    emoji: "text-[4.5rem]",
    title: "text-heading line-clamp-2",
    timeIcon: "text-[1.75rem]",
    badge: "size-9",
    badgeText: "text-body",
    badgeOverlap: "-ms-2.25",
  },
  medium: {
    tile: "h-[5.5rem] gap-3 ps-3 pe-3",
    disc: "size-[4.5rem]",
    emoji: "text-[3.75rem]",
    title: "text-tile line-clamp-2",
    badge: "size-6.5",
    badgeText: "text-meta",
  },
  dense: {
    tile: "h-[4.5rem] gap-3 ps-2.5 pe-3",
    disc: "size-[4rem]",
    emoji: "text-[3.25rem]",
    title: "text-tile-compact line-clamp-2",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: true,
  },
};

/** Classes of `size`, with the prominent variant applied when asked for and defined. */
export function tileClasses(size: TileSize, prominent: boolean): SizeClasses {
  const base = SIZES[size];
  const extra = prominent ? PROMINENT[size] : undefined;
  return extra === undefined ? base : { ...base, ...extra };
}

/** Overlay that carries the tile edge on top of the tile's content. */
const EDGE_OVERLAY =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-tile";

/**
 * Status look. Past events recede through surface/text tokens, never opacity (merge
 * rule 4). "Now" and "next" read without words (merge rule 3) and in person-neutral
 * colours, never a child's: the current event has a thick solid ring in the "now" ink
 * (plus the filled clock cue on its emoji), the next upcoming one a dashed outline in the
 * same ink (plus an outlined ▶ cue), so it does not repeat the gold of today's column.
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
      ? `${EDGE_OVERLAY} after:inset-ring-4 ${CHILD_EDGE_AFTER}`
      : `${EDGE_OVERLAY} after:inset-ring-2 after:inset-ring-border`;
  const emphasis =
    status === "current"
      ? "ring-now shadow-raised ring-4"
      : next
        ? "outline-now shadow-raised outline-3 outline-offset-2 outline-dashed"
        : "";
  return `text-text ${edge} ${emphasis}`;
}

/**
 * Start-edge stripes of a shared tile: one vertical band per child, side by side.
 * Decorative (the accessible name names the children); clipped by the tile's corners.
 */
export function TileStripes({
  tint,
}: {
  tint: TileTint;
}): React.JSX.Element | null {
  const style = stripeStyle(tint);
  if (style === undefined) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="tile-stripes"
      style={style}
      // Dimmed a quarter at night like the edges and badges (decorative stripes).
      className="night:brightness-75 pointer-events-none absolute inset-y-0 start-0"
    />
  );
}

/**
 * An emoji on a small light disc with a subtle ring, so pale glyphs (🦷, 🥛) stay
 * visible on light tints and dark ones at night. Decorative; `children` are drawn on top
 * (e.g. the "now" clock cue).
 */
export function EmojiDisc({
  emoji,
  disc,
  className,
  past = false,
  children,
}: {
  emoji: string;
  /** Disc size, e.g. `size-12`. */
  disc: string;
  /** Emoji size, e.g. `text-[2.5rem]`. */
  className: string;
  past?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      data-testid="emoji-disc"
      className={`${disc} ${past ? "bg-surface" : "bg-surface-sunken shadow-card"} rounded-pill inset-ring-border relative inline-flex shrink-0 items-center justify-center inset-ring-1`}
    >
      <Emoji
        emoji={emoji}
        className={`${className} ${past ? "grayscale" : ""}`}
      />
      {children}
    </span>
  );
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
  /** Larger tile for "now" (else "next") in today's column, when space allows. */
  prominent?: boolean;
}

/**
 * An event as a picture tile: emoji on a light disc, a title of up to two lines with the
 * children's badges beside it (inside the tile), and the time-of-day icon with the time.
 * The fill is the child's tint (one child, with an edge), or neutral with a colour stripe
 * per child on the start edge (two and more) or plain neutral (none). The accessible name
 * says title, time, children and state ("Ballett, 15:30, Für Mia"); emoji and badges are
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
  prominent = false,
}: EventTileProps): React.JSX.Element {
  const { t } = useTranslation();
  const kids = childrenOf(event, childList);
  const tint = resolveTileTint(kids);
  const big = prominent && PROMINENT_EXTRA_REM[size] > 0;
  const sizes = tileClasses(size, big);
  // Shared tiles: the disc moves off the start-edge stripes.
  const stripeRoom = tint.stripes.length > 0 ? "ms-2.5" : "";
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
  const badges = (
    <ChildBadges
      tint={tint}
      size={sizes.badge}
      text={sizes.badgeText}
      overlap={sizes.badgeOverlap}
    />
  );
  const meta = (
    <p
      className={`text-meta text-text-muted flex min-w-0 items-center gap-1.5 ${sizes.stacked ? "justify-center" : ""}`}
    >
      {event.allDay ? (
        <AllDayIcon className="size-6" />
      ) : timeOfDay !== null ? (
        <TimeOfDayIcon timeOfDay={timeOfDay} className={sizes.timeIcon} />
      ) : null}
      <span className="min-w-0 truncate">{time}</span>
    </p>
  );
  return (
    <article
      aria-label={name}
      data-testid="event-tile"
      data-status={status}
      data-next={next}
      data-prominent={big}
      data-all-day={event.allDay}
      data-size={size}
      data-tint={past ? "past" : tint.kind}
      style={past ? undefined : tileTintStyle(tint)}
      className={`${statusClasses(status, next, tint)} ${sizes.tile} rounded-tile relative flex min-w-0 items-center`}
    >
      {/* The stripes are clipped to the tile's rounded start edge by their own wrapper. */}
      {!past && tint.stripes.length > 0 && (
        <span
          aria-hidden="true"
          className="rounded-tile pointer-events-none absolute inset-0 overflow-hidden"
        >
          <TileStripes tint={tint} />
        </span>
      )}
      {sizes.disc === null ? (
        <Emoji
          emoji={event.icon}
          className={`${sizes.emoji} ${past ? "grayscale" : ""}`}
        />
      ) : (
        <EmojiDisc
          emoji={event.icon}
          disc={`${sizes.disc} ${stripeRoom}`}
          className={sizes.emoji}
          past={past}
        >
          {status === "current" && (
            <span
              data-testid="now-cue"
              className={`bg-now text-surface rounded-pill absolute start-0 top-0 grid place-items-center ${sizes.cue}`}
            >
              <ClockIcon className="size-[75%]" />
            </span>
          )}
          {status === "upcoming" && next && (
            <span
              data-testid="next-cue"
              className={`bg-surface text-now ring-now rounded-pill absolute start-0 top-0 grid place-items-center ring-2 ${sizes.cue}`}
            >
              <NextIcon className="size-[70%]" />
            </span>
          )}
        </EmojiDisc>
      )}
      {sizes.stacked ? (
        <>
          {/* Week tiles are picture-first; the title follows in one line where the column
              is wide enough (`@container` on the week column's list), else it is only in
              the accessible name. */}
          {sizes.stackedTitle && (
            <p
              className={`${sizes.title} ${tint.stripes.length > 0 ? "ps-2" : ""} hidden w-full min-w-0 truncate text-center font-extrabold @min-[5.5rem]:block`}
            >
              <span data-testid="tile-title">{event.title}</span>
            </p>
          )}
          {/* Full width, so a long word ("Ganztägig") is cut, not pushed out. */}
          <div className="w-full min-w-0">{meta}</div>
          <span className="pointer-events-none absolute end-1 top-1">
            {badges}
          </span>
        </>
      ) : sizes.inline ? (
        // Slim: one row (title cut with an ellipsis, badges, time), so a full day fits.
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className={`${sizes.title} min-w-0 flex-1 truncate`}>
            <span data-testid="tile-title">{event.title}</span>
          </p>
          {badges}
          <div className="shrink-0">{meta}</div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          {sizes.badgeFloat ? (
            // The badges float at the end of the first line only (one line high), so a
            // second line and the time run under them; a word that does not fit beside
            // them starts on the next line instead of being cut.
            <p
              className={`${sizes.title} max-h-[2lh] min-w-0 text-ellipsis hyphens-manual`}
            >
              {tint.badges.length > 0 && (
                <span
                  data-testid="badge-float"
                  className="float-end ms-2 h-[1lh]"
                >
                  {badges}
                </span>
              )}
              <span data-testid="tile-title">{event.title}</span>
            </p>
          ) : (
            <div className="flex min-w-0 items-start gap-2">
              <p
                className={`${sizes.title} min-w-0 flex-1 text-ellipsis hyphens-manual`}
              >
                <span data-testid="tile-title">{event.title}</span>
              </p>
              {badges}
            </div>
          )}
          {meta}
        </div>
      )}
    </article>
  );
}
