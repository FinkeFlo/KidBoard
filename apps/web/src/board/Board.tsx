import { useCallback, useMemo, useState } from "react";

import { buildCountdown } from "../countdown/buildCountdown";
import { CountdownBadge } from "../countdown/CountdownBadge";
import {
  useApiErrorKind,
  useConfig,
  useConnectionStatus,
  useTodayAgenda,
} from "../data";
import { buildDayModel } from "../day/buildDayModel";
import { DayBoard } from "../day/DayBoard";
import { DayError, type DayErrorKind, DayLoading } from "../day/DayStates";
import { useFormatContext } from "../i18n/format";
import { useNow } from "../time";
import { buildWeekModel } from "../week/buildWeekModel";
import { WeekBoard } from "../week/WeekBoard";
import { BoardFrame } from "./BoardFrame";
import { useAutoReturn } from "./useAutoReturn";
import type { BoardView } from "./ViewToggle";

function errorKindOf(
  status: ReturnType<typeof useConnectionStatus>,
  apiError: ReturnType<typeof useApiErrorKind>,
): DayErrorKind | undefined {
  if (apiError === "unauthorized") return "unauthorized";
  if (status === "error") return "failed";
  if (status === "offline") return "offline";
  return undefined;
}

/** Used until the config (which carries `autoReturnSeconds`) is known. */
const DEFAULT_AUTO_RETURN_SECONDS = 120;

/**
 * The board: day or week view inside the shared {@link BoardFrame}. Until the config
 * (time zone, bands) and the agenda are known it shows the loading skeleton; without
 * any data a failure shows {@link DayError}. With data (also stale or offline) the board
 * stays up and only the discreet banner reports it.
 * The week view returns to the day view after `config.autoReturnSeconds` of inactivity.
 * The "How many sleeps?" countdown (T-19) sits in the header: full on the week view, a
 * compact badge on the day view; it is built from the same agenda query (31 days).
 */
export function Board(): React.JSX.Element {
  const config = useConfig().data;
  const { today, agenda } = useTodayAgenda();
  const now = useNow();
  const status = useConnectionStatus();
  const apiError = useApiErrorKind();
  const data = agenda.data;
  const timeZone = config?.timeZone ?? "UTC";
  const format = useFormatContext(timeZone);
  const [view, setView] = useState<BoardView>("day");
  const backToDay = useCallback(() => {
    setView("day");
  }, []);
  useAutoReturn(
    view === "week",
    config?.autoReturnSeconds ?? DEFAULT_AUTO_RETURN_SECONDS,
    backToDay,
  );
  const models = useMemo(
    () =>
      config === undefined || today === undefined || data === undefined
        ? undefined
        : {
            day: buildDayModel(data, config, today, now),
            week: buildWeekModel(data, config, today, now),
            countdown: buildCountdown(data.events, today, config.timeZone),
          },
    [config, today, data, now],
  );

  if (config === undefined || today === undefined || models === undefined) {
    const kind = errorKindOf(status, apiError);
    return kind === undefined ? <DayLoading /> : <DayError kind={kind} />;
  }
  return (
    <BoardFrame
      today={today}
      childList={config.children}
      format={format}
      view={view}
      onViewChange={setView}
      countdown={
        models.countdown === undefined ? undefined : (
          <CountdownBadge
            countdown={models.countdown}
            variant={view === "day" ? "compact" : "full"}
          />
        )
      }
    >
      {view === "day" ? (
        <DayBoard
          model={models.day}
          childList={config.children}
          format={format}
        />
      ) : (
        <WeekBoard days={models.week} format={format} />
      )}
    </BoardFrame>
  );
}
