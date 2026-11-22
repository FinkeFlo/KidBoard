# ADR-0003: iCalendar parsing and recurrence expansion

- Status: accepted
- Date: 2026-11-22

## Context
Must handle RRULE, EXDATE, RDATE, RECURRENCE-ID overrides, all-day and multi-day events,
VTIMEZONE/DST, inside the Workers runtime (no Node built-ins).

## Options
| Library | License | Runtime | Recurrence | Notes |
|---|---|---|---|---|
| **ical.js 2.x** (Mozilla/kewisch) | MPL-2.0 | pure JS, ESM, browser + Workers | `ICAL.Event` + `iterator()`, `relateException()`, `getOccurrenceDetails()`, `RecurExpansion` | used by Thunderbird; parses VTIMEZONE from the feed |
| node-ical | Apache-2.0 | Node (fs, axios history) | via rrule.js | not Worker-friendly |
| rrule.js + own parser | BSD | any | RRULE only | would need our own ICS parser → rule 2 violation |

## Decision
ical.js. Expansion pattern (from Context7 docs): parse → for each VEVENT without
RECURRENCE-ID create `ICAL.Event`, attach exceptions with `relateException`, iterate
`event.iterator()` until past the window end, use `getOccurrenceDetails()` per occurrence
(handles moved instances and `RANGE=THISANDFUTURE`). Register each `VTIMEZONE` from the
feed with `ICAL.TimezoneService` before expansion. Guard against runaway rules with an
iteration cap.

## Consequences
* MPL-2.0 is file-level copyleft; using the unmodified package as a dependency is
  compatible with KidBoard's MIT license. We must not copy ical.js source into the repo.
* Iteration always starts at DTSTART → cap iterations (e.g. 10 000) per event.
