import type { CalendarEvent, Child } from "@kidboard/shared";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { resolveTileTint, tileTintStyle } from "../components/childTint";
import { Emoji } from "../components/Emoji";
import { childrenOf, EventTile } from "../components/EventTile";
import { useContentHeight } from "../day/useContentHeight";
import {
  type FormatContext,
  formatDayMonthShort,
  formatWeekday,
} from "../i18n/format";
import { chronological, type WeekDay } from "./buildWeekModel";
import { MealRows } from "./MealRows";
import { fitWeekColumn } from "./weekCapacity";

/** 🌙 counts sleeps and nothing else (merge rule 1); one per night still to sleep. */
const MOON = "🌙";

/** The day the countdown waits for, as far as the week columns need it. */
export interface WeekCountdown {
  /** Start date (`YYYY-MM-DD`, config zone) of the awaited events. */
  date: string;
  /** The awaited events; the first one's children tint the target day. */
  events: readonly CalendarEvent[];
}

/** "+N" row for the events without a tile; names them for assistive tech. */
function MoreRow({
  items,
}: {
  items: readonly CalendarEvent[];
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <li
      data-testid="column-more"
      data-count={items.length}
      className="bg-surface-raised text-text-muted inset-ring-border rounded-tile text-title flex h-9 items-center justify-center font-black inset-ring-2"
    >
      <span aria-hidden="true">
        {t("week.moreBadge", { count: items.length })}
      </span>
      <span className="sr-only">
        {t("week.more", {
          count: items.length,
          titles: items.map((event) => event.title),
        })}
      </span>
    </li>
  );
}

function WeekColumn({
  day,
  childList,
  format,
  countdown,
}: {
  day: WeekDay;
  childList: readonly Child[];
  format: FormatContext;
  countdown: WeekCountdown | undefined;
}): React.JSX.Element {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const measured = useContentHeight(listRef);
  const fit = fitWeekColumn(
    day.events,
    measured === null ? null : measured.height / measured.rem,
  );
  const shown = chronological(fit.visible);

  // The countdown day wears the awaited event's child tint and edge; every day before it
  // shows one moon in its header (the night after it is still to sleep).
  const target = countdown !== undefined && countdown.date === day.date;
  // Guarded: an empty `events` list (never built today, but the type allows it) leaves
  // the day untinted instead of crashing the board.
  const awaited = target ? countdown.events[0] : undefined;
  const tint =
    awaited === undefined
      ? undefined
      : resolveTileTint(childrenOf(awaited, childList));
  const tinted = tint !== undefined && tint.kind !== "none";
  const moon = countdown !== undefined && day.date < countdown.date;

  // Weekend columns keep their own surface (T-18); today is raised like in the overview;
  // the countdown day's inline tint wins over all of them.
  const surface = tinted
    ? "text-text"
    : day.isWeekend
      ? "bg-surface-weekend text-text"
      : day.isToday
        ? "bg-surface-raised text-text"
        : "bg-surface-sunken text-text";
  const edge =
    tint !== undefined && tint.edge !== null
      ? "inset-ring-4 inset-ring-(color:--child-color)"
      : "";
  const ring = day.isToday ? "ring-today-ring shadow-raised ring-[5px]" : "";
  const label = day.isWeekend ? "text-band-morning-accent" : "text-text";
  return (
    <section
      aria-labelledby={headingId}
      aria-current={day.isToday ? "date" : undefined}
      data-testid="day-column"
      data-date={day.date}
      data-weekend={day.isWeekend}
      data-today={day.isToday}
      data-countdown-day={target}
      data-size={fit.size}
      style={tinted ? tileTintStyle(tint) : undefined}
      className={`${surface} ${edge} ${ring} rounded-column flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3`}
    >
      <div className="shrink-0">
        <h2
          id={headingId}
          className={`${label} text-tile font-extrabold break-words hyphens-auto`}
        >
          {formatWeekday(day.date, format)}
        </h2>
        <div className="flex items-center justify-between gap-1">
          <p className="text-caption text-text-muted min-w-0 truncate font-bold">
            {formatDayMonthShort(day.date, format)}
          </p>
          {moon && (
            <span data-testid="column-moon" className="shrink-0">
              <Emoji emoji={MOON} className="text-title" />
            </span>
          )}
        </div>
      </div>
      <ul
        ref={listRef}
        data-testid="column-events"
        className="-mx-1.5 flex min-h-0 flex-1 basis-0 flex-col gap-2 overflow-hidden px-1.5 pt-2 pb-1.5"
      >
        {shown.map((item) => (
          <li key={item.event.id} className="min-w-0">
            <EventTile
              event={item.event}
              childList={childList}
              format={format}
              status={item.status}
              continues={item.continues}
              timeOfDay={item.timeOfDay}
              size={fit.size}
            />
          </li>
        ))}
        {fit.hidden.length > 0 && (
          <MoreRow items={fit.hidden.map((item) => item.event)} />
        )}
      </ul>
      <MealRows meals={day.meals} />
    </section>
  );
}

export interface WeekBoardProps {
  days: readonly WeekDay[];
  /** Configured children; `event.childIds` are looked up here (unknown ids skipped). */
  childList: readonly Child[];
  format: FormatContext;
  /** The awaited countdown: tints its day and puts a moon in the earlier headers. */
  countdown?: WeekCountdown | undefined;
}

/**
 * Seven day columns side by side (today first) in the overview's tile language: tinted
 * tiles with child badges and a time-of-day symbol, meals as a three-row list. How many
 * tiles fit is measured per column; the rest becomes "+N". Presentational.
 */
export function WeekBoard({
  days,
  childList,
  format,
  countdown,
}: WeekBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("week.label")}
      data-testid="week-board"
      className="gap-gutter grid min-h-0 flex-1 grid-cols-7 grid-rows-[minmax(0,1fr)]"
    >
      {days.map((day) => (
        <WeekColumn
          key={day.date}
          day={day}
          childList={childList}
          format={format}
          countdown={countdown}
        />
      ))}
    </div>
  );
}
