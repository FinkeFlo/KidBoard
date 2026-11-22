# ADR-0006: Caching and offline strategy

- Status: accepted
- Date: 2026-11-22

## Context
~1 h staleness is fine. The tablet must keep showing the last state when Wi-Fi or Google
fails, and say so discreetly.

## Options
* Worker: Cache API only / Cache API + KV / KV only. KV used to need an extra namespace
  (account step) for every self-hoster; Wrangler now auto-provisions id-less KV bindings
  on deploy.
* Client: Workbox runtime caching of `/api/*` vs TanStack Query persistence vs both.

## Decision
* **Worker:** per source, store the normalized result for a fixed rolling window
  (`[today − 1, today + 32)`) as one entry, kept 7 days. It is *fresh* while it matches
  the current window and is younger than `KIDBOARD_CACHE_TTL` (default 3600 s); after
  that it is the *last-good* entry. If the upstream fetch fails or the feed is broken,
  serve last-good and mark the source `stale` (and `AgendaResponse.stale = true`).
* **Worker storage backend** (revised in T-10): the Cache API is a no-op on
  `*.workers.dev` (functional only on custom domains), which is the default for
  one-click deploys. Therefore a **Workers KV** binding `KIDBOARD_CACHE` is declared in
  `wrangler.jsonc` *without an id*: Wrangler provisions it automatically on deploy
  (also for dashboard/Git deploys; there the id is only visible in the dashboard) and
  `wrangler dev` / the vitest plugin use a local namespace. When the binding is absent
  the worker falls back to the Cache API. A per-isolate memory map sits in front of
  either backend; concurrent misses share one upstream fetch.
* **KV quota:** the Free plan allows 1 000 writes/day. One write per source per
  refresh, so the fresh TTL is raised to at least `ceil(sources × 86 400 / 500)` s
  (budget 500 writes/day, leaving room for day rollovers and concurrent refreshes in
  other data centers). Failed writes are logged and do not fail the request.
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
* KV is eventually consistent (reads may lag up to ~60 s in other locations); an
  isolate that reads an older entry just refreshes once more.
* An old last-good entry covers its own window only, so after several days of failures
  it may cover just part of the requested range.
