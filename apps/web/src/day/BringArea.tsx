import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { CHIP_DISC } from "../components/BringChips";
import { ChildAvatar } from "../components/ChildAvatar";
import { CHILD_EDGE, childColorStyle } from "../components/childColor";
import { resolveChildTint } from "../components/childTint";
import { Emoji } from "../components/Emoji";
import {
  BRING_BAG,
  type BringGroup,
  type BringReminder,
} from "./buildBringReminder";
import { useContentWidth } from "./useContentWidth";

/** Height of the 🎒 area in rem (`h-11`): one row, it never wraps. */
export const BRING_AREA_REM = 2.75;

/**
 * Room of the groups row in rem; the classes below use exactly these values (full class
 * names so Tailwind can see them).
 */
export const BRING_AREA_METRICS = {
  /** One chip disc (`size-7`). */
  chipRem: 1.75,
  /** Gap between the items of a group: badge, chips, "+N" (`gap-1`). */
  itemGapRem: 0.25,
  /** The child's avatar badge (`size-8`). */
  badgeRem: 2,
  /** Room kept for a "+N" (`min-w-7`). */
  moreRem: 1.75,
  /** Inline padding of a group with a badge (`ps-0.5 pe-2`) … */
  badgePadRem: 0.125 + 0.5,
  /** … and of the neutral group, which has none (`px-2`). */
  plainPadRem: 0.5 + 0.5,
  /** Gap between two groups and before the trailing "+N" (`gap-1.5`). */
  groupGapRem: 0.375,
} as const;

/** What the fit needs to know of a group: its icon count and whether it has a badge. */
export interface BringGroupSize {
  icons: number;
  badge: boolean;
}

export interface BringGroupFit {
  /** Groups drawn (the first `shown`), each with its drawn icon count. */
  drawn: number[];
  /** Icons of the groups that did not fit at all, counted in a trailing "+N". */
  hiddenIcons: number;
}

function groupRem(drawn: number, icons: number, badge: boolean): number {
  const m = BRING_AREA_METRICS;
  const more = drawn < icons ? 1 : 0;
  const items = (badge ? 1 : 0) + drawn + more;
  const pad = badge ? m.badgePadRem : m.plainPadRem;
  if (items === 0) return pad;
  return (
    pad +
    (badge ? m.badgeRem : 0) +
    drawn * m.chipRem +
    more * m.moreRem +
    (items - 1) * m.itemGapRem
  );
}

/**
 * Width in rem of the groups row when group `i` draws `drawn[i]` chips (plus its "+N"
 * when that is fewer than its icons), with a trailing "+N" when `hidden`.
 */
export function bringRowRem(
  groups: readonly BringGroupSize[],
  drawn: readonly number[],
  hidden: boolean,
): number {
  const m = BRING_AREA_METRICS;
  const widths = drawn.map((count, index) => {
    const group = groups[index];
    return group === undefined ? 0 : groupRem(count, group.icons, group.badge);
  });
  const parts = widths.length + (hidden ? 1 : 0);
  return (
    widths.reduce((sum, width) => sum + width, 0) +
    (hidden ? m.moreRem : 0) +
    Math.max(0, parts - 1) * m.groupGapRem
  );
}

/**
 * Which icons of the 🎒 area's groups fit one row `widthRem` wide (`null`: not measured,
 * then all of them). Whole icons only, as `stripIconsThatFit`: every group keeps its badge
 * and shows as many whole chips as fit, its other icons in a plain-text "+N". Groups are
 * kept in order (neutral first, then config order); room is shared out one chip at a time
 * across them, so every child gets a fair share. Only when not even every group's badge
 * and "+N" fit, the last groups are left out and their icons counted in a trailing "+N".
 * `shown + counted` always covers every icon (the area's accessible name lists them all).
 */
export function bringGroupsThatFit(
  groups: readonly BringGroupSize[],
  widthRem: number | null,
): BringGroupFit {
  const all = groups.map((group) => Math.max(0, group.icons));
  if (widthRem === null) return { drawn: all, hiddenIcons: 0 };
  const available = widthRem + 1e-6;
  const iconsFrom = (start: number): number =>
    all.slice(start).reduce((sum, icons) => sum + icons, 0);

  // The most groups whose badge and "+N" fit (with a trailing "+N" for the rest).
  let shown = groups.length;
  while (
    shown > 0 &&
    bringRowRem(
      groups,
      new Array<number>(shown).fill(0),
      shown < groups.length,
    ) > available
  ) {
    shown -= 1;
  }
  const hidden = shown < groups.length;
  const drawn = new Array<number>(shown).fill(0);
  // One more chip per group in turn, while the row still fits.
  let grew = true;
  while (grew) {
    grew = false;
    for (let index = 0; index < shown; index += 1) {
      const current = drawn[index] ?? 0;
      if (current >= (all[index] ?? 0)) continue;
      drawn[index] = current + 1;
      if (bringRowRem(groups, drawn, hidden) <= available) {
        grew = true;
      } else {
        drawn[index] = current;
      }
    }
  }
  return { drawn, hiddenIcons: iconsFrom(shown) };
}

function groupName(group: BringGroup, everyone: string): string {
  return `${group.child?.name ?? everyone} ${group.icons.join(" ")}`;
}

/**
 * The evening-before 🎒 area in today's overview column (T-36): led by 🎒, one group per
 * child (avatar badge, the child's tint and edge; the neutral group for everyone first)
 * with its icons as chips. One row of fixed height ({@link BRING_AREA_REM}) that never
 * wraps; it measures its width and draws only whole chips, the rest as a plain-text "+N"
 * per group ({@link bringGroupsThatFit}). A labelled region (not a live region) whose
 * name lists every child and icon; nothing in it is interactive. Rendered only when
 * there is something to pack. Emoji are React text only (through `<Emoji>`, dimmed at
 * night); the chips use the shared {@link CHIP_DISC} (`--color-chip`, lighter at night).
 */
export function BringArea({
  reminder,
}: {
  reminder: BringReminder;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const width = useContentWidth(ref);
  const { groups } = reminder;
  if (groups.length === 0) return null;
  const fit = bringGroupsThatFit(
    groups.map((group) => ({
      icons: group.icons.length,
      badge: group.child !== null,
    })),
    width,
  );
  const everyone = t("bring.everyone");
  const label = t(
    reminder.when === "tomorrow" ? "bring.tomorrow" : "bring.today",
    { groups: groups.map((group) => groupName(group, everyone)) },
  );
  return (
    <section
      aria-label={label}
      data-testid="bring-area"
      data-when={reminder.when}
      className="bg-surface-sunken rounded-tile inset-ring-border flex h-11 shrink-0 items-center gap-2 overflow-hidden ps-2 pe-1 inset-ring-1"
    >
      <Emoji
        emoji={BRING_BAG}
        className="w-8 shrink-0 text-center text-[1.75rem]"
      />
      <div
        ref={ref}
        aria-hidden="true"
        data-testid="bring-groups"
        className="flex min-w-0 flex-1 basis-0 items-center gap-1.5 overflow-hidden"
      >
        {fit.drawn.map((drawn, index) => {
          const group = groups[index];
          if (group === undefined) return null;
          const counted = group.icons.length - drawn;
          const child = group.child;
          return (
            <span
              key={child?.id ?? "everyone"}
              data-testid="bring-group"
              data-child={child?.id ?? ""}
              data-count={group.icons.length}
              data-drawn={drawn}
              style={
                child === null
                  ? undefined
                  : {
                      background: resolveChildTint(child),
                      ...childColorStyle(child.color),
                    }
              }
              className={`rounded-pill flex h-9 shrink-0 items-center gap-1 ${
                child === null
                  ? "bg-surface-raised inset-ring-border px-2 inset-ring-1"
                  : `${CHILD_EDGE} ps-0.5 pe-2 inset-ring-2`
              }`}
            >
              {child !== null && (
                <ChildAvatar
                  decorative
                  child={child}
                  className="text-body size-8"
                />
              )}
              {group.icons.slice(0, drawn).map((icon, position) => (
                <span
                  key={`${String(position)}-${icon}`}
                  data-testid="bring-area-chip"
                  className={`size-7 ${CHIP_DISC}`}
                >
                  <Emoji emoji={icon} className="text-[1.125rem]" />
                </span>
              ))}
              {counted > 0 && (
                <span
                  data-testid="bring-group-more"
                  className="text-meta text-text-muted min-w-7 shrink-0 text-center font-black"
                >
                  {t("day.hidden.badge", { count: counted })}
                </span>
              )}
            </span>
          );
        })}
        {fit.hiddenIcons > 0 && (
          <span
            data-testid="bring-area-more"
            className="text-meta text-text-muted min-w-7 shrink-0 text-center font-black"
          >
            {t("day.hidden.badge", { count: fit.hiddenIcons })}
          </span>
        )}
      </div>
    </section>
  );
}
