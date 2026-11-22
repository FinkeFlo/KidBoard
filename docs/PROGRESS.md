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
| 2026-11-22 | M2 date-only fix | Sonnet → Opus | Time-zone fix from the M2 milestone review |

## Milestone reviews

| Date | Milestone | Reviewer | Verdict | Notes |
|---|---|---|---|---|
| 2026-11-22 | M4 | Opus 5.5 (reviewer-opus) | PASS after docs fix | Only finding: missing T-19 escalation row (added). CI + CodeQL green at 55c3587. Follow-ups folded into T-20/21/22/23/24. |
| 2026-11-22 | M3 | Opus 5.5 (reviewer-opus) | PASS (round 2) | Round 1: offline-no-data text claimed a saved plan (fixed), countdown needs 31 days vs `/api/agenda` cap 14 (plan change in T-19), escalation rows missing (added). Context7 unreachable for reviewers. Follow-ups folded into T-18/20/21/23/28. |
| 2026-11-22 | M2 | Opus 5.5 (reviewer-opus) | PASS (round 2) | Round 1 found date-only keys formatted a day early west of UTC (fixed in 815815d). Context7 unreachable for reviewers; APIs checked against installed sources. Follow-ups folded into T-15/16/17/21/23/25/27. |
| 2026-11-22 | M1 | Opus 5.5 (reviewer-opus) | PASS | Fresh clone + wrangler dev sanity green; CI green after gitleaks false-positive fix (missed for 3 commits → orchestrator now checks CI after each push). |
| 2026-11-22 | M0 | Opus 5.5 (reviewer-opus) | PASS | Fresh clone green, CI run 45013616341 green. Follow-ups folded into T-06/T-08/T-10/T-11. |

## Open questions for the maintainer

1. **Repo setting needed (blocks releases, T-28):** Settings → Actions → General → Workflow permissions → enable "Allow GitHub Actions to create and approve pull requests". release-please fails on every push until then.
2. Before M6: Cloudflare account/API token and the secret iCal URLs (only the maintainer can provide them).
