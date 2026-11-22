import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import type { Countdown } from "./buildCountdown";

/** Up to this many nights every night is its own 🌙; beyond, one 🌙 with a number. */
export const MAX_INDIVIDUAL_MOONS = 14;
/** Moons per row: a week per row, so 14 nights are two rows (fits the header). */
export const MOONS_PER_ROW = 7;
/** Event icons shown when several countdown events fall on the same day. */
export const MAX_COUNTDOWN_ICONS = 3;

const MOON = "🌙";

export type CountdownVariant = "full" | "compact";

// Full class names so Tailwind can see them.
const SIZES: Record<
  CountdownVariant,
  { icon: string; moon: string; text: string; box: string }
> = {
  full: {
    icon: "text-heading",
    moon: "text-title",
    text: "text-title",
    box: "gap-3 px-4 py-2",
  },
  compact: {
    icon: "text-title",
    moon: "text-body",
    text: "text-body",
    box: "gap-2 px-3 py-1",
  },
};

/** Night counts split into rows of {@link MOONS_PER_ROW}: 10 → [7, 3]. */
export function moonRows(nights: number): number[] {
  const rows: number[] = [];
  for (let left = nights; left > 0; left -= MOONS_PER_ROW) {
    rows.push(Math.min(left, MOONS_PER_ROW));
  }
  return rows;
}

function Moons({
  nights,
  variant,
}: {
  nights: number;
  variant: CountdownVariant;
}): React.JSX.Element {
  const { t } = useTranslation();
  const size = SIZES[variant];
  if (nights > MAX_INDIVIDUAL_MOONS) {
    return (
      <span
        data-testid="countdown-grouped"
        className={`${size.text} flex items-center gap-1 font-extrabold`}
      >
        <Emoji emoji={MOON} className={size.moon} />
        {t("countdown.grouped", { count: nights })}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      {moonRows(nights).map((count, row) => (
        <span key={row} className="flex gap-0.5">
          {Array.from({ length: count }, (_, index) => (
            <Emoji key={index} emoji={MOON} className={size.moon} />
          ))}
        </span>
      ))}
    </span>
  );
}

export interface CountdownBadgeProps {
  countdown: Countdown;
  /** `full` on the week view, `compact` (smaller) on the day view. */
  variant: CountdownVariant;
}

/**
 * "How many sleeps?" (T-19): the awaited event icon(s) and one 🌙 per night (up to
 * {@link MAX_INDIVIDUAL_MOONS}, in rows of a week), or 🌙 ×N beyond. Today: the icons and
 * "Today!". The visuals are hidden from assistive tech; a localized, pluralized label
 * says the same in words. Static (no animation), so reduced motion needs nothing extra.
 */
export function CountdownBadge({
  countdown,
  variant,
}: CountdownBadgeProps): React.JSX.Element {
  const { t } = useTranslation();
  const size = SIZES[variant];
  const titles = countdown.events.map((event) => event.title);
  const label =
    countdown.nights === 0
      ? t("countdown.todayLabel", { titles })
      : t("countdown.nights", { count: countdown.nights, titles });
  const isToday = countdown.nights === 0;
  return (
    <section
      aria-label={t("countdown.label")}
      data-testid="countdown"
      data-variant={variant}
      data-nights={countdown.nights}
      className={`${isToday ? "bg-band-morning" : "bg-band-evening"} text-text rounded-card shadow-card flex shrink-0 items-center ${size.box}`}
    >
      <p className="sr-only">{label}</p>
      <span aria-hidden="true" className="flex items-center gap-1">
        {countdown.events.slice(0, MAX_COUNTDOWN_ICONS).map((event) => (
          <Emoji key={event.id} emoji={event.icon} className={size.icon} />
        ))}
      </span>
      <span aria-hidden="true" className="flex items-center">
        {isToday ? (
          <span className={`${size.text} font-extrabold`}>
            {t("countdown.today")}
          </span>
        ) : (
          <Moons nights={countdown.nights} variant={variant} />
        )}
      </span>
    </section>
  );
}
