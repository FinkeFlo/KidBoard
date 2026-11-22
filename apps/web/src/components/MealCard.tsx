import type { Meal } from "@kidboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "./Emoji";

/** One meal: big icon, slot label, title (plain text, clamped to 2 lines). */
export function MealCard({ meal }: { meal: Meal }): React.JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      data-testid="meal-card"
      data-slot={meal.slot}
      className="bg-surface-raised text-text min-h-touch rounded-card shadow-card flex items-center gap-4 p-3"
    >
      <Emoji emoji={meal.icon} className="text-heading" />
      <div className="min-w-0 flex-1">
        <p className="text-caption text-text-muted font-bold">
          {t(`meal.slot.${meal.slot}`)}
        </p>
        <p
          id={titleId}
          className="text-body line-clamp-2 font-bold break-words"
        >
          {meal.title}
        </p>
      </div>
    </article>
  );
}
