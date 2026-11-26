# KidBoard auf Cloudflare deployen

[English](DEPLOY.md)

KidBoard läuft als **ein Cloudflare Worker**: Er liefert das Board aus (statische Dateien aus
`apps/web/dist`) und die JSON-API unter `/api/*`, speichert die Einträge aus dem
Eltern-Editor und liest optional die geheimen iCal-Adressen deiner Google-Kalender auf dem
Server. Der Gratis-Tarif von Workers reicht für eine Familie. Du bekommst eine Adresse wie `https://kidboard.<deine-subdomain>.workers.dev`.

Alles, was Wrangler braucht, steht in der [`wrangler.jsonc`](../wrangler.jsonc) im
Repository-Root. Geheimnisse kommen nie ins Repository: Sie sind Worker-Secrets in deinem
Cloudflare-Konto.

## 1. Vorbereitung

Du brauchst:

1. Ein kostenloses **Cloudflare-Konto** (für Variante A zusätzlich ein GitHub- oder
   GitLab-Konto).
2. Ein **Zugriffstoken** (Pflicht), z. B. die Ausgabe von `openssl rand -hex 32`. Ohne
   gültiges Token verweigert die API jede Anfrage, dein Kalender ist also nie versehentlich
   öffentlich. Erlaubte Länge und Zeichen sowie das Opt-in für ein bewusst öffentliches
   Board: [CONFIG.de.md](CONFIG.de.md#secrets-und-umgebungsvariablen).
3. Eine **Eltern-PIN** mit 6 bis 12 Ziffern für den Editor, nicht leicht zu erraten (keine
   Geburtstage). Welche PINs abgelehnt werden und wie falsche PINs den Editor sperren:
   [CONFIG.de.md](CONFIG.de.md#secrets-und-umgebungsvariablen).
4. Deine **Einstellungen** (`KIDBOARD_CONFIG`) als **eine Zeile JSON**: Kinder, Zeitzone,
   ... Das Deploy-Formular füllt ein Beispiel mit zwei Kindern und ohne Kalender vor. Alle
   Optionen in [CONFIG.de.md](CONFIG.de.md) (vollständige Tabellen: [CONFIG.md](CONFIG.md)).
5. Optional, auch später: die **geheime iCal-Adresse** jedes Google-Kalenders, der angezeigt
   werden soll. Google Kalender (Web): Einstellungen > dein Kalender > "Kalender
   integrieren" > **Privatadresse im iCal-Format**. Behandle sie wie ein Passwort: Wer sie
   kennt, kann den Kalender lesen. Jeden Kalender unter `calendars` in `KIDBOARD_CONFIG`
   eintragen und ein passendes Secret `CAL_<ID>_URL` anlegen (ID in Großbuchstaben:
   `kinder` -> `CAL_KINDER_URL`). Eine Config-Datei wie
   [`config.example.json`](../config.example.json) in eine Zeile umwandeln:

   ```sh
   node -e "process.stdout.write(JSON.stringify(require('./config.example.json')))"
   ```

## 2. Secrets und Variablen

Der Worker liest genau diese Namen (`apps/worker/src/env.ts`). Was jeder Wert annimmt, sein
Standard und was bei fehlendem oder ungültigem Wert passiert:
[CONFIG.de.md](CONFIG.de.md#secrets-und-umgebungsvariablen).

| Name                       | Art                  | Pflicht                 | Wofür                                             |
| -------------------------- | -------------------- | ----------------------- | ------------------------------------------------- |
| `CAL_<ID>_URL`             | Secret               | pro Kalender (optional) | Geheime iCal-Adresse eines Kalenders in `calendars` |
| `KIDBOARD_ACCESS_TOKEN`    | Secret               | ja                      | Schützt die API; nötig für den Editor             |
| `KIDBOARD_PUBLIC`          | Variable             | nein                    | Opt-in für ein öffentliches Board ohne Token      |
| `KIDBOARD_CONFIG`          | Secret oder Variable | ja                      | Deine Einstellungen als JSON in einer Zeile       |
| `KIDBOARD_ALLOWED_ORIGINS` | Variable             | nein                    | Nur für API-Zugriffe von anderen Origins          |
| `KIDBOARD_CACHE_TTL`       | Variable             | nein                    | Sekunden, die ein Feed als frisch gilt            |
| `KIDBOARD_CACHE`           | KV-Namespace-Binding | automatisch             | Feed-Cache; beim ersten Deploy angelegt           |
| `KIDBOARD_PARENT_PIN`      | Secret               | nein                    | Schaltet den Eltern-Editor ein                    |
| `KIDBOARD_DATA`            | D1-Datenbank-Binding | automatisch             | Editor-Einträge; beim ersten Deploy angelegt      |
| `KIDBOARD_FEED_TOKEN`      | Secret               | nein                    | Schaltet den Handy-Feed der Editor-Einträge ein   |

Im Dashboard gesetzte Klartext-Variablen bleiben bei späteren Deploys erhalten
(`keep_vars: true`), Secrets sowieso. Die Vorlage für alle ist
[`.dev.vars.example`](../.dev.vars.example).

## 3. Variante A: Button "Deploy to Cloudflare"

Der schnellste Weg, aber er braucht ein kostenloses **GitHub- oder GitLab-Konto**. Das
passiert dabei: Cloudflare bittet dich, seine GitHub-App **"Cloudflare Workers & Pages"** (bei GitLab
seine GitLab-Integration) zu installieren und ihr Zugriff auf deine Repositorys zu geben. Dann legt es eine Kopie von
KidBoard als neues Repository in deinem Konto an (privat, wenn du das Kästchen ankreuzt) und
deployt sie. Jede spätere Änderung, die auf diese Kopie gepusht wird, deployt erneut. Kein
GitHub-Konto? Dann
[Variante B](#4-variante-b-vom-eigenen-rechner-ohne-github-konto-wrangler-cli).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/FinkeFlo/kidboard)

1. Button klicken und bei Cloudflare anmelden.
2. GitHub oder GitLab verbinden und einen Namen für das neue Repository wählen. Cloudflare
   kopiert KidBoard in dein Konto; spätere Pushes darauf deployen automatisch. Diese Kopie
   ist von diesem Repository getrennt: neue KidBoard-Versionen kommen nicht von selbst an.
3. **Worker-Namen** behalten oder ändern (Standard `kidboard`, er wird Teil der Adresse)
   und den vorgeschlagenen **KV-Namespace** (`KIDBOARD_CACHE`) und die **D1-Datenbank**
   (`KIDBOARD_DATA`) übernehmen.
4. Die drei abgefragten Secrets ausfüllen (aus `.dev.vars.example`):
   `KIDBOARD_ACCESS_TOKEN`, `KIDBOARD_PARENT_PIN` und `KIDBOARD_CONFIG` (Beispielkinder
   anpassen). **Jedes `REPLACE_ME` ersetzen** (nur `KIDBOARD_PARENT_PIN` darf es behalten:
   dann bleibt der Eltern-Editor aus). Google-Kalender werden nicht abgefragt; sie kommen
   später dazu (Schritt 7).
5. Build-Einstellungen prüfen. Das Repository ist ein pnpm-Monorepo, gebaut wird im Root:
   - Root-Verzeichnis: leer (Repository-Root)
   - Build-Befehl: `pnpm run build` (aus `package.json` vorbelegt; baut die Web-App, dann
     einen Probelauf des Workers)
   - Deploy-Befehl: `npx wrangler deploy` (Standard; nutzt die im Root-`package.json`
     festgelegte `wrangler`-Version und die Root-`wrangler.jsonc`)

   Node.js 22 kommt aus `.nvmrc`, pnpm aus dem Feld `packageManager`.
6. Erstellen und deployen. Der erste Build dauert ein paar Minuten. Danach die Secrets
   prüfen (`<url>` ersetzen): `curl -s https://<url>/api/config` muss `401 unauthorized`
   antworten. `500 server_misconfigured` heißt: `KIDBOARD_ACCESS_TOKEN` oder
   `KIDBOARD_CONFIG` stimmt noch nicht (Schritt 7 oder [Abschnitt 9](#9-fehlersuche)). Bei
   einer ganz neuen Datenbank kann das allererste Laden des Boards ein paar Sekunden dauern
   oder einmal einen Fehler zeigen; neu laden.
7. Google-Kalender oder geänderte Einstellungen: Workers & Pages > dein Worker > Settings >
   Variables and Secrets. `calendars` in `KIDBOARD_CONFIG` ergänzen und je Kalender ein
   `CAL_<ID>_URL` anlegen (Add, Typ "Secret"). Speichern deployt eine neue Version.

**Den Zugriff der App nach dem ersten Deploy einschränken** (GitHub). Die App hat womöglich
Zugriff auf alle deine Repositorys bekommen. <https://github.com/settings/installations> öffnen,
"Cloudflare Workers & Pages" > Configure wählen, unter **Repository access** **Only select
repositories** einstellen und dein neues KidBoard-Repository auswählen. Cloudflares Doku beschreibt,
wie man sie einschränkt.

## 4. Variante B: vom eigenen Rechner, ohne GitHub-Konto (Wrangler-CLI)

Dieser Weg braucht kein GitHub-Konto und kein git, nur:

- ein kostenloses Cloudflare-Konto,
- [Node.js](https://nodejs.org/) 22 (LTS),
- pnpm 10: nach der Installation von Node einmal `corepack enable` ausführen.

1. KidBoard holen: auf der [Repository-Seite](https://github.com/FinkeFlo/kidboard)
   **Code > Download ZIP** wählen (der aktuelle Stand von `main`; sobald es Releases gibt,
   geht das Quellcode-Archiv des neuesten Release genauso) und entpacken. Wer git
   nutzt, kann genauso klonen: `git clone https://github.com/FinkeFlo/kidboard.git`.
2. Ein Terminal im entpackten Ordner öffnen und ausführen:

   ```sh
   pnpm install
   pnpm exec wrangler login          # öffnet einmal den Browser
   pnpm deploy:cloudflare            # baut apps/web, dann `wrangler deploy`
   ```

Der erste Deploy legt den Worker, seinen KV-Namespace und seine D1-Datenbank an. Danach die Secrets setzen
(jeder Befehl fragt nach dem Wert; jede Änderung wird sofort deployt):

```sh
pnpm exec wrangler secret put KIDBOARD_ACCESS_TOKEN
pnpm exec wrangler secret put KIDBOARD_PARENT_PIN
pnpm exec wrangler secret put CAL_KINDER_URL       # optional: eins pro Kalender, CAL_<ID>_URL
node -e "process.stdout.write(JSON.stringify(require('./meine-config.json')))" \
  | pnpm exec wrangler secret put KIDBOARD_CONFIG
```

Oder alle auf einmal aus einer ausgefüllten Kopie der Vorlage, die wegen ihres Namens von
Git ignoriert wird: `.dev.vars.example` nach `.dev.vars.production` kopieren, ausfüllen,
`pnpm exec wrangler secret bulk .dev.vars.production` ausführen und die Datei danach
löschen.

Später aktualisieren: das ZIP erneut herunterladen, in einen neuen, leeren Ordner entpacken
(nicht mit dem alten mischen) und dort `pnpm install` und `pnpm deploy:cloudflare` ausführen
(fragt Wrangler danach, erneut mit `pnpm exec wrangler login` anmelden). Mit einem Klon:
`git pull && pnpm install && pnpm deploy:cloudflare`. Secrets, Cache und die Einträge aus dem
Editor bleiben erhalten: Der Deploy nutzt den Speicher des Workers weiter, der schon unter
demselben Namen läuft; die IDs, die Wrangler eventuell in `wrangler.jsonc` schreibt, musst du
nicht aufheben. Das gilt, solange der Worker seinen Namen (`kidboard`) behält und im selben
Cloudflare-Konto bleibt. Ein umbenannter Worker oder ein anderes Konto beginnt mit leerem
Cache und leerer Datenbank, und die Secrets müssen neu gesetzt werden (wie oben): vorher im Editor eine Sicherung speichern ("Sicherung
herunterladen", siehe [Der Eltern-Editor](../README.de.md#der-eltern-editor)).

## 5. Deployment prüfen

`<url>` und `<token>` ersetzen:

```sh
curl -s https://<url>/api/health                                         # {"ok":true}
curl -s -H "Authorization: Bearer <token>" https://<url>/api/config      # öffentliche Einstellungen
curl -s -H "Authorization: Bearer <token>" "https://<url>/api/agenda?days=3"
```

In der Agenda-Antwort sollte jeder Eintrag in `sources` `"status":"ok"` haben (ohne
Google-Kalender und mit ausgeschaltetem Editor ist die Liste leer). `"error"` heißt: Das Secret dieses Kalenders fehlt, ist falsch geschrieben oder die Adresse stimmt
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
- Einbetten (Frames) ist auf die eigene Herkunft beschränkt (`frame-ancestors 'self'`),
  andere Seiten können das Board nicht einbetten. Für ein Dashboard (z. B. Home Assistant)
  dessen Adresse in `FRAME_ANCESTORS` in `apps/web/headers/staticHeaders.ts` ergänzen.

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
| `/api/config` antwortet `500 server_misconfigured` | `KIDBOARD_CONFIG` fehlt oder ist ungültig (Workers Logs nennen die Fehler), oder `KIDBOARD_ACCESS_TOKEN` fehlt oder erfüllt die [Token-Regeln](CONFIG.de.md#secrets-und-umgebungsvariablen) nicht (das Log nennt den Grund). |
| Editor lange gesperrt | Es wurden wiederholt falsche PINs eingegeben; die Sperre wächst mit jeder weiteren Sperre ([Sperr-Regeln](CONFIG.de.md#secrets-und-umgebungsvariablen)) und endet von selbst. Wer das Zugriffstoken hat, kann das wiederholen: `KIDBOARD_ACCESS_TOKEN` wechseln und den Tablet-Link neu öffnen. |
| Ein Kalender fehlt, `sources[].status` ist `error` | Secret-Name passt nicht zur Kalender-ID (`CAL_<ID>_URL`, Großbuchstaben) oder die iCal-Adresse ist falsch. |
| Deploy-Formular (GitHub): "Your GitHub authorization has expired …" | Laut Cloudflares Anleitung zur Neuinstallation: <https://github.com/settings/installations> öffnen, "Cloudflare Workers & Pages" wählen, deinstallieren, dann GitHub neu verbinden. Unser Rat: danach das Deploy-Formular neu starten und die App installieren, wenn danach gefragt wird. |
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
CSP-Verstöße). Variante B ohne git: ein entpacktes Archiv des Repositorys ohne `.git` lief
mit `pnpm install` (die Git-Hooks werden übersprungen), `pnpm build` und
`pnpm deploy:cloudflare --dry-run`. Button-Ablauf, Workers Builds und das Log-Verhalten in Produktion folgen der
Cloudflare-Doku und lassen sich nur mit einem echten Konto bestätigen.
