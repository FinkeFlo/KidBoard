# KidBoard – Progress log

One row per completed task. Escalations to Opus are logged with their reason.

| Date | Task | Builder model | Reviewer model | Review rounds | Notes |
|---|---|---|---|---|---|
| 2026-11-22 | T-00 Planning & agent setup | Opus 5.5 (orchestrator) | – | – | Stack evaluated via Context7 + npm; ADRs 0001–0009. |
| 2026-11-22 | T-01 Workspace scaffold | Sonnet 5.5 | Sonnet 5.5 | 2 | Round 1: named non-handler export crashed workerd. |
| 2026-11-22 | T-02 Lint, format, git hooks | Sonnet 5.5 | Sonnet 5.5 | 1 | Orchestrator spot-checked lefthook config against Context7. |
| 2026-11-22 | T-03 Test setup | Sonnet 5.5 | Sonnet 5.5 | 1 | Uses @cloudflare/vitest-plugin (renamed from vitest-pool-workers, which is deprecated). |
| 2026-11-22 | T-05 Community & config files | Sonnet 5.5 | Sonnet 5.5 | 2 | Round 1: autoReturnSeconds default inconsistent with T-18. Built in parallel with T-04. |
| 2026-11-22 | T-04 CI, release, dependency updates | Opus 5.5 (builder-opus) | Opus 5.5 (reviewer-opus) | 1 | High risk (CI/release) → Opus. gitleaks CLI instead of action (license). Release PRs need repo setting 'Allow GitHub Actions to create PRs'. |
| 2026-11-22 | T-06 Shared data model & config schema | Sonnet 5.5 | Sonnet 5.5 | 1 | zod 4 strictObject for config; DTOs strip unknown keys. |
| 2026-11-22 | T-07 Title parser | Sonnet 5.5 | Sonnet 5.5 | 1 | emoji-regex v11 used without `u` flag; text symbols like © filtered. Built in parallel with T-08. |
| 2026-11-22 | T-08 iCal parsing & recurrence expansion | Opus 5.5 (builder-opus) | Opus 5.5 (reviewer-opus) | 4 | R1: RDATE PERIOD, TZID w/o VTIMEZONE, ADR; orchestrator added perf (Free plan 10 ms CPU) → fast-forward + equivalence tests (232→~10-30 ms). R2: infinite loop on unsatisfiable RRULE → per-iterator guard. R3: pin ical.js 2.2.1 + canary. |
| 2026-11-22 | T-09 Normalization | Sonnet 5.5 | Sonnet 5.5 | 1 | FNV-1a 64 ids (verified vectors). |
| 2026-11-22 | T-10 Worker API | Opus 5.5 (builder-opus) | Opus 5.5 (reviewer-opus) | 3 | R1 structural: Cache API no-op on workers.dev → KV (auto-provisioned); window extended to 33 d for T-19. R2: stuck single-flight → waitUntil + dead-flight replacement. |
| 2026-11-22 | T-11 Web shell & design tokens | Sonnet 5.5 | Sonnet 5.5 | 2 | R1: spacing/touch tokens missing. |
| 2026-11-22 | T-12 i18n | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; reviewer Context7 unreachable (builder verified APIs via Context7) |
| 2026-11-22 | T-13 Data layer | Opus (builder-opus) | Opus (reviewer-opus) | 2 | PASS round 2; fixed per-query 7d max age, 401 wipe, degraded-source stale |
| 2026-11-22 | T-14 PWA | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1 |
| 2026-11-22 | T-15 Core components | Sonnet (builder) | Sonnet (reviewer) | 2 | PASS round 2; removed duplicate error boundary, decorative icons next to visible titles |
| 2026-11-22 | T-16 Clock & day rollover | Opus (builder-opus) | Opus (reviewer-opus) | 2 | PASS round 2; partial seed reported stale, seed respects 7d max age; Context7 unreachable for reviewer (installed source checked) |
| 2026-11-22 | T-17 Day view | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; Context7 unreachable for reviewer |
| 2026-11-22 | T-18 Week view & navigation | Sonnet (builder) | Sonnet (reviewer) | 2 | PASS round 2; week icons enlarged (icon-first) |
| 2026-11-22 | T-19 "How many sleeps?" countdown | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; persister drops superseded agendas (payload size) |
| 2026-11-22 | T-20 Wake lock & fullscreen | Sonnet (builder) | Sonnet (reviewer) | 2 | PASS round 2; wake lock re-acquired while visible, control strip reserved |
| 2026-11-22 | T-21 Night mode | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; useCurrentBand removed |
| 2026-11-22 | T-22 Burn-in protection | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; banner moved to bottom slot so the toggle never moves |
| 2026-11-22 | T-23 Offline & stale UX end-to-end | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; fixed 401 wipe race (revert-cancel restored data); theme remembered before first paint |
| 2026-11-22 | T-24 Visual screenshots | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; pre-existing 4-event band overflow found, moved to follow-up |
| 2026-11-22 | M5 review fixes | Opus (builder-opus) | Opus (reviewer-opus) | 2 | Wake lock outside error boundary, fullscreen glyph token (≥3:1), dense day bands (+N, past hidden first), single error announcement, demo weekdays; orchestrator pinned pwa.spec clock (failed after 19:30 Berlin) |
| 2026-11-22 | T-25 Cloudflare deploy | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; wrangler config moved to repo root (deploy button needs it); CSP via generated _headers with boot-script hash; REPLACE_ME token fails closed; Cache-Control + ?key= logging verified; reviewer Context7 unreachable (Cloudflare docs repo + installed sources) |
| 2026-11-22 | T-29 Final design tokens | Sonnet (builder) | Sonnet (reviewer) | 2 | PASS round 2; night nav-active flipped to light fill (>=3:1, synced into docs/design); opacity-past marked not-for-text; week header uses text-tile (no mid-word wrap) |
| 2026-11-22 | T-29a Stable test hooks | Sonnet (builder) | Sonnet (reviewer) | 2 | PASS round 2; band clipping checks kept alongside day-column until T-30b |
| 2026-11-22 | T-30a Overview model and layout logic | Sonnet (builder) | Sonnet (reviewer) | 2 | PASS round 2; all folded past events kept for the strip label, strict CSS colour validation, MIN_SLOTS=3, current never hidden |
| 2026-11-22 | T-30b Four-day overview as main screen | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; today 2fr, 🌆 evening, now line + next ring, vorbei strip named, bands removed; nits (first-frame flash, badge padding, dense emoji overflow, screenshot determinism) folded into T-32 |
| 2026-11-22 | T-31 Week view in the new tile language | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; space-based +N with titles, countdown column tint, header moons, meal rows; deterministic screenshot raster flags; nits (countdown events[0] guard) folded into T-32 |
| 2026-11-22 | T-32 States and night mode per hand-off | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; error card on unchanged boundary logic, calm 401, no-flash measurement, review follow-ups a-g; dense emoji tuck under edge (open for M5b review / T-27a) |
| 2026-11-22 | T-27 Documentation | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; title rules, KB-* codes, token flow checked against code; links verified by script |
| 2026-11-23 | T-27a UI/UX dummy test loop | Opus 5.5 (builder-opus, 4 fix batches) | Sonnet (reviewer) + Opus (reviewer-opus, Batch B) | 4 test rounds | Round 1: Haiku 7/5, Sonnet 8/7, Opus 6.5/6 (children/parents), 22 findings (A1–A12 overview/tiles, B1–B10 week/countdown/states). Fixed in batches A and B, then Sonnet re-checks: round 2 8/8.5, round 3 8.5/8, round 4 8.5/9, no blockers or majors since round 2; round 4 verdict release-ready. Remaining minor week polish in issue #5. |
| 2026-11-23 | T-33 Bring list: parsing and event DTO | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; emoji-only output, bounded linear parsing, cache entry v2 with v1 last-good fallback; nits: rollback note, extra VS16 |
| 2026-11-23 | T-34 Subject fallback icons and emoji baseline | Sonnet (builder) | Sonnet (reviewer) | 1 | PASS round 1; 🛝 → 🎠 (Emoji 13.0 baseline, ADR-0011); bring list keeps emoji with redundant VS16 |
| 2026-11-23 | T-35 Bring chips on tiles | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; narrow tiles grow by a chip row (BRING_EXTRA_REM), today's tiles keep height; night chip contrast for M10 exit review |
| 2026-11-23 | T-39 Editor model: compose and parse entries | Opus (builder-opus) | Opus (reviewer-opus) | 2 | PASS round 2; DST-gap time ranges (default end +60 real min, explicit gap end rejected), countdown marker kept when it sat on a bring line, shared tests run under TZ=Pacific/Kiritimati; Context7 unreachable for subagents (installed sources checked) |
| 2026-11-23 | T-40 Worker: entry store in D1 | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; nits fixed before commit: `editor` omitted from `/api/config` when false (old strict PWA bundles), replace-import revisions taken inside the batch (`kb_meta`); `addException`/`setOverride` take a revision (409 on conflict); web parses config with `PublicConfigSchema`; gitleaks not installed locally (CI runs it) |
| 2026-11-23 | T-41 Worker: app entries on the board | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; entries rendered with ical.js and expanded like Google feeds (`app-events`/`app-meals`), D1 change stamp so a write shows in every isolate, reserved calendar ids; nits for T-43: D1 timeout in the agenda path, KV cost per write; Context7 unreachable for subagents |
| 2026-11-23 | T-42 Worker: parent lock | Opus (builder-opus) | Opus (reviewer-opus) | 2 | PASS after round 2 + plan text fix; round 1 found a structural lockout bypass via parallel unlocks (fixed: attempts reserved before the compare, per isolate and atomically in D1); PIN errors now 403 so the board never wipes its access token; canonical base64url MACs only; nits for T-43: release local reservation on exceptions (try/finally), count only settled failures |
| 2026-11-23 | T-36 Evening-before 🎒 "tomorrow bring" area | Opus (builder-opus) | Opus (reviewer-opus) | 1 | PASS round 1; resumed from interrupted partial work; night chip token --color-chip; nit: two-digit +N width for T-37 e2e |
| 2026-11-23 | T-38 School docs | Sonnet (builder) | Sonnet (reviewer, together with T-37) | 1 | PASS round 1; README/README.de bring-list section, subject icons, emoji baseline note, CONFIG window rows, troubleshooting |
| 2026-11-23 | T-37 Fixtures, demo data, e2e and screenshots | Sonnet (builder) | Sonnet (reviewer, together with T-38) | 1 | PASS round 1; e2e found a two-digit +N clip in the bag area, reservation raised to 2rem with a fit fix |

## Escalations

| Date | Task | From → To | Reason |
|---|---|---|---|
| 2026-11-22 | T-04 | Sonnet → Opus | High-risk task (CI/release pipeline) |
| 2026-11-22 | T-08 | Sonnet → Opus | High-risk task (iCal/recurrence/time zones); reviewer reported structural perf problem in round 1 |
| 2026-11-22 | T-10 | Sonnet → Opus | High-risk task (security/secrets, caching) |
| 2026-11-22 | T-13 | Sonnet → Opus | High-risk task (caching/offline, token handling) |
| 2026-11-22 | T-14 | Sonnet → Opus | High-risk task (PWA/service worker, caching/offline) |
| 2026-11-22 | T-16 | Sonnet → Opus | High-risk task (time zones/DST, day rollover) |
| 2026-11-22 | T-19 | Sonnet → Opus | Structural finding from M3 review (31-day shared query) and caching/offline (persister superseding) |
| 2026-11-22 | T-23 | Sonnet → Opus | High-risk task (caching/offline, token wipe) |
| 2026-11-22 | M5 review fixes | Sonnet → Opus | Kiosk recovery (wake lock × error boundary) and layout fixes from the M5 milestone review |
| 2026-11-22 | T-30b | Sonnet → Opus | Architecture: replaces the main screen layout (bands → four-day overview, nav rail, capacity measurement) |
| 2026-11-22 | T-32 | Sonnet → Opus | Error boundary × kiosk recovery, offline/401 states (caching/offline) |
| 2026-11-22 | M2 date-only fix | Sonnet → Opus | Time-zone fix from the M2 milestone review |
| 2026-11-23 | T-27a | Sonnet → Opus | High-risk parts (tile capacity layout, caching/refetch on reload in B5); Batch B reviewed by reviewer-opus |
| 2026-11-23 | T-33 | Sonnet → Opus | High-risk task (untrusted description parsing, privacy, worker cache versioning) |
| 2026-11-23 | T-35 | Sonnet → Opus | Tile capacity layout (space budget of chips in overview and week) |
| 2026-11-23 | T-36 | Sonnet → Opus | High-risk task (time zones/DST, midnight rollover offline, Today column space budget) |
| 2026-11-23 | T-39 | Sonnet → Opus | High-risk task (recurrence/DST, editor architecture) |
| 2026-11-23 | T-40 | Sonnet → Opus | High-risk task (data storage, concurrency, PIN handling) |
| 2026-11-23 | T-41 | Sonnet → Opus | High-risk task (iCal rendering/recurrence, caching) |
| 2026-11-23 | T-42 | Sonnet → Opus | High-risk task (security: PIN, sessions, lockout); reviewer reported a structural problem in round 1 |

## Milestone reviews

| Date | Milestone | Reviewer | Verdict | Notes |
|---|---|---|---|---|
| 2026-11-23 | M10 | Opus 5.5 (reviewer-opus) + Sonnet UI/UX check | PASS after fixes | Code review PASS (escalation rows added). UI check round 1: child 6/10, parent 7/10, major: a child's items hidden behind "+N" in the bag area. Fixed (one row per child, day cue, 28px chips, compact titles), reviewer-opus PASS after plan rewording; UI re-check child 8/10, parent 9/10, ready. Follow-ups (text-only day cue, week compact titles, week evening cue) in issue #5. Fresh clone, e2e 228, gitleaks, forbidden terms green. Context7 unreachable (installed sources checked). |
| 2026-11-22 | M5b | Opus 5.5 (reviewer-opus) | PASS after fixes (round 2) | Blocking: missing T-30b/T-32 escalation rows, ARCHITECTURE/ADR-0009 still described bands. Decision: dense tiles 3.75rem with ~3rem emoji (plan change). Follow-ups in T-27/T-27a. Context7 unreachable (installed sources checked). |
| 2026-11-22 | M5 | Opus 5.5 (reviewer-opus) | PASS after fixes | Blocking: wake lock dropped during error fallback, fullscreen glyph contrast, missing T-23 escalation row; plus pre-existing day-band clipping. All fixed (2 re-review rounds). Context7 unreachable for the first review (installed sources checked). Follow-ups in T-25/T-27. |
| 2026-11-22 | M4 | Opus 5.5 (reviewer-opus) | PASS after docs fix | Only finding: missing T-19 escalation row (added). CI + CodeQL green at 55c3587. Follow-ups folded into T-20/21/22/23/24. |
| 2026-11-22 | M3 | Opus 5.5 (reviewer-opus) | PASS (round 2) | Round 1: offline-no-data text claimed a saved plan (fixed), countdown needs 31 days vs `/api/agenda` cap 14 (plan change in T-19), escalation rows missing (added). Context7 unreachable for reviewers. Follow-ups folded into T-18/20/21/23/28. |
| 2026-11-22 | M2 | Opus 5.5 (reviewer-opus) | PASS (round 2) | Round 1 found date-only keys formatted a day early west of UTC (fixed in 815815d). Context7 unreachable for reviewers; APIs checked against installed sources. Follow-ups folded into T-15/16/17/21/23/25/27. |
| 2026-11-22 | M1 | Opus 5.5 (reviewer-opus) | PASS | Fresh clone + wrangler dev sanity green; CI green after gitleaks false-positive fix (missed for 3 commits → orchestrator now checks CI after each push). |
| 2026-11-22 | M0 | Opus 5.5 (reviewer-opus) | PASS | Fresh clone green, CI run 45013616341 green. Follow-ups folded into T-06/T-08/T-10/T-11. |

## Open questions for the maintainer

1. ~~Repo setting for release-please~~ done by the maintainer (2026-11-22); release-please runs on manual dispatch until v1.0.0.
2. Before M6: Cloudflare account/API token and the secret iCal URLs (only the maintainer can provide them).
