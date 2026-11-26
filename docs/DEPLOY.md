# Deploy KidBoard to Cloudflare

[Deutsch](DEPLOY.de.md)

KidBoard runs as **one Cloudflare Worker**: it serves the board (static assets from
`apps/web/dist`) and the JSON API under `/api/*`, stores the entries made in the parent
editor and, optionally, reads your Google calendars' secret iCal addresses on the server.
The Workers Free plan is enough for a family. You get a URL like
`https://kidboard.<your-subdomain>.workers.dev`.

Everything Wrangler needs is in the root [`wrangler.jsonc`](../wrangler.jsonc). Secrets
never go into the repository: they are Worker secrets in your Cloudflare account.

## 1. Before you start

You need:

1. A free **Cloudflare account** (and for option A a GitHub or GitLab account).
2. An **access token** (required), for example the output of `openssl rand -hex 32`.
   Without a valid one the API refuses every request, so your calendar is never public by
   accident. Allowed length and characters, and the opt-in for a deliberately public board:
   [CONFIG.md](CONFIG.md#secrets-and-environment-variables).
3. A **parent PIN** of 6 to 12 digits for the editor, not easy to guess (no birthdays). Which
   PINs are refused and how wrong PINs lock the editor:
   [CONFIG.md](CONFIG.md#secrets-and-environment-variables).
4. Your **settings** (`KIDBOARD_CONFIG`) as **one line of JSON**: children, time zone, ...
   The deploy form pre-fills an example with two children and no calendars. All options are
   in [CONFIG.md](CONFIG.md).
5. Optional, also later: the **secret iCal address** of every Google calendar you want to
   show. Google Calendar (web): Settings > your calendar > "Integrate calendar" > **Secret
   address in iCal format**. Treat it like a password: anyone with it can read the
   calendar. List each calendar in `calendars` of `KIDBOARD_CONFIG` and add a matching
   secret `CAL_<ID>_URL` (id in upper case: `kinder` -> `CAL_KINDER_URL`). To turn a config
   file such as [`config.example.json`](../config.example.json) into one line:

   ```sh
   node -e "process.stdout.write(JSON.stringify(require('./config.example.json')))"
   ```

## 2. Secrets and variables

The worker reads exactly these names (`apps/worker/src/env.ts`). What each one accepts, its
default and what happens with a missing or invalid value:
[CONFIG.md](CONFIG.md#secrets-and-environment-variables).

| Name                       | Kind                 | Required                | What for                                         |
| -------------------------- | -------------------- | ----------------------- | ------------------------------------------------ |
| `CAL_<ID>_URL`             | secret               | per calendar (optional) | Secret iCal address of a calendar in `calendars` |
| `KIDBOARD_ACCESS_TOKEN`    | secret               | yes                     | Protects the API; needed for the editor          |
| `KIDBOARD_PUBLIC`          | variable             | no                      | Opt-in for a public board without a token        |
| `KIDBOARD_CONFIG`          | secret or variable   | yes                     | Your settings as single-line JSON                |
| `KIDBOARD_ALLOWED_ORIGINS` | variable             | no                      | Only for API use from another origin             |
| `KIDBOARD_CACHE_TTL`       | variable             | no                      | Seconds a feed counts as fresh                   |
| `KIDBOARD_CACHE`           | KV namespace binding | automatic               | Feed cache; created on the first deploy          |
| `KIDBOARD_PARENT_PIN`      | secret               | no                      | Turns on the parent editor                       |
| `KIDBOARD_DATA`            | D1 database binding  | automatic               | Editor entries; created on the first deploy      |
| `KIDBOARD_FEED_TOKEN`      | secret               | no                      | Turns on the phone feed of the editor's entries  |

Plain-text variables set in the dashboard survive later deploys (`keep_vars: true`);
secrets always do. The template for all of them is [`.dev.vars.example`](../.dev.vars.example).

## 3. Option A: "Deploy to Cloudflare" button

The quickest way, but it needs a free **GitHub or GitLab account**. Here is what happens:
Cloudflare asks you to install its GitHub App **"Cloudflare Workers & Pages"** (or, for
GitLab, its GitLab integration) and give it access to your repositories. It then creates a copy of KidBoard as a new repository in your
account (private if you tick that box) and deploys it. Every later change pushed to that
copy deploys again. No GitHub account? Use
[option B](#4-option-b-from-your-computer-no-github-account-wrangler-cli).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/FinkeFlo/kidboard)

1. Click the button and log in to Cloudflare.
2. Connect GitHub or GitLab and choose a name for the new repository. Cloudflare copies
   KidBoard into your account; later pushes to it redeploy automatically. This copy is
   separate from this repository: new KidBoard versions do not reach it by themselves.
3. Keep or change the **Worker name** (default `kidboard`, it becomes part of the URL) and
   keep the suggested **KV namespace** (`KIDBOARD_CACHE`) and **D1 database**
   (`KIDBOARD_DATA`).
4. Fill in the three secrets the page asks for (taken from `.dev.vars.example`):
   `KIDBOARD_ACCESS_TOKEN`, `KIDBOARD_PARENT_PIN` and `KIDBOARD_CONFIG` (change the example
   children). **Replace every `REPLACE_ME`** (only `KIDBOARD_PARENT_PIN` may keep it: the
   parent editor then stays off). Google calendars are not asked for; add them later
   (step 7).
5. Check the build settings. The repository is a pnpm monorepo, so the build must run in
   the repository root:
   - Root directory: empty (repository root)
   - Build command: `pnpm run build` (pre-filled from `package.json`; builds the web app,
     then dry-runs the worker)
   - Deploy command: `npx wrangler deploy` (the default; uses the `wrangler` version pinned
     in the root `package.json` and the root `wrangler.jsonc`)

   Node.js 22 comes from `.nvmrc`, pnpm from the `packageManager` field.
6. Create and deploy. The first build takes a few minutes.
7. Google calendars or a changed setting: Workers & Pages > your Worker > Settings >
   Variables and Secrets. Add `calendars` to `KIDBOARD_CONFIG` and one `CAL_<ID>_URL` per
   calendar (Add, type "Secret"). Saving deploys a new version.

**Limit the app's access after the first deploy** (GitHub). The app may have been given
access to all your repositories. Open <https://github.com/settings/installations>, choose
"Cloudflare Workers & Pages" > Configure, set **Repository access** to **Only select
repositories** and pick your new KidBoard repository. Cloudflare's docs describe how to
limit it.

## 4. Option B: from your computer, no GitHub account (Wrangler CLI)

This way needs no GitHub account and no git, only:

- a free Cloudflare account,
- [Node.js](https://nodejs.org/) 22 (LTS),
- pnpm 10: after installing Node, run `corepack enable` once.

1. Get KidBoard: on the [repository page](https://github.com/FinkeFlo/kidboard) choose
   **Code > Download ZIP** (the current `main`; once there are releases, the source
   archive of the latest release works the same way) and unpack it. If you use git, cloning
   works just as well: `git clone https://github.com/FinkeFlo/kidboard.git`.
2. Open a terminal in the unpacked folder and run:

   ```sh
   pnpm install
   pnpm exec wrangler login          # opens the browser once
   pnpm deploy:cloudflare            # builds apps/web, then `wrangler deploy`
   ```

The first deploy creates the Worker, its KV namespace and its D1 database. Then set the secrets (each command
prompts for the value; every change is deployed at once):

```sh
pnpm exec wrangler secret put KIDBOARD_ACCESS_TOKEN
pnpm exec wrangler secret put KIDBOARD_PARENT_PIN
pnpm exec wrangler secret put CAL_KINDER_URL       # optional: one per calendar, CAL_<ID>_URL
node -e "process.stdout.write(JSON.stringify(require('./my-config.json')))" \
  | pnpm exec wrangler secret put KIDBOARD_CONFIG
```

Or all at once from a filled-in copy of the template, which is git-ignored because of its
name: copy `.dev.vars.example` to `.dev.vars.production`, fill it in, run
`pnpm exec wrangler secret bulk .dev.vars.production` and delete the file afterwards.

Updating later: download the ZIP again, unpack it into a new, empty folder (do not mix it
with the old one) and run `pnpm install` and `pnpm deploy:cloudflare` there (log in again
with `pnpm exec wrangler login` if Wrangler asks). With a clone:
`git pull && pnpm install && pnpm deploy:cloudflare`. Your secrets, the cache and the
editor's entries stay: the deploy reuses the storage of the Worker already deployed under
the same name, so you do not need to keep the ids Wrangler may write into `wrangler.jsonc`.
This holds as long as the Worker keeps its name (`kidboard`) and your Cloudflare account. A
renamed Worker or another account starts with an empty cache and an empty database: save a
backup in the editor first ("Download backup", see
[the parent editor](../README.md#the-parent-editor)).

## 5. Check the deployment

Replace `<url>` and `<token>`:

```sh
curl -s https://<url>/api/health                                         # {"ok":true}
curl -s -H "Authorization: Bearer <token>" https://<url>/api/config      # your public settings
curl -s -H "Authorization: Bearer <token>" "https://<url>/api/agenda?days=3"
```

In the agenda answer every entry of `sources` should have `"status":"ok"` (without Google
calendars and with the editor off the list is empty). `"error"` means that calendar's
secret is missing, misspelled or the address is wrong.

Then open **`https://<url>/?key=<token>` once on the tablet**. The board stores the token,
removes it from the address bar and from then on sends it as a header. Install it as an app
(browser menu > "Add to home screen") or point your kiosk browser at `https://<url>/`.

Changing the token: set a new `KIDBOARD_ACCESS_TOKEN`; the tablet then says "This tablet
needs a new access link", wipes its stored calendar data and forgets the old token until you open
a new `?key=` link.

## 6. Optional: custom domain

Worker > Settings > Domains & Routes > Add > Custom domain (the domain must be on
Cloudflare). The board works the same; the Cache API is then available as an extra fallback
(on `workers.dev` the worker relies on the KV namespace, ADR-0006).

## 7. HTTP caching and security headers

Checked against the Cloudflare docs (Workers Static Assets, "Headers") and with
`wrangler dev`: every static asset is served with **`Cache-Control: public, max-age=0,
must-revalidate`** plus an `ETag`. That holds for `sw.js`, `index.html` (also as the
single-page-application fallback) and `manifest.webmanifest`, so browsers revalidate them
on every use and a new deploy is picked up at once; nothing is cached too long, and
KidBoard does not override it. Hashed files under `/assets/` are also revalidated (cheap
`304`) and the service worker keeps its own copy anyway.

`vite build` generates `apps/web/dist/_headers` (`apps/web/headers/staticHeaders.ts`),
which Workers Static Assets applies to all static responses:

- `Content-Security-Policy`: only same-origin resources, no `eval`, no inline code except
  the theme boot script in `index.html`, allowed by its SHA-256 hash. The hash is computed
  from the built file on every build, so it cannot go stale.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (the first visit's
  `?key=` is never sent as a referrer), `Permissions-Policy` without camera, microphone,
  geolocation, payment and USB (wake lock and fullscreen stay allowed).
- Framing is limited to the board's own origin (`frame-ancestors 'self'`), so other sites
  cannot embed it. To embed it in a dashboard (e.g. Home Assistant), add that dashboard's
  origin to `FRAME_ANCESTORS` in `apps/web/headers/staticHeaders.ts`.

`_headers` does not apply to `/api/*`: the worker answers those itself with
`Cache-Control: no-store`, `nosniff` and `Referrer-Policy: no-referrer`.

## 8. Logs and the `?key=` link

- **Workers Logs** (enabled in `wrangler.jsonc`, the default for new Workers) record one
  invocation log per **Worker invocation**, with method and URL. The `/?key=…` page load
  never invokes the Worker: `/` is a static asset, only `/api/*` runs the Worker first
  (`run_worker_first`), and since compatibility date 2025-04-01 navigations prefer asset
  serving. So the link with the token is **not** in Workers Logs, and therefore not in
  Workers Logpush (`workers_trace_events`) or Tail Workers either. Local check with
  `wrangler dev`: the captured traces contained only the `/api/*` requests.
- API requests carry the token in the `Authorization` header; Cloudflare's trace events
  redact header values whose name contains "auth", "key" or "token" by default. The API also accepts `?key=` (e.g. for `curl`);
  `observability.redact_query_string: true` removes query strings from logged URLs.
- **Not covered:** zone-level HTTP request logs. With a custom domain, Cloudflare's HTTP
  request logs (Logpush dataset `http_requests`, Enterprise plans) and analytics can
  contain the full request URL including `?key=`. The token also stays in the browser
  history of the device on which you opened the link, and in the place you sent the link
  through. Open it directly on the tablet, and rotate the token if the link leaks.
- KidBoard itself never logs feed URLs, tokens or calendar content (only ids, secret
  _names_ and reason codes).

## 9. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Board says "This tablet needs a new access link" | Wrong or changed token: open `https://<url>/?key=<token>` again. |
| `/api/config` answers `500 server_misconfigured` | `KIDBOARD_CONFIG` missing or invalid (Workers Logs list the validation errors), or `KIDBOARD_ACCESS_TOKEN` is missing or does not meet the [token rules](CONFIG.md#secrets-and-environment-variables) (the log names the reason). |
| Editor locked for a long time | Wrong PINs were entered repeatedly; the lock grows with every further lockout ([lockout rules](CONFIG.md#secrets-and-environment-variables)) and ends by itself. A holder of the access token can repeat this: rotate `KIDBOARD_ACCESS_TOKEN` and open the tablet link again. |
| A calendar is missing, `sources[].status` is `error` | Secret name does not match the calendar id (`CAL_<ID>_URL`, upper case) or the iCal address is wrong. |
| Deploy form (GitHub): "Your GitHub authorization has expired …" | Cloudflare's reinstall instructions say: open <https://github.com/settings/installations>, choose "Cloudflare Workers & Pages", uninstall it, then connect GitHub again (start the deploy form again and install the app when asked). |
| Build fails with a pnpm error | Add the build variable `PNPM_VERSION=10.28.0` (Worker > Settings > Build). |
| `The directory specified by the "assets.directory" field ... does not exist` | The web app was not built: use `pnpm deploy:cloudflare` or the build command `pnpm run build`. |
| Old version still shown | The tablet checks for a new version hourly and reloads itself; or reload once. |

## How this guide was verified

Without a Cloudflare account (no real deploy): `pnpm exec wrangler deploy --dry-run`
(also in CI) and `pnpm deploy:cloudflare --dry-run` with the root config; `wrangler dev`
with fake secrets (`TESTONLY-not-a-secret` token, calendars from `fixtures/ics` on a local
HTTP server), `curl` against `/api/health`, `/api/config`, `/api/agenda` (with and without
token) and the static paths (`Cache-Control`, `_headers`), and a headless Chromium opening
`/?key=…` (token stored and stripped, service worker active, zero CSP violations). Option B without
git: an archive of the repository without `.git`, unpacked, ran `pnpm install` (the git
hooks are skipped), `pnpm build` and `pnpm deploy:cloudflare --dry-run`. The
button flow, Workers Builds and the production log behaviour follow the Cloudflare docs and
need a real account to confirm.
