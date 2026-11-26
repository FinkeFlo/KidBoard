import { PARENT_LOCKOUT_SECONDS } from "@kidboard/shared";

import { logWarn } from "../log";

/**
 * ADR-0013: wrong PINs count since the last right PIN, not per time window. Every
 * {@link MAX_FAILURES}th wrong PIN locks the unlock route. The first lockout lasts
 * {@link PARENT_LOCKOUT_SECONDS}; every further lockout without a right PIN in between
 * doubles it (15 min, 30, 60, 120 up to {@link MAX_LOCKOUT_SECONDS}), so at most
 * {@link MAX_FAILURES} PINs are compared per lockout period and guessing a PIN through
 * the lockout never gets cheaper than a few hundred tries per year. Spreading wrong PINs
 * over time does not help: they do not age out.
 */
export const MAX_FAILURES = 5;
/**
 * How long an *unsettled* reservation (an attempt whose PIN compare never reported
 * back, e.g. a crashed request) stays counted. Settled failures never age out.
 */
export const RESERVATION_TTL_SECONDS = 15 * 60;
export const MAX_LOCKOUT_SECONDS = 2 * 60 * 60;

/**
 * `kb_meta` keys: one row per attempt (→ epoch seconds of the attempt), reserved as
 * `parent_fail:<uuid>` before the PIN is compared; a wrong PIN renames it to
 * `parent_fail:s:<uuid>` (settled failure), a right PIN deletes it together with every
 * settled failure. Plus the end of the latest lockout (`parent_lock_until` → epoch
 * seconds; the row stays after the lockout ended) and the number of lockouts since the
 * last right PIN (`parent_lock_level`). Reservations lie in the key range
 * `(FAIL_PREFIX, SETTLED_PREFIX)` (a UUID starts with a hex digit, which sorts before
 * `s`) and settled failures in `(SETTLED_PREFIX, SETTLED_END)`, so the primary key index
 * serves the scans.
 *
 * Life of the settled rows: they stay counted until a right PIN deletes them. The
 * failure that brings the count to {@link MAX_FAILURES} sets the lockout and keeps its
 * row, so during the lockout the rows show the attempts that caused it (and attempts
 * that were still being compared when it started settle next to them; no new attempt
 * is reserved while it runs). The first reservation after the lockout has ended deletes
 * every settled row older than the end of that lockout (`value < parent_lock_until`): they
 * were paid for with the lockout, so the next period starts with a fresh count of
 * {@link MAX_FAILURES} at the escalated level. Rows reserved after the end have
 * `value >= parent_lock_until` and are kept. The level stays until a right PIN.
 */
const FAIL_PREFIX = "parent_fail:";
const SETTLED_PREFIX = "parent_fail:s:";
const SETTLED_END = "parent_fail:s;";
const LOCK_KEY = "parent_lock_until";
const LEVEL_KEY = "parent_lock_level";

/**
 * Attempt rows that count against the limit: every settled failure plus the
 * reservations younger than {@link RESERVATION_TTL_SECONDS}. Binds ?1 = FAIL_PREFIX,
 * ?2 = SETTLED_PREFIX, ?3 = SETTLED_END, ?4 = oldest counted reservation time (exclusive).
 */
const COUNTED =
  "((key > ?1 AND key < ?2 AND value > ?4) OR (key > ?2 AND key < ?3))";

export interface Refused {
  ok: false;
  retryAfterSeconds: number;
}

/** A reserved attempt: settle it with `fail` or `release` once the PIN is compared. */
export interface Reservation {
  ok: true;
  id: string;
}

export type FailureOutcome =
  | { locked: false; attemptsLeft: number }
  | { locked: true; retryAfterSeconds: number };

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/*
 * Unlock attempt limiter (ADR-0013); D1 is the only state, so it holds across isolates.
 * An attempt is *reserved* before the PIN is compared, atomically against the limit
 * (one batch whose conditional insert is the check), so parallel requests cannot test
 * more than MAX_FAILURES PINs per lockout period. A wrong PIN keeps the reservation as
 * a settled failure and starts the lockout once MAX_FAILURES attempts are counted; a
 * right PIN deletes it, clears every settled failure (the parent typed the PIN; earlier
 * typos no longer count) and resets the escalation. Reservations of attempts still
 * being compared stay counted, so even next to a right PIN no more than MAX_FAILURES
 * PINs are being compared at once. A reservation that never settles (crashed request)
 * stops counting after RESERVATION_TTL_SECONDS, so it cannot lock parents out forever.
 */

/**
 * Reserves a new attempt: drops reservations older than {@link RESERVATION_TTL_SECONDS}
 * and the settled failures paid for by a lockout that has ended, inserts the attempt
 * row only if no lockout is active and fewer than {@link MAX_FAILURES} attempts are
 * counted, and reads back whether it was inserted.
 */
export async function reserveAttempt(
  db: D1Database,
  nowSeconds: number,
): Promise<Reservation | Refused> {
  const reservationStart = nowSeconds - RESERVATION_TTL_SECONDS;
  const id = crypto.randomUUID();
  const key = FAIL_PREFIX + id;
  const results = await db.batch<{ value: unknown }>([
    db
      .prepare(
        "DELETE FROM kb_meta WHERE key > ?1 AND key < ?2 AND value <= ?3",
      )
      .bind(FAIL_PREFIX, SETTLED_PREFIX, reservationStart),
    // Strict `<`: a failure reserved in the second the lockout ended is a new one.
    db
      .prepare(
        `DELETE FROM kb_meta WHERE key > ?1 AND key < ?2
           AND (SELECT value FROM kb_meta WHERE key = ?3) <= ?4
           AND value < (SELECT value FROM kb_meta WHERE key = ?3)`,
      )
      .bind(SETTLED_PREFIX, SETTLED_END, LOCK_KEY, nowSeconds),
    db
      .prepare(
        `INSERT INTO kb_meta (key, value)
         SELECT ?5, ?6
         WHERE NOT EXISTS (SELECT 1 FROM kb_meta WHERE key = ?7 AND value > ?6)
           AND (SELECT COUNT(*) FROM kb_meta WHERE ${COUNTED}) < ?8`,
      )
      .bind(
        FAIL_PREFIX,
        SETTLED_PREFIX,
        SETTLED_END,
        reservationStart,
        key,
        nowSeconds,
        LOCK_KEY,
        MAX_FAILURES,
      ),
    db
      .prepare("SELECT COUNT(*) AS value FROM kb_meta WHERE key = ?1")
      .bind(key),
    db.prepare("SELECT value FROM kb_meta WHERE key = ?1").bind(LOCK_KEY),
    // Only reservations: settled failures never age out, so they set no retry time.
    db
      .prepare(
        "SELECT MIN(value) AS value FROM kb_meta WHERE key > ?1 AND key < ?2",
      )
      .bind(FAIL_PREFIX, SETTLED_PREFIX),
  ]);
  if (asNumber(results[3]?.results[0]?.value) === 1) {
    return { ok: true, id };
  }
  const lockedUntil = asNumber(results[4]?.results[0]?.value) ?? 0;
  const oldestReservation = asNumber(results[5]?.results[0]?.value);
  // Without an active lockout the limit is full only while attempts are still being
  // compared (the failure that fills it sets the lockout): they settle in moments, at
  // the latest their reservations age out.
  const retryAt =
    lockedUntil > nowSeconds
      ? lockedUntil
      : (oldestReservation ?? nowSeconds) + RESERVATION_TTL_SECONDS;
  return { ok: false, retryAfterSeconds: Math.max(1, retryAt - nowSeconds) };
}

/**
 * The reserved attempt was a wrong PIN: it stays counted; once {@link MAX_FAILURES}
 * attempts are counted and no lockout is active, the lockout starts and its level rises
 * (duration {@link PARENT_LOCKOUT_SECONDS} doubled per earlier lockout, at most
 * {@link MAX_LOCKOUT_SECONDS}). Both conditional inserts test the same state, and the
 * batch is one transaction, so parallel failures escalate once. Every wrong PIN is
 * logged (counts only; this function never sees the PIN).
 *
 * The lock condition counts every counted attempt, including reservations of parallel
 * requests whose PIN is still being compared, not only settled failures. Deliberate:
 * it errs on the closed side and differs only while attempts run in parallel, which one
 * family tablet does not produce (a parent types one PIN at a time). The settle write
 * (rename to the settled key range) decides what a later right PIN clears and that the
 * row no longer ages out.
 */
export async function recordFailure(
  db: D1Database,
  reservation: Reservation,
  nowSeconds: number,
): Promise<FailureOutcome> {
  const reservationStart = nowSeconds - RESERVATION_TTL_SECONDS;
  const mustLock = `(SELECT COUNT(*) FROM kb_meta WHERE ${COUNTED}) >= ?7
         AND NOT EXISTS (SELECT 1 FROM kb_meta WHERE key = ?5 AND value > ?6)`;
  const results = await db.batch<{ value: unknown }>([
    // Settle the reservation: it stays counted, now as a failure a right PIN clears.
    db
      .prepare("UPDATE kb_meta SET key = ?1 WHERE key = ?2")
      .bind(SETTLED_PREFIX + reservation.id, FAIL_PREFIX + reservation.id),
    // Raise the level first; the lock below is sized from the raised level.
    db
      .prepare(
        `INSERT INTO kb_meta (key, value)
         SELECT ?8, 1
         WHERE ${mustLock}
         ON CONFLICT (key) DO UPDATE SET value = value + 1`,
      )
      .bind(
        FAIL_PREFIX,
        SETTLED_PREFIX,
        SETTLED_END,
        reservationStart,
        LOCK_KEY,
        nowSeconds,
        MAX_FAILURES,
        LEVEL_KEY,
      ),
    db
      .prepare(
        `INSERT INTO kb_meta (key, value)
         SELECT ?5, ?6 + MIN(?9 * (1 << MIN(MAX(
           (SELECT value FROM kb_meta WHERE key = ?8) - 1, 0), 20)), ?10)
         WHERE ${mustLock}
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .bind(
        FAIL_PREFIX,
        SETTLED_PREFIX,
        SETTLED_END,
        reservationStart,
        LOCK_KEY,
        nowSeconds,
        MAX_FAILURES,
        LEVEL_KEY,
        PARENT_LOCKOUT_SECONDS,
        MAX_LOCKOUT_SECONDS,
      ),
    db
      .prepare(`SELECT COUNT(*) AS value FROM kb_meta WHERE ${COUNTED}`)
      .bind(FAIL_PREFIX, SETTLED_PREFIX, SETTLED_END, reservationStart),
    db.prepare("SELECT value FROM kb_meta WHERE key = ?1").bind(LOCK_KEY),
  ]);
  const count = asNumber(results[3]?.results[0]?.value) ?? 0;
  const lockedUntil = asNumber(results[4]?.results[0]?.value) ?? 0;
  if (lockedUntil > nowSeconds) {
    const retryAfterSeconds = lockedUntil - nowSeconds;
    logWarn(
      `parent unlock: wrong PIN, locked for ${String(retryAfterSeconds)} s after repeated wrong PINs`,
    );
    return { locked: true, retryAfterSeconds };
  }
  const attemptsLeft = Math.max(0, MAX_FAILURES - count);
  logWarn(
    `parent unlock: wrong PIN, ${String(attemptsLeft)} of ${String(MAX_FAILURES)} attempts left`,
  );
  return { locked: false, attemptsLeft };
}

/**
 * The reserved attempt was the right PIN: forget it, every settled failure and the
 * lockout level (one delete). Reservations of parallel attempts whose PIN is still
 * being compared stay counted (they settle on their own). An active lockout is
 * untouched: while it runs no PIN is compared at all.
 */
export async function clearFailures(
  db: D1Database,
  reservation: Reservation,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM kb_meta WHERE key = ?1 OR key = ?4 OR (key > ?2 AND key < ?3)",
    )
    .bind(FAIL_PREFIX + reservation.id, SETTLED_PREFIX, SETTLED_END, LEVEL_KEY)
    .run();
}
