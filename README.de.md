# KidBoard

[English](README.md) | [Deutsch](README.de.md)

Ein quelloffener, icon-basierter Familienkalender und Speiseplan für ein Wand-Tablet im
Kiosk-Modus. Gedacht für Kinder (etwa 3-8 Jahre), die noch nicht lesen können: große Icons
statt Text. Eltern pflegen weiter ihren Google Kalender; KidBoard liest die geheimen
iCal-Adressen serverseitig und zeigt eine ruhige Tages- und Wochenansicht.

> Stand: in Arbeit. Mit _folgt_ markierte Abschnitte werden später ergänzt (siehe
> [docs/PLAN.md](docs/PLAN.md), Plan auf Englisch).

## Funktionen

- Tages- und Wochenansicht für ein 1280x800-Wandtablet, aus dem Raum gut lesbar
- Emoji-Icons aus den Termintiteln, mit Stichwort-Fallback (Deutsch + Englisch)
- Ein oder mehrere Kinder, jeweils mit Farbe und Avatar
- Speiseplan (Frühstück, Mittag, Abendessen) aus einem eigenen Kalender
- "Noch x Mal schlafen"-Countdown für besondere Termine
- Nachtmodus, Offline-Betrieb (PWA), automatische Aktualisierung
- iCal-URLs bleiben geheim auf dem Server - nie im Browser
- Deutsche und englische Oberfläche

## Screenshots

_Folgt._ Platzhalter (Dateien kommen nach `docs/screenshots/`):

- `docs/screenshots/day-view.png`
- `docs/screenshots/week-view.png`
- `docs/screenshots/night-mode.png`

## Google-Kalender einrichten

_Folgt._ Kurz: Kalender wie "Kinder" und "Essen" anlegen, pro Kalender die **geheime Adresse
im iCal-Format** kopieren und als Worker-Secret (`CAL_<ID>_URL`) hinterlegen. Diese URLs
niemals teilen oder einchecken.

## Titel-Konventionen im Kalender

| Roher Termintitel (Kalender)   | Icon          | Titel     | Kinder   | Mahlzeit   |
| ------------------------------ | ------------- | --------- | -------- | ---------- |
| `⚽ Fußball` (Bens Kalender)   | ⚽            | Fußball   | Ben      | -          |
| `Mia: 🩰 Ballett`              | 🩰            | Ballett   | Mia      | -          |
| `Mia, Ben: 🛁 Baden`           | 🛁            | Baden     | Mia, Ben | -          |
| `🏫 Kita` (Kinder)             | 🏫            | Kita      | alle     | -          |
| `Zahnarzt`                     | 🦷 (Fallback) | Zahnarzt  | alle     | -          |
| `Mittag: 🍝 Spaghetti` (Essen) | 🍝            | Spaghetti | -        | Mittag     |
| `Dinner: Pizza` (Essen)        | 🍕 (Fallback) | Pizza     | -        | Abendessen |

Alle Regeln (englisch): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#title-conventions-parsing-rules).

## Konfiguration

Alle Optionen stehen in [docs/CONFIG.md](docs/CONFIG.md) (mit deutscher Kurzfassung),
Vorlagen: [config.example.json](config.example.json) und
[apps/worker/.dev.vars.example](apps/worker/.dev.vars.example).

## Deployment

_Folgt._ Anleitungen für Cloudflare Workers (T-25) und Vercel (T-26).

## Kiosk-Tipps

_Folgt._ Fully Kiosk Browser, installierte PWA, Bildschirm wach halten (T-27).

## Entwicklung

Benötigt Node 22 und pnpm 10.

```sh
pnpm install
pnpm dev            # Web (Vite) + Worker (wrangler dev)
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) und die [Architektur](docs/ARCHITECTURE.md).

## Lizenz

[MIT](LICENSE) (c) 2026 FinkeFlo
