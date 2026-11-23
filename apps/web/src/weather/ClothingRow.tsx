import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import { DAY_PILL, TowardsArrow } from "../day/BringArea";
import { type FormatContext, formatWeekdayShort } from "../i18n/format";
import type { ClothingRowModel } from "./buildBoardWeather";

/** Test hook of the row's "→" (the 🎒 area's is `bring-arrow`). */
const ARROW_TEST_ID = "clothing-arrow";

/**
 * What to wear, in today's overview column: a pill in the heading row just before the
 * weather chip (T-49; it wraps below the chip when both do not fit). One to five
 * clothing pictures (whole icons only; a pill too narrow for all wraps the rest out of
 * sight, while the list's name still says every item). In the
 * evening the clothes are for tomorrow, led by the 🎒 area's day cue ("→" and
 * tomorrow's short weekday). A labelled list ("Wear today: jacket, scarf"), not a live
 * region, nothing interactive; emoji through `<Emoji>` (dimmed at night).
 */
export function ClothingRow({
  row,
  format,
}: {
  row: ClothingRowModel;
  format: FormatContext;
}): React.JSX.Element {
  const { t } = useTranslation();
  const names = row.items.map((item) => t(`weather.clothing.${item.key}`));
  const tomorrow = row.when === "tomorrow";
  const label = t(tomorrow ? "weather.wear.tomorrow" : "weather.wear.today", {
    items: names,
  });
  return (
    <div
      data-testid="clothing-row"
      data-when={row.when}
      data-date={row.date}
      className="rounded-pill bg-surface-sunken flex h-9 min-w-0 shrink items-center gap-0.5 ps-1.5 pe-1"
    >
      {tomorrow && (
        // The list's name says "tomorrow"; the cue is for those who cannot read it.
        <span aria-hidden="true" className="flex shrink-0 items-center">
          <TowardsArrow testId={ARROW_TEST_ID} />
          <span data-testid="clothing-day" className={DAY_PILL}>
            {formatWeekdayShort(row.date, format)}
          </span>
        </span>
      )}
      <ul
        aria-label={label}
        className="flex h-9 min-w-0 flex-wrap items-center gap-x-0.5 overflow-hidden"
      >
        {row.items.map((item, index) => (
          <li
            key={item.key}
            data-testid="clothing-item"
            data-key={item.key}
            className="flex h-9 items-center"
          >
            <Emoji
              emoji={item.emoji}
              label={names[index]}
              className="text-[1.75rem]"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
