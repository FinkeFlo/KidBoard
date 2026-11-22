# Component specs

Sizes are px at the 1280×800 baseline (root 16px); implement them with the tokens in
[`tokens.css`](tokens.css), which are rem and scale with the board. Labels in quotes are the
German UI strings; every one needs an EN counterpart in the locale files.

## EventTile

An event as a large picture tile: emoji, title, time-of-day icon with time, and the child's
sign in the corner.

| | Large (today) | Compact (other days) | Dense (today, 6+ events) |
|---|---|---|---|
| Height | `--spacing-tile` (80) | `--spacing-tile-compact` (76) | 60 |
| Emoji | 50 | 40 | 40 |
| Title | `--text-tile` (22, 800) | `--text-tile-compact` (19, 800) | `--text-tile-compact` |
| Badge | `--spacing-badge` (40) | 36 | 32 |

- **One child:** background `--color-child-N-tint`, inset 4px edge `--color-child-N`, one badge.
- **Several children:** background split hard into the children's tints (child 1 left,
  child 2 right), no edge, badges overlapping by 12px. 3+ children: `--color-surface-raised`,
  up to three badges, then "+N".
- **Badge:** circle `--color-child-N` with the child's emoji, 3px ring `--color-on-child`
  (night: `--color-surface`), positioned `top: -8px; right: -6px`.
- **Time row:** time-of-day icon (sunrise `--color-band-morning-accent`, sun outline
  `--color-band-midday-accent` with `--color-sun` fill, moon `--color-band-evening-accent`)
  plus time in `--text-meta`, `--color-text-muted`. All-day: "ganztags" with the sun.
- **States:** upcoming (full), past (`--opacity-past`, night `--opacity-past-night`).
- **Rules:** title one line, truncated; accessible name = title, time, children
  ("Ballett, 15:30, Mia"); decorative emoji (`aria-hidden`). Tiles are not interactive.

## DayColumn

One column per day; events top to bottom in time order, meals at the bottom.

- **Today:** grid share 1.4 (others 1), `--color-surface-raised`, `box-shadow: 0 0 0 5px
  var(--color-today-ring), var(--shadow-raised)`, header "Heute" (`--text-heading`) with the
  full date below (`--text-body`, muted).
- **Other days:** `--color-surface-sunken`, weekday (`--text-title`) and date (muted).
- Padding 14, gap 10, radius `--radius-column`. Order: header, past events (or the
  "vorbei" strip), NowLine (today only), upcoming events, MealPlates (`margin-top: auto`).
- **Week variant (7 equal columns):** tiles show emoji (44) + time-of-day icon + time only,
  height 92, at most 3, then a "+N" tile (outlined, `--color-border`). A special day
  (countdown target) gets the child's tint as background and a 4px edge in the child colour.
  Meals as a three-row list (icon + emoji 26).
- **Dense rule:** from 6 events today, past ones become the "vorbei" strip (label + 30px
  emoji, opacity 0.6) and upcoming tiles use the dense size. Never scroll.

## NowLine

Separates past from upcoming in today's column: 12px dot, 3px line, label "jetzt"
(`--text-meta`, 900), all `--color-now`. Moves between tiles only, never per minute. Before
the first event it sits on top, after the last one above the meals. `role="separator"`.

## MealPlates

Three plates (breakfast, lunch, dinner): circles 60 (today) / 52 (other days) in
`--color-surface-raised`, emoji at 60%, a 22px time-of-day badge bottom-right. The strip has
radius `--radius-tile` and a translucent white (day) / 4% white (night) background. A missing
meal leaves its slot empty. There is no separate meal-plan screen (T-18 decision stands).

## SleepCountdown

"How many sleeps?" pill in the header: 50px circle with the event emoji in the child's tint
and edge, then one moon (30px, `--color-band-evening-accent`) per night; more than 7 nights:
7 moons + "+N". Accessible name "Noch 4 Mal schlafen bis Mias Geburtstag". In the week view
each column before the target day shows a 22px moon in its header.

## ChildLegend

Header chips: `--color-surface-raised`, 40px circle `--color-child-N` with the child's emoji,
name in `--text-body` 800. Emoji and colour come from `config.children[]`; children pick their
own sign.

## ViewToggle

Navigation rail on the right (`--spacing-nav` wide): buttons 104×120, radius `--radius-nav`,
label `--text-body` 900. "Heute": sun icon (night: moon in `--color-sun`). "Woche": seven
bars, the first `--color-sun`, the rest `--color-border`. Active: `--color-nav-active` /
`--color-on-nav-active`, `aria-current="page"`; inactive: `--color-surface-raised` with a 3px
inset `--color-border`. Press feedback scale 0.97 over `--duration-fast`. At the bottom of the
rail: "Stand 15:18" (`--text-caption`, muted) and the lock button for the parent area (64px,
`--color-control-quiet`). Auto-return to "Heute" after `autoReturnSeconds`.

## StatusBanner

Offline / stale notice for parents: pill `--color-notice` / `--color-on-notice`, crossed-out
cloud icon, "Offline · Stand von 14:02", `role="status"`, no blinking, disappears after a
successful refetch. The board stays fully visible underneath.

**Loading:** no spinner. First load shows a calm skeleton of the columns in
`--color-surface-sunken` / `--color-surface-raised` and "Der Tag wird geholt …" with a sun.

## EmptyState

- **Nothing planned today:** inside today's column: two discs in the children's tints, a
  `--color-sun` disc at 55%, 🧸 and 🪁; "Heute ist nichts geplant" (`--text-title`), "Zeit zum
  Spielen" (`--text-body`, muted). Meals stay visible below.
- **Error:** card `--color-soft-error`, 🧸, "Gleich geht's weiter" (`--text-title`), one line
  for parents ("Der Kalender ist gerade nicht erreichbar. Neuer Versuch in 60 Sekunden."), a
  64px button "Jetzt neu laden" (`--color-nav-active`), and a small error code below. No red
  surfaces, no warning icons.

## Outlook (M7/M8, sketch only)

- **Routine checklist:** per child, rows 84px with emoji 50, label, 56px check circle (done:
  `--color-child-N` with a white check, row in the child's tint); stars on top
  (`--color-sun` fill, `--color-band-midday-accent` outline).
- **Parent PIN:** card `--color-surface-raised`, lock + "Eltern-Bereich", four dots, 3×4 keypad
  of 72px keys in `--color-surface-sunken`, "Abbrechen" as a quiet 64px text button.
