import type { Child } from "@kidboard/shared";

import { ChildLegend } from "../components/ChildLegend";
import { DiscreetStatusBanner } from "../day/DiscreetStatusBanner";
import {
  type FormatContext,
  formatLongDate,
  formatWeekday,
} from "../i18n/format";
import { type BoardView, ViewToggle } from "./ViewToggle";

export interface BoardFrameProps {
  /** Today, `YYYY-MM-DD` in the config zone. */
  today: string;
  childList: readonly Child[];
  format: FormatContext;
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  /** The "How many sleeps?" countdown for the header (T-19), if there is one. */
  countdown?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared frame of day and week view: today's date, the countdown, status banner, child
 * legend and the view toggle on top, the view itself below.
 */
export function BoardFrame({
  today,
  childList,
  format,
  view,
  onViewChange,
  countdown,
  children,
}: BoardFrameProps): React.JSX.Element {
  return (
    <main // `pb-touch` reserves the bottom strip of the page for the fullscreen control (T-20),
      // so the corner overlay never sits on content.
      className="bg-surface text-text gap-gutter p-gutter pb-touch flex h-full flex-col"
    >
      <header className="gap-gutter flex shrink-0 items-center justify-between">
        <div className="shrink-0">
          <h1 className="text-display font-extrabold">
            {formatWeekday(today, format)}
          </h1>
          <p className="text-title text-text-muted font-bold">
            {formatLongDate(today, format)}
          </p>
        </div>
        {countdown}
        <div className="gap-gutter flex min-w-0 flex-wrap items-center justify-end">
          <DiscreetStatusBanner />
          <ChildLegend childList={childList} />
          <ViewToggle view={view} onChange={onViewChange} />
        </div>
      </header>
      {children}
    </main>
  );
}
