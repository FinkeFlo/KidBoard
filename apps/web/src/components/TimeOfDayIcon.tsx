import type { DayBand } from "../time";
import { Emoji } from "./Emoji";

/**
 * Time-of-day symbols on tiles and meal plates. One symbol, one meaning (merge rule 1):
 * 🌙 only counts sleeps (countdown) and ☀️ is the "Today" button, so midday is the sun
 * with a face and the evening a dusk skyline, never a moon.
 */
export const TIME_OF_DAY_SYMBOL: Record<DayBand, string> = {
  morning: "🌅",
  midday: "🌞",
  evening: "🌆",
};

/** Small decorative time-of-day emoji; the time next to it carries the meaning. */
export function TimeOfDayIcon({
  timeOfDay,
  className = "",
}: {
  timeOfDay: DayBand;
  className?: string;
}): React.JSX.Element {
  return (
    <Emoji
      emoji={TIME_OF_DAY_SYMBOL[timeOfDay]}
      className={`${className} shrink-0`.trim()}
    />
  );
}

/**
 * Own symbol for all-day events (not the midday sun): the sun's arc over the horizon,
 * from sunrise to sunset. Decorative; the "All day" text next to it says the same.
 */
export function AllDayIcon({
  className = "size-5",
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-testid="all-day-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`shrink-0 ${className}`}
    >
      <path d="M2 18h20" />
      <path d="M5 18a7 7 0 0 1 14 0" strokeDasharray="2 3.2" />
      <circle cx="5" cy="18" r="1.6" fill="currentColor" />
      <circle cx="19" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}
