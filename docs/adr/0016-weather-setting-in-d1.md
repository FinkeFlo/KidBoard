# ADR-0016: Weather setting from the parent editor, stored in D1

- Status: accepted
- Date: 2026-11-26

## Context
Weather (ADR-0015) is only on when `KIDBOARD_CONFIG` has a `weather` block. The deploy form
pre-fills no such block, so a fresh board shows no weather and parents would have to edit a
one-line JSON secret in the Cloudflare dashboard to change it. The parent editor (M11) is
already behind the parent lock (ADR-0013) and stores its data in the family's D1 database
(ADR-0014). The place is personal data: ADR-0015 keeps it inside the worker.

## Options
1. **Editor setting in D1 `kb_meta`, the config block as default** – one row, no new table,
   reuses the parent session and the existing D1 binding.
2. Move the whole configuration to D1 (M12 setup wizard) – much larger; children and
   calendars are not part of this need.
3. Pre-fill a sample town in the deploy form – still JSON editing to change it, and a wrong
   default town is worse than none.
4. Browser storage on the tablet – other devices would not see it, and the worker would have
   to receive the place on every weather request.

## Decision
Option 1. One `kb_meta` row with a constant key `weather_setting` holds either
`{"off":true}` or a weather block (`place`, optional `country`, `unit`), validated with a
strict shared schema on write and on read. The effective weather is the stored setting if
present, else the config's block; "off" wins over the config. Without D1 or on a D1 error the
config's block applies. `/api/config` and `/api/weather` use the effective weather; the
agenda config hash stays derived from `KIDBOARD_CONFIG` only, so a weather change never
invalidates calendar caches (the weather caches already key on the place).

The place is readable again only through the parent API behind the parent session (the
editor shows what is set); it stays out of logs, error bodies, the public config and every
unauthenticated response. Coordinates from the config are never returned, only that they
are set. Saving resolves the place immediately so the editor can say "town not found"
instead of the board hiding the weather silently.

## Consequences
* One extra D1 read per `/api/config` and `/api/weather` request (both are cheap and few).
* KV budget: the forecast's writes (`WEATHER_KV_WRITES_PER_DAY`, ADR-0015) are reserved
  against `KV_WRITES_PER_DAY_BUDGET` whenever the config has a `weather` block **or** the
  editor is on (D1 bound, valid PIN and access token), because the editor can turn the
  weather on at any time. Decided without a D1 read on the agenda path; a board with the
  editor on and the weather off pays a slightly higher feed TTL floor with KV.
* Each `PUT` with a new town geocodes it and loads a forecast right away (KV writes for the
  place and the forecast). Only an unlocked parent (PIN, lockout) can trigger it, and the
  writes stay within the reserved weather budget in normal use (one forecast key per place and unit,
  fresh 30 minutes).
* The weather setting is not part of the entries backup; importing a backup keeps it.
* Precedence must be documented in CONFIG.md (EN + DE): the editor setting overrides the
  config, "Use the setting from the configuration" removes it.
* A later M12 wizard can store more settings the same way or migrate this row.
