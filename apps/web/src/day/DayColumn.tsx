import type { Child } from "@kidboard/shared";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import { EventTile } from "../components/EventTile";
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

/**
 * "vorbei" strip: past events folded into small grey emoji (oldest first). Its accessible
 * name lists every folded title (merge rule 2), also those beyond the drawn icons.
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
      className="text-text-muted flex h-9 shrink-0 items-center gap-2 overflow-hidden ps-2"
    >
      <span aria-hidden="true" className="text-meta shrink-0 font-black">
        {t("day.past.label")}
      </span>
      {icons.map(({ event }) => (
        <Emoji
          key={event.id}
          emoji={event.icon}
          className="text-[1.875rem] grayscale"
        />
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

/** "+N" for the latest upcoming events that do not fit; names them for assistive tech. */
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
      className="bg-surface-raised text-text-muted inset-ring-border rounded-tile text-title flex h-9 items-center justify-center font-black inset-ring-2"
    >
      <span aria-hidden="true">
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
 * tiles fit is measured from the list's height (`fitColumn` + `columnLayout`): past
 * events fold into the "vorbei" strip first, then the latest are summed up in "+N";
 * nothing is hidden silently and nothing scrolls.
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
  const plan = fitColumn(
    day.events,
    day.isToday,
    measured === null ? null : measured.height / measured.rem,
    showNow ? NOW_LINE_REM + COLUMN_GAP_REM : 0,
  );
  const { layout } = plan;
  const started = new Set(day.events.slice(0, day.nowIndex ?? 0));
  const before = layout.visible.filter((item) => started.has(item));
  const after = layout.visible.filter((item) => !started.has(item));
  const shown = new Set(layout.visible);
  const folded = new Set(layout.pastStrip);
  const hiddenLater = day.events.filter(
    (item) => !shown.has(item) && !folded.has(item),
  );
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
      <div className="shrink-0">
        <h2
          id={headingId}
          className={`${day.isToday ? "text-heading" : "text-title"} truncate`}
        >
          {day.isToday ? t("day.today") : formatWeekday(day.date, format)}
        </h2>
        <p className="text-body text-text-muted truncate">
          {day.isToday
            ? t("day.todayDate", {
                weekday: formatWeekday(day.date, format),
                date: formatDayMonth(day.date, format),
              })
            : formatDayMonth(day.date, format)}
        </p>
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
