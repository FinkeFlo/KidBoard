import type { Meal, MealSlot } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import { TimeOfDayIcon } from "../components/TimeOfDayIcon";
import type { DayBand } from "../time";

/** The three fixed plate positions; a missing meal leaves its position empty. */
const PLATE_SLOTS: readonly Exclude<MealSlot, "unspecified">[] = [
  "breakfast",
  "lunch",
  "dinner",
];

const SLOT_TIME: Record<Exclude<MealSlot, "unspecified">, DayBand> = {
  breakfast: "morning",
  lunch: "midday",
  dinner: "evening",
};

export type Plate = { key: string; meal: Meal } | { key: string; meal: null };

/**
 * Plates in display order: breakfast, lunch, dinner at fixed positions (an empty place
 * for a missing one, more meals of a slot next to each other), then the meals without a
 * slot (`unspecified`) at the end.
 */
export function platesOf(meals: readonly Meal[]): Plate[] {
  const plates: Plate[] = [];
  for (const slot of PLATE_SLOTS) {
    const ofSlot = meals.filter((meal) => meal.slot === slot);
    if (ofSlot.length === 0) plates.push({ key: `empty-${slot}`, meal: null });
    for (const meal of ofSlot) plates.push({ key: meal.id, meal });
  }
  for (const meal of meals.filter((m) => m.slot === "unspecified")) {
    plates.push({ key: meal.id, meal });
  }
  return plates;
}

/**
 * The day's meals at the bottom of a column: round plates with the meal emoji and a small
 * time-of-day badge (none for `unspecified`); today's column also shows the short name.
 * Each plate is an image named "Lunch: Spaghetti". Plates shrink when a day has more
 * meals than the three positions (size container), so they never overflow.
 */
export function MealPlates({
  meals,
  today,
}: {
  meals: readonly Meal[];
  today: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (meals.length === 0) return null;
  return (
    <ul
      aria-label={t("day.meals")}
      data-testid="meal-plates"
      className={`${today ? "" : "bg-surface px-2 py-2"} rounded-tile mt-auto flex shrink-0 items-start justify-around gap-2`}
    >
      {platesOf(meals).map(({ key, meal }) => (
        <li
          key={key}
          data-slot={meal?.slot ?? "empty"}
          aria-hidden={meal === null ? true : undefined}
          className={`${today ? "max-w-24" : "max-w-13"} flex min-w-0 flex-1 flex-col items-center gap-1`}
        >
          <span
            className={`${meal === null ? "" : today ? "bg-surface-sunken" : "bg-surface-raised"} rounded-pill @container relative flex aspect-square w-full items-center justify-center ${today ? "max-w-15" : "max-w-13"}`}
          >
            {meal !== null && (
              <>
                <Emoji
                  emoji={meal.icon}
                  label={t("meal.plate", {
                    slot: t(`meal.slot.${meal.slot}`),
                    title: meal.title,
                  })}
                  className="text-[60cqw]"
                />
                {meal.slot !== "unspecified" && (
                  <span className="absolute -end-0.5 -bottom-0.5 text-[34cqw]">
                    <TimeOfDayIcon timeOfDay={SLOT_TIME[meal.slot]} />
                  </span>
                )}
              </>
            )}
          </span>
          {today && meal !== null && (
            <span
              aria-hidden="true"
              className="text-caption text-text-muted w-full truncate text-center"
            >
              {meal.title}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
