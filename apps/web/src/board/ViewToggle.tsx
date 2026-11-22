import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";

export type BoardView = "day" | "week";

const OPTIONS: readonly { view: BoardView; emoji: string }[] = [
  { view: "day", emoji: "☀️" },
  { view: "week", emoji: "🗓️" },
];

export interface ViewToggleProps {
  view: BoardView;
  onChange: (view: BoardView) => void;
}

/**
 * Big pictorial switch between day (sun) and week (calendar). Pictures only, so it works
 * for children who cannot read; the names are for assistive tech. Each button is >= 64 px.
 */
export function ViewToggle({
  view,
  onChange,
}: ViewToggleProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("board.viewGroup")}
      className="bg-surface-sunken rounded-pill flex gap-1 p-1"
    >
      {OPTIONS.map(({ view: option, emoji }) => {
        const active = option === view;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={t(`board.${option}`)}
            data-view={option}
            onClick={() => {
              onChange(option);
            }}
            className={`${
              active
                ? "bg-accent text-on-accent shadow-card"
                : "text-text bg-transparent"
            } min-h-touch min-w-touch rounded-pill focus-visible:outline-accent flex items-center justify-center focus-visible:outline-4 focus-visible:outline-offset-2`}
          >
            <Emoji emoji={emoji} className="text-heading" />
          </button>
        );
      })}
    </div>
  );
}
