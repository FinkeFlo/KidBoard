import { useTranslation } from "react-i18next";

/** Height of the now line in rem (`h-6`), for the column's capacity. */
export const NOW_LINE_REM = 1.5;

/**
 * The "now" line in today's column: dot, line and "now", all in `--color-now`. It sits
 * between the events that have started and the upcoming ones and moves only from tile to
 * tile, never per minute. A separator named with the time ("now, 15:18") for assistive
 * tech; not a live region.
 */
export function NowLine({ time }: { time: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="separator"
      aria-label={t("day.nowLabel", { time })}
      data-testid="now-line"
      className="text-now flex h-6 shrink-0 items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="bg-now rounded-pill size-3 shrink-0"
      />
      <span aria-hidden="true" className="bg-now rounded-pill h-0.75 flex-1" />
      <span aria-hidden="true" className="text-meta font-black">
        {t("day.now")}
      </span>
    </div>
  );
}
