# ADR-0015: Weather from Open-Meteo via the worker

- Status: accepted
- Date: 2026-11-23

## Context
M9 shows the weather and child-friendly clothing pictures for today and tomorrow. Setup must
stay simple for families (no account, no API key), the tablet must keep working offline, and
the family's location is personal data.

## Options
1. **Open-Meteo forecast + geocoding API, called by the worker** – free for non-commercial
   use, no key, JSON, data under CC BY 4.0 (attribution required).
2. A keyed provider (OpenWeatherMap, Tomorrow.io …) – needs an account and a secret per family.
3. Calling Open-Meteo from the browser – exposes the location to the client bundle and the
   tablet's network, no shared cache, and a CSP `connect-src` exception.
4. The official `openmeteo` npm client – built for the FlatBuffers format; for one JSON
   request a `fetch` validated with zod (as the feeds) is smaller and keeps one pattern.

## Decision
Option 1 with a plain `fetch` + zod (option 4 rejected for size and consistency). The
location is set once in `KIDBOARD_CONFIG` (`weather.place` resolved by the geocoding API, or
`latitude`/`longitude`); it never leaves the worker except to Open-Meteo. The worker condenses
the forecast to a small DTO (`/api/weather`), caches it 30 minutes (KV or Cache API) and serves
the last good forecast up to 24 hours on errors. Weather is optional and never breaks the
board. Clothing pictures come from a pure threshold table in `packages/shared`
(`clothingFor`), based on the feels-like temperature of the daytime hours, rain, snow and UV.
Built-in weather and clothing emoji follow the ADR-0011 baseline. ☀️ means "sunny" inside a
weather chip; the rail's "Today" button keeps its ☀️ with its text label; 🌙 is never used
for weather (rule 1).

## Consequences
* Attribution "Open-Meteo.com" is shown in the rail while weather is on and in the docs.
* There is no emoji for a knitted hat or a sweater (Emoji ≤ 13.0); cold is shown with 🧥 🧣 🧤.
  Own pictures could follow with the optional asset set (ADR-0009, M7).
* KV writes for the forecast (≤ 48/day) count against `KV_WRITES_PER_DAY_BUDGET`.
* Commercial use would need an Open-Meteo plan; KidBoard is self-hosted per family.
