import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import {
  type FormatContext,
  formatDayMonth,
  formatWeekday,
} from "../i18n/format";
import type { WeekDay } from "./buildWeekModel";

function WeekColumn({
  day,
  format,
}: {
  day: WeekDay;
  format: FormatContext;
}): React.JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const surface = day.isWeekend
    ? "bg-band-morning text-text"
    : "bg-surface-raised text-text";
  const ring = day.isToday ? "ring-accent shadow-raised ring-4" : "shadow-card";
  const label = day.isWeekend ? "text-band-morning-accent" : "text-text";
  return (
    <section
      aria-labelledby={headingId}
      aria-current={day.isToday ? "date" : undefined}
      data-testid="week-day"
      data-date={day.date}
      data-weekend={day.isWeekend}
      data-today={day.isToday}
      className={`${surface} ${ring} rounded-tile flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3`}
    >
      <div className="shrink-0">
        <h2
          id={headingId}
          className={`${label} text-title font-extrabold break-words hyphens-auto`}
        >
          {formatWeekday(day.date, format)}
        </h2>
        <p className="text-caption text-text-muted font-bold">
          {formatDayMonth(day.date, format)}
        </p>
      </div>
      {(day.icons.length > 0 || day.more > 0) && (
        <ul className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          {day.icons.map((event) => (
            <li key={event.id}>
              <Emoji
                emoji={event.icon}
                label={event.title}
                className="text-icon"
              />
            </li>
          ))}
          {day.more > 0 && (
            <li className="text-title text-text-muted font-extrabold">
              <span aria-hidden="true">
                {t("week.moreBadge", { count: day.more })}
              </span>
              <span className="sr-only">
                {t("week.more", { count: day.more })}
              </span>
            </li>
          )}
        </ul>
      )}
      {day.meals.length > 0 && (
        <ul
          aria-label={t("week.meals")}
          className="border-border mt-auto flex shrink-0 flex-col gap-1 border-t-2 pt-2"
        >
          {day.meals.map((meal) => (
            <li
              key={meal.id}
              data-slot={meal.slot}
              className="flex min-w-0 items-center gap-2"
            >
              <Emoji emoji={meal.icon} className="text-title" />
              <span
                aria-hidden="true"
                className="text-caption min-w-0 flex-1 truncate font-bold"
              >
                {meal.title}
              </span>
              <span className="sr-only">
                {t("week.mealEntry", {
                  slot: t(`meal.slot.${meal.slot}`),
                  title: meal.title,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface WeekBoardProps {
  days: readonly WeekDay[];
  format: FormatContext;
}

/** Seven day columns side by side (today first) with icons and meals. Presentational. */
export function WeekBoard({ days, format }: WeekBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("week.label")}
      data-testid="week-board"
      className="grid min-h-0 flex-1 grid-cols-7 gap-3"
    >
      {days.map((day) => (
        <WeekColumn key={day.date} day={day} format={format} />
      ))}
    </div>
  );
}
