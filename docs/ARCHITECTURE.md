# KidBoard – Architecture

> Engineering docs (plan, ADRs, architecture, progress) are written in English so that
> contributors worldwide can follow them. User-facing docs (README, CONTRIBUTING) are
> bilingual (EN + DE). See [ADR-0001](adr/0001-stack.md).

## Overview

KidBoard is a read-only, icon-first family calendar and meal plan for a wall-mounted
tablet. Parents keep everything in Google Calendar; KidBoard reads the calendars'
**secret iCal addresses** on the server side, normalizes them, and serves a small JSON
API to a kiosk-friendly PWA.

```mermaid
flowchart LR
  subgraph Google["Google Calendar"]
    K["Calendar 'Kinder' (secret iCal URL)"]
    E["Calendar 'Essen' (secret iCal URL)"]
  end

  subgraph Worker["Cloudflare Worker (apps/worker, Hono)"]
    F["fetch feeds<br/>(timeout, size limit)"]
    P["parse + expand<br/>(ical.js: RRULE, EXDATE,<br/>RECURRENCE-ID, VTIMEZONE)"]
    N["normalize<br/>(title conventions,<br/>children, meals)"]
    C[("KV or Cache API<br/>fresh ≈1h<br/>last-good ≈7d")]
    A["/api/agenda<br/>/api/config<br/>/api/health"]
    S["static assets<br/>(apps/web/dist)"]
  end

  subgraph Tablet["Tablet (Fully Kiosk / installed PWA)"]
    SW["Service worker<br/>(app shell precache)"]
    Q["TanStack Query<br/>+ persisted cache (localStorage)"]
    V["Day view / Week view<br/>night mode, wake lock,<br/>burn-in shift"]
  end

  K -- HTTPS --> F
  E -- HTTPS --> F
  F --> P --> N --> C --> A
  A -- JSON --> Q --> V
  S --> SW --> V
```

* iCal URLs are **Worker secrets** (`CAL_<ID>_URL`). They never reach the client bundle,
  logs or fixtures.
* Non-secret settings (children, colors, locale, time zone, day bands, night mode) live
  in one JSON document (`KIDBOARD_CONFIG` variable, shape documented in
  `config.example.json`). The worker validates it and exposes the public part at
  `/api/config`.
* One deployable unit: a single Worker serves the SPA as static assets and handles
  `/api/*` first (`run_worker_first`). See [ADR-0002](adr/0002-hosting.md).

## Repository layout

```
apps/
  web/        Vite + React PWA (UI only, talks to /api)
  worker/     Cloudflare Worker (Hono): feeds → JSON API, serves web/dist
packages/
  shared/     Pure TypeScript: data model, config schema, title parser,
              date helpers. No DOM, no Worker globals. Used by both apps.
docs/         Plan, ADRs, architecture, progress, design hand-off
```

## Data model (TypeScript)

```ts
/** A configured child. Color is a design-token name or a CSS color. */
export interface Child {
  id: string;            // slug, e.g. "mia"
  name: string;          // "Mia" – also the title prefix "Mia: …"
  color: string;         // e.g. "#E4572E" or token "child-1"
  avatar: string;        // emoji, e.g. "🦊"
}

export type CalendarKind = 'events' | 'meals';

/** One configured iCal feed. The URL itself is a secret and never part of this type. */
export interface CalendarSource {
  id: string;            // "kinder", "essen", "mia" … → secret CAL_<ID>_URL
  kind: CalendarKind;
  childId?: string;      // feed belongs to exactly one child (one calendar per child)
  label?: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'unspecified';

/** One concrete occurrence (recurrences are already expanded server-side). */
export interface CalendarEvent {
  id: string;            // stable: `${sourceId}:${uid}:${recurrenceId}` hashed
  sourceId: string;
  title: string;         // display title, emoji and prefixes stripped, plain text
  icon: string;          // leading emoji, or fallback icon
  iconIsFallback: boolean;
  childIds: string[];    // [] = for everyone
  allDay: boolean;
  start: string;         // ISO 8601 with offset (timed) or YYYY-MM-DD (all-day)
  end: string;           // exclusive end, same format as start
  countdown: boolean;    // special event for the "how many sleeps?" countdown
}

export interface Meal {
  id: string;
  sourceId: string;
  date: string;          // YYYY-MM-DD in the configured time zone
  slot: MealSlot;
  title: string;
  icon: string;
  iconIsFallback: boolean;
}

export interface AgendaResponse {
  generatedAt: string;   // ISO timestamp of the underlying data
  timeZone: string;      // e.g. "Europe/Berlin"
  range: { from: string; to: string };  // YYYY-MM-DD, `to` exclusive
  stale: boolean;        // true = at least one source served from last-good cache
  sources: Array<{
    id: string;
    status: 'ok' | 'stale' | 'error';
    fetchedAt?: string;  // when the served data was fetched (absent for 'error')
    truncated?: boolean; // true = recurrence expansion hit a cap (ADR-0003)
  }>;
  events: CalendarEvent[];
  meals: Meal[];
}
```

## Title conventions (parsing rules)

Parsing happens server-side in `packages/shared` (pure function, heavily unit-tested).
Order of operations on the raw `SUMMARY`:

1. Trim; collapse inner whitespace. Treat as **plain text** (never HTML).
2. **Child prefix** – `Name: rest` where `Name` matches a configured child's name
   (case-insensitive, Unicode-aware) or `Alle:` / `All:` / `Everyone:` (= all children).
   Several children: `Mia, Ben: …` or `Mia + Ben: …`. Unknown names are left untouched
   (so `Tipp: …` stays a title).
3. **Meal prefix** (meal calendars only) – `Frühstück:`/`Breakfast:`, `Mittag:`/
   `Mittagessen:`/`Lunch:`, `Abend:`/`Abendessen:`/`Dinner:` (case-insensitive).
   No prefix → `unspecified` slot.
4. **Leading emoji** – the first grapheme cluster, if it is an RGI emoji (incl. ZWJ
   sequences like 👨‍👩‍👧, skin tones like 👋🏽, flags, keycaps), becomes `icon`.
   Detection uses `emoji-regex` on the first `Intl.Segmenter` grapheme.
5. **Fallback icon** – if no emoji: keyword table (DE + EN, e.g. "Kita"→🏫,
   "Geburtstag"/"birthday"→🎂, "Arzt"/"doctor"→🩺), else 📅 for events and 🍽️ for meals.
6. **Countdown flag** – `true` if the icon is in `config.countdown.emojis`
   (default 🎂 🎉 🎁 🎄 🐣 ✈️ 🏖️) or the event description contains `#countdown`.

| Raw `SUMMARY` (calendar) | icon | title | children | slot |
|---|---|---|---|---|
| `⚽ Fußball` (Ben's calendar) | ⚽ | Fußball | ben | – |
| `Mia: 🩰 Ballett` | 🩰 | Ballett | mia | – |
| `Mia, Ben: 🛁 Baden` | 🛁 | Baden | mia, ben | – |
| `🏫 Kita` (Kinder) | 🏫 | Kita | (all) | – |
| `Zahnarzt` | 🦷 (fallback) | Zahnarzt | (all) | – |
| `Mittag: 🍝 Spaghetti` (Essen) | 🍝 | Spaghetti | – | lunch |
| `Dinner: Pizza` (Essen) | 🍕 (fallback) | Pizza | – | dinner |
| `🥣 Müsli` (Essen) | 🥣 | Müsli | – | unspecified |

## Time handling

* All server-side expansion runs in the configured IANA zone (default `Europe/Berlin`);
  output offsets and the `[from, to)` window are in that zone (details: ADR-0003).
* TZIDs that are IANA zones are converted with the runtime tz database (`@date-fns/tz`
  `tzOffset`), whether or not the feed has a `VTIMEZONE` for them; non-IANA TZIDs use the
  feed's `VTIMEZONE` via ical.js; floating times and unknown TZIDs use the configured
  zone. `VTIMEZONE`s are not registered globally in `ICAL.TimezoneService`.
* DST: non-existent local times (spring-forward gap) use the offset before the gap
  (02:30 → 03:30), ambiguous ones (fall-back) the first occurrence (RFC 5545 §3.3.5).
* Recurrences are fast-forwarded where provably equivalent and capped per series and
  per feed (CPU budget, ADR-0003); a hit cap is reported as `truncated`.
* Day boundaries, bands (morning/midday/evening) and "nights until" are computed with
  `@date-fns/tz` (`TZDate`) in the configured zone, not the device zone.
* "Today" (`YYYY-MM-DD` in the configured zone) comes from one shared helper,
  `todayInZone` in `packages/shared` (`@date-fns/tz` `tzOffset`), used by the worker
  window and the client's `range.from`, so both always name the same day.
* All-day events use date-only strings with exclusive end, multi-day events appear on
  every covered day.

## Caching & offline (summary – details in [ADR-0006](adr/0006-caching-offline.md))

| Layer | What | Lifetime |
|---|---|---|
| Worker KV (or Cache API) "fresh" | normalized per-source result for the window | ~1 h (configurable) |
| Worker KV (or Cache API) "last-good" | same entry, after the TTL | ~7 days |
| Service worker (Workbox precache) | app shell, fonts, icons | until next deploy |
| TanStack Query persisted cache | last `/api/agenda` + `/api/config` | 7 days |

The client refetches every `refreshMinutes` (default hourly), on `visibilitychange`/`online`,
and after midnight (new day = new agenda query key, seeded from the cache meanwhile, T-16).

### PWA / service worker (T-14)

`vite-plugin-pwa` (`generateSW`, `registerType: 'autoUpdate'`), options in
`apps/web/pwa/options.ts`. The Workbox precache holds HTML, JS, CSS, the Nunito `woff2`
files and the icons; every navigation outside `/api/*` is answered with the precached
`index.html` (`navigateFallbackDenylist: [/^\/api\//]`), so the shell loads offline after
the first visit. `/api/*` is `NetworkOnly`: no API response and no request carrying the
bearer token ever enters Cache Storage. Manifest: `display: fullscreen`, `orientation:
landscape`, `theme_color` = `--color-accent`, `background_color` = `--color-surface`
(read from `tokens.css` at build time). Icons (any + maskable + Apple + favicon) are
generated on every build by `@vite-pwa/assets-generator` from the original artwork
`apps/web/public/kidboard-icon.svg` (`apps/web/pwa-assets.config.ts`). The app polls for a
new `sw.js` hourly; a new worker activates at once and the page reloads by itself.

### Client data layer (T-13)

`apps/web/src/data/`: typed API client (zod-validated, 15 s timeout > worker's ~11 s
upstream budget, Bearer token from a one-time `?key=`), TanStack Query with the
localStorage persister, `useConfig()`, `useAgenda({ from, days })` and
`useConnectionStatus()` → `loading | ready | offline | stale | error`. A 502 or an
invalid response never replaces shown or persisted data; with data it shows as `stale`,
without data as `error`. A 200 agenda that is worker-stale or has a failed source is
`stale` too. A 401 wipes all calendar data (memory and storage) and the stored token:
status `error`, `useApiErrorKind()` = `unauthorized`. Persisted queries older than 7 days
are dropped. The config `locale` is applied to i18n as soon as the config is
known (fetched or restored). Rules in detail: [ADR-0006](adr/0006-caching-offline.md).

### Clock & day rollover (T-16)

`apps/web/src/time/`: pure logic in `clock.ts` (`startOfMinute`, `msUntilNextMinute`,
`minuteOfDay`, `bandOf(instant, bands, zone)` → `night | morning | midday | evening`,
boundaries belong to the later band, `night` = before `morningStart`), hooks in
`hooks.ts`:

* `useNow()`: current time floored to the minute. One shared `setTimeout` chain
  (`minuteClock.ts`) wakes all consumers at each minute boundary; every delay is
  computed afresh from `Date.now()` (late or throttled timers and system clock jumps
  correct themselves at the next firing, nothing is accumulated). `visibilitychange`
  (visible) and `pageshow` wake it at once, so a tab that slept across midnight shows
  the new day immediately. The timer and listeners exist only while something is
  subscribed.
* `useToday(zone)`: `todayInZone(Date.now(), zone)`; changes exactly at local midnight
  of the config zone (minute boundaries are local minute boundaries for all
  whole-minute offsets), also on DST nights and when the DST change happens at midnight,
  whatever the device zone. Re-renders only when the date changes.
* `useCurrentBand(now, bands, zone)`: `bandOf` memoized for the view.

**Before the config has loaded** the time zone is unknown. KidBoard deliberately gates
instead of guessing a default zone: `useToday`/`useCurrentBand` return `undefined`,
`useTodayAgenda` sends no agenda request (its agenda query stays pending, so the
connection status is `loading`, or `offline` without network), and views show their
loading state. A default such as `Europe/Berlin` would fetch and show the wrong day for
families in other zones and then jump. In practice the gate only applies to the very
first visit (or after 7 days without data): the persisted config is restored at
startup, also offline.

**Rollover:** `useTodayAgenda(days = 8)` = config zone → `useToday` → `useAgenda({ from:
today, days })`. At midnight the new `from` is a new query key, fetched at once. Until
that succeeds the new query is seeded (TanStack `initialData`, `initialDataUpdatedAt: 0`)
from the most recent cached agenda whose range covers the new day, re-scoped to the new
range (`agendaSeed.ts`; same overlap rules as the worker; `range.to` never claims days
the cache does not cover). Only real responses younger than 7 days qualify (the
persister's max-age rule, applied to in-memory data too; seeds never qualify), so over
several offline days each day is seeded from the last real response while it covers
the day. So offline or after a 502 the board keeps showing the last state with status
`offline`/`stale`, never empty or `loading`. A seed is never `ready`: an agenda query
whose data is a seed (`dataUpdatedAt` 0) or ends before `from + days` (from the query
key) counts as `stale` until the real response lands, also while that fetch is still
running online (both rules on purpose: even a seed that covers every requested day is
the last known state, not an answer for the new range). For one render right at the
rollover the status can still show the previous value, until the new query's observer
has subscribed. `initialData` rather than
`placeholderData`: placeholder data disappears once the fetch fails and is invisible to
the cache-based connection status. The seed is marked outdated (`dataUpdatedAt` 0), so it
is refetched regardless of `staleTime` and never persisted (the persister's per-query
7-day check drops it); a 401 wipes it like all agenda data. `useAgenda` waits for the
persisted cache to be restored before it creates the real query, so a reload on a later
day (offline) is seeded from the restored agenda.

### Worker API details (T-10)

- **Window:** per source the worker expands and normalizes a fixed rolling window
  `[today − 1, today + 32)` (config zone; 32 days ahead so countdowns up to 30 days
  ahead are covered, T-19) once per TTL and caches the result; `/api/agenda` only
  filters it. `[from, from + days)` must lie inside the window (`days` ≤ 14), otherwise
  `400`. No on-demand expansion outside it (CPU budget, ADR-0003).
- **Storage (ADR-0006):** one JSON entry per source (validated with the shared zod
  schemas on read) under the key `v1/source/<sourceId>/<hash>`, kept 7 days. It is
  *fresh* while it was expanded for the current window and is younger than the TTL, and
  serves as *last-good* otherwise. `<hash>` = SHA-256 (truncated) of the validated
  config, the source id and the feed URL: a config or URL change starts with an empty
  cache; the URL itself never appears in a key, log or response. Backend: Workers KV
  (`KIDBOARD_CACHE`, auto-provisioned) when bound, else the Cache API (synthetic key
  `https://cache.kidboard.invalid/<key>`; only functional on custom domains). A
  per-isolate memory map (≤ 64 entries) sits in front, and concurrent misses in an
  isolate share one upstream fetch (single flight).
- **KV write budget:** one write per source per refresh. With KV the fresh TTL is at
  least `ceil(sources × 86 400 / 500)` s (half of the Free plan's 1 000 writes/day; e.g.
  2 sources → 346 s); a lower `KIDBOARD_CACHE_TTL` is raised with a log warning.
- **Failures:** non-2xx, timeout (10 s, headers and body), > 5 MB (Content-Length and
  streamed byte count), network errors and `FeedParseError` → the stored entry as
  `stale` (an old entry may cover only part of the requested range, e.g. after several
  days offline), else `error`. Logs contain source ids, secret _names_, reason codes
  and expansion warning codes only. Response `200` if any source is `ok`/`stale`, `502`
  otherwise; `generatedAt` = oldest `fetchedAt` served.
- **Security:** optional `KIDBOARD_ACCESS_TOKEN` (Bearer or `?key=`, SHA-256 +
  `crypto.subtle.timingSafeEqual`); `/api/health` is public and returns only
  `{ ok: true }`. CORS only for `KIDBOARD_ALLOWED_ORIGINS` (preflights are answered before
  the token check). Hono `secureHeaders()` (nosniff, `Referrer-Policy: no-referrer`, …) and
  `Cache-Control: no-store` on every API response (the client owns caching, ADR-0006).
- **Config:** `KIDBOARD_CONFIG` is parsed once per isolate (memoized by raw string);
  invalid → `500 { error: "server_misconfigured" }` and a log line with the validation
  errors.
