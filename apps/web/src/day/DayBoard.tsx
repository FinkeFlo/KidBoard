import type { Child } from "@kidboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import { type EventStatus, EventTile } from "../components/EventTile";
import { MealCard } from "../components/MealCard";
import type { FormatContext } from "../i18n/format";
import type { DayBand } from "../time";
import type { DayBandModel, DayEvent, DayModel } from "./buildDayModel";
import { DayEmpty } from "./DayStates";

/**
 * Band symbols. They must not repeat a symbol with another meaning on the board: 🌙 is the
 * countdown's "one sleep" and ☀️ the day-view toggle, so midday is the sun with a face
 * and the evening a sunset (never a moon).
 */
const BAND_SYMBOL: Record<DayBand, string> = {
  morning: "🌅",
  midday: "🌞",
  evening: "🌆",
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

/**
 * Band layout. One column up to this many events; with an all-day row above the bands
 * there is less height, so one fewer. Beyond it, two columns.
 */
const SINGLE_COLUMN_MAX = 4;
const SINGLE_COLUMN_MAX_WITH_ALL_DAY = 3;
/** Rows a band shows at most; beyond them events are summed up in "+N" tiles. */
const MAX_ROWS = 4;

export interface BandLayout<T> {
  columns: 1 | 2;
  rows: number;
  /** Events shown as tiles, in time order. */
  visible: T[];
  /** Past events summed up in a leading "+N already over" tile (0: no such tile). */
  earlier: number;
  /** Latest current/upcoming events summed up in a trailing "+N later" tile (0: none). */
  later: number;
}

/**
 * How a band lays out its events (in time order). The tiles shrink with the band's
 * height (container query units, see `EventTile` `fit`), so they never clip; only when
 * `MAX_ROWS` rows of two columns are not enough are events summed up in "+N" tiles,
 * never hidden silently. Past events go first (oldest first): a child's board shows
 * what is going on and what comes next. Only if that is not enough are the latest
 * upcoming events summed up too.
 */
export function bandLayout<T extends { status: EventStatus }>(
  items: readonly T[],
  hasAllDay: boolean,
): BandLayout<T> {
  const count = items.length;
  const singleMax = hasAllDay
    ? SINGLE_COLUMN_MAX_WITH_ALL_DAY
    : SINGLE_COLUMN_MAX;
  const columns = count > singleMax ? 2 : 1;
  const capacity = columns * MAX_ROWS;
  const hidden = new Set<number>();
  let earlier = 0;
  let later = 0;
  if (count > capacity) {
    const past = items.flatMap((item, index) =>
      item.status === "past" ? [index] : [],
    );
    // One cell goes to the "+N" tile.
    const excess = count - (capacity - 1);
    if (excess <= past.length) {
      earlier = excess;
    } else {
      earlier = past.length;
      const tiles = earlier > 0 ? 2 : 1;
      later = count - earlier - (capacity - tiles);
    }
    for (const index of past.slice(0, earlier)) hidden.add(index);
    const rest = items.flatMap((item, index) =>
      item.status === "past" ? [] : [index],
    );
    for (const index of rest.slice(rest.length - later)) hidden.add(index);
  }
  const visible = items.filter((_, index) => !hidden.has(index));
  const cells = visible.length + (earlier > 0 ? 1 : 0) + (later > 0 ? 1 : 0);
  return {
    columns,
    rows: Math.max(1, Math.ceil(cells / columns)),
    visible,
    earlier,
    later,
  };
}

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
      {items.map(({ event, status, continues }) => (
        <li key={event.id} className="min-w-0">
          <EventTile
            event={event}
            childList={childList}
            format={format}
            status={status}
            continues={continues}
          />
        </li>
      ))}
    </ul>
  );
}

/*
 * A band cell: a size container whose height is the natural tile height, or less when
 * `--rows` rows would not fit into the band's list area (`100cqh` of the list wrapper).
 */
const BAND_CELL =
  "@container-size min-w-0 h-[min(var(--spacing-band-tile),calc((100cqh-(var(--rows)-1)*--spacing(2))/var(--rows)))]";

/** "+N" cell for events a crowded band sums up: past ones first, later ones last. */
function HiddenTile({
  count,
  kind,
}: {
  count: number;
  kind: "earlier" | "later";
}): React.JSX.Element {
  const { t } = useTranslation();
  const surface =
    kind === "earlier"
      ? "bg-surface-sunken text-text-muted"
      : "bg-surface-raised text-text-muted shadow-card";
  return (
    <li data-testid="day-band-more" data-kind={kind} className={BAND_CELL}>
      <p
        className={`${surface} rounded-tile text-title flex h-full items-center justify-center font-extrabold`}
      >
        <span aria-hidden="true">{t("day.hidden.badge", { count })}</span>
        <span className="sr-only">{t(`day.hidden.${kind}`, { count })}</span>
      </p>
    </li>
  );
}

function BandEvents({
  items,
  hasAllDay,
  childList,
  format,
}: {
  items: readonly DayEvent[];
  hasAllDay: boolean;
  childList: readonly Child[];
  format: FormatContext;
}): React.JSX.Element {
  const layout = bandLayout(items, hasAllDay);
  // `--rows` is a unitless count for the cell height above, not a colour or a size.
  const rows = { "--rows": String(layout.rows) } as React.CSSProperties;
  return (
    <div className="@container-size min-h-0 flex-1">
      <ul
        style={rows}
        className={`grid content-start gap-2 ${
          layout.columns === 2 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {layout.earlier > 0 && (
          <HiddenTile count={layout.earlier} kind="earlier" />
        )}
        {layout.visible.map(({ event, status, continues }) => (
          <li key={event.id} className={BAND_CELL}>
            <EventTile
              event={event}
              childList={childList}
              format={format}
              status={status}
              continues={continues}
              fit
            />
          </li>
        ))}
        {layout.later > 0 && <HiddenTile count={layout.later} kind="later" />}
      </ul>
    </div>
  );
}

function BandColumn({
  band,
  hasAllDay,
  childList,
  format,
}: {
  band: DayBandModel;
  hasAllDay: boolean;
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
      <BandEvents
        items={band.events}
        hasAllDay={hasAllDay}
        childList={childList}
        format={format}
      />
    </section>
  );
}

export interface DayBoardProps {
  model: DayModel;
  childList: readonly Child[];
  format: FormatContext;
}

/** The loaded day view (below the shared board frame): all-day row, three bands, meals. Purely presentational. */
export function DayBoard({
  model,
  childList,
  format,
}: DayBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="gap-gutter flex min-h-0 flex-1 flex-col">
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
                hasAllDay={model.allDay.length > 0}
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
    </div>
  );
}
