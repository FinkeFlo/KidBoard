# KidBoard-Konfiguration (Kurzfassung)

[English](CONFIG.md)

Diese Seite fasst [CONFIG.md](CONFIG.md) auf Deutsch zusammen: alle Secrets, Variablen und
Bindings, die der Worker liest, und die genauen Regeln für Zugriffstoken und Eltern-PIN;
README und DEPLOY verweisen hierher. Die vollständigen Tabellen (Typ, Standardwert und
Beispiel jeder Option) stehen in [CONFIG.md](CONFIG.md).

## Secrets und Umgebungsvariablen

**Geheimnisse** (Zugriffstoken, Eltern-PIN, optionale iCal-URLs) liegen als Worker-Secrets bzw.
lokal in `.dev.vars` im Repository-Root (Vorlage: `.dev.vars.example`, nie einchecken;
Deployment: [DEPLOY.de.md](DEPLOY.de.md)). Pro Kalender in `calendars` gibt es
`CAL_<ID>_URL` (ID in Großbuchstaben; fehlt sie, zeigt nur dieser Kalender einen Fehler).
Pflicht: `KIDBOARD_ACCESS_TOKEN` (32-256 Zeichen `A-Z a-z 0-9 _ -`, z. B. `openssl rand -hex 32`; alle API-Aufrufe außer `/api/health` brauchen den
Token als `Authorization: Bearer <token>` oder `?key=<token>`; besser den Header, denn `?key=`
landet im Browserverlauf). Ohne gültiges Token (fehlt, leer, zu kurz, falsche Zeichen oder noch `REPLACE_ME`) verweigert die API alles mit `500` und das Log nennt den Grund: das Board schaltet nie ungeschützt. Ein bewusst öffentliches Board gibt es nur per Opt-in `KIDBOARD_PUBLIC="1"` ohne Token (jeder mit dem Link sieht den Familienkalender, der Editor bleibt aus). `/api/health` bleibt öffentlich und liefert nur `{ "ok": true }`.
Optional: `KIDBOARD_PARENT_PIN` (6-12 Ziffern, schaltet den Eltern-Editor ein; braucht zusätzlich das Zugriffstoken. Abgelehnt werden (Editor bleibt aus, das Log nennt den Grund) zu kurze/lange oder nicht-numerische Werte, eine einzige wiederholte Ziffer (`111111`) und Zahlenreihen (`123456`, `654321`); bitte keine Geburtstage oder Datumsangaben. Nach 5 falschen PINs in 15 Minuten sperrt der Editor 15 Minuten; jede weitere Sperre verdoppelt die Zeit (höchstens 2 Stunden), eine richtige PIN setzt zurück), `KIDBOARD_FEED_TOKEN` (32-256 Zeichen `A-Z a-z 0-9 _ -`, schaltet den Handy-Feed der Editor-Einträge ein; der Eltern-Bereich zeigt dann den Abo-Link), `KIDBOARD_ALLOWED_ORIGINS` (nur für API-Zugriffe von anderen Origins; das Board selbst ist same-origin), `KIDBOARD_CACHE_TTL` (Sekunden, 60-86400, Standard 3600; mit
KV-Cache mindestens `Kalender × 86400 / 500`; bei eingeschaltetem Eltern-Editor zählen
seine zwei App-Quellen mit). Die Kalender-IDs `app-events` und `app-meals` sind für die in
der App angelegten Einträge reserviert. Die Adresse `CAL_<ID>_URL` muss mit `https://` (oder
`webcal://`) beginnen; `http://` und andere Schemata werden abgelehnt. Besser eigene
Zweitkalender ("Kinder", "Essen") als den Hauptkalender verwenden: dessen Feed listet auch
noch nicht angenommene Einladungen. Ein fehlgeschlagener Feed wird 5 Minuten nicht neu
abgerufen (solange gilt die letzte gute Kopie); pro Kalender werden höchstens 2000 Termine
gelesen und Titel nach 120 Zeichen gekürzt (`truncated: true`).

`KIDBOARD_CONFIG`, `KIDBOARD_PUBLIC`, `KIDBOARD_ALLOWED_ORIGINS` und `KIDBOARD_CACHE_TTL`
dürfen auch Klartext-Variablen sein (`keep_vars: true` behält Dashboard-Variablen über
Deploys). Die Bindings `KIDBOARD_CACHE` (KV-Namespace für den Feed-Cache) und
`KIDBOARD_DATA` (D1-Datenbank mit den Einträgen aus dem Editor, ADR-0014; ohne sie bleibt
der Editor aus) stehen ohne ID in `wrangler.jsonc`; Wrangler legt sie beim ersten Deploy
an, der Worker seine Tabellen.

## Zugriffstoken: der Tablet-Link

Ist `KIDBOARD_ACCESS_TOKEN` gesetzt, das Board auf dem
Tablet **einmal** als `https://<dein-worker>.workers.dev/?key=<token>` öffnen (z. B. als
Start-URL in Fully Kiosk). Die Seite speichert das Token im lokalen Speicher des Tablets und
**entfernt `?key=` sofort aus der Adresszeile**; danach ruft sie die API mit
`Authorization: Bearer` auf. Spätere Besuche brauchen kein `?key=`; ein neues `?key=` ersetzt
das gespeicherte Token (nach einem Token-Wechsel). Nach einem **`401`** (Token ungültig oder
widerrufen) **vergisst** das Tablet das Token und zeigt "Dieses Tablet braucht einen neuen Zugangslink" (Fehlercode
`KB-401`): den Tablet-Link mit dem aktuellen `?key=<token>` noch einmal öffnen. Mit
öffentlichem Opt-in (`KIDBOARD_PUBLIC="1"`, kein Token) ist das alles nicht nötig.

## Einstellungen in `KIDBOARD_CONFIG`

**Nicht geheime Einstellungen** stehen als JSON in `KIDBOARD_CONFIG` (Pflicht; Vorlage:
`config.example.json`; fehlerhaft → API antwortet `500`, das Log nennt die Fehler). Alle Optionen haben Standardwerte; `calendars` (Google-Feeds) ist optional, ohne zeigt das Board die Einträge aus dem Eltern-Editor (ADR-0014): `locale`
(`de`/`en`/`auto`; `auto` = Browsersprache, sonst `de`), `timeZone` (IANA, Standard `Europe/Berlin`), `children` (id, name, color (`child-1` bis `child-6` oder Hex `#rgb`/`#rrggbb`; benannte oder `rgb()`-Farben werden abgelehnt),
avatar = Emoji des Kindes; Farbe und Emoji färben die Kacheln des Kindes und bilden das Abzeichen), `calendars` (id, kind `events`/`meals`, optional `childId`, `label`), `bands`
(`morningStart`/`middayStart`/`eveningStart`, `HH:mm` aufsteigend: sie bestimmen das Tageszeit-Icon auf den Kacheln und den Mahlzeit-Slot für Mahlzeiten mit Uhrzeit, keine Abschnitte auf dem Bildschirm), `nightMode` (an/aus, Start, Ende), `countdown.emojis`
(Termine mit diesen Icons bekommen den "Noch x Mal schlafen"-Countdown), `refreshMinutes`,
`autoReturnSeconds` (Rückkehr von der Wochenansicht zur Übersicht nach Inaktivität). Die
Tabelle in [CONFIG.md](CONFIG.md#kidboard_config-options) nennt Typ, Standardwert und
Beispiel jeder Option.

## Mitbringen-Bereich (🎒)

`bands.eveningStart` startet auch den 🎒-Bereich: ab dann bis
Mitternacht zeigt die heutige Karte, was für morgen einzupacken ist (Zeile `Mitbringen:` /
`Bring:` in der Beschreibung des Termins, siehe [README.de.md](../README.de.md#mitbringen-liste));
nach Mitternacht zeigt sie, was heute noch mitzubringen ist, bis der Termin beginnt.
`bands.middayStart` beendet ihn für ganztägige Termine (ihre Icons stehen vom Vorabend
`eveningStart` bis zu dieser Uhrzeit am Tag selbst). Es gibt keine eigene Einstellung; es
gelten `timeZone` und die Bänder. Zeigt sich nichts: die Zeile muss für sich stehen, mit
`Mitbringen:` oder `Bring:` samt Doppelpunkt beginnen, mindestens ein Emoji enthalten und in
der Beschreibung (nicht im Titel) stehen; Feed- und Cache-Verzögerung bis zu
`KIDBOARD_CACHE_TTL`.

## Wetter

Optional (ADR-0015): ohne `weather`-Block kein Wetter. Mit ihm zeigt jeder Tag der Übersicht
ein Wetter-Icon mit Temperatur (heute: jetzt, sonst: Höchstwert), die Wochenansicht Icon und
Höchstwert im Kopf jedes Tages der 7-Tage-Vorhersage und die heutige Karte eine Reihe
Kleidungsbilder: für heute bis `bands.eveningStart`, ab dann bis Mitternacht für morgen.
Beispiel: `"weather": { "place": "Hamburg", "country": "DE" }`. `place` (1-80 Zeichen) wird
einmal über die Geocoding-API von Open-Meteo gesucht (erster Treffer, `country` als
ISO-3166-1-Alpha-2-Code grenzt ein; kein Treffer: kein Wetter, das Board läuft weiter);
alternativ `latitude` und `longitude` (nie beides). `unit`: `celsius` (Standard) oder
`fahrenheit`.

- **Datenschutz:** Ort und Koordinaten bleiben auf dem Server; das Tablet erfährt nur, dass
  Wetter an ist. Der Server schickt sie nur an Open-Meteo und speichert die Vorhersage 30
  Minuten (die letzte gute bis 24 Stunden).
- **Bedingungen:** Open-Meteo ist für nicht kommerzielle Nutzung kostenlos, ohne Konto und
  API-Schlüssel; die Daten stehen unter CC BY 4.0, daher zeigt die Leiste "Wetter:
  Open-Meteo.com", solange Wetter an ist. Kommerzielle Nutzung braucht einen Open-Meteo-Tarif.
- **Abends:** ab `bands.eveningStart` gelten die Kleidungsbilder für morgen, angeführt von
  "→", dem Wetter-Icon und Höchstwert von morgen; der Chip von heute zeigt dann nur 🌡️ und
  die aktuelle Temperatur.
- **Kleidungsbilder** (gefühlte Temperatur 07:00-19:00 in °C, °F wird umgerechnet; "min" =
  kühlste, "max" = wärmste Stunde). Höchstens fünf, in dieser Reihenfolge (Schutz zuerst):

  | Bild        | Kleidung      | Wann                                           |
  | ----------- | ------------- | ---------------------------------------------- |
  | 🌂          | Regenschirm   | Regen                                          |
  | 👢          | Gummistiefel  | Regen und max unter 20° (nicht bei Schnee)     |
  | 🥾          | Winterstiefel | Schnee                                         |
  | 🧥          | Jacke         | min unter 14°                                  |
  | (gezeichnet)| Mütze         | min unter 8°                                   |
  | 🧤          | Handschuhe    | min unter 3° oder Schnee                       |
  | 🧣          | Schal         | min unter 5°                                   |
  | (gezeichnet)| Pulli         | min von 14° bis unter 18° (ohne Jacke)         |
  | 👕          | T-Shirt       | max ab 22°                                     |
  | 🩳          | kurze Hose    | max ab 24°                                     |
  | 🧢          | Kappe         | sonnig (WMO-Code ≤ 2), UV ≥ 3 und max ab 15°   |
  | 🧴          | Sonnencreme   | sonnig (WMO-Code ≤ 2) und UV ≥ 4               |

  Für Mütze und Pulli gibt es kein Emoji, KidBoard zeichnet sie selbst.
- Eine Vorhersage älter als 24 Stunden oder eine Fehlerantwort des Servers blendet das
  Wetter aus. Ohne Verbindung bleibt die letzte Vorhersage (solange jünger als 24 Stunden).

## API

`/api/agenda?from=JJJJ-MM-TT&days=N` liefert 1-31 Tage (Standard 8 ab heute) innerhalb
von gestern bis heute + 31 Tage. Kalender werden mit 10 s Timeout und 5 MB Limit geladen und pro
Kalender im KV-Namespace `KIDBOARD_CACHE` gespeichert (legt Wrangler beim ersten Deploy selbst an;
ohne Binding: Cache API, die nur mit eigener Domain funktioniert): frisch für
`KIDBOARD_CACHE_TTL`, danach bis 7 Tage als letzter guter Stand. Fällt ein Kalender aus, wird
dieser Stand mit `status: "stale"` geliefert (ein alter Stand deckt evtl. nur einen Teil des
Zeitraums ab), ohne Stand `error`. Antwort `200`, wenn mindestens eine Quelle Daten hat oder es
keine Quelle gibt (keine Kalender, Editor aus: leeres Board und eine Log-Warnung), sonst
`502`. Mit Eltern-Editor kommen die Quellen `app-events` und `app-meals` (Einträge aus der
App, aus D1) hinzu; eine Änderung in der App ist beim nächsten Abruf sichtbar, fällt D1 aus,
sind nur sie `stale` bzw. `error`.
