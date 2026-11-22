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
  children: React.ReactNode;
}

/**
 * Shared frame of day and week view: today's date, status banner, child legend and the
 * view toggle on top, the view itself below.
 */
export function BoardFrame({
  today,
  childList,
  format,
  view,
  onViewChange,
  children,
}: BoardFrameProps): React.JSX.Element {
  return (
    <main className="bg-surface text-text gap-gutter p-gutter flex h-full flex-col">
      <header className="gap-gutter flex shrink-0 items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-display font-extrabold">
            {formatWeekday(today, format)}
          </h1>
          <p className="text-title text-text-muted font-bold">
            {formatLongDate(today, format)}
          </p>
        </div>
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
