import type { Child } from "@kidboard/shared";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import { EventTile } from "../components/EventTile";
import { CheckIcon } from "../components/TimeOfDayIcon";
import {
  type FormatContext,
  formatDayMonth,
  formatWeekday,
} from "../i18n/format";
import { AllDayBanner } from "./AllDayBanner";
import type { DayEvent } from "./buildDayModel";
import type { OverviewDay } from "./buildOverviewModel";
import { COLUMN_GAP_REM, fitColumn } from "./columnCapacity";
import { DayEmpty } from "./DayStates";
import { MealPlates } from "./MealPlates";
import { NOW_LINE_REM, NowLine } from "./NowLine";
import { useContentHeight } from "./useContentHeight";

/** Hidden upcoming events the "+N" row draws as small icons; the count covers all. */
export const MORE_ICONS_MAX = 4;

/**
 * "vorbei" strip: past events folded into small grey emoji with a check mark (oldest
 * first). Its accessible name lists every folded title (merge rule 2), also those beyond
 * the drawn icons.
 */
function PastStrip({
  items,
  icons,
  hidden,
}: {
  items: readonly DayEvent[];
  icons: readonly DayEvent[];
  hidden: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("day.past.list", {
        titles: items.map((item) => item.event.title),
      })}
      data-testid="past-strip"
      data-count={items.length}
      className="text-text-muted flex h-9 shrink-0 items-center gap-2.5 overflow-hidden ps-2"
    >
      <span
        aria-hidden="true"
        className="text-meta flex shrink-0 items-center gap-1 font-black"
      >
        <CheckIcon className="size-4" />
        {t("day.past.label")}
      </span>
      {icons.map(({ event }) => (
        <span key={event.id} className="relative inline-flex shrink-0">
          <Emoji emoji={event.icon} className="text-[1.875rem] grayscale" />
          <span className="bg-text-muted text-surface rounded-pill absolute -end-1 -bottom-0.5 grid size-3.5 place-items-center">
            <CheckIcon className="size-2.5" />
          </span>
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-meta shrink-0 font-black">
          <span aria-hidden="true">
            {t("day.hidden.badge", { count: hidden })}
          </span>
          <span className="sr-only">
            {t("day.hidden.earlier", { count: hidden })}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The latest upcoming events that do not fit: their emoji in small, then "+N" – plain
 * text, no border or fill, so it does not look like a button (it is not interactive).
 * Names every summed-up title for assistive tech.
 */
function MoreLater({
  items,
}: {
  items: readonly DayEvent[];
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <li
      data-testid="column-more"
      data-count={items.length}
      className="text-text-muted flex h-9 min-w-0 items-center gap-2 overflow-hidden ps-2"
    >
      {items.slice(0, MORE_ICONS_MAX).map(({ event }) => (
        <Emoji
          key={event.id}
          emoji={event.icon}
          className="shrink-0 text-[1.625rem]"
        />
      ))}
      <span
        aria-hidden="true"
        data-testid="column-more-count"
        className="text-meta shrink-0 font-black"
      >
        {t("day.hidden.badge", { count: items.length })}
      </span>
      <span className="sr-only">
        {t("day.hidden.later", {
          count: items.length,
          titles: items.map((item) => item.event.title),
        })}
      </span>
    </li>
  );
}

export interface DayColumnProps {
  day: OverviewDay;
  childList: readonly Child[];
  format: FormatContext;
  /** Current time, formatted, for the now line's name (today only). */
  nowTime: string;
}

/**
 * One day of the overview: header, all-day banner, the timed events top to bottom
 * (today: past ones, now line, upcoming ones) and the meal plates at the bottom. How many
 * tiles fit is measured from the list's height (`fitColumn` + `columnLayout`): if the
 * whole day does not fit at the largest size, all past events fold into the "vorbei"
 * strip, then the tiles shrink step by step, and only then the latest are summed up in
 * "+N"; nothing is hidden silently and nothing scrolls. The current event (else the
 * next one) gets a larger tile while space allows.
 */
export function DayColumn({
  day,
  childList,
  format,
  nowTime,
}: DayColumnProps): React.JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const measured = useContentHeight(listRef);
  const showNow = day.isToday && day.events.length > 0;
  // "Now" stands out: the current events, else the next one, get a larger tile.
  const prominent =
    day.current.length > 0 ? day.current : day.next === null ? [] : [day.next];
  const plan = fitColumn(
    day.events,
    day.isToday,
    measured === null ? null : measured.height / measured.rem,
    showNow ? NOW_LINE_REM + COLUMN_GAP_REM : 0,
    prominent,
  );
  const { layout } = plan;
  const started = new Set(day.events.slice(0, day.nowIndex ?? 0));
  const before = layout.visible.filter((item) => started.has(item));
  const after = layout.visible.filter((item) => !started.has(item));
  const hiddenLater = layout.later;
  const empty = day.events.length === 0 && day.allDay.length === 0;

  const tile = (item: DayEvent): React.JSX.Element => (
    <li key={item.event.id} className="min-w-0">
      <EventTile
        event={item.event}
        childList={childList}
        format={format}
        status={item.status}
        continues={item.continues}
        timeOfDay={item.timeOfDay}
        size={plan.size}
        next={day.next === item}
        prominent={plan.prominent && prominent.includes(item)}
      />
    </li>
  );

  return (
    <section
      aria-labelledby={headingId}
      aria-current={day.isToday ? "date" : undefined}
      data-testid="day-column"
      data-date={day.date}
      data-today={day.isToday}
      data-size={plan.size}
      className={`${
        day.isToday
          ? "bg-surface-raised ring-today-ring shadow-raised ring-[5px]"
          : "bg-surface-sunken"
      } text-text rounded-column flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden p-3.5`}
    >
      {/* Today's weekday and date are in the board header already (no repeat here). */}
      <div className="shrink-0">
        <h2
          id={headingId}
          className={`${day.isToday ? "text-heading" : "text-title"} truncate`}
        >
          {day.isToday ? t("day.today") : formatWeekday(day.date, format)}
        </h2>
        {!day.isToday && (
          <p className="text-body text-text-muted truncate">
            {formatDayMonth(day.date, format)}
          </p>
        )}
      </div>
      <AllDayBanner
        items={day.allDay}
        childList={childList}
        large={day.isToday}
      />
      <div
        ref={listRef}
        data-testid="column-events"
        className="-mx-1.5 flex min-h-0 flex-1 basis-0 flex-col gap-2 overflow-hidden px-1.5 pt-2 pb-1.5"
      >
        {day.isToday && empty ? (
          <DayEmpty childList={childList} />
        ) : (
          <>
            {layout.pastStrip.length > 0 && (
              <PastStrip
                items={layout.pastStrip}
                icons={layout.stripIcons}
                hidden={layout.hiddenEarlier}
              />
            )}
            {before.length > 0 && (
              <ol className="flex flex-col gap-2">{before.map(tile)}</ol>
            )}
            {showNow && <NowLine time={nowTime} />}
            {(after.length > 0 || hiddenLater.length > 0) && (
              <ol className="flex flex-col gap-2">
                {after.map(tile)}
                {hiddenLater.length > 0 && <MoreLater items={hiddenLater} />}
              </ol>
            )}
          </>
        )}
      </div>
      <MealPlates meals={day.meals} today={day.isToday} />
    </section>
  );
}
