# KidBoard configuration

KidBoard has two kinds of settings:

1. **Secrets** (iCal URLs, optional access token) - Worker secrets / `.dev.vars` (repository root).
2. **Non-secret settings** - one JSON document in the `KIDBOARD_CONFIG` variable. The
   shape is shown in [`config.example.json`](../config.example.json); the worker validates
   it with the schema from `packages/shared` and exposes the public part at `/api/config`.
   JSON has no comments, so every option is documented here. All options except
   `calendars` have defaults.

Deutsche Kurzfassung am Ende dieses Dokuments.

## Secrets and environment variables

Set locally in `.dev.vars` in the repository root, next to `wrangler.jsonc` (copy from
[`.dev.vars.example`](../.dev.vars.example), dotenv format, git-ignored). In production use
`pnpm exec wrangler secret put NAME` or the hosting dashboard; step by step:
[DEPLOY.md](DEPLOY.md). All five may be secrets; `KIDBOARD_CONFIG`,
`KIDBOARD_ALLOWED_ORIGINS` and `KIDBOARD_CACHE_TTL` may also be plain-text variables
(`keep_vars: true` keeps dashboard variables across deploys).

| Name                      | Required | Default            | Description                                                                                                                                      |
| ------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CAL_<ID>_URL`            | yes, one per calendar | -     | Secret iCal address of the calendar with id `<ID>` (upper case), e.g. `CAL_KINDER_URL`. Google Calendar: Settings > calendar > "Secret address in iCal format". `https://`, `http://` or `webcal://` (fetched as `https://`). Never commit it. A missing or invalid value marks only that calendar as `error`. |
| `KIDBOARD_ACCESS_TOKEN`   | no       | unset (no check)   | If set (non-empty), API requests must present this token as `Authorization: Bearer <token>` or `?key=<token>`, else `401`. Prefer the header: `?key=` ends up in browser history (Workers Logs drop query strings, `redact_query_string`). A value that still contains `REPLACE_ME` (the template) is refused: every protected path answers `500 server_misconfigured`. `/api/health` stays public (it only returns `{ "ok": true }`). |
| `KIDBOARD_ALLOWED_ORIGINS`| no       | same origin only   | Comma-separated list of allowed CORS origins, e.g. `http://localhost:5173`.                                                                      |
| `KIDBOARD_CACHE_TTL`      | no       | `3600`             | Seconds a fetched feed counts as fresh (integer 60-86400; other values fall back to 3600 with a log warning). With the KV cache at least `ceil(calendars × 86400 / 500)` (KV Free plan write quota; 2 calendars → 346; with the parent editor on, its two app sources count as calendars).                                    |
| `KIDBOARD_CONFIG`         | yes      | -                  | The JSON document described below (single line). Missing or invalid: the API answers `500` and the log lists the validation errors.             |

The root `.env.example` only lists tooling variables (e.g. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

## Access token: the tablet link

If `KIDBOARD_ACCESS_TOKEN` is set, the board needs the token to load data:

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

Without a configured token nothing of this is needed. The token is not a user login, only a
shared secret for this tablet: treat the link like a password.

## `KIDBOARD_CONFIG` options

| Option                  | Type                          | Default                          | Example                         | Description                                                                                          |
| ----------------------- | ----------------------------- | -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `locale`                | `"de"` \| `"en"` \| `"auto"`  | `"auto"`                         | `"de"`                          | UI language. `auto` follows the browser language, falling back to `de`.                               |
| `timeZone`              | IANA time zone name           | `"Europe/Berlin"`                | `"America/New_York"`            | Zone for day boundaries, bands, night mode and floating times; the device time zone is never used. Must be a valid IANA name.                        |
| `children`              | array of child                | `[]`                             | see below                       | Children shown on the board. Ids must be unique.                                                     |
| `children[].id`         | string (slug)                 | required                         | `"mia"`                         | Stable identifier.                                                                                   |
| `children[].name`       | string                        | required                         | `"Mia"`                         | Display name; also the title prefix `Mia: ...`.                                                      |
| `children[].color`      | CSS color or token name       | required                         | `"#E4572E"`                     | Child colour: tints the child's event tiles and rings the badge. A token name `child-1` ... `child-6` or any CSS colour (hex, `rgb()`, `hsl()`, `oklch()`, named); an unusable value falls back to neutral. Text stays readable on the tint in both themes. |
| `children[].avatar`     | single emoji                  | required                         | `"🦊"`                          | The child's emoji (this is the field the schema calls `avatar`; there is no `emoji` key). Shown in the badge on the child's tiles and in the "who is who" legend. |
| `calendars`             | array of calendar source      | required                         | see below                       | Configured feeds. Ids must be unique.                                                                |
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

## API behavior

| Endpoint                                | Notes                                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                       | Always `{ "ok": true }`; public, does not read the config or the feeds.                                                                                                                                               |
| `GET /api/config`                       | Public part of `KIDBOARD_CONFIG` with defaults applied.                                                                                                                                                                |
| `GET /api/agenda?from=YYYY-MM-DD&days=N` | `days` 1-14 (default 8), `from` default today in `timeZone`. `[from, from + days)` must lie within yesterday ... today + 31 days (the cached window `[today − 1, today + 32)`), else `400`. `200` if any calendar has data (`ok` or `stale`), `502` otherwise. |

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
are unaffected. All API responses
carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`.

## Deutsche Kurzfassung

**Geheimnisse** (iCal-URLs, optionales Zugriffstoken) liegen als Worker-Secrets bzw. lokal in
`.dev.vars` im Repository-Root (Vorlage: `.dev.vars.example`, nie einchecken; Deployment:
[DEPLOY.de.md](DEPLOY.de.md)). Pro Kalender gibt es
`CAL_<ID>_URL` (ID in Großbuchstaben; fehlt sie, zeigt nur dieser Kalender einen Fehler).
Optional: `KIDBOARD_ACCESS_TOKEN` (dann brauchen alle API-Aufrufe außer `/api/health` den
Token als `Authorization: Bearer <token>` oder `?key=<token>`; besser den Header, denn `?key=`
landet im Browserverlauf; ein Wert, der noch `REPLACE_ME` enthält, wird abgelehnt (`500`); `/api/health` bleibt öffentlich und liefert nur `{ "ok": true }`),
`KIDBOARD_ALLOWED_ORIGINS`, `KIDBOARD_CACHE_TTL` (Sekunden, 60-86400, Standard 3600; mit
KV-Cache mindestens `Kalender × 86400 / 500`; bei eingeschaltetem Eltern-Editor zählen
seine zwei App-Quellen mit). Die Kalender-IDs `app-events` und `app-meals` sind für die in
der App angelegten Einträge reserviert.

**Zugriffstoken: der Tablet-Link.** Ist `KIDBOARD_ACCESS_TOKEN` gesetzt, das Board auf dem
Tablet **einmal** als `https://<dein-worker>.workers.dev/?key=<token>` öffnen (z. B. als
Start-URL in Fully Kiosk). Die Seite speichert das Token im lokalen Speicher des Tablets und
**entfernt `?key=` sofort aus der Adresszeile**; danach ruft sie die API mit
`Authorization: Bearer` auf. Spätere Besuche brauchen kein `?key=`; ein neues `?key=` ersetzt
das gespeicherte Token (nach einem Token-Wechsel). Nach einem **`401`** (Token ungültig oder
widerrufen) **vergisst** das Tablet das Token und zeigt "Dieses Tablet braucht einen neuen Zugangslink" (Fehlercode
`KB-401`): den Tablet-Link mit dem aktuellen `?key=<token>` noch einmal öffnen. Ohne
konfiguriertes Token ist das alles nicht nötig.

**Nicht geheime Einstellungen** stehen als JSON in `KIDBOARD_CONFIG` (Pflicht; Vorlage:
`config.example.json`; fehlerhaft → API antwortet `500`, das Log nennt die Fehler). Alle Optionen außer `calendars` haben Standardwerte: `locale`
(`de`/`en`/`auto`; `auto` = Browsersprache, sonst `de`), `timeZone` (IANA, Standard `Europe/Berlin`), `children` (id, name, color,
avatar = Emoji des Kindes; Farbe und Emoji färben die Kacheln des Kindes und bilden das Abzeichen), `calendars` (id, kind `events`/`meals`, optional `childId`, `label`), `bands`
(`morningStart`/`middayStart`/`eveningStart`, `HH:mm` aufsteigend: sie bestimmen das Tageszeit-Icon auf den Kacheln und den Mahlzeit-Slot für Mahlzeiten mit Uhrzeit, keine Abschnitte auf dem Bildschirm), `nightMode` (an/aus, Start, Ende), `countdown.emojis`
(Termine mit diesen Icons bekommen den "Noch x Mal schlafen"-Countdown), `refreshMinutes`,
`autoReturnSeconds` (Rückkehr von der Wochenansicht zur Übersicht nach Inaktivität). Die Tabelle oben nennt Typ,
Standardwert und Beispiel jeder Option.

**Mitbringen-Bereich (🎒).** `bands.eveningStart` startet auch den 🎒-Bereich: ab dann bis
Mitternacht zeigt die heutige Karte, was für morgen einzupacken ist (Zeile `Mitbringen:` /
`Bring:` in der Beschreibung des Termins, siehe [README.de.md](../README.de.md#mitbringen-liste));
nach Mitternacht zeigt sie, was heute noch mitzubringen ist, bis der Termin beginnt.
`bands.middayStart` beendet ihn für ganztägige Termine (ihre Icons stehen vom Vorabend
`eveningStart` bis zu dieser Uhrzeit am Tag selbst). Es gibt keine eigene Einstellung; es
gelten `timeZone` und die Bänder. Zeigt sich nichts: die Zeile muss für sich stehen, mit
`Mitbringen:` oder `Bring:` samt Doppelpunkt beginnen, mindestens ein Emoji enthalten und in
der Beschreibung (nicht im Titel) stehen; Feed- und Cache-Verzögerung bis zu
`KIDBOARD_CACHE_TTL`.

**API:** `/api/agenda?from=JJJJ-MM-TT&days=N` liefert 1-14 Tage (Standard 8 ab heute) innerhalb
von gestern bis heute + 31 Tage. Kalender werden mit 10 s Timeout und 5 MB Limit geladen und pro
Kalender im KV-Namespace `KIDBOARD_CACHE` gespeichert (legt Wrangler beim ersten Deploy selbst an;
ohne Binding: Cache API, die nur mit eigener Domain funktioniert): frisch für
`KIDBOARD_CACHE_TTL`, danach bis 7 Tage als letzter guter Stand. Fällt ein Kalender aus, wird
dieser Stand mit `status: "stale"` geliefert (ein alter Stand deckt evtl. nur einen Teil des
Zeitraums ab), ohne Stand `error`. Antwort `200`, wenn mindestens ein Kalender Daten hat, sonst
`502`. Mit Eltern-Editor kommen die Quellen `app-events` und `app-meals` (Einträge aus der
App, aus D1) hinzu; eine Änderung in der App ist beim nächsten Abruf sichtbar, fällt D1 aus,
sind nur sie `stale` bzw. `error`.
