# ICS fixtures

All files in this directory are **synthetic**. They are hand-written test data.

- Never add real calendar URLs (including secret iCal feed addresses).
- Never add real names, addresses, e-mail addresses or any other personal data.
- Use reserved example domains (e.g. `fixtures.kidboard.invalid`) for UIDs.

## Files

Used by `apps/worker/src/ical/expandCalendar.test.ts` (loaded via Vite `?raw` imports).
All fixtures use CRLF line endings, a Google-style header (`X-WR-TIMEZONE`) and a
`VTIMEZONE` for `Europe/Berlin`.

| File                          | Covers                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `single-events.ics`           | timed, all-day (single/multi-day, no DTEND), overnight, DURATION                                                                   |
| `recurrence.ics`              | weekly RRULE + EXDATE, COUNT, UNTIL, RDATE                                                                                         |
| `overrides.ics`               | RECURRENCE-ID moves (same day, other day, into/out of window), cancellations                                                       |
| `dst.ics`                     | weekly 08:00 across DST changes, spring-forward gap, fall-back overlap                                                             |
| `timezones.ics`               | VTIMEZONE, UTC, floating, America/New_York, missing VTIMEZONE (incl. a series with UTC EXDATE/RECURRENCE-ID), custom/unknown TZIDs |
| `window.ics`                  | window boundary cases                                                                                                              |
| `runaway.ics`                 | unbounded `FREQ=MINUTELY` (iteration cap)                                                                                          |
| `edge-cases.ics`              | all-day series, SEQUENCE, orphan override, RDATE-only + EXDATE, broken event                                                       |
| `empty.ics` / `truncated.ics` | empty calendar / truncated (malformed) file                                                                                        |
