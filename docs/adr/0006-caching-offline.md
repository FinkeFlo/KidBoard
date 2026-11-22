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
* **Client details** (T-13, `apps/web/src/data/`):
  * `refetchInterval` = `config.refreshMinutes` (60 min until the config is known).
    Midnight: the view derives `range.from` from "today" in the config zone (T-16); a
    new day is a new query key and fetches by itself.
  * Requests time out after 15 s (headers + body). The worker needs up to ~11 s (10 s
    upstream timeout + 1 s flight margin) before it answers with last-good data, so a
    slow upstream still delivers stale data. Network/timeout/5xx/429 errors are retried
    twice; 400, 401, other 4xx and schema-invalid responses are not.
  * Every response is validated with the shared zod schemas. A schema-invalid body and
    **502** (all sources failed; its body has no events) are errors: the query keeps its
    previous data.
  * **401** is not an outage: the token was revoked or is wrong. Every KidBoard query
    drops its data (status `error`, `useApiErrorKind()` = `unauthorized`), so the
    persister writes an empty cache and a revoked device stops showing calendar data,
    and the stored token is forgotten (a new `?key=` link is needed anyway; keeping a
    dead token would only produce more 401s). The persister stores every KidBoard query **with data**,
    also after a failed refetch (TanStack's default persists `success` only, which would
    wipe the last-good agenda on the first 502). Stored queries are reduced to their data
    (no error objects); on restore each query is re-validated and dropped if invalid.
    `maxAge` only checks the client timestamp (refreshed by every save), so each query
    is additionally dropped on save and on restore once its `dataUpdatedAt` is older
    than 7 days (old agenda keys do not pile up).
  * Connection status (`useConnectionStatus`), first match wins: restoring → `loading`;
    a query in use without data: failed → `error`, offline → `offline`, else `loading`;
    offline → `offline`; failed refetch, `AgendaResponse.stale` or any
    `sources[].status === "error"` → `stale`; else `ready`. "Offline" is
    `onlineManager`, seeded from `navigator.onLine` at startup and then driven by
    `online`/`offline` events.
  * The optional access token is taken once from `?key=`, stored under its own
    localStorage key (never in a query key or the persisted cache), removed from the
    visible URL with `history.replaceState`, and sent as `Authorization: Bearer`.
  * localStorage unusable (blocked, quota 0, `null` in WebViews): persistence is off,
    the token lives in memory for the session, the app keeps working online.
* **Service worker:** vite-plugin-pwa `generateSW`, precache the app shell only, `/api/*`
  is `NetworkOnly` in the SW (TanStack owns API caching → no double caching), auto update.

## Consequences
* Offline after first successful load; indicator driven by `navigator.onLine`, query
  error state and `stale` flag.
* KV is eventually consistent (reads may lag up to ~60 s in other locations); an
  isolate that reads an older entry just refreshes once more.
* An old last-good entry covers its own window only, so after several days of failures
  it may cover just part of the requested range.
