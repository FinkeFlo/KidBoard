import type { Child } from "@kidboard/shared";

import { useBurnInShift } from "../burnin";
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
 * Shared frame of day and week view: today's date, the countdown, child legend and the
 * view toggle on top, the view itself below, the status banner in the bottom strip.
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
  const { x, y } = useBurnInShift();
  return (
    <main
      data-testid="board-ready"
      // The gutter gives `burn-in` back to the inner wrapper as padding, so the shifted
      // wrapper (at most `burn-in` either way) stays inside the original gutter. The bottom
      // strip (`touch`, reserved for the fullscreen control, T-20) gets `burn-in` on top, so
      // even shifted down the wrapper's box ends above the strip.
      className="bg-surface text-text h-full p-[calc(var(--spacing-gutter)-var(--spacing-burn-in))] pb-[calc(var(--spacing-touch)+var(--spacing-burn-in))]"
    >
      <div
        data-testid="burn-in-shift"
        data-burn-in-x={x}
        data-burn-in-y={y}
        // Burn-in protection (T-22): `<main>` stays put, only this wrapper drifts.
        style={{
          transform: `translate(calc(var(--spacing-burn-in) * ${String(x)}), calc(var(--spacing-burn-in) * ${String(y)}))`,
        }}
        className="gap-gutter px-burn-in pt-burn-in flex h-full flex-col transition-transform duration-(--duration-slow) ease-in-out motion-reduce:transition-none"
      >
        <header className="gap-gutter flex shrink-0 items-center justify-between">
          <div className="shrink-0">
            <h1 className="text-display font-extrabold">
              {formatWeekday(today, format)}
            </h1>
            <p className="text-title text-text-muted leading-snug font-bold">
              {formatLongDate(today, format)}
            </p>
          </div>
          {countdown}
          <div className="gap-gutter flex min-w-0 items-center justify-end">
            <ChildLegend childList={childList} />
            <ViewToggle view={view} onChange={onViewChange} />
          </div>
        </header>
        {children}
      </div>
      {/* The banner has a fixed slot of its own in the reserved bottom strip (left of the
          fullscreen control), not in the header: it appears and disappears without moving
          the view toggle, and it is not shifted (it is transient). */}
      <div className="h-touch inset-x-touch pointer-events-none fixed bottom-0 flex items-center justify-center">
        <DiscreetStatusBanner />
      </div>
    </main>
  );
}
