import type { AgendaResponse, PublicConfig } from "@kidboard/shared";
import {
  skipToken,
  useIsRestoring,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useToday } from "../time/hooks";
import { seedAgenda } from "./agendaSeed";
import type { AgendaRange } from "./apiClient";
import { useApiClient } from "./apiContext";
import { refreshIntervalMs } from "./queryClient";
import { queryKeys } from "./queryKeys";

/** Days the board requests from today on (worker default; covers the week view). */
export const AGENDA_DAYS = 8;

/**
 * `/api/config`. Refetched every `refreshMinutes` (60 until known), on focus and
 * reconnect; restored from the persisted cache while offline.
 */
export function useConfig(): UseQueryResult<PublicConfig> {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.config(),
    queryFn: ({ signal }) => api.getConfig(signal),
    refetchInterval: (query) =>
      refreshIntervalMs(query.state.data?.refreshMinutes),
  });
}

/**
 * `/api/agenda` for `range`, refetched every `config.refreshMinutes`, on focus
 * (`visibilitychange`) and reconnect (`online`). On a failed refetch the previous data
 * stays (`data` defined, `isError` true); `useConnectionStatus` turns that into
 * `stale`.
 *
 * `range` `undefined` (not known yet, e.g. before the config has loaded) and the time
 * while the persisted cache is restored use a pending query that never fetches; the
 * connection status counts it as a needed agenda without data (`loading`/`offline`).
 *
 * Midnight rollover (T-16): the caller derives `range.from` from "today" in the config
 * zone ({@link useTodayAgenda}). A new day is a new query key, which fetches at once.
 * Until that fetch succeeds (offline, 502, slow network) the new query is seeded from a
 * cached agenda covering the new day, re-scoped to the new range (`seedAgenda`).
 *
 * The seed is TanStack `initialData` rather than `placeholderData` on purpose:
 * placeholder data is only shown while the query is `pending` and disappears once the
 * fetch fails (e.g. a 502 right after midnight), and the connection status reads the
 * query cache, where placeholder data does not exist. `initialDataUpdatedAt: 0` marks
 * the seed as outdated: the new range is always fetched immediately (regardless of
 * `staleTime`), and the seed is never written to storage (the persister drops data
 * older than 7 days), so only real responses are persisted. A 401 wipes the seed like
 * any other agenda data.
 */
export function useAgenda(
  range: AgendaRange | undefined,
): UseQueryResult<AgendaResponse> {
  const api = useApiClient();
  const client = useQueryClient();
  const config = useConfig();
  // Seeding needs the restored cache, so the real query starts after restoring.
  const restoring = useIsRestoring();
  const active = restoring ? undefined : range;
  const intervalMs = refreshIntervalMs(config.data?.refreshMinutes);
  return useQuery({
    queryKey:
      active === undefined
        ? queryKeys.agendaPending()
        : queryKeys.agenda(active),
    queryFn:
      active === undefined
        ? skipToken
        : ({ signal }) => api.getAgenda(active, signal),
    initialData:
      active === undefined ? undefined : () => seedAgenda(client, active),
    initialDataUpdatedAt: 0,
    refetchInterval: intervalMs,
  });
}

export interface TodayAgenda {
  /** Config zone, `undefined` until the config is known. */
  timeZone: string | undefined;
  /** Today (`YYYY-MM-DD`) in the config zone, `undefined` until the config is known. */
  today: string | undefined;
  agenda: UseQueryResult<AgendaResponse>;
}

/**
 * The agenda from today (config zone) for `days` days. Before the config has loaded
 * the zone is unknown: `today` is `undefined` and the agenda stays pending (no request
 * with a guessed zone). At local midnight `today` changes and the new range is fetched
 * (seeded from the cache meanwhile, see {@link useAgenda}).
 */
export function useTodayAgenda(days: number = AGENDA_DAYS): TodayAgenda {
  const timeZone = useConfig().data?.timeZone;
  const today = useToday(timeZone);
  const agenda = useAgenda(
    today === undefined ? undefined : { from: today, days },
  );
  return { timeZone, today, agenda };
}
