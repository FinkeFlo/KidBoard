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

Synthetische Demo-Daten (erzeugt mit `pnpm screenshots`; Versionen in 2000x1200 liegen in
[`docs/screenshots/`](docs/screenshots/)).

| Tagesansicht                                                    | Wochenansicht                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| ![Tagesansicht](docs/screenshots/day-light-1280x800.png)        | ![Wochenansicht](docs/screenshots/week-light-1280x800.png)        |
| ![Tagesansicht, Nacht](docs/screenshots/day-night-1280x800.png) | ![Wochenansicht, Nacht](docs/screenshots/week-night-1280x800.png) |

Der Countdown "Wie oft noch schlafen?" wird am großen Tag zum Konfetti-Popper:

![Countdown erreicht heute](docs/screenshots/day-countdown-today-1280x800.png)

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
[.dev.vars.example](.dev.vars.example).

## Deployment

### Cloudflare Workers (empfohlen, der Gratis-Tarif reicht)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/FinkeFlo/kidboard)

Der Button kopiert dieses Repository in dein GitHub-/GitLab-Konto, baut es mit Workers Builds
(`pnpm`, Web-App vor dem Worker) und deployt einen Worker, der Board und API ausliefert. Er
fragt die Kalender-Secrets und Einstellungen ab (`CAL_<ID>_URL`, `KIDBOARD_ACCESS_TOKEN`,
`KIDBOARD_CONFIG`) und legt den KV-Cache selbst an. Ersetze jedes `REPLACE_ME`.

Alternativ aus einem lokalen Klon:

```sh
pnpm install
pnpm exec wrangler login
pnpm exec wrangler secret put CAL_KINDER_URL   # eins pro Kalender: CAL_<ID>_URL
pnpm exec wrangler secret put KIDBOARD_ACCESS_TOKEN
pnpm exec wrangler secret put KIDBOARD_CONFIG
pnpm deploy:cloudflare                          # baut Web-App + deployt den Worker
```

Danach auf dem Tablet einmal `https://<dein-worker>.workers.dev/?key=<token>` öffnen. Schritt
für Schritt, alle Variablen, eigene Domain, Logs und Fehlersuche:
[docs/DEPLOY.de.md](docs/DEPLOY.de.md).

### Vercel

_Folgt_ (T-26).

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
