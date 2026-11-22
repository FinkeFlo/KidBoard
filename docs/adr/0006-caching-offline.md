# ADR-0006: Caching and offline strategy

- Status: accepted
- Date: 2026-11-22

## Context
~1 h staleness is fine. The tablet must keep showing the last state when Wi-Fi or Google
fails, and say so discreetly.

## Options
* Worker: Cache API only / Cache API + KV / KV only. KV needs an extra namespace
  (account step) for every self-hoster.
* Client: Workbox runtime caching of `/api/*` vs TanStack Query persistence vs both.

## Decision
* **Worker:** per source, store the normalized result in the Cache API under a
  synthetic key: a *fresh* entry (`max-age` = `KIDBOARD_CACHE_TTL`, default 3600 s) and a
  *last-good* entry (7 days). If the upstream fetch fails or the feed is broken, serve
  last-good and mark the source `stale` (and `AgendaResponse.stale = true`). Optional KV
  binding may be added later without API change.
* **Client:** TanStack Query with `PersistQueryClientProvider` +
  `createAsyncStoragePersister({ storage: window.localStorage })`, `gcTime`/`maxAge`
  7 days, `staleTime` 15 min, `refetchInterval` 60 min, refetch on window focus and
  reconnect, extra refetch after midnight. Persisted data is versioned (`buster` = app
  version + schema version).
* **Service worker:** vite-plugin-pwa `generateSW`, precache the app shell only, `/api/*`
  is `NetworkOnly` in the SW (TanStack owns API caching → no double caching), auto update.

## Consequences
* Offline after first successful load; indicator driven by `navigator.onLine`, query
  error state and `stale` flag.
