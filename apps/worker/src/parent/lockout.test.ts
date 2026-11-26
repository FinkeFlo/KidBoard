import { reset } from "cloudflare:test";
import { env as testEnv } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureSchema } from "../entries/schema";
import {
  clearFailures,
  type FailureOutcome,
  MAX_FAILURES,
  recordFailure,
  type Reservation,
  RESERVATION_TTL_SECONDS,
  reserveAttempt,
} from "./lockout";

/** Monday 2026-03-09, 09:00 UTC, in epoch seconds. */
const T0 = Date.parse("2026-03-09T09:00:00Z") / 1000;
const MINUTE = 60;

const db = (): D1Database => testEnv.KIDBOARD_DATA;

let warnings: string[];

beforeEach(async () => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  await ensureSchema(db());
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

/** What one unlock attempt with a wrong PIN at `now` gets: refused or the outcome. */
type Attempt =
  | { refused: true; retryAfterSeconds: number }
  | ({ refused: false } & FailureOutcome);

async function wrongPin(now: number): Promise<Attempt> {
  const reserved = await reserveAttempt(db(), now);
  if (!reserved.ok) {
    return { refused: true, retryAfterSeconds: reserved.retryAfterSeconds };
  }
  return { refused: false, ...(await recordFailure(db(), reserved, now)) };
}

async function reserve(now: number): Promise<Reservation> {
  const reserved = await reserveAttempt(db(), now);
  if (!reserved.ok) {
    throw new Error("expected a reservation");
  }
  return reserved;
}

async function rightPin(now: number): Promise<boolean> {
  const reserved = await reserveAttempt(db(), now);
  if (!reserved.ok) {
    return false;
  }
  await clearFailures(db(), reserved);
  return true;
}

async function attemptKeys(): Promise<string[]> {
  const { results } = await db()
    .prepare(
      "SELECT key FROM kb_meta WHERE key LIKE 'parent_fail:%' ORDER BY key",
    )
    .all<{ key: string }>();
  return results.map((r) => r.key);
}

describe("lockout counting", () => {
  it("counts wrong PINs since the last right PIN: spreading them over windows does not help", async () => {
    let now = T0;
    const compared: Attempt[] = [];
    // 4 wrong PINs, then 15 min + 1 s of rest, again and again.
    const burst = async (): Promise<void> => {
      for (let i = 0; i < 4; i++) {
        compared.push(await wrongPin(now));
        now += 1;
      }
      now += RESERVATION_TTL_SECONDS + 1;
    };

    await burst();
    expect(compared.map((a) => a.refused)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(
      compared.map((a) => !a.refused && !a.locked && a.attemptsLeft),
    ).toEqual([4, 3, 2, 1]);

    // The 5th wrong PIN overall, more than 15 minutes after the 4th, locks.
    const fifth = await wrongPin(now);
    expect(fifth).toEqual({
      refused: false,
      locked: true,
      retryAfterSeconds: 900,
    });
    expect(await wrongPin(now + 1)).toMatchObject({ refused: true });

    // After the lockout: a fresh count of 5 at the escalated level.
    now += 900;
    compared.length = 0;
    await burst();
    expect(
      compared.map((a) => !a.refused && !a.locked && a.attemptsLeft),
    ).toEqual([4, 3, 2, 1]);
    // The 10th wrong PIN overall locks again, now for twice as long.
    expect(await wrongPin(now)).toEqual({
      refused: false,
      locked: true,
      retryAfterSeconds: 1800,
    });
  });

  it("never compares more than 5 PINs per lockout period, however they are spread", async () => {
    let now = T0;
    let compared = 0;
    // One wrong PIN every 20 minutes for 3 days.
    for (; now < T0 + 3 * 24 * 3600; now += 20 * MINUTE) {
      const attempt = await wrongPin(now);
      if (!attempt.refused) {
        compared++;
      }
    }
    // Lockouts of 15, 30, 60, 120, 120, ... minutes: far fewer than one try per 20 min.
    expect(compared).toBeLessThan(3 * 24 * 3);
    expect(compared).toBeGreaterThan(0);
  });

  it("a single typo never locks, and a right PIN clears all earlier ones", async () => {
    expect(await wrongPin(T0)).toEqual({
      refused: false,
      locked: false,
      attemptsLeft: 4,
    });
    expect(await rightPin(T0 + 10)).toBe(true);
    expect(await attemptKeys()).toEqual([]);
    // Weeks later the count starts at 5 again.
    const later = T0 + 30 * 24 * 3600;
    expect(await wrongPin(later)).toMatchObject({ attemptsLeft: 4 });
  });

  it("keeps old wrong PINs counted until a right PIN (they do not age out)", async () => {
    for (let i = 0; i < 3; i++) {
      await wrongPin(T0 + i);
    }
    const nextDay = T0 + 24 * 3600;
    expect(await wrongPin(nextDay)).toMatchObject({ attemptsLeft: 1 });
    expect(await attemptKeys()).toHaveLength(4);
  });

  it("keeps the failures behind an active lockout and drops them once it has ended", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await wrongPin(T0 + i);
    }
    const lockEnd = T0 + 4 + 900;
    // During the lockout the rows that caused it stay; nothing new is reserved.
    expect(await wrongPin(lockEnd - 1)).toMatchObject({ refused: true });
    expect(await attemptKeys()).toHaveLength(5);
    // In the second the lockout ends: the old rows go, the new attempt counts as the first.
    expect(await wrongPin(lockEnd)).toMatchObject({ attemptsLeft: 4 });
    expect(await attemptKeys()).toHaveLength(1);
    // Later reservations do not drop the row reserved at the end of the lockout.
    expect(await wrongPin(lockEnd + 1)).toMatchObject({ attemptsLeft: 3 });
  });

  it("a right PIN after a lockout resets the escalation", async () => {
    let now = T0;
    for (let i = 0; i < MAX_FAILURES; i++) {
      await wrongPin(now++);
    }
    now += 900;
    expect(await rightPin(now)).toBe(true);
    let last: Attempt | undefined;
    for (let i = 0; i < MAX_FAILURES; i++) {
      last = await wrongPin(now++);
    }
    expect(last).toMatchObject({ locked: true, retryAfterSeconds: 900 });
  });

  it("lets a reservation that never settled (crashed request) age out", async () => {
    for (let i = 0; i < 4; i++) {
      await wrongPin(T0 + i);
    }
    await reserve(T0 + 10); // never settled
    // The limit is full: refused until the unsettled reservation ages out.
    const refused = await reserveAttempt(db(), T0 + 20);
    expect(refused).toEqual({
      ok: false,
      retryAfterSeconds: RESERVATION_TTL_SECONDS - 10,
    });
    // Afterwards the 4 settled failures still count: the next wrong PIN locks.
    expect(await wrongPin(T0 + 10 + RESERVATION_TTL_SECONDS + 1)).toMatchObject(
      { locked: true, retryAfterSeconds: 900 },
    );
  });

  it("logs every wrong PIN with counts only", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await wrongPin(T0 + i);
    }
    expect(warnings).toHaveLength(MAX_FAILURES);
    expect(warnings.slice(0, 4)).toEqual(
      [4, 3, 2, 1].map(
        (left) =>
          `[kidboard] parent unlock: wrong PIN, ${String(left)} of 5 attempts left`,
      ),
    );
    expect(warnings[4]).toBe(
      "[kidboard] parent unlock: wrong PIN, locked for 900 s after repeated wrong PINs",
    );
  });

  it("counts a wrong PIN whose reservation aged out before it settled", async () => {
    const slow = await reserve(T0);
    // Another attempt 15 min + 1 s later drops the unsettled reservation.
    expect(await wrongPin(T0 + RESERVATION_TTL_SECONDS + 1)).toMatchObject({
      attemptsLeft: 4,
    });
    expect(
      await recordFailure(db(), slow, T0 + RESERVATION_TTL_SECONDS + 2),
    ).toEqual({ locked: false, attemptsLeft: 3 });
    expect(
      (await attemptKeys()).filter((k) => k.startsWith("parent_fail:s:")),
    ).toHaveLength(2);
  });

  it("starts the lockout at the time of the failure, not of the reservation", async () => {
    for (let i = 0; i < 4; i++) {
      await wrongPin(T0 + i);
    }
    const reserved = await reserve(T0 + 10);
    const settleAt = T0 + 10 + 600;
    expect(await recordFailure(db(), reserved, settleAt)).toEqual({
      locked: true,
      retryAfterSeconds: 900,
    });
    expect(await reserveAttempt(db(), settleAt + 1)).toEqual({
      ok: false,
      retryAfterSeconds: 899,
    });
  });
});
