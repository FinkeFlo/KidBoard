import type { Child } from "@kidboard/shared";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { EventTile, showsBring } from "../components/EventTile";
import {
  type FormatContext,
  formatDayMonth,
  formatWeekday,
} from "../i18n/format";
import { AllDayBanner } from "./AllDayBanner";
import type { DayEvent } from "./buildDayModel";
import type { OverviewDay } from "./buildOverviewModel";
import { COLUMN_GAP_REM, fitColumn, freeRem } from "./columnCapacity";
import { MoreLater, PastStrip } from "./ColumnSummaries";
import { DayDone, DayEmpty, DayFree, DONE_MIN_REM } from "./DayStates";
import { MealPlates } from "./MealPlates";
import { NOW_LINE_REM, NowLine } from "./NowLine";
import { useContentHeight } from "./useContentHeight";

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
 * next one) gets a larger tile while space allows. When every event of today is over,
 * the free space below shows "All done" ({@link DayDone}); another day without anything
 * planned shows a quiet placeholder ({@link DayFree}).
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
  const heightRem = measured === null ? null : measured.height / measured.rem;
  const reservedRem = showNow ? NOW_LINE_REM + COLUMN_GAP_REM : 0;
  // Tiles with bring chips: taller where the chips need a row of their own.
  const bring = day.events.filter((item) =>
    showsBring(item.event, item.status),
  );
  const plan = fitColumn(
    day.events,
    day.isToday,
    heightRem,
    reservedRem,
    prominent,
    bring,
  );
  const { layout } = plan;
  const started = new Set(day.events.slice(0, day.nowIndex ?? 0));
  const before = layout.visible.filter((item) => started.has(item));
  const after = layout.visible.filter((item) => !started.has(item));
  const hiddenLater = layout.later;
  const empty = day.events.length === 0 && day.allDay.length === 0;
  // Every timed event of today is over: "All done" in the free space, if it fits there.
  const free = freeRem(plan, heightRem, reservedRem, prominent, bring);
  const allDone =
    day.isToday &&
    day.events.length > 0 &&
    day.events.every((item) => item.status === "past") &&
    (free === null || free >= DONE_MIN_REM);

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
        {empty ? (
          day.isToday ? (
            <DayEmpty childList={childList} />
          ) : (
            <DayFree />
          )
        ) : (
          <>
            {layout.pastStrip.length > 0 && (
              <PastStrip
                items={layout.pastStrip.map((item) => item.event)}
                icons={layout.stripIcons.map((item) => item.event)}
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
                {hiddenLater.length > 0 && (
                  <MoreLater items={hiddenLater.map((item) => item.event)} />
                )}
              </ol>
            )}
            {allDone && <DayDone />}
          </>
        )}
      </div>
      <MealPlates meals={day.meals} today={day.isToday} />
    </section>
  );
}
