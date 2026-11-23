# ADR-0013: Parent lock for the editor (PIN, short sessions, lockout)

- Status: accepted
- Date: 2026-11-23

## Context
The editor (ADR-0014) runs on the same wall tablet the children use. Children aged 3–8
must not reach it by accident, and someone who only has the board's access token (it is in
the tablet's storage and in the `/?key=` link) must not be able to change the family's
calendars. There are no user accounts (ADR-0002).

## Options
1. **Parent PIN checked by the worker**, exchanged for a short-lived signed session token.
2. Client-only PIN (checked in the browser) - anyone with the access token could call the
   write API directly.
3. Cloudflare Access / Zero Trust in front of `/api/parent/*` - strong, but another account
   setup step per family and awkward on a kiosk tablet.
4. A second long random "editor token" - secure but not something a parent can type.

## Decision
Option 1.

* **Secret** `KIDBOARD_PARENT_PIN`: 6 to 12 digits. Shorter, non-digit or the template
  value → the editor stays off and the worker logs a configuration warning (fail closed).
* **Access token required:** the editor (and with it the app entries on the board and
  the phone feed) is on only when `KIDBOARD_ACCESS_TOKEN` is set too (non-empty, not the
  template value). Without it anyone who finds the URL could try PINs and run the
  family into the lockout; the worker logs a configuration warning (never the values),
  `/api/config` reports no `editor` flag and every `/api/parent/*` path is 404. The
  read-only board keeps working without an access token as before.
* **Unlock:** `POST /api/parent/unlock` with `{ pin }` (plus the normal access token, if
  one is set). Compared in constant time (same helper as the access token). Success →
  `{ token, expiresAt }`, a session token `v1.<expiryEpochSeconds>.<base64url HMAC-SHA-256>`
  signed with a key derived from the PIN and a random 32-byte server secret that the worker
  generates once and keeps in D1 (ADR-0014), valid 15 minutes. Changing the PIN invalidates
  all sessions. No server-side session store.
* **Write and editor-read routes** (`/api/parent/*` except `unlock`) need
  `X-KidBoard-Parent: <session token>` in addition to the access token; expired or wrong
  → 403 `parent_locked`. A wrong PIN at unlock is 403 `wrong_pin` (with the attempts
  left). 401 stays reserved for the access token: the board client forgets its token on
  any 401. Bearer header, no cookies → no CSRF; CORS for listed origins
  additionally allows `POST, PATCH, DELETE` and the two headers.
* **Lockout:** after 5 wrong PINs within 15 minutes the unlock route answers 429
  `parent_lockout` (with `Retry-After`) for 15 minutes. Counted in D1 (ADR-0014,
  strongly consistent) plus a per-isolate counter. Not per IP: a family has one board.
  Every attempt is *reserved* before the PIN is compared, so parallel requests cannot
  test more than 5 PINs per window: synchronously in the isolate, then in D1 with one
  batch that inserts the attempt row only if no lockout is active and the window holds
  fewer than 5 attempts; not reserved → 429 without comparing. A wrong PIN keeps the
  row, marked as a settled failure; a right PIN deletes its reservation and every
  settled failure of the window (in D1 and in its isolate), so a parent's earlier typos
  do not count against the next unlock. Reservations of parallel attempts still being
  compared are not cleared: at most 5 PINs are compared at once, and without the right
  PIN at most 5 per window. Another isolate's own copy of earlier failures ages out with
  the window (fail closed).
* **Tablet UI:** no visible "edit" button for children. The entry is a small, low-contrast
  ✏️ control in the nav rail that opens only after a 2-second press and hold (same pattern
  as the fullscreen control), then a PIN pad. The session lives in memory only (not in
  localStorage); the editor locks itself after 3 minutes without a touch, when the tab is
  hidden, and on "Done"; the board's auto-return does not run while the editor is open.

## Consequences
* A 6-digit PIN with a lockout of 5 tries per 15 minutes is ~1.75 years of expected
  online guessing even with a stolen access token; acceptable for a family calendar. A
  right PIN resets the count, which helps only someone who already knows the PIN.
* Families must set an access token to use the editor; a deployment without one stays
  the read-only board (the deploy form asks for both).
* The PIN is typed on the tablet in view of children; parents may change it any time
  (`wrangler secret put` / dashboard) and all sessions end.
* Opening the editor from a phone works too (same URL with `?key=` once, then PIN).
