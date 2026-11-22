# KidBoard – Plan

This plan is binding (see `CLAUDE.md`). Tasks are worked in order. Changes only via an
entry in the change log at the bottom and a dedicated `docs(plan): …` commit.

Risk drives model choice: **low/medium → Sonnet builder/reviewer, high → Opus
builder/reviewer** (`builder-opus` / `reviewer-opus`).

## Goal

Children aged ~3–8 (many cannot read yet) see on a wall tablet, at a glance from 1–3 m,
what happens today and in the next days and what there is to eat. Parents maintain
everything in Google Calendar. Icons first, text second. Calm, warm, robust in kiosk
operation, works offline with the last known state.

## Non-goals (MVP)

* Editing events on the tablet, write access to Google, Google OAuth.
* Accounts, databases, multi-family hosting.
* Copying anything from daely-shop.com (texts, graphics, names, layouts).
* Routines, parent PIN, weather (→ M7+).
* Portrait layout and phones (should not break, but not designed for).

## Definition of Done (every task)

* All acceptance criteria demonstrably met; reviewer verdict `PASS`.
* `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build` green locally.
* New/changed behavior covered by meaningful tests. No skipped tests, no disabled lint
  rules, no `any` without a justifying comment.
* All UI strings via i18n (DE + EN). No secrets anywhere in the repo.
* Docs touched where behavior is user-visible.

---

## M0 – Repository setup

- [x] **T-00 Planning & agent setup** (risk: medium) – `docs/PLAN.md`, `docs/ARCHITECTURE.md`,
  ADRs 0001–0009, `docs/PROGRESS.md`, `CLAUDE.md`, `.claude/agents/*`, `.claude/settings.json`.
  *Done by orchestrator (Opus) in Phase 0.*

- [x] **T-01 Workspace scaffold** (risk: medium, deps: T-00)
  Goal: pnpm monorepo with `apps/web`, `apps/worker`, `packages/shared` that builds.
  Acceptance:
  1. Root `package.json` with `packageManager: pnpm@10.x`, `engines.node`, scripts
     `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `format`, `format:check`;
     `pnpm-workspace.yaml`; `.nvmrc` + `.node-version` (Node 22 LTS).
  2. `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`,
     `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; per-package tsconfigs; root
     `typecheck` covers all packages.
  3. `packages/shared` exports a placeholder (e.g. `APP_NAME`) consumed by both apps.
  4. `apps/web`: Vite + React 19 + TS renders a placeholder page; `pnpm build` emits
     `apps/web/dist`.
  5. `apps/worker`: Hono app with `GET /api/health` → `{ ok: true }`; `wrangler.jsonc` with
     static assets pointing at `../web/dist`, `not_found_handling: "single-page-application"`,
     `run_worker_first: ["/api/*"]`; `wrangler deploy --dry-run` succeeds.
  6. `.gitignore` covers `node_modules`, `dist`, `.wrangler`, `.env*` except `.env.example`,
     `.dev.vars*` except `.dev.vars.example`, Playwright output.

- [x] **T-02 Lint, format, git hooks** (risk: low, deps: T-01)
  Acceptance:
  1. ESLint 9 flat config per ADR-0007 incl. `react/no-danger` as error; `pnpm lint` green.
  2. Prettier + Tailwind plugin; `pnpm format:check` green; `.editorconfig`.
  3. lefthook: pre-commit runs Prettier + ESLint on staged files; commit-msg runs commitlint
     (conventional). Installed via `prepare` script; documented in CONTRIBUTING later.
  4. A deliberately bad commit message is rejected (shown in review via
     `pnpm exec commitlint` on a sample).

- [x] **T-03 Test setup** (risk: low, deps: T-01)
  Acceptance:
  1. Vitest projects for `shared` (node), `web` (jsdom + Testing Library + jest-dom
     matchers), `worker` (`@cloudflare/vitest-plugin`). `pnpm test` runs all.
  2. One real test per package (not just `expect(true)`).
  3. Playwright config (Chromium; projects `tablet-1280x800`, `tablet-2000x1200`) starting
     the built app via `vite preview` with API mocked by route interception; one smoke
     test asserting the placeholder page renders. `pnpm test:e2e` runs it.
  4. `fixtures/ics/` with synthetic `.ics` files (README states: synthetic only, never real
     URLs or personal data).

- [x] **T-04 CI, release, dependency updates** (risk: high, deps: T-02, T-03)
  Acceptance:
  1. `.github/workflows/ci.yml` on push/PR to `main`: checkout, pnpm setup, Node from
     `.nvmrc`, install with cache (`--frozen-lockfile`), lint, format:check, typecheck,
     test, build, Playwright smoke (install Chromium with deps), upload Playwright report on
     failure. Minimal `permissions`.
  2. Secret scan job with gitleaks (full history checkout) + `.gitleaks.toml` allowlisting
     nothing but fixtures paths if necessary.
  3. All third-party actions pinned to full commit SHAs with `# vX.Y.Z` comments.
  4. release-please workflow + config/manifest (`release-type: node`, root package) →
     `CHANGELOG.md` on release.
  5. `.github/dependabot.yml`: npm + github-actions, weekly, grouped.
  6. CI run on GitHub for the pushed commit is green.

- [x] **T-05 Community & config files** (risk: low, deps: T-01)
  Acceptance:
  1. `LICENSE` (MIT, © 2026 FinkeFlo), `README.md` (EN) + `README.de.md` (DE) skeleton with
     language switch links, feature list, screenshot placeholders, sections stubbed for
     setup/deploy/kiosk (filled in T-27).
  2. `CONTRIBUTING.md` (EN + DE section), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
     `SECURITY.md` (private reporting via GitHub Security Advisories).
  3. `.github/ISSUE_TEMPLATE/` bug + feature as **Issue Forms** (YAML) with DE/EN labels,
     `config.yml`; `.github/pull_request_template.md`; `.github/CODEOWNERS` (`* @FinkeFlo`).
  4. `.env.example` / `apps/worker/.dev.vars.example` and `config.example.json` with every
     option described (comments via accompanying `docs/CONFIG.md` since JSON has no comments).
  5. `docs/design/README.md` explaining the Claude Design hand-off (tokens, screens).

**M0 exit:** empty skeleton green locally and in CI; milestone review by `reviewer-opus`.

## M1 – Worker + iCal parsing

- [x] **T-06 Shared data model & config schema** (risk: medium, deps: M0)
  Acceptance:
  1. Types + zod schemas for `Child`, `CalendarSource`, `CalendarEvent`, `Meal`,
     `AgendaResponse`, `AppConfig` in `packages/shared` exactly as in ARCHITECTURE.md
     (TS types inferred from or checked against schemas).
  2. `AppConfig`: `locale` (`de` | `en` | `auto`), `timeZone` (validated IANA name via
     `Intl.supportedValuesOf` or `Intl.DateTimeFormat` probe), `children[]` (≥ 0, unique ids,
     color, avatar), `calendars[]` (unique ids, kind, optional `childId` referencing a child),
     `bands` (`morningStart`, `middayStart`, `eveningStart`, `HH:mm`, ascending),
     `nightMode` (`enabled`, `start`, `end`), `countdown.emojis`, `refreshMinutes`,
     `autoReturnSeconds` (default 120).
     Sensible defaults for everything except `calendars`.
  3. `parseConfig(json)` returns typed config or a readable error list; unit tests for
     valid/invalid examples; `config.example.json` validates in a test.
  4. Public config DTO excludes nothing secret (URLs are not part of the config at all).

- [x] **T-07 Title parser** (risk: medium, deps: T-06)
  Acceptance: pure `parseTitle(raw, { kind, children, countdownEmojis, description })`
  implementing ARCHITECTURE.md rules 1–6, with table-driven tests for at least:
  1. simple leading emoji (`⚽ Fußball`), emoji without space (`⚽Fußball`);
  2. ZWJ sequence 👨‍👩‍👧, skin tone 👋🏽, flag 🇩🇪, keycap 1️⃣, emoji with VS16 ☀️;
  3. emoji not at start stays in title; text-only symbols (`©`, digits) are not icons;
  4. `Name:` prefix (case-insensitive, umlauts e.g. `Jürgen:`), multiple names
     (`Mia, Ben:` / `Mia + Ben:`), `Alle:`/`All:`, unknown prefix untouched;
  5. meal prefixes DE + EN incl. `Mittagessen:`, `Abendessen:`, case-insensitive;
     prefix + emoji combos in either order (`Mittag: 🍝 Spaghetti`, `🍝 Mittag: Spaghetti`);
  6. fallback icons from keyword table (DE + EN) and default fallback;
  7. countdown flag via emoji list and `#countdown` in description;
  8. empty/whitespace-only titles → localized-neutral placeholder flag, not a crash;
  9. HTML-looking titles (`<img src=x onerror=…>`) are returned verbatim as text.

- [x] **T-08 iCal parsing & recurrence expansion** (risk: **high** → Opus, deps: T-06)
  Goal: `expandCalendar(icsText, { from, to, timeZone })` → occurrences
  (`uid`, `recurrenceId`, `summary`, `description`, `start`, `end`, `allDay`).
  Acceptance (each with a synthetic fixture in `fixtures/ics/`):
  1. single timed event; all-day single day; all-day multi-day (exclusive DTEND);
     timed event spanning midnight;
  2. weekly RRULE with EXDATE; RRULE with COUNT and UNTIL; RDATE;
  3. moved single occurrence via RECURRENCE-ID (new time, and moved to another day);
     cancelled occurrence (`STATUS:CANCELLED` override) is dropped;
  4. DST: weekly 08:00 Europe/Berlin event across last Sunday in March and October keeps
     08:00 local; event at 02:30 on spring-forward day handled deterministically;
  5. TZID from feed VTIMEZONE; UTC (`Z`) times; floating times interpreted in config zone;
     event in another zone (America/New_York) converted correctly;
  6. only occurrences overlapping `[from, to)` returned; iteration cap prevents runaway
     rules (test with an unbounded `FREQ=MINUTELY`… capped, no hang);
  7. empty VCALENDAR → `[]`; malformed/non-ICS input → typed `FeedParseError`, no throw
     leaks raw content;
  8. works inside the Workers runtime (test runs in `@cloudflare/vitest-plugin`); fixtures are
     loaded via Vite `?raw` imports (no `fs` in workerd) with an ambient module declaration.

- [x] **T-09 Normalization** (risk: medium, deps: T-07, T-08)
  Acceptance:
  1. `normalize(occurrences, source, config)` → `CalendarEvent[]` / `Meal[]` using the title
     parser; `childIds` from source `childId` ∪ title prefix.
  2. Meals: all-day events in `meals` sources; multi-day meal events produce one `Meal` per
     day; timed meal events are assigned to a slot by band times if no prefix.
  3. Stable ids (hash of source, uid, recurrence id) – identical across runs.
  4. Output sorted (all-day first, then by start, then title) and validated against the zod
     schema in tests.

- [x] **T-10 Worker API** (risk: **high** → Opus, deps: T-09)
  Acceptance:
  1. `GET /api/agenda?from=YYYY-MM-DD&days=N` (1 ≤ N ≤ 31, raised from 14 in T-19; default 8;
     `from` default today in config zone) returns `AgendaResponse`; input validated → 400 on bad input.
  2. `GET /api/config` returns the public config; `GET /api/health` returns status without
     secrets.
  3. Feeds fetched in parallel with timeout (10 s) and size limit (5 MB); per-source fresh
     cache (TTL from `KIDBOARD_CACHE_TTL`, default 3600 s) and last-good cache (7 d) via
     KV (`KIDBOARD_CACHE`, auto-provisioned) with Cache API/memory fallback; on upstream failure the last-good data is served with
     `status: 'stale'`, `stale: true`; no data at all → `status: 'error'` for that source,
     still 200 for the response if any source succeeded, 502 otherwise.
  4. Secrets read from env `CAL_<ID>_URL`; never logged, never in responses or error
     messages (test asserts the URL string is absent from all responses and console output).
  5. Optional `KIDBOARD_ACCESS_TOKEN`: if set, `/api/*` requires
     `Authorization: Bearer <token>` or `?key=<token>` (constant-time compare) → 401 otherwise.
  6. CORS only for origins in `KIDBOARD_ALLOWED_ORIGINS` (default none; same-origin works
     without CORS). Security headers on API responses (`X-Content-Type-Options`,
     `Cache-Control` appropriate, `Content-Type: application/json`).
  7. Typed `Env` bindings (`CAL_*_URL`, `KIDBOARD_*`) for the Hono app.
  8. Integration tests in `@cloudflare/vitest-plugin` with mocked upstream `fetch` serving
     fixtures: happy path, upstream 500 with/without last-good, timeout, invalid config.

**M1 exit:** milestone review (`reviewer-opus`), CI green.

## M2 – App skeleton, i18n, data, PWA

- [x] **T-11 Web shell & design tokens** (risk: medium, deps: M1)
  Acceptance:
  1. Tailwind 4 via `@tailwindcss/vite`; all colors, radii, spacing, shadows, font sizes,
     motion durations defined as CSS variables in `apps/web/src/styles/tokens.css` and
     exposed through `@theme`; components use only token-based utilities (placeholder
     child-friendly theme; light + night token sets).
  2. Child palette of ≥ 6 color-blind-friendly colors as tokens; text/background pairs meet
     WCAG AA (unit test computing contrast ratios of token pairs).
  3. Nunito via Fontsource, self-hosted.
  4. Layout scales fluidly between 1280×800 and 2000×1200 without scrolling (root font size
     from viewport); `prefers-reduced-motion` disables transitions.
  5. App-level error boundary with friendly fallback.
  7. `pnpm dev` works on a fresh clone (worker needs `apps/web/dist`: predev build or placeholder; documented).
  6. Split `apps/web` tsconfig: browser code without Node types; a separate
     `tsconfig.node.json` for vite/vitest/playwright configs and e2e.

- [x] **T-12 i18n** (risk: low, deps: T-11)
  Acceptance:
  1. i18next + react-i18next, bundled `de` / `en` resources, typed keys.
  2. Language: config `locale` → else browser language → else `de`; `<html lang>` updated;
     docs/CONFIG.md `auto` fallback aligned.
  3. Test: both locales have identical key sets and no empty values.
  4. Date/time formatting helpers use the active locale and configured time zone.
  5. Lint/test guard against hard-coded UI strings in JSX (e.g. `i18next/no-literal-string`
     or equivalent check) – no exceptions except emoji.

- [x] **T-13 Data layer** (risk: **high** → Opus, deps: T-10, T-12)
  Acceptance:
  1. Typed API client (`/api/config`, `/api/agenda`) validating responses with shared zod
     schemas; access token read once from `?key=` and stored locally, sent as Bearer header.
  2. TanStack Query + `PersistQueryClientProvider` with localStorage persister per ADR-0006
     (`buster` versioned, `maxAge` 7 d, `staleTime` 15 min, `refetchInterval` =
     `config.refreshMinutes`, refetch on focus/reconnect).
  3. `useAgenda(range)` and `useConnectionStatus()` exposing
     `loading | ready | offline | stale | error` deterministically (unit tests for each).
  5. Client request timeout > worker upstream timeout + margin (≈ 11 s), so stale data can arrive.
  4. Tests with MSW or fetch mocks: first load, refetch, offline with persisted data,
     schema-invalid response treated as error without wiping persisted data.

- [x] **T-14 PWA** (risk: **high** → Opus, deps: T-11)
  Acceptance:
  1. vite-plugin-pwa (`generateSW`, `registerType: 'autoUpdate'`), manifest (name, short
     name, `display: fullscreen`, `orientation: landscape`, theme/background colors from
     tokens, maskable + any icons generated from an original SVG).
  2. Precache app shell + fonts; `/api/*` `NetworkOnly` in SW.
  3. Built app passes Lighthouse-style installability checks (manifest + SW present –
     verified in a Playwright test reading the manifest and SW registration).
  4. App shell loads offline after first visit (Playwright offline test).

**M2 exit:** milestone review, CI green.

## M3 – Day view

- [x] **T-15 Core components** (risk: medium, deps: M2)
  Acceptance: `Emoji` (ADR-0009, `role="img"`, `aria-label` from title), `EventTile`
  (icon large, title small, time small, child color edge + avatar dots, past/current/all-day
  variants, long titles clamp to 2 lines), `MealCard`, `ChildLegend`, `StatusBanner`
  (offline/stale/error, discreet). Component tests incl. a11y roles; touch targets ≥ 64 px;
  titles rendered as text (XSS test with HTML-looking title).
  M2 follow-ups: `StatusBanner`/error state distinguishes `useApiErrorKind() === "unauthorized"`
  (parent-readable "access link expired, open the new `?key=` link", de + en); move
  `AppErrorBoundary` above `DataProvider` in `main.tsx`.

- [x] **T-16 Clock & day rollover** (risk: **high** → Opus, deps: T-12)
  Acceptance:
  1. `useNow()` ticks each minute aligned to the minute boundary; `useToday()` derives the
     date in the configured zone and changes exactly at local midnight without reload.
  2. Midnight rollover triggers an agenda refetch for the new range.
  3. Tests with fake timers: normal midnight, DST spring-forward and fall-back nights,
     device zone ≠ config zone, tab sleeping across midnight (`visibilitychange`).
  4. Current-band computation tested at band boundaries.
  5. (M2 follow-up) Shared, runtime-agnostic "today as `YYYY-MM-DD` in zone" helper in
     `packages/shared`, used by worker and web so `range.from` matches the worker window.
  6. (M2 follow-up) Midnight while offline: `useAgenda` gets placeholder data from a cached
     agenda whose range covers the new day; status stays `offline`/`stale`, never empty/`loading`.
  7. (M2 follow-up) Documented behaviour before the config (time zone) has loaded.

- [x] **T-17 Day view** (risk: medium, deps: T-15, T-16)
  Acceptance:
  1. Header: localized weekday + date large.
  2. Three bands morning/midday/evening (config boundaries, symbols 🌅 ☀️ 🌙), events placed
     by start time; all-day events in a top row; multi-day events shown on each day.
  3. Current band highlighted, past bands and past events visibly receded.
  4. Today's meals (breakfast/lunch/dinner/unspecified) visible without scrolling.
  5. States: loading skeleton, empty day ("Heute ist nichts geplant" with friendly emoji
     illustration), offline/stale banner, error state (parent-readable, child-calm).
  6. Fits 1280×800 and 2000×1200 with 8 events + 3 meals without scrolling (Playwright).
  7. (M2 follow-up) `formatTime` throws for date keys: only call it for timed events
     (`allDay === false`); format helpers need ISO instants with offset or `YYYY-MM-DD`.

**M3 exit:** milestone review, CI green.

## M4 – Week view, countdown, meal plan

- [x] **T-18 Week view & navigation** (risk: medium, deps: M3)
  Acceptance:
  1. Next 7 days (today first) side by side; each column: weekday, up to 3 most important
     icons (+N indicator), the day's meals compact; weekend visually distinct.
  2. Meal plan is integrated into the week columns (decision recorded in PLAN change log
     rationale: no extra screen, one glance).
  3. Big pictorial toggle (☀️ day / 🗓️ week) ≥ 64 px, understandable without reading,
     accessible names via i18n.
  4. Auto-return to day view after `config.autoReturnSeconds` (default 120 s) of
     inactivity.
  5. (M3 follow-ups) Header (date, status banner, child legend) moves out of `DayBoard` into a
     shared board frame for day + week; `buildDayModel` reused per column (rename `today` →
     `date`). Continuing multi-day timed events get a "continues" hint instead of the
     original start time.

- [x] **T-19 "How many sleeps?" countdown** (risk: medium, deps: T-18, T-16)
  Acceptance:
  1. Picks the nearest upcoming `countdown` event within 30 days.
  2. Nights = calendar-day difference in configured zone (event today → 0 → "today!"
     state; tomorrow → 1 moon).
  3. Rendered as countable 🌙 symbols (≤ 14 shown individually, beyond that grouped with a
     number) plus an accessible localized label with plural rules (DE/EN).
  4. Shown on week view and as a compact badge on the day view. DST-crossing tests.
  5. (M3 review, structural) Data: `/api/agenda` `days` limit raised from 14 to 31 (still inside
     the worker window `[today−1, today+32)`) and the client `AGENDA_DAYS` raised from 8 to 31, so
     day, week and countdown share one query, status and offline seed. Worker tests, ARCHITECTURE
     "Worker API details" and T-10 wording updated accordingly.

**M4 exit:** milestone review, CI green.

## M5 – Kiosk features

- [x] **T-20 Wake lock & fullscreen** (risk: medium, deps: M4)
  Acceptance: Screen Wake Lock requested when visible and re-acquired on
  `visibilitychange`; graceful no-op where unsupported; small, unobtrusive parent control
  for fullscreen (Fullscreen API); unit tests with mocked APIs. (M3 follow-up) `AppErrorBoundary` auto-resets after a delay with backoff so an unattended
  kiosk recovers without a tap (test that the reset lands in the day view).

- [ ] **T-21 Night mode** (risk: medium, deps: T-11, T-16)
  Acceptance: automatic switch by `config.nightMode` times (spanning midnight works),
  dimmed warm token set, smooth transition (none under reduced motion), optional manual
  toggle via URL param `?night=1|0` for testing; contrast of night tokens meets AA. (M3 follow-up) Use `useCurrentBand` or remove it and fix its ARCHITECTURE mention. (M4 follow-up) Night-token contrast for weekend columns, countdown surface, band accents and
  `ring-accent`. (M2 follow-up) `<meta name="theme-color">` follows night mode, or the reason it doesn't is
  documented.

- [ ] **T-22 Burn-in protection** (risk: low, deps: T-11)
  Acceptance: whole layout shifts by a few px on a slow orbit every few minutes, never
  causes overflow/scrolling; under reduced motion shifts happen without animation; tests
  with fake timers.
  (M4 follow-ups) Shift moves an inner wrapper within the gutter (not `<main>`), e2e re-run with
  max shift + banner + 14 moons; the view toggle keeps a fixed place when a banner appears
  (reserve a banner slot or keep the toggle on header row 1).

- [ ] **T-23 Offline & stale UX end-to-end** (risk: **high** → Opus, deps: T-13, T-14, T-17)
  Acceptance: Playwright: load online → go offline → reload → last state + discreet
  offline hint; API returns `stale: true` → stale hint; API 502 with persisted data →
  data + hint; API 502 without data → error state; back online → hint disappears after
  refetch. (M2 follow-ups) offline across midnight keeps showing data; 401 with persisted
  data wipes storage and `kidboard.accessToken`. (M3 follow-ups) the e2e clock Proxy gets a test-only offset setter (offline across midnight)
  and an `apply` trap; Playwright projects set `timezoneId` (e.g. America/Los_Angeles) so the
  config zone is proven against a non-UTC device zone; `mockApi.ts` derives fixture dates (`dateOf`) and the clock from one constant; `pwa.spec.ts` offline test asserts day
  content or the offline banner again; ARCHITECTURE gets a day-view section (placement rules,
  5 s stale-banner delay) and ADR-0006/ADR-0009 mention the delay and the decorative emoji mode.

- [ ] **T-24 Visual screenshots** (risk: medium, deps: T-21, T-23)
  Acceptance: a dev/screenshot fixture with dates relative to "today" (or recurring) exists so manual dev
  and screenshots show realistic data; Playwright generates screenshots of day + week view at 1280×800 and
  2000×1200 in light and night mode with fixture data (Mia 🦊 / Ben 🐻 example) into
  `docs/screenshots/`; a CI job runs them (artifact upload), committed copies are used in
  the README.
  (M4 follow-ups) Glanceability pass on the screenshots: larger compact countdown moons on the
  day view, a pictorial "today!" cue (e.g. 🎉), check 🌙/☀️ double meanings (band vs. sleep
  unit vs. toggle), child colour cue on week icons, past events in today's week column ranked
  last or dimmed.

**M5 exit:** milestone review, CI green.

## M6 – Deploy, docs, v1.0.0

- [ ] **T-25 Cloudflare deploy** (risk: **high** → Opus, deps: M5)
  Acceptance: root `pnpm deploy:cloudflare` builds web + deploys worker; "Deploy to
  Cloudflare" button in README; documented secrets (`wrangler secret put CAL_KINDER_URL`)
  and vars; `wrangler deploy --dry-run` in CI; step-by-step guide verified as far as
  possible without credentials. (M2 follow-up) Verify the Workers Static Assets default `Cache-Control` for `sw.js`,
  `index.html`, `manifest.webmanifest`, and whether Cloudflare logs record the first-visit
  `/?key=` URL; document it.

- [ ] **T-26 Vercel alternative** (risk: medium, deps: T-25)
  Acceptance: `apps/worker/src/vercel.ts` adapter reusing the Hono app (Cache API absent →
  in-memory/`Cache-Control` fallback, documented); `vercel.json`; Deploy button + guide.

- [ ] **T-27 Documentation** (risk: low, deps: T-25, T-26)
  Acceptance: README EN + DE complete: features, screenshots, Google Calendar setup (where
  to find the secret iCal address, creating separate calendars, sharing caveats), title
  conventions with examples, configuration reference, deploy (Cloudflare + Vercel), kiosk
  tips (Fully Kiosk settings, PWA install, screen dimming), troubleshooting, privacy note. (M2 follow-up) CONFIG.md EN + DE documents the tablet token flow: open `/?key=` once,
  token stored + stripped from URL, forgotten after a 401.

- [ ] **T-28 Release readiness & v1.0.0** (risk: **high** → Opus, deps: T-27)
  Acceptance: full review by `reviewer-opus`; gitleaks over full history clean;
  `pnpm audit --prod` without high/critical; release-please release `v1.0.0` published;
  branch-protection settings documented/applied; `CLAUDE.md` switched to PR workflow;
  M7+ plan refined. (M3 follow-up) release-please `initial-version` set (e.g. `0.1.0`) so it never proposes
  1.0.0 early; maintainer enables "Allow GitHub Actions to create and approve pull requests".

## M7+ – Later (not in MVP)

* **M7 Routines** – routine checklist (e.g. brush teeth, get dressed) with reward stars,
  stored locally on the tablet; optional emoji asset set (ADR-0009).
* **M8 Parent mode** – PIN-protected settings overlay (refresh, night mode override, locale).
* **M9 Weather** – small weather icon in the header via a keyless open API (e.g.
  Open-Meteo), cached in the worker.

---

## Change log

| Date | Change | Reason |
|---|---|---|
| 2026-11-22 | Initial plan | Phase 0 |
| 2026-11-22 | M4 review follow-ups: burn-in inner wrapper + fixed toggle place (T-22), glanceability pass (T-24), boundary reset test (T-20), night contrast for new surfaces (T-21), single fixture date constant (T-23) | M4 milestone review by reviewer-opus |
| 2026-11-22 | T-18: the meal plan is shown inside the week columns instead of a separate meal screen | No extra screen, one glance: children and parents see events and meals of the whole week at once |
| 2026-11-22 | M3 review: agenda `days` limit 14 → 31 and client range 8 → 31 (T-19, shared query for day/week/countdown); follow-ups to T-18 (shared frame, continuing events), T-20 (boundary auto-reset), T-21 (`useCurrentBand`), T-23 (e2e clock, `timezoneId`, docs), T-28 (release-please initial version) | M3 milestone review by reviewer-opus; countdown needs 30 days but `/api/agenda` capped at 14 |
| 2026-11-22 | M2 review follow-ups: unauthorized state + boundary placement (T-15), shared today helper, offline midnight placeholder, pre-config behaviour (T-16), `formatTime` for timed events only (T-17), theme-color in night mode (T-21), offline-midnight + 401 e2e (T-23), static-asset Cache-Control + `?key=` logging check (T-25), token flow docs (T-27) | M2 milestone review by reviewer-opus |
| 2026-11-22 | M1 review follow-ups: fresh-clone `pnpm dev` (T-11), locale fallback docs (T-12), client timeout (T-13), relative dev fixture (T-24) | M1 milestone review by reviewer-opus |
| 2026-11-22 | T-10: worker cache uses an auto-provisioned KV binding (`KIDBOARD_CACHE`) with Cache API/memory fallback; cached window `[today−1, today+32)` | Cache API is a no-op on `*.workers.dev`; T-19 needs a 30-day countdown lookahead (T-10 review, structural) |
| 2026-11-22 | M0 milestone review follow-ups: `autoReturnSeconds` in T-06, `format:check` in DoD, fixture loading note in T-08, typed `Env` in T-10, tsconfig split in T-11 | Findings of the M0 review by reviewer-opus |
| 2026-11-22 | Worker test tooling renamed to `@cloudflare/vitest-plugin` (T-03, T-08, T-10) | `@cloudflare/vitest-pool-workers` is deprecated on npm and supports only Vitest 4 |
