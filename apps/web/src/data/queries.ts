import type { AgendaResponse, PublicConfig } from "@kidboard/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { AgendaRange } from "./apiClient";
import { useApiClient } from "./apiContext";
import { refreshIntervalMs } from "./queryClient";
import { queryKeys } from "./queryKeys";

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
 * Midnight rollover (T-16): the caller derives `range.from` from "today" in the config
 * zone. When the day changes, the new `from` is a new query key, so a fetch happens
 * automatically; no extra timer lives here.
 */
export function useAgenda(range: AgendaRange): UseQueryResult<AgendaResponse> {
  const api = useApiClient();
  const config = useConfig();
  const intervalMs = refreshIntervalMs(config.data?.refreshMinutes);
  return useQuery({
    queryKey: queryKeys.agenda(range),
    queryFn: ({ signal }) => api.getAgenda(range, signal),
    refetchInterval: intervalMs,
  });
}
