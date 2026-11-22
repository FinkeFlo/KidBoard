import type { Child } from "@kidboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { ChildLegend } from "../components/ChildLegend";
import { Emoji } from "../components/Emoji";
import { EventTile } from "../components/EventTile";
import { MealCard } from "../components/MealCard";
import {
  type FormatContext,
  formatLongDate,
  formatWeekday,
} from "../i18n/format";
import type { DayBand } from "../time";
import type { DayBandModel, DayEvent, DayModel } from "./buildDayModel";
import { DayEmpty } from "./DayStates";
import { DiscreetStatusBanner } from "./DiscreetStatusBanner";

const BAND_SYMBOL: Record<DayBand, string> = {
  morning: "🌅",
  midday: "☀️",
  evening: "🌙",
};

// Full class names so Tailwind can see them.
const BAND_SURFACE: Record<DayBand, string> = {
  morning: "bg-band-morning ring-band-morning-accent",
  midday: "bg-band-midday ring-band-midday-accent",
  evening: "bg-band-evening ring-band-evening-accent",
};
const BAND_ACCENT: Record<DayBand, string> = {
  morning: "text-band-morning-accent",
  midday: "text-band-midday-accent",
  evening: "text-band-evening-accent",
};

/** Above this many events a band lists them in two columns to stay on screen. */
const SINGLE_COLUMN_MAX = 4;

function EventList({
  items,
  childList,
  format,
  className,
}: {
  items: readonly DayEvent[];
  childList: readonly Child[];
  format: FormatContext;
  className: string;
}): React.JSX.Element {
  return (
    <ul className={className}>
      {items.map(({ event, status }) => (
        <li key={event.id} className="min-w-0">
          <EventTile
            event={event}
            childList={childList}
            format={format}
            status={status}
          />
        </li>
      ))}
    </ul>
  );
}

function BandColumn({
  band,
  childList,
  format,
}: {
  band: DayBandModel;
  childList: readonly Child[];
  format: FormatContext;
}): React.JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  // Current: band colour with an accent ring. Past: plain, receded. Upcoming: band colour.
  const surface =
    band.status === "past"
      ? "bg-surface border-border text-text-muted border-2"
      : band.status === "current"
        ? `${BAND_SURFACE[band.id]} text-text shadow-raised ring-4`
        : `${BAND_SURFACE[band.id]} text-text`;
  const accent = band.status === "past" ? "" : BAND_ACCENT[band.id];
  return (
    <section
      aria-labelledby={headingId}
      aria-current={band.status === "current" ? "time" : undefined}
      data-testid="day-band"
      data-band={band.id}
      data-status={band.status}
      className={`${surface} rounded-tile flex min-h-0 flex-col gap-3 overflow-hidden p-4`}
    >
      <h2
        id={headingId}
        className={`${accent} text-title flex shrink-0 items-center gap-3 font-extrabold`}
      >
        <Emoji emoji={BAND_SYMBOL[band.id]} className="text-heading" />
        {t(`day.band.${band.id}`)}
      </h2>
      <EventList
        items={band.events}
        childList={childList}
        format={format}
        className={`grid min-h-0 content-start gap-2 ${
          band.events.length > SINGLE_COLUMN_MAX ? "grid-cols-2" : "grid-cols-1"
        }`}
      />
    </section>
  );
}

export interface DayBoardProps {
  model: DayModel;
  /** Today, `YYYY-MM-DD` in the config zone. */
  today: string;
  childList: readonly Child[];
  format: FormatContext;
}

/** The loaded day view: header, all-day row, three bands, meals. Purely presentational. */
export function DayBoard({
  model,
  today,
  childList,
  format,
}: DayBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="bg-surface text-text gap-gutter p-gutter flex h-full flex-col">
      <header className="gap-gutter flex shrink-0 items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-display font-extrabold">
            {formatWeekday(today, format)}
          </h1>
          <p className="text-title text-text-muted font-bold">
            {formatLongDate(today, format)}
          </p>
        </div>
        <div className="gap-gutter flex min-w-0 flex-wrap items-center justify-end">
          <DiscreetStatusBanner />
          <ChildLegend childList={childList} />
        </div>
      </header>
      {model.isEmpty ? (
        <DayEmpty />
      ) : (
        <>
          {model.allDay.length > 0 && (
            <EventList
              items={model.allDay}
              childList={childList}
              format={format}
              className="gap-gutter grid shrink-0 grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]"
            />
          )}
          <div
            data-testid="day-bands"
            className="gap-gutter grid min-h-0 flex-1 grid-cols-3"
          >
            {model.bands.map((band) => (
              <BandColumn
                key={band.id}
                band={band}
                childList={childList}
                format={format}
              />
            ))}
          </div>
        </>
      )}
      {model.meals.length > 0 && (
        <section aria-label={t("day.meals")} className="shrink-0">
          <ul className="gap-gutter flex">
            {model.meals.map((meal) => (
              <li key={meal.id} className="min-w-0 flex-1">
                <MealCard meal={meal} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
