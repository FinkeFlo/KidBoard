import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import type { DayWeather } from "./buildBoardWeather";

/**
 * Full spoken name of a chip: "Sunny, now 8 degrees, high 12 degrees" (today while the
 * current temperature is fresh) or "Rain, high 9 degrees".
 */
export function weatherName(t: TFunction, day: DayWeather): string {
  const kind = t(`weather.kind.${day.kind}`);
  const high = t("weather.degrees", { count: day.high });
  return day.current === undefined
    ? t("weather.high", { kind, high })
    : t("weather.nowAndHigh", {
        kind,
        now: t("weather.degrees", { count: day.current }),
        high,
      });
}

/**
 * Sizes: `today` (overview, today's heading row: icon 2rem, temperature as a title),
 * `day` (overview, the other days' date line: icon 1.75rem) and `week` (week header).
 * Full class names so Tailwind can see them.
 */
const SIZES = {
  today: { icon: "text-heading", temperature: "text-title" },
  day: { icon: "text-[1.75rem]", temperature: "text-tile" },
  week: { icon: "text-tile", temperature: "text-meta font-black" },
} as const;

export type WeatherChipSize = keyof typeof SIZES;

/**
 * The weather of one day: its icon (never 🌙, rule 1) and a temperature, today's current
 * one while fresh, else the day's high. One image for assistive tech with the full name
 * ({@link weatherName}); its parts are decorative. `decorative` hides the whole chip
 * (the week header says the name in its heading instead). Not interactive.
 */
export function WeatherChip({
  day,
  size,
  decorative = false,
}: {
  day: DayWeather;
  size: WeatherChipSize;
  decorative?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const classes = SIZES[size];
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : weatherName(t, day)}
      aria-hidden={decorative ? true : undefined}
      data-testid="weather-chip"
      data-date={day.date}
      data-kind={day.kind}
      className="flex shrink-0 items-center gap-1"
    >
      <Emoji emoji={day.icon} className={classes.icon} />
      <span
        aria-hidden="true"
        data-testid="weather-temperature"
        className={`${classes.temperature} leading-none whitespace-nowrap`}
      >
        {t("weather.temperature", { value: day.current ?? day.high })}
      </span>
    </span>
  );
}
