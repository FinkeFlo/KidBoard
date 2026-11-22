import { AgendaResponseSchema, AppConfigSchema } from "@kidboard/shared";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { DehydratedState, Query } from "@tanstack/react-query";
import {
  type PersistedClient,
  type Persister,
  type PersistQueryClientOptions,
  removeOldestQuery,
} from "@tanstack/react-query-persist-client";
import { z } from "zod";

import { PERSIST_MAX_AGE_MS } from "./queryClient";
import { queryKindOf } from "./queryKeys";
import type { KeyValueStorage } from "./storage";

/** localStorage key of the persisted query cache. */
export const PERSIST_STORAGE_KEY = "kidboard.queryCache";
/**
 * Bump when the persisted shape changes incompatibly (query keys, schemas). Together
 * with the app version it forms the `buster`: a mismatch discards the persisted cache.
 */
export const PERSIST_SCHEMA_VERSION = 1;
export const PERSIST_BUSTER = `${__APP_VERSION__}+cache${String(PERSIST_SCHEMA_VERSION)}`;

/**
 * Persist every KidBoard query that has data, also when its last refetch failed.
 * TanStack's default persists `status === "success"` only, which would drop the
 * last-good agenda from storage on the first failed refetch (e.g. a 502).
 */
export function shouldPersistQuery(query: Query): boolean {
  return (
    queryKindOf(query.queryKey) !== undefined && query.state.data !== undefined
  );
}

type DehydratedQuery = DehydratedState["queries"][number];

/**
 * A persisted query reduced to its data: `status: "success"`, no error, idle. Errors
 * are never written to storage (they are runtime state; a restored query refetches
 * anyway because its data is older than `staleTime`).
 */
function cleanQuery(
  query: Pick<DehydratedQuery, "queryKey" | "queryHash" | "dehydratedAt">,
  data: unknown,
  dataUpdatedAt: number,
  dataUpdateCount: number,
): DehydratedQuery {
  return {
    queryKey: query.queryKey,
    queryHash: query.queryHash,
    dehydratedAt: query.dehydratedAt,
    state: {
      data,
      dataUpdateCount,
      dataUpdatedAt,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: "success",
      fetchStatus: "idle",
    },
  };
}

/**
 * `maxAge` only checks the client timestamp, which every save refreshes, and hydrate
 * restarts `gcTime`: without this per-query check old agenda keys would live forever.
 */
export function isWithinMaxAge(
  dataUpdatedAt: number,
  now = Date.now(),
): boolean {
  return now - dataUpdatedAt <= PERSIST_MAX_AGE_MS;
}

/** JSON for storage: KidBoard queries with data younger than 7 d, error state stripped. */
export function serializePersistedClient(client: PersistedClient): string {
  const queries = client.clientState.queries.flatMap((query) =>
    queryKindOf(query.queryKey) !== undefined &&
    query.state.data !== undefined &&
    isWithinMaxAge(query.state.dataUpdatedAt)
      ? [
          cleanQuery(
            query,
            query.state.data,
            query.state.dataUpdatedAt,
            query.state.dataUpdateCount,
          ),
        ]
      : [],
  );
  return JSON.stringify({
    timestamp: client.timestamp,
    buster: client.buster,
    clientState: { queries, mutations: [] },
  } satisfies PersistedClient);
}

const StoredClientSchema = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({
    queries: z.array(
      z.object({
        queryKey: z.array(z.unknown()),
        queryHash: z.string(),
        dehydratedAt: z.number(),
        state: z.object({
          data: z.unknown(),
          dataUpdatedAt: z.number(),
          dataUpdateCount: z.number(),
        }),
      }),
    ),
  }),
});

/**
 * Parses stored JSON. Every query's data is re-validated with the shared zod schema
 * (storage may be stale or tampered with); invalid queries and queries whose data is
 * older than 7 days are dropped individually.
 * A structurally broken blob throws, which makes TanStack discard it.
 */
export function deserializePersistedClient(raw: string): PersistedClient {
  const stored = StoredClientSchema.parse(JSON.parse(raw));
  const queries = stored.clientState.queries.flatMap((query) => {
    const kind = queryKindOf(query.queryKey);
    const parsed =
      kind === "config"
        ? AppConfigSchema.safeParse(query.state.data)
        : kind === "agenda"
          ? AgendaResponseSchema.safeParse(query.state.data)
          : undefined;
    return parsed?.success === true && isWithinMaxAge(query.state.dataUpdatedAt)
      ? [
          cleanQuery(
            query,
            parsed.data,
            query.state.dataUpdatedAt,
            query.state.dataUpdateCount,
          ),
        ]
      : [];
  });
  return {
    timestamp: stored.timestamp,
    buster: stored.buster,
    clientState: { queries, mutations: [] },
  };
}

/** Persister on `storage` (localStorage); a no-op without storage. */
export function createPersister(
  storage: KeyValueStorage | undefined,
): Persister {
  return createAsyncStoragePersister({
    storage,
    key: PERSIST_STORAGE_KEY,
    serialize: serializePersistedClient,
    deserialize: deserializePersistedClient,
    // Quota exceeded: drop the oldest query and try again.
    retry: removeOldestQuery,
  });
}

/** `persistOptions` for `PersistQueryClientProvider` (ADR-0006). */
export function createPersistOptions(
  storage: KeyValueStorage | undefined,
): Omit<PersistQueryClientOptions, "queryClient"> {
  return {
    persister: createPersister(storage),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: PERSIST_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}
