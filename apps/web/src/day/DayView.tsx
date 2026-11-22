import { useMemo } from "react";

import {
  useApiErrorKind,
  useConfig,
  useConnectionStatus,
  useTodayAgenda,
} from "../data";
import { useFormatContext } from "../i18n/format";
import { useNow } from "../time";
import { buildDayModel } from "./buildDayModel";
import { DayBoard } from "./DayBoard";
import { DayError, type DayErrorKind, DayLoading } from "./DayStates";

function errorKindOf(
  status: ReturnType<typeof useConnectionStatus>,
  apiError: ReturnType<typeof useApiErrorKind>,
): DayErrorKind | undefined {
  if (apiError === "unauthorized") return "unauthorized";
  if (status === "error") return "failed";
  if (status === "offline") return "offline";
  return undefined;
}

/**
 * Today's board. Until the config (time zone, bands) and the agenda are known it shows
 * the loading skeleton; without any data a failure shows {@link DayError}. With data
 * (also stale or offline) the board stays up and only the discreet banner reports it.
 */
export function DayView(): React.JSX.Element {
  const config = useConfig().data;
  const { today, agenda } = useTodayAgenda();
  const now = useNow();
  const status = useConnectionStatus();
  const apiError = useApiErrorKind();
  const data = agenda.data;
  const timeZone = config?.timeZone ?? "UTC";
  const format = useFormatContext(timeZone);
  const model = useMemo(
    () =>
      config === undefined || today === undefined || data === undefined
        ? undefined
        : buildDayModel(data, config, today, now),
    [config, today, data, now],
  );

  if (config === undefined || today === undefined || model === undefined) {
    const kind = errorKindOf(status, apiError);
    return kind === undefined ? <DayLoading /> : <DayError kind={kind} />;
  }
  return (
    <DayBoard
      model={model}
      today={today}
      childList={config.children}
      format={format}
    />
  );
}
