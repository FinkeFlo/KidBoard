# KidBoard

[English](README.md) | [Deutsch](README.de.md)

An open-source, icon-first family calendar and meal plan for a wall-mounted tablet in kiosk
mode. Built for children (about 3-8) who cannot read yet: big icons instead of text. Parents
keep editing Google Calendar as usual; KidBoard reads the calendars' secret iCal feeds on the
server side and shows a calm day and week view.

> Status: work in progress. Sections marked _coming soon_ are filled in later (see
> [docs/PLAN.md](docs/PLAN.md)).

## Features

- Day and week view designed for a 1280x800 wall tablet, readable from across the room
- Emoji icons from event titles, with keyword fallbacks (German + English)
- One or several children, each with a color and avatar
- Meal plan (breakfast, lunch, dinner) from a separate calendar
- "How many sleeps?" countdown for special events
- Night mode, offline support (PWA), automatic refresh
- iCal URLs stay secret on the server - never in the browser
- German and English UI

## Screenshots

Synthetic demo data (generated with `pnpm screenshots`; 2000x1200 versions are in
[`docs/screenshots/`](docs/screenshots/)).

| Day view                                                    | Week view                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| ![Day view](docs/screenshots/day-light-1280x800.png)        | ![Week view](docs/screenshots/week-light-1280x800.png)        |
| ![Day view, night](docs/screenshots/day-night-1280x800.png) | ![Week view, night](docs/screenshots/week-night-1280x800.png) |

The "How many sleeps?" countdown turns into a party popper on the big day:

![Countdown reaches today](docs/screenshots/day-countdown-today-1280x800.png)

## Google Calendar setup

_Coming soon._ In short: create calendars such as "Kinder" and "Essen", copy each calendar's
**secret address in iCal format**, and store it as a Worker secret (`CAL_<ID>_URL`).
Never share or commit these URLs.

## Calendar title conventions

| Raw event title (calendar)     | Icon          | Title     | Children | Meal slot |
| ------------------------------ | ------------- | --------- | -------- | --------- |
| `⚽ Fußball` (Ben's calendar)  | ⚽            | Fußball   | Ben      | -         |
| `Mia: 🩰 Ballett`              | 🩰            | Ballett   | Mia      | -         |
| `Mia, Ben: 🛁 Baden`           | 🛁            | Baden     | Mia, Ben | -         |
| `🏫 Kita` (Kinder)             | 🏫            | Kita      | everyone | -         |
| `Zahnarzt`                     | 🦷 (fallback) | Zahnarzt  | everyone | -         |
| `Mittag: 🍝 Spaghetti` (Essen) | 🍝            | Spaghetti | -        | lunch     |
| `Dinner: Pizza` (Essen)        | 🍕 (fallback) | Pizza     | -        | dinner    |

Full rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#title-conventions-parsing-rules).

## Configuration

See [docs/CONFIG.md](docs/CONFIG.md) for every option, and
[config.example.json](config.example.json) and
[apps/worker/.dev.vars.example](apps/worker/.dev.vars.example) for templates.

## Deploy

_Coming soon._ Cloudflare Workers (T-25) and Vercel (T-26) guides will follow.

## Kiosk tips

_Coming soon._ Fully Kiosk Browser, installed PWA, keeping the screen awake (T-27).

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm dev            # web (Vite) + worker (wrangler dev)
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [architecture](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE) (c) 2026 FinkeFlo
