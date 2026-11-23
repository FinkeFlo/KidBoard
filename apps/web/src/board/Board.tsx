import { useCallback, useMemo, useState } from "react";

import { buildCountdown } from "../countdown/buildCountdown";
import { CountdownBadge } from "../countdown/CountdownBadge";
import {
  useApiErrorKind,
  useConfig,
  useConnectionStatus,
  useTodayAgenda,
} from "../data";
import { buildOverviewModel } from "../day/buildOverviewModel";
import { DayError, type DayErrorKind, DayLoading } from "../day/DayStates";
import { OverviewBoard } from "../day/OverviewBoard";
import { formatTime, useFormatContext } from "../i18n/format";
import { useNightTheme } from "../theme";
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
 * The board: the four-day overview ("Today") or the week view inside the shared
 * {@link BoardFrame}. Until the config
 * (time zone, bands) and the agenda are known it shows the loading skeleton; without
 * any data a failure shows {@link DayError}. With data (also stale or offline) the board
 * stays up and only the discreet banner reports it.
 * The week view returns to the overview after `config.autoReturnSeconds` of inactivity.
 * The "How many sleeps?" countdown (T-19) sits in the header: full on the week view, a
 * compact badge on the overview; it is built from the same agenda query (31 days), whose
 * `dataUpdatedAt` is the rail's "Stand" time.
 */
export function Board(): React.JSX.Element {
  const config = useConfig().data;
  const { today, agenda } = useTodayAgenda();
  const now = useNow();
  useNightTheme(config?.nightMode, config?.timeZone);
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
            overview: buildOverviewModel(data, config, today, now),
            week: buildWeekModel(data, config, today, now),
            countdown: buildCountdown(data.events, today, config.timeZone),
          },
    [config, today, data, now],
  );

  if (config === undefined || today === undefined || models === undefined) {
    const kind = errorKindOf(status, apiError);
    return kind === undefined ? (
      <DayLoading />
    ) : (
      <DayError kind={kind} apiError={apiError} />
    );
  }
  return (
    <BoardFrame
      today={today}
      childList={config.children}
      format={format}
      view={view}
      onViewChange={setView}
      updatedAt={agenda.dataUpdatedAt}
      countdown={
        models.countdown === undefined ? undefined : (
          <CountdownBadge
            countdown={models.countdown}
            childList={config.children}
          />
        )
      }
    >
      {view === "day" ? (
        <OverviewBoard
          model={models.overview}
          childList={config.children}
          format={format}
          nowTime={formatTime(now, format)}
        />
      ) : (
        <WeekBoard
          days={models.week}
          childList={config.children}
          format={format}
          countdown={models.countdown}
        />
      )}
    </BoardFrame>
  );
}
