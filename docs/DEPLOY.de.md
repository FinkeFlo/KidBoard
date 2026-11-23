# KidBoard auf Cloudflare deployen

[English](DEPLOY.md)

KidBoard läuft als **ein Cloudflare Worker**: Er liefert das Board aus (statische Dateien aus
`apps/web/dist`) und die JSON-API unter `/api/*` und liest die geheimen iCal-Adressen deiner
Kalender auf dem Server. Der Gratis-Tarif von Workers reicht für eine Familie. Du bekommst
eine Adresse wie `https://kidboard.<deine-subdomain>.workers.dev`.

Alles, was Wrangler braucht, steht in der [`wrangler.jsonc`](../wrangler.jsonc) im
Repository-Root. Geheimnisse kommen nie ins Repository: Sie sind Worker-Secrets in deinem
Cloudflare-Konto.

## 1. Vorbereitung

Du brauchst:

1. Ein kostenloses **Cloudflare-Konto** (für Variante A zusätzlich ein GitHub- oder
   GitLab-Konto).
2. Die **geheime iCal-Adresse** jedes Kalenders, der angezeigt werden soll. Google Kalender
   (Web): Einstellungen > dein Kalender > "Kalender integrieren" > **Privatadresse im
   iCal-Format**. Behandle sie wie ein Passwort: Wer sie kennt, kann den Kalender lesen.
3. Ein **Zugriffstoken**: eine lange Zufallszeichenkette, z. B. die Ausgabe von
   `openssl rand -hex 32`. Ohne Token kann jeder, der deine `workers.dev`-Adresse findet,
   die Kalenderdaten über die API lesen; setze also eins.
4. Deine **Einstellungen** (`KIDBOARD_CONFIG`) als **eine Zeile JSON**: Kinder, Kalender,
   Zeitzone, ... Vorlage: [`config.example.json`](../config.example.json), alle Optionen in
   [CONFIG.md](CONFIG.md). Jede Kalender-`id` braucht ein passendes Secret `CAL_<ID>_URL`
   (ID in Großbuchstaben: `kinder` -> `CAL_KINDER_URL`). Datei in eine Zeile umwandeln:

   ```sh
   node -e "process.stdout.write(JSON.stringify(require('./config.example.json')))"
   ```

## 2. Secrets und Variablen

Der Worker liest genau diese Namen (`apps/worker/src/env.ts`):

| Name                       | Art                  | Pflicht  | Hinweise                                                                                          |
| -------------------------- | -------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `CAL_<ID>_URL`             | Secret               | pro Kalender | z. B. `CAL_KINDER_URL`, `CAL_ESSEN_URL`, `CAL_MIA_URL`. Fehlt eins, zeigt nur dieser Kalender `error`. |
| `KIDBOARD_ACCESS_TOKEN`    | Secret               | dringend empfohlen | Leer oder nicht gesetzt = keine Prüfung. Ein Wert, der noch `REPLACE_ME` enthält, wird abgelehnt (API antwortet `500`). |
| `KIDBOARD_CONFIG`          | Secret oder Variable | ja       | JSON in einer Zeile. Fehlt/ungültig: `/api/config` und `/api/agenda` antworten `500`.             |
| `KIDBOARD_ALLOWED_ORIGINS` | Variable             | nein     | Nur für API-Zugriffe von anderen Origins; das Board selbst ist same-origin.                       |
| `KIDBOARD_CACHE_TTL`       | Variable             | nein     | Sekunden, die ein Feed als frisch gilt, Standard 3600.                                            |
| `KIDBOARD_CACHE`           | KV-Namespace-Binding | automatisch | Ohne ID in `wrangler.jsonc` deklariert; Wrangler legt ihn beim ersten Deploy an.               |

Im Dashboard gesetzte Klartext-Variablen bleiben bei späteren Deploys erhalten
(`keep_vars: true`), Secrets sowieso. Die Vorlage für alle ist
[`.dev.vars.example`](../.dev.vars.example).

## 3. Variante A: Button "Deploy to Cloudflare"

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/FinkeFlo/kidboard)

1. Button klicken und bei Cloudflare anmelden.
2. GitHub oder GitLab verbinden und einen Namen für das neue Repository wählen. Cloudflare
   kopiert KidBoard in dein Konto; spätere Pushes darauf deployen automatisch.
3. **Worker-Namen** behalten oder ändern (Standard `kidboard`, er wird Teil der Adresse)
   und den vorgeschlagenen **KV-Namespace** für `KIDBOARD_CACHE` übernehmen.
4. Die abgefragten Secrets ausfüllen (aus `.dev.vars.example`): `CAL_KINDER_URL`,
   `CAL_ESSEN_URL`, `KIDBOARD_ACCESS_TOKEN`, `KIDBOARD_CONFIG`. **Jedes `REPLACE_ME`
   ersetzen.** Haben deine Kalender andere IDs, trage hier die vorhandenen ein und lege die
   übrigen `CAL_<ID>_URL`-Secrets danach an (Schritt 7).
5. Build-Einstellungen prüfen. Das Repository ist ein pnpm-Monorepo, gebaut wird im Root:
   - Root-Verzeichnis: leer (Repository-Root)
   - Build-Befehl: `pnpm run build` (aus `package.json` vorbelegt; baut die Web-App, dann
     einen Probelauf des Workers)
   - Deploy-Befehl: `npx wrangler deploy` (Standard; nutzt die im Root-`package.json`
     festgelegte `wrangler`-Version und die Root-`wrangler.jsonc`)

   Node.js 22 kommt aus `.nvmrc`, pnpm aus dem Feld `packageManager`.
6. Erstellen und deployen. Der erste Build dauert ein paar Minuten.
7. Fehlende Kalender oder geänderte Einstellungen: Workers & Pages > dein Worker > Settings >
   Variables and Secrets > Add (Typ "Secret"). Speichern deployt eine neue Version.

## 4. Variante B: aus einem lokalen Klon (Wrangler-CLI)

Benötigt Node 22 und pnpm 10 (`corepack enable`).

```sh
git clone https://github.com/FinkeFlo/kidboard.git && cd kidboard
pnpm install
pnpm exec wrangler login          # öffnet einmal den Browser
pnpm deploy:cloudflare            # baut apps/web, dann `wrangler deploy`
```

Der erste Deploy legt den Worker und seinen KV-Namespace an. Danach die Secrets setzen
(jeder Befehl fragt nach dem Wert; jede Änderung wird sofort deployt):

```sh
pnpm exec wrangler secret put CAL_KINDER_URL
pnpm exec wrangler secret put CAL_ESSEN_URL        # eins pro Kalender: CAL_<ID>_URL
pnpm exec wrangler secret put KIDBOARD_ACCESS_TOKEN
node -e "process.stdout.write(JSON.stringify(require('./meine-config.json')))" \
  | pnpm exec wrangler secret put KIDBOARD_CONFIG
```

Oder alle auf einmal aus einer ausgefüllten Kopie der Vorlage, die wegen ihres Namens von
Git ignoriert wird: `.dev.vars.example` nach `.dev.vars.production` kopieren, ausfüllen,
`pnpm exec wrangler secret bulk .dev.vars.production` ausführen und die Datei danach
löschen.

Später aktualisieren: `git pull && pnpm install && pnpm deploy:cloudflare`. Die Secrets
bleiben erhalten.

## 5. Deployment prüfen

`<url>` und `<token>` ersetzen:

```sh
curl -s https://<url>/api/health                                         # {"ok":true}
curl -s -H "Authorization: Bearer <token>" https://<url>/api/config      # öffentliche Einstellungen
curl -s -H "Authorization: Bearer <token>" "https://<url>/api/agenda?days=3"
```

In der Agenda-Antwort sollte jeder Eintrag in `sources` `"status":"ok"` haben. `"error"`
heißt: Das Secret dieses Kalenders fehlt, ist falsch geschrieben oder die Adresse stimmt
nicht.

Dann **auf dem Tablet einmal `https://<url>/?key=<token>` öffnen**. Das Board speichert den
Token, entfernt ihn aus der Adresszeile und sendet ihn ab dann als Header. Als App
installieren (Browsermenü > "Zum Startbildschirm hinzufügen") oder den Kiosk-Browser auf
`https://<url>/` einstellen.

Token wechseln: neues `KIDBOARD_ACCESS_TOKEN` setzen; das Tablet meldet dann "Dieses
Tablet braucht einen neuen Zugangslink", löscht die gespeicherten Kalenderdaten und vergisst den alten
Token, bis du einen neuen `?key=`-Link öffnest.

## 6. Optional: eigene Domain

Worker > Settings > Domains & Routes > Add > Custom domain (die Domain muss bei Cloudflare
liegen). Das Board funktioniert genauso; zusätzlich steht dann die Cache API als Rückfall zur
Verfügung (auf `workers.dev` nutzt der Worker den KV-Namespace, ADR-0006).

## 7. HTTP-Caching und Sicherheits-Header

Geprüft anhand der Cloudflare-Doku (Workers Static Assets, "Headers") und mit
`wrangler dev`: Jede statische Datei wird mit **`Cache-Control: public, max-age=0,
must-revalidate`** und einem `ETag` ausgeliefert. Das gilt für `sw.js`, `index.html` (auch
als Single-Page-App-Fallback) und `manifest.webmanifest`: Browser prüfen sie bei jeder
Nutzung neu, ein neuer Deploy wird sofort erkannt, nichts wird zu lange gecacht, und
KidBoard überschreibt den Header nicht. Dateien mit Hash unter `/assets/` werden ebenfalls
neu geprüft (günstiges `304`), der Service Worker hält ohnehin eine eigene Kopie.

`vite build` erzeugt `apps/web/dist/_headers` (`apps/web/headers/staticHeaders.ts`), das
Workers Static Assets auf alle statischen Antworten anwendet:

- `Content-Security-Policy`: nur Ressourcen vom eigenen Origin, kein `eval`, kein
  Inline-Code außer dem Theme-Boot-Skript in `index.html`, das über seinen SHA-256-Hash
  erlaubt ist. Der Hash wird bei jedem Build aus der gebauten Datei berechnet und kann
  nicht veralten.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (das `?key=` des ersten
  Aufrufs wird nie als Referrer gesendet), `Permissions-Policy` ohne Kamera, Mikrofon,
  Standort, Bezahlung und USB (Wake Lock und Vollbild bleiben erlaubt).
- Einbetten (Frames) ist nicht eingeschränkt, damit Dashboards (z. B. Home Assistant) das
  Board anzeigen können. Zum Verbieten `frame-ancestors 'none'` in `staticHeaders.ts`
  ergänzen.

`_headers` gilt nicht für `/api/*`: Diese Antworten erzeugt der Worker selbst, mit
`Cache-Control: no-store`, `nosniff` und `Referrer-Policy: no-referrer`.

## 8. Logs und der `?key=`-Link

- **Workers Logs** (in `wrangler.jsonc` aktiviert, Standard für neue Worker) schreiben pro
  **Worker-Aufruf** einen Eintrag mit Methode und URL. Das Laden von `/?key=…` ruft den
  Worker nie auf: `/` ist eine statische Datei, nur `/api/*` läuft zuerst durch den Worker
  (`run_worker_first`), und seit Kompatibilitätsdatum 2025-04-01 werden Navigationen
  bevorzugt aus den Assets bedient. Der Link mit dem Token steht also **nicht** in Workers
  Logs und damit auch nicht in Workers Logpush (`workers_trace_events`) oder Tail Workers.
  Lokal mit `wrangler dev` geprüft: Die aufgezeichneten Traces enthielten nur die
  `/api/*`-Anfragen.
- API-Anfragen tragen den Token im Header `Authorization`; Cloudflares Trace-Events
  schwärzen standardmäßig Header, deren Name "auth", "key" oder "token" enthält. Die API
  akzeptiert auch `?key=` (z. B. für `curl`); `observability.redact_query_string: true`
  entfernt Query-Strings aus geloggten URLs.
- **Nicht abgedeckt:** HTTP-Request-Logs der Zone. Mit eigener Domain können Cloudflares
  HTTP-Request-Logs (Logpush-Datensatz `http_requests`, Enterprise-Tarife) und Analytics die
  vollständige URL samt `?key=` enthalten. Außerdem bleibt der Token im Browserverlauf des
  Geräts, auf dem du den Link geöffnet hast, und dort, wo du den Link verschickt hast. Öffne
  ihn direkt auf dem Tablet und wechsle den Token, falls der Link in falsche Hände gerät.
- KidBoard selbst loggt nie Feed-URLs, Tokens oder Kalenderinhalte (nur IDs, Secret-_Namen_
  und Fehlercodes).

## 9. Fehlersuche

| Symptom | Ursache und Lösung |
| --- | --- |
| Board meldet "Dieses Tablet braucht einen neuen Zugangslink" | Falscher oder geänderter Token: `https://<url>/?key=<token>` erneut öffnen. |
| `/api/config` antwortet `500 server_misconfigured` | `KIDBOARD_CONFIG` fehlt oder ist ungültig (Workers Logs nennen die Fehler), oder `KIDBOARD_ACCESS_TOKEN` enthält noch `REPLACE_ME`. |
| Ein Kalender fehlt, `sources[].status` ist `error` | Secret-Name passt nicht zur Kalender-ID (`CAL_<ID>_URL`, Großbuchstaben) oder die iCal-Adresse ist falsch. |
| Build bricht mit pnpm-Fehler ab | Build-Variable `PNPM_VERSION=10.28.0` setzen (Worker > Settings > Build). |
| `The directory specified by the "assets.directory" field ... does not exist` | Die Web-App wurde nicht gebaut: `pnpm deploy:cloudflare` bzw. Build-Befehl `pnpm run build` verwenden. |
| Alte Version wird angezeigt | Das Tablet sucht stündlich nach einer neuen Version und lädt sich selbst neu; oder einmal neu laden. |

## Wie diese Anleitung geprüft wurde

Ohne Cloudflare-Konto (kein echter Deploy): `pnpm exec wrangler deploy --dry-run` (auch in
der CI) und `pnpm deploy:cloudflare --dry-run` mit der Root-Konfiguration; `wrangler dev` mit
Fake-Secrets (Token `TESTONLY-not-a-secret`, Kalender aus `fixtures/ics` über einen lokalen
HTTP-Server), `curl` gegen `/api/health`, `/api/config`, `/api/agenda` (mit und ohne Token)
und die statischen Pfade (`Cache-Control`, `_headers`) sowie ein Headless-Chromium, der
`/?key=…` öffnet (Token gespeichert und entfernt, Service Worker aktiv, keine
CSP-Verstöße). Button-Ablauf, Workers Builds und das Log-Verhalten in Produktion folgen der
Cloudflare-Doku und lassen sich nur mit einem echten Konto bestätigen.
