# KidBoard configuration

KidBoard has two kinds of settings:

1. **Secrets** (iCal URLs, optional access token) - Worker secrets / `apps/worker/.dev.vars`.
2. **Non-secret settings** - one JSON document in the `KIDBOARD_CONFIG` variable. The
   shape is shown in [`config.example.json`](../config.example.json); the worker validates
   it with the schema from `packages/shared` and exposes the public part at `/api/config`.
   JSON has no comments, so every option is documented here. All options except
   `calendars` have defaults.

Deutsche Kurzfassung am Ende dieses Dokuments.

## Secrets and environment variables

Set locally in `apps/worker/.dev.vars` (copy from `.dev.vars.example`, dotenv format,
git-ignored). In production use `wrangler secret put NAME` or the hosting dashboard.

| Name                      | Required | Default            | Description                                                                                                                                      |
| ------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CAL_<ID>_URL`            | yes, one per calendar | -     | Secret iCal address of the calendar with id `<ID>` (upper case), e.g. `CAL_KINDER_URL`. Google Calendar: Settings > calendar > "Secret address in iCal format". Never commit it. |
| `KIDBOARD_ACCESS_TOKEN`   | no       | unset (no check)   | If set, API requests must present this token as `Authorization: Bearer <token>` or `?key=<token>`.                                                                                                    |
| `KIDBOARD_ALLOWED_ORIGINS`| no       | same origin only   | Comma-separated list of allowed CORS origins, e.g. `http://localhost:5173`.                                                                      |
| `KIDBOARD_CACHE_TTL`      | no       | `3600`             | Seconds a fetched feed counts as fresh.                                                                                                          |
| `KIDBOARD_CONFIG`         | no       | built-in defaults  | The JSON document described below (single line).                                                                                                 |

The root `.env.example` only lists tooling variables (e.g. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

## `KIDBOARD_CONFIG` options

| Option                  | Type                          | Default                          | Example                         | Description                                                                                          |
| ----------------------- | ----------------------------- | -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `locale`                | `"de"` \| `"en"` \| `"auto"`  | `"auto"`                         | `"de"`                          | UI language. `auto` follows the device language, falling back to `en`.                               |
| `timeZone`              | IANA time zone name           | `"Europe/Berlin"`                | `"America/New_York"`            | Zone for day boundaries, bands and floating times. Must be a valid IANA name.                        |
| `children`              | array of child                | `[]`                             | see below                       | Children shown on the board. Ids must be unique.                                                     |
| `children[].id`         | string (slug)                 | required                         | `"mia"`                         | Stable identifier.                                                                                   |
| `children[].name`       | string                        | required                         | `"Mia"`                         | Display name; also the title prefix `Mia: ...`.                                                      |
| `children[].color`      | CSS color or token name       | required                         | `"#E4572E"`                     | Accent color for the child. Keep WCAG AA contrast in mind.                                           |
| `children[].avatar`     | single emoji                  | required                         | `"🦊"`                          | Icon identifying the child.                                                                          |
| `calendars`             | array of calendar source      | required                         | see below                       | Configured feeds. Ids must be unique.                                                                |
| `calendars[].id`        | string                        | required                         | `"kinder"`                      | Maps to the secret `CAL_<ID>_URL`.                                                                   |
| `calendars[].kind`      | `"events"` \| `"meals"`       | required                         | `"meals"`                       | Events calendar or meal plan.                                                                        |
| `calendars[].childId`   | string (child id)             | unset (event is for everyone)    | `"mia"`                         | Marks a one-calendar-per-child feed. Must reference an existing child.                               |
| `calendars[].label`     | string                        | unset                            | `"Kinder"`                      | Optional human-readable name.                                                                        |
| `bands.morningStart`    | `HH:mm`                       | `"06:00"`                        | `"06:30"`                       | Start of the morning band. Bands must be ascending.                                                  |
| `bands.middayStart`     | `HH:mm`                       | `"11:00"`                        | `"11:30"`                       | Start of the midday band; also assigns timed meals to a slot.                                        |
| `bands.eveningStart`    | `HH:mm`                       | `"17:00"`                        | `"17:30"`                       | Start of the evening band.                                                                           |
| `nightMode.enabled`     | boolean                       | `true`                           | `false`                         | Dim the board at night.                                                                              |
| `nightMode.start`       | `HH:mm`                       | `"19:30"`                        | `"20:00"`                       | When night mode starts.                                                                              |
| `nightMode.end`         | `HH:mm`                       | `"06:30"`                        | `"07:00"`                       | When night mode ends (may be on the next day).                                                       |
| `countdown.emojis`      | array of emoji                | `["🎂","🎉","🎁","🎄","🐣","✈️","🏖️"]` | `["🎂","✈️"]`            | Events with one of these icons (or `#countdown` in the description) get the "sleeps until" countdown. |
| `refreshMinutes`        | integer                       | `60`                             | `30`                            | How often the client refetches data.                                                                 |
| `autoReturnSeconds`     | integer                       | `120`                             | `180`                           | Seconds of inactivity before the UI returns to the day view.                                         |

Notes: calendar `mia` and child `mia` are separate namespaces, so the same slug may be used
for both. The final schema is defined in T-06 (`packages/shared`); if this document and the
schema ever disagree, the schema wins and this page must be fixed.

## Deutsche Kurzfassung

**Geheimnisse** (iCal-URLs, optionales Zugriffstoken) liegen als Worker-Secrets bzw. lokal in
`apps/worker/.dev.vars` (Vorlage: `.dev.vars.example`, nie einchecken). Pro Kalender gibt es
`CAL_<ID>_URL` (ID in Großbuchstaben). Optional: `KIDBOARD_ACCESS_TOKEN`,
`KIDBOARD_ALLOWED_ORIGINS`, `KIDBOARD_CACHE_TTL` (Sekunden, Standard 3600).

**Nicht geheime Einstellungen** stehen als JSON in `KIDBOARD_CONFIG` (Vorlage:
`config.example.json`). Alle Optionen außer `calendars` haben Standardwerte: `locale`
(`de`/`en`/`auto`), `timeZone` (IANA, Standard `Europe/Berlin`), `children` (id, name, color,
avatar), `calendars` (id, kind `events`/`meals`, optional `childId`, `label`), `bands`
(Tagesabschnitte, `HH:mm` aufsteigend), `nightMode` (an/aus, Start, Ende), `countdown.emojis`
(Termine mit diesen Icons bekommen den "Noch x Mal schlafen"-Countdown), `refreshMinutes`,
`autoReturnSeconds` (Rückkehr zur Tagesansicht nach Inaktivität). Die Tabelle oben nennt Typ,
Standardwert und Beispiel jeder Option.
