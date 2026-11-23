import type { CalendarEvent } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import { CheckIcon } from "../components/TimeOfDayIcon";

/** Hidden upcoming events the overview's "+N" row draws as small icons; the count covers all. */
export const MORE_ICONS_MAX = 4;
/** The same in the narrow week columns. */
export const WEEK_MORE_ICONS_MAX = 2;
/** Past events the week's "done" strip draws as icons; further ones are counted. */
export const WEEK_STRIP_ICONS_MAX = 2;

/**
 * `day`: overview columns (the word "done" next to 30px icons); `week`: the seven narrow
 * week columns (check mark only, smaller icons, fewer of them). The size of the row
 * (`h-9`, `SUMMARY_ROW_REM`) is the same in both.
 */
export type SummaryVariant = "day" | "week";

const SIZES: Record<
  SummaryVariant,
  { row: string; icon: string; more: string; check: string }
> = {
  day: {
    row: "gap-2.5 ps-2",
    icon: "text-[1.875rem]",
    more: "gap-2 ps-2",
    check: "size-4",
  },
  week: {
    row: "gap-1.5 ps-1",
    icon: "text-[1.5rem]",
    more: "gap-1.5 ps-1",
    check: "size-5",
  },
};

/**
 * "done" strip: past events folded into small grey emoji with a check mark (oldest
 * first). Its accessible name lists every folded title (merge rule 2), also those beyond
 * the drawn icons, which are counted as "+N".
 */
export function PastStrip({
  items,
  icons,
  hidden,
  variant = "day",
}: {
  /** Every folded event (for the accessible name). */
  items: readonly CalendarEvent[];
  /** The ones drawn as icons. */
  icons: readonly CalendarEvent[];
  /** Folded events without an icon. */
  hidden: number;
  variant?: SummaryVariant;
}): React.JSX.Element {
  const { t } = useTranslation();
  const size = SIZES[variant];
  return (
    <div
      role="group"
      aria-label={t("day.past.list", {
        titles: items.map((event) => event.title),
      })}
      data-testid="past-strip"
      data-count={items.length}
      className={`text-text-muted flex h-9 shrink-0 items-center overflow-hidden ${size.row}`}
    >
      <span
        aria-hidden="true"
        className="text-meta flex shrink-0 items-center gap-1 font-black"
      >
        <CheckIcon className={size.check} />
        {variant === "day" && t("day.past.label")}
      </span>
      {icons.map((event) => (
        <span key={event.id} className="relative inline-flex shrink-0">
          <Emoji emoji={event.icon} className={`${size.icon} grayscale`} />
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
 * The upcoming events that do not fit: their emoji in small, then "+N" – plain text, no
 * border or fill, so it does not look like a button (it is not interactive). Names every
 * summed-up title for assistive tech. A list item: it ends the column's list of tiles.
 */
export function MoreLater({
  items,
  variant = "day",
}: {
  items: readonly CalendarEvent[];
  variant?: SummaryVariant;
}): React.JSX.Element {
  const { t } = useTranslation();
  const size = SIZES[variant];
  const max = variant === "day" ? MORE_ICONS_MAX : WEEK_MORE_ICONS_MAX;
  return (
    <li
      data-testid="column-more"
      data-count={items.length}
      className={`text-text-muted flex h-9 min-w-0 shrink-0 items-center overflow-hidden ${size.more}`}
    >
      {items.slice(0, max).map((event) => (
        <Emoji
          key={event.id}
          emoji={event.icon}
          className={`shrink-0 ${variant === "day" ? "text-[1.625rem]" : "text-[1.375rem]"}`}
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
        {t(variant === "day" ? "day.hidden.later" : "week.more", {
          count: items.length,
          titles: items.map((event) => event.title),
        })}
      </span>
    </li>
  );
}
