# KidBoard configuration

[Deutsch](CONFIG.de.md)

This page is the reference for every secret, variable and binding the worker reads and
for the exact rules of the access token and the parent PIN; README and DEPLOY link here.

KidBoard has two kinds of settings:

1. **Secrets** (access token, parent PIN, optional iCal URLs) - Worker secrets / `.dev.vars` (repository root).
2. **Non-secret settings** - one JSON document in the `KIDBOARD_CONFIG` variable. The
   shape is shown in [`config.example.json`](../config.example.json); the worker validates
   it with the schema from `packages/shared` and exposes the public part at `/api/config`.
   JSON has no comments, so every option is documented here. All options have defaults;
   `calendars` (Google feeds) is optional: without it the board shows the entries made in
   the parent editor (ADR-0014).

## Secrets and environment variables

Set locally in `.dev.vars` in the repository root, next to `wrangler.jsonc` (copy from
[`.dev.vars.example`](../.dev.vars.example), dotenv format, git-ignored). In production use
`pnpm exec wrangler secret put NAME` or the hosting dashboard; step by step:
[DEPLOY.md](DEPLOY.md). All of them may be secrets; `KIDBOARD_CONFIG`, `KIDBOARD_PUBLIC`,
`KIDBOARD_ALLOWED_ORIGINS` and `KIDBOARD_CACHE_TTL` may also be plain-text variables
(`keep_vars: true` keeps dashboard variables across deploys).

| Name                      | Required | Default            | Description                                                                                                                                      |
| ------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CAL_<ID>_URL`            | one per calendar in `calendars` | -     | Secret iCal address of the calendar with id `<ID>` (upper case), e.g. `CAL_KINDER_URL`. Google Calendar: Settings > calendar > "Secret address in iCal format". `https://` or `webcal://` (fetched as `https://`); plain `http://` and other schemes are refused. Use your own secondary calendars (e.g. "Kinder", "Essen") instead of the main calendar: a main calendar also lists invitations you have not accepted. Never commit it. A missing or invalid value marks only that calendar as `error`. |
| `KIDBOARD_ACCESS_TOKEN`   | yes (see `KIDBOARD_PUBLIC`) | unset (API refuses, `500 server_misconfigured`) | API requests must present this token as `Authorization: Bearer <token>` or `?key=<token>`, else `401`. 32 to 256 characters of `A-Z a-z 0-9 _ -`, e.g. the output of `openssl rand -hex 32`. Unset, empty, shorter, other characters or still containing `REPLACE_ME` (the template): every protected path answers `500 server_misconfigured` and the log says why (the board fails closed, it never serves data without a valid token). Prefer the header: `?key=` ends up in browser history (Workers Logs drop query strings, `redact_query_string`). `/api/health` stays public (it only returns `{ "ok": true }`). |
| `KIDBOARD_PUBLIC`         | no       | unset              | Explicit opt-in for a public read-only board: with the value `1` **and no** `KIDBOARD_ACCESS_TOKEN`, the board is served without any check (anyone with the link sees your family's calendar; the editor stays off). If a token is set, it is enforced regardless of this variable. |
| `KIDBOARD_ALLOWED_ORIGINS`| no       | same origin only   | Comma-separated list of allowed CORS origins, e.g. `http://localhost:5173`. Only for API use from another origin; the board itself is same-origin. |
| `KIDBOARD_CACHE_TTL`      | no       | `3600`             | Seconds a fetched feed counts as fresh (integer 60-86400; other values fall back to 3600 with a log warning). With the KV cache at least `ceil(calendars × 86400 / 500)` (KV Free plan write quota; 2 calendars → 346; with the parent editor on, its two app sources count as calendars).                                    |
| `KIDBOARD_PARENT_PIN`     | no       | unset (editor off) | 6 to 12 digits that unlock the parent editor. Not accepted (editor stays off, the log says why): unset, shorter or longer, non-digits, still `REPLACE_ME`, one repeated digit (`111111`) or a run of rising or falling digits (`123456`, `654321`). Choose something not guessable: no birthdays or dates. After 5 wrong PINs in 15 minutes the editor locks for 15 minutes; every further lockout while failures continue doubles the time (up to 2 hours); a right PIN resets this. The editor also needs a valid `KIDBOARD_ACCESS_TOKEN` and the D1 binding `KIDBOARD_DATA`. |
| `KIDBOARD_FEED_TOKEN`     | no       | unset (no feed)    | Secret token of the phone feed `/api/feed.ics?token=…` with the editor's entries; 32-256 characters `A-Z a-z 0-9 _ -`. With a valid one the parent area shows the subscribe link. Changing it ends every subscription. |
| `KIDBOARD_CONFIG`         | yes      | -                  | The JSON document described below (single line). Missing or invalid: the API answers `500` and the log lists the validation errors.             |
| `KIDBOARD_CACHE`          | automatic | -                 | KV namespace binding of the feed cache (see [API behavior](#api-behavior)). Declared without an id in `wrangler.jsonc`; Wrangler creates it on the first deploy. |
| `KIDBOARD_DATA`           | automatic | unset (editor off) | D1 database binding with the entries made in the editor (ADR-0014). Declared without an id in `wrangler.jsonc`; Wrangler creates it on the first deploy, the worker creates its tables. |

The root `.env.example` only lists tooling variables (e.g. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

## Access token: the tablet link

The board needs the token to load data (without a valid `KIDBOARD_ACCESS_TOKEN` the API refuses
everything except `/api/health`, unless you opt in to a public board with `KIDBOARD_PUBLIC="1"`):

1. Open the board **once** on the tablet as `https://<your-worker>.workers.dev/?key=<token>`
   (for example as the Fully Kiosk start URL or in the installed app).
2. The page stores the token in the tablet's local storage and immediately **removes `?key=`
   from the address bar**, so it does not stay in the URL, bookmarks or screenshots. From
   then on it calls the API with `Authorization: Bearer <token>`.
3. Later visits need no `?key=`. A new `?key=` replaces the stored token (use it after
   rotating the token).
4. After a **`401`** (token revoked or wrong) the tablet **forgets** the stored token and shows
   "This tablet needs a new access link" (error code `KB-401`): open the tablet link with the current
   `?key=<token>` once more.

With the public opt-in (`KIDBOARD_PUBLIC="1"`, no token) nothing of this is needed. The token is not a user login, only a
shared secret for this tablet: treat the link like a password.

## `KIDBOARD_CONFIG` options

| Option                  | Type                          | Default                          | Example                         | Description                                                                                          |
| ----------------------- | ----------------------------- | -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `locale`                | `"de"` \| `"en"` \| `"auto"`  | `"auto"`                         | `"de"`                          | UI language. `auto` follows the browser language, falling back to `de`.                               |
| `timeZone`              | IANA time zone name           | `"Europe/Berlin"`                | `"America/New_York"`            | Zone for day boundaries, bands, night mode and floating times; the device time zone is never used. Must be a valid IANA name.                        |
| `children`              | array of child                | `[]`                             | see below                       | Children shown on the board. Ids must be unique.                                                     |
| `children[].id`         | string (slug)                 | required                         | `"mia"`                         | Stable identifier.                                                                                   |
| `children[].name`       | string                        | required                         | `"Mia"`                         | Display name; also the title prefix `Mia: ...`.                                                      |
| `children[].color`      | hex colour or token name      | required                         | `"#E4572E"`                     | Child colour: tints the child's event tiles and rings the badge. A token name `child-1` ... `child-6` or a hex colour (`#rgb`, `#rrggbb`); anything else (named colours, `rgb()`, `hsl()` ...) is refused when the configuration is validated, so change old values like `"red"` to `"#cc0000"`. Text stays readable on the tint in both themes. |
| `children[].avatar`     | single emoji                  | required                         | `"🦊"`                          | The child's emoji (this is the field the schema calls `avatar`; there is no `emoji` key). Shown in the badge on the child's tiles and in the "who is who" legend. |
| `calendars`             | array of calendar source      | `[]` (no Google feeds)           | see below                       | Optional Google Calendar feeds, added any time. Ids must be unique.                                  |
| `calendars[].id`        | string                        | required                         | `"kinder"`                      | Maps to the secret `CAL_<ID>_URL`. `app-events` and `app-meals` are reserved (entries made in the app). |
| `calendars[].kind`      | `"events"` \| `"meals"`       | required                         | `"meals"`                       | Events calendar or meal plan.                                                                        |
| `calendars[].childId`   | string (child id)             | unset (event is for everyone)    | `"mia"`                         | Marks a one-calendar-per-child feed. Must reference an existing child.                               |
| `calendars[].label`     | string                        | unset                            | `"Kinder"`                      | Optional human-readable name.                                                                        |
| `bands.morningStart`    | `HH:mm`                       | `"06:00"`                        | `"06:30"`                       | Start of the morning. Together with the other two bands it picks the time-of-day icon on tiles (🌅 morning, 🌞 midday, 🌆 evening) and, for timed meals without a slot word, the meal slot. Bands are not shown as on-screen sections. Must be ascending. |
| `bands.middayStart`     | `HH:mm`                       | `"11:00"`                        | `"11:30"`                       | Start of midday. Timed meals before it are breakfast, from it until `eveningStart` lunch. Also ends the 🎒 bring area for all-day events: their icons show from `eveningStart` the day before until this time on the day itself (timed events: until they start). |
| `bands.eveningStart`    | `HH:mm`                       | `"17:00"`                        | `"17:30"`                       | Start of the evening. Timed meals from here on are dinner. Also the moment the 🎒 bring area starts: from here until midnight today's card lists what to pack for tomorrow ([README](../README.md#bring-list)). |
| `nightMode.enabled`     | boolean                       | `true`                           | `false`                         | Switch to the dark night theme (colours only, the screen stays on).                                       |
| `nightMode.start`       | `HH:mm`                       | `"19:30"`                        | `"20:00"`                       | When night mode starts.                                                                              |
| `nightMode.end`         | `HH:mm`                       | `"06:30"`                        | `"07:00"`                       | When night mode ends (may be on the next day).                                                       |
| `countdown.emojis`      | array of emoji                | `["🎂","🎉","🎁","🎄","🐣","✈️","🏖️"]` | `["🎂","✈️"]`            | Events with one of these icons (or `#countdown` in the description) get the "sleeps until" countdown. |
| `refreshMinutes`        | integer                       | `60`                             | `30`                            | How often the client refetches data.                                                                 |
| `autoReturnSeconds`     | integer                       | `120`                             | `180`                           | Seconds of inactivity before the week view returns to the four-day overview.                                         |

Validation details (schema in `packages/shared`): unknown keys are rejected (typos are
reported, not ignored); ids (children and calendars) match `[a-z0-9][a-z0-9_-]*` (max 32
chars); the secret name is the upper-cased id with `-` replaced by `_` (`school-a` ->
`CAL_SCHOOL_A_URL`), so ids that map to the same name (`a-b` and `a_b`) are rejected; the
calendar ids `app-events` and `app-meals` are reserved for the entries made in the app; child
names must be unique (case-insensitive); `refreshMinutes` is 1-1440; `autoReturnSeconds` is
10-3600; bands must be strictly ascending; `nightMode.start` and `end` must differ.

Notes: calendar `mia` and child `mia` are separate namespaces, so the same slug may be used
for both. The 🎒 bring area (`Bring:` / `Mitbringen:` line in the event description) has no setting of
its own: it follows `timeZone` and the two bands above. The description's other text is
never sent to the tablet. If bring icons do not show: the line must be on its own, start
with `Bring:` or `Mitbringen:` including the colon, contain at least one emoji and sit in
the description (not the title); feed and cache delay changes by up to
`KIDBOARD_CACHE_TTL`. The final schema is defined in T-06 (`packages/shared`); if this document and the
schema ever disagree, the schema wins and this page must be fixed.

## Weather

Optional (ADR-0015). Without a `weather` block the board shows no weather. With it, every
overview day shows a weather icon with a temperature (today: now; other days: the high),
the week view the icon and high in each day header inside the 7-day forecast, and today's
card a row of clothing pictures: for today until `bands.eveningStart`, from then until
midnight for tomorrow.

```json
"weather": { "place": "Hamburg", "country": "DE" }
```

| Key         | Type                             | Default     | Description                                                                                     |
| ----------- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `place`     | string, 1-80 chars               | -           | Town name, looked up once with the Open-Meteo geocoding API (first match). Not found: no weather, the rest of the board works. |
| `country`   | ISO 3166-1 alpha-2 code          | unset       | Narrows the lookup of `place` (`"DE"`, `"AT"`, `"US"`, ...).                                     |
| `latitude`, `longitude` | number (−90…90, −180…180) | -     | Instead of `place` (never both): `"weather": { "latitude": 53.55, "longitude": 9.99 }`.          |
| `unit`      | `"celsius"` \| `"fahrenheit"`    | `"celsius"` | Temperature unit of the chips (the board shows just `°`).                                        |

- **Privacy:** the place and coordinates stay on the server; the tablet only learns that
  weather is on. The server sends them to Open-Meteo only (forecast and geocoding) and
  caches the forecast for 30 minutes (the last good one up to 24 hours).
- **Terms:** Open-Meteo is free for non-commercial use without an account or API key; its
  data is licensed under CC BY 4.0, so the board shows "Weather: Open-Meteo.com" in the
  rail while weather is on. Commercial use needs an Open-Meteo plan.
- **Evening:** from `bands.eveningStart` the clothing pictures are tomorrow's, led by "→",
  tomorrow's weather icon and high; today's chip then shows only 🌡️ and the current
  temperature.
- **Clothing pictures** (feels-like temperature 07:00-19:00 in °C, °F is converted; "min"
  = coolest, "max" = warmest hour). At most five, in this order (protection first):

  | Picture | Item          | When                                          |
  | ------- | ------------- | --------------------------------------------- |
  | 🌂      | umbrella      | rain                                          |
  | 👢      | rain boots    | rain and max below 20° (not with snow)        |
  | 🥾      | winter boots  | snow                                          |
  | 🧥      | jacket        | min below 14°                                 |
  | (drawn) | warm hat      | min below 8°                                  |
  | 🧤      | gloves        | min below 3°, or snow                         |
  | 🧣      | scarf         | min below 5°                                  |
  | (drawn) | sweater       | min from 14° to below 18° (no jacket)         |
  | 👕      | T-shirt       | max from 22°                                  |
  | 🩳      | shorts        | max from 24°                                  |
  | 🧢      | cap           | sunny (WMO code ≤ 2), UV ≥ 3 and max from 15° |
  | 🧴      | sunscreen     | sunny (WMO code ≤ 2) and UV ≥ 4               |

  The warm hat and the sweater have no emoji, so KidBoard draws them itself.
- A forecast older than 24 hours, or an error answer of the server, hides the weather.
  Without a connection the last forecast stays (while under 24 hours old).

## API behavior

| Endpoint                                | Notes                                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                       | Always `{ "ok": true }`; public, does not read the config or the feeds.                                                                                                                                               |
| `GET /api/config`                       | Public part of `KIDBOARD_CONFIG` with defaults applied.                                                                                                                                                                |
| `GET /api/agenda?from=YYYY-MM-DD&days=N` | `days` 1-31 (default 8), `from` default today in `timeZone`. `[from, from + days)` must lie within yesterday ... today + 31 days (the cached window `[today − 1, today + 32)`), else `400`. `200` if any source has data (`ok` or `stale`) or there are no sources (no calendars, editor off: empty board and one log warning), `502` otherwise. |
| `GET /api/weather`                      | The condensed forecast ([Weather](#weather)), never the place. `404 weather_off` without a `weather` block, `503` when the place is unknown or Open-Meteo fails without a last good forecast. |

Feeds are fetched with a 10 s timeout and a 5 MB limit. Each calendar's normalized data
for the window is stored once per refresh: it is fresh for `KIDBOARD_CACHE_TTL` and kept
7 days as last-good, served with `status: "stale"` when the feed fails (an old entry may
cover only part of the requested range). The store is the Workers KV namespace
`KIDBOARD_CACHE`, which Wrangler creates automatically on the first deploy (declared
without an id in the root `wrangler.jsonc`); without that binding the Cache API is
used, which only works on a custom domain (not on `*.workers.dev`). With the parent
editor on (ADR-0014), `sources` also lists `app-events` and `app-meals`: the entries made
in the app, read from D1 and cached the same way; a change in the app shows on the next
refresh, and if D1 is unavailable they are `stale` (or `error`) while the Google calendars
are unaffected. A feed that failed is not fetched again for 5 minutes (the last-good
copy is served meanwhile). Per calendar at most 2000 events are read and titles are cut at
120 characters (`truncated: true` marks it). All API responses
carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`.
