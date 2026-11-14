# Ironman 27 – Trainings-Cockpit

Statische Website (GitHub Pages) für die Vorbereitung auf den Ironman Frankfurt am 27.06.2027. Sie zeigt Daten
aus Strava und Garmin, den Trainingsstand und eine Zielzeit-Prognose. Kein Server, kein Build-Schritt, keine
Abhängigkeiten im Repo.

Der Besitzer ist Anfänger und arbeitet nur am iPad und iPhone. Er liest und schreibt Deutsch.

## Feste Regeln

1. **Keine Schlüssel im Code.** Passwörter, Tokens und API-Schlüssel stehen nie in einer Datei, einem Commit
   oder einem Protokoll. Das Repo ist öffentlich. Zugangsdaten liegen nur als GitHub-Secrets vor.
2. **Keine Rohdaten ins Repo.** Strava-Streams und GPS-Strecken werden nie committet, nur berechnete Kennzahlen.
3. **Erklären für Anfänger.** Antworte auf Deutsch, in ganzen Sätzen, ohne Fachbegriffe oder mit kurzer
   Erklärung. Sag nach jeder Änderung, wie er sie am iPad prüft: welcher Tab, was antippen, was zu sehen ist.
   Braucht es einen Handgriff von ihm, gib eine nummerierte Anleitung mit den genauen Tipp-Schritten.
4. **Erst der Plan, dann die Arbeit.** Nenne vor größeren Änderungen kurz das Ziel und woran man erkennt, dass es
   stimmt. Bei gründlichen Aufgaben gilt der Skill `arbeite-wie-fable`.
5. **Design und Funktionen nur auf Wunsch ändern.** Fehler beheben heißt nicht umgestalten.
6. **Keine neuen Abhängigkeiten, kein Build-Schritt.**
7. **Ehrlich berichten.** Was geprüft ist, was nur angenommen ist, was offen bleibt.

## Arbeitsablauf

- Entwickelt wird auf dem vorgegebenen Zweig, ein Pull Request je Schritt. Der Besitzer merged selbst oder sagt
  ausdrücklich, dass Claude mergen soll.
- Nach einem Merge: Zweig neu von `main` aufsetzen, nie auf schon gemergter Historie weiterbauen.
- Nächste Schritte stehen in [`ROADMAP.md`](ROADMAP.md), Funde in [`AUDIT.md`](AUDIT.md), Bedienung und
  Funktionen in [`README.md`](README.md). Ist ein Roadmap-Schritt gemergt, dort abhaken.
- Jede neue Funktion wird in `README.md` beschrieben.

## Aufbau

- `index.html` lädt die Skripte in fester Reihenfolge. **Jede neue JS-Datei muss in die Liste in `index.html`
  und in `CORE` in `sw.js`.** Bei jeder Änderung an Seite, CSS oder JS `CACHE` in `sw.js` hochzählen.
- `js/data.js`: persönliche Einstellungen (Rennen, Flex-Block, Zonen, Ziele, Schwellen). Von Hand gepflegt.
- Rechenmodule ohne DOM, je mit Test: `prediction`, `z2`, `flex`, `gym`, `calendar`, `weekly`, `freshness`,
  `phases`, `charts`, `metrics`, `native`. Neue Rechenlogik gehört in ein solches Modul, nicht in `js/app.js`.
- `js/app.js`: zeichnet die Seite (sehr groß; Aufteilung ist in der Roadmap geplant). Lies nur den Abschnitt,
  den du brauchst.
- **Automatisch erzeugt, nie von Hand ändern:** `js/strava-data.js`, `js/garmin-data.js`, `data/*.json`.
- `scripts/`: Strava-Update (`UPDATE.md`, `update_strava.py`, `process_streams.js`), Garmin-Update
  (`update_garmin.py`, `garmin_tokens.sh`), Prognose-Verlauf (`save_prediction.js`).
- `.github/workflows/garmin.yml`: holt Garmin-Daten und pusht direkt auf `main`.

## Daten-Updates

- **Strava:** geplante Claude-Aufgabe, zweimal täglich, genau nach `scripts/UPDATE.md`. Sie committet nur
  `js/strava-data.js`, `data/z2-metrics.json` und `data/prediction-history.json` direkt auf `main`.
- **Garmin:** GitHub Action. Die Anmeldung liegt nur verschlüsselt im Zwischenspeicher.
- Nennt der Besitzer neue Testwerte (z. B. Schwimmtest, FTP, Körpergewicht) oder Termine, trägt Claude sie in
  `js/data.js` ein.

## Prüfen

- Alle Tests: `for f in tests/*.test.js; do node "$f" || break; done` und `python3 tests/update_garmin_test.py`.
- Neue Logik bekommt einen Test, der vor der Änderung scheitert.
- Sichtbare Änderungen im Browser ansehen (Playwright ist vorinstalliert): iPhone und iPad, hoch und quer, hell
  und dunkel, auch im Home-Bildschirm-Modus.
- Darstellung: Farben nur über CSS-Variablen, Kontrast mindestens 4,5:1, Tippflächen mindestens 44 px.
