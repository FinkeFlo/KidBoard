import { logWarn } from "../log";

/** ADR-0013: 5 wrong PINs within 15 minutes lock the unlock route for 15 minutes. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_SECONDS = 15 * 60;
export const LOCKOUT_SECONDS = 15 * 60;

/**
 * `kb_meta` keys: one row per attempt (`parent_fail:<uuid>` → epoch seconds), reserved
 * before the PIN is compared and deleted again if it was right, and the end of an
 * active lockout (`parent_lock_until` → epoch seconds). Attempt keys lie in the key
 * range `(FAIL_PREFIX, FAIL_END)` so the primary key index serves the scans.
 */
const FAIL_PREFIX = "parent_fail:";
const FAIL_END = "parent_fail;";
const LOCK_KEY = "parent_lock_until";
/** Attempt rows inside the window; binds ?1 = FAIL_PREFIX, ?2 = FAIL_END, ?3 = window start. */
const IN_WINDOW = "key > ?1 AND key < ?2 AND value > ?3";

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

interface LocalAttempt {
  id: string;
  at: number;
}

/**
 * Unlock attempt limiter (ADR-0013). An attempt is *reserved* before the PIN is
 * compared, atomically against the limit, so parallel requests cannot test more than
 * {@link MAX_FAILURES} PINs per window: first in this isolate (synchronous check and
 * insert, no await in between), then in D1 (one batch whose conditional insert is the
 * check; strongly consistent across isolates). A wrong PIN keeps the reservation as a
 * failure and starts the lockout once the window holds {@link MAX_FAILURES}; a right
 * PIN deletes it again. The isolate copy keeps a lockout even if a D1 write is lost.
 */
export class UnlockLimiter {
  private attempts: LocalAttempt[] = [];
  private lockedUntil = 0;

  /**
   * Synchronous per-isolate reservation; call it before the request's first `await`.
   * Refused while this isolate's lockout runs or the window already holds
   * {@link MAX_FAILURES} attempts (failed or still being compared).
   */
  reserveLocal(nowSeconds: number): Reservation | Refused {
    const windowStart = nowSeconds - FAILURE_WINDOW_SECONDS;
    this.attempts = this.attempts.filter((a) => a.at > windowStart);
    if (this.lockedUntil > nowSeconds) {
      return { ok: false, retryAfterSeconds: this.lockedUntil - nowSeconds };
    }
    const oldest = this.attempts[0];
    if (oldest !== undefined && this.attempts.length >= MAX_FAILURES) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          oldest.at + FAILURE_WINDOW_SECONDS - nowSeconds,
        ),
      };
    }
    const id = crypto.randomUUID();
    this.attempts.push({ id, at: nowSeconds });
    return { ok: true, id };
  }

  /** Drops a local reservation that never reached the PIN compare (bad body, refused by D1). */
  releaseLocal(reservation: Reservation): void {
    this.attempts = this.attempts.filter((a) => a.id !== reservation.id);
  }

  /**
   * Reserves the attempt in D1 (one batch): drops attempts older than the window,
   * inserts the attempt row only if no lockout is active and the window holds fewer
   * than {@link MAX_FAILURES} rows, and reads back whether it was inserted.
   */
  async reserveRemote(
    db: D1Database,
    reservation: Reservation,
    nowSeconds: number,
  ): Promise<Reservation | Refused> {
    const windowStart = nowSeconds - FAILURE_WINDOW_SECONDS;
    const key = FAIL_PREFIX + reservation.id;
    const results = await db.batch<{ value: unknown }>([
      db
        .prepare(
          "DELETE FROM kb_meta WHERE key > ?1 AND key < ?2 AND value <= ?3",
        )
        .bind(FAIL_PREFIX, FAIL_END, windowStart),
      db
        .prepare(
          `INSERT INTO kb_meta (key, value)
           SELECT ?4, ?5
           WHERE NOT EXISTS (SELECT 1 FROM kb_meta WHERE key = ?6 AND value > ?5)
             AND (SELECT COUNT(*) FROM kb_meta WHERE ${IN_WINDOW}) < ?7`,
        )
        .bind(
          FAIL_PREFIX,
          FAIL_END,
          windowStart,
          key,
          nowSeconds,
          LOCK_KEY,
          MAX_FAILURES,
        ),
      db
        .prepare("SELECT COUNT(*) AS value FROM kb_meta WHERE key = ?1")
        .bind(key),
      db.prepare("SELECT value FROM kb_meta WHERE key = ?1").bind(LOCK_KEY),
      db
        .prepare(`SELECT MIN(value) AS value FROM kb_meta WHERE ${IN_WINDOW}`)
        .bind(FAIL_PREFIX, FAIL_END, windowStart),
    ]);
    if (asNumber(results[2]?.results[0]?.value) === 1) {
      return reservation;
    }
    const lockedUntil = asNumber(results[3]?.results[0]?.value) ?? 0;
    const oldest = asNumber(results[4]?.results[0]?.value);
    const retryAt =
      lockedUntil > nowSeconds
        ? lockedUntil
        : (oldest ?? nowSeconds) + FAILURE_WINDOW_SECONDS;
    return { ok: false, retryAfterSeconds: Math.max(1, retryAt - nowSeconds) };
  }

  /**
   * The reserved attempt was a wrong PIN: it stays counted; once the window holds
   * {@link MAX_FAILURES} attempts the lockout starts (15 min from now), here and in D1.
   *
   * The lock condition counts every attempt in the window, including reservations of
   * parallel requests whose PIN is still being compared, not only settled failures.
   * Deliberate (T-43 review follow-up): it errs on the closed side and differs only
   * while attempts run in parallel, which one family tablet does not produce (a parent
   * types one PIN at a time); telling pending from failed rows in D1 would need a
   * second row type and a settle write in this security path for no practical gain.
   */
  async fail(db: D1Database, nowSeconds: number): Promise<FailureOutcome> {
    const windowStart = nowSeconds - FAILURE_WINDOW_SECONDS;
    if (this.attempts.length >= MAX_FAILURES) {
      this.lockedUntil = Math.max(
        this.lockedUntil,
        nowSeconds + LOCKOUT_SECONDS,
      );
    }
    const results = await db.batch<{ value: unknown }>([
      db
        .prepare(
          `INSERT INTO kb_meta (key, value)
           SELECT ?4, ?5
           WHERE (SELECT COUNT(*) FROM kb_meta WHERE ${IN_WINDOW}) >= ?6
           ON CONFLICT (key) DO UPDATE SET value = MAX(value, excluded.value)`,
        )
        .bind(
          FAIL_PREFIX,
          FAIL_END,
          windowStart,
          LOCK_KEY,
          nowSeconds + LOCKOUT_SECONDS,
          MAX_FAILURES,
        ),
      db
        .prepare(`SELECT COUNT(*) AS value FROM kb_meta WHERE ${IN_WINDOW}`)
        .bind(FAIL_PREFIX, FAIL_END, windowStart),
      db.prepare("SELECT value FROM kb_meta WHERE key = ?1").bind(LOCK_KEY),
    ]);
    const count = Math.max(
      asNumber(results[1]?.results[0]?.value) ?? 0,
      this.attempts.length,
    );
    const lockedUntil = Math.max(
      asNumber(results[2]?.results[0]?.value) ?? 0,
      this.lockedUntil,
    );
    if (lockedUntil > nowSeconds) {
      logWarn("parent unlock locked after repeated wrong PINs");
      return { locked: true, retryAfterSeconds: lockedUntil - nowSeconds };
    }
    return { locked: false, attemptsLeft: Math.max(0, MAX_FAILURES - count) };
  }

  /** The reserved attempt was the right PIN: forget it here and in D1 (one delete). */
  async release(db: D1Database, reservation: Reservation): Promise<void> {
    this.releaseLocal(reservation);
    await db
      .prepare("DELETE FROM kb_meta WHERE key = ?1")
      .bind(FAIL_PREFIX + reservation.id)
      .run();
  }
}
