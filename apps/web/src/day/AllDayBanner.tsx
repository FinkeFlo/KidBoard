import type { Child } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { ChildBadges } from "../components/ChildBadges";
import { resolveTileTint, tileTintStyle } from "../components/childTint";
import { Emoji } from "../components/Emoji";
import { childrenOf, tileName } from "../components/EventTile";
import { AllDayIcon } from "../components/TimeOfDayIcon";
import type { DayEvent } from "./buildDayModel";

/** All-day entries a banner shows; more are summed up in a "+N" (never hidden silently). */
export const ALL_DAY_MAX = 2;
/** Badge size on a banner entry. */
const BADGE = { size: "size-8", text: "text-body" } as const;

/**
 * All-day events at the top of a day column (merge rule 1: their own treatment, not a
 * tile with the midday sun): a flat strip per event with the all-day arc icon, in the
 * children's tint. Beyond {@link ALL_DAY_MAX} a "+N" names the rest for assistive tech.
 */
export function AllDayBanner({
  items,
  childList,
  large,
}: {
  items: readonly DayEvent[];
  childList: readonly Child[];
  /** Today's column: larger emoji and title. */
  large: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const shown = items.slice(0, ALL_DAY_MAX);
  const rest = items.slice(ALL_DAY_MAX);
  return (
    <ul
      data-testid="all-day"
      className="-mx-1.5 flex shrink-0 flex-col gap-2 px-1.5 pt-2"
    >
      {shown.map(({ event }) => {
        const kids = childrenOf(event, childList);
        const tint = resolveTileTint(kids);
        const name = tileName([
          event.title,
          t("event.allDay"),
          kids.length === 0
            ? t("event.forEveryone")
            : t("event.forChildren", {
                names: kids.map((child) => child.name),
              }),
        ]);
        return (
          <li key={event.id} className="relative min-w-0">
            <article
              aria-label={name}
              data-testid="event-tile"
              data-all-day="true"
              data-tint={tint.kind}
              style={tileTintStyle(tint)}
              className={`${
                tint.edge === null
                  ? tint.kind === "split"
                    ? ""
                    : "inset-ring-border inset-ring-2"
                  : "inset-ring-4 inset-ring-(color:--child-color)"
              } text-text rounded-tile flex h-12 items-center gap-2 ps-2.5 pe-4`}
            >
              <AllDayIcon className="text-text-muted size-6" />
              <Emoji
                emoji={event.icon}
                className={large ? "text-heading" : "text-title"}
              />
              <p
                className={`${large ? "text-tile" : "text-tile-compact"} min-w-0 flex-1 truncate pe-6`}
              >
                {event.title}
              </p>
            </article>
            <span className="pointer-events-none absolute -end-1.5 -top-2">
              <ChildBadges tint={tint} size={BADGE.size} text={BADGE.text} />
            </span>
          </li>
        );
      })}
      {rest.length > 0 && (
        <li
          data-testid="all-day-more"
          data-count={rest.length}
          className="text-meta text-text-muted flex items-center gap-1.5 font-black"
        >
          <AllDayIcon />
          <span aria-hidden="true">
            {t("day.hidden.badge", { count: rest.length })}
          </span>
          <span className="sr-only">
            {t("day.hidden.allDay", {
              count: rest.length,
              titles: rest.map((item) => item.event.title),
            })}
          </span>
        </li>
      )}
    </ul>
  );
}
