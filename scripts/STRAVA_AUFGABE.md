# Geplante Aufgabe für das Strava-Update

Garmin aktualisiert sich über GitHub Actions selbst (`.github/workflows/garmin.yml`). Strava hat keinen
solchen Zugang und wird von einer **geplanten Claude-Aufgabe** aktualisiert (mittags und abends). Fällt sie
aus, zeigt die Website nach 20 Stunden oben eine Warnung.

## Aufgabe anlegen (unabhängig von einem bestimmten Chat)

Auf claude.ai bei Claude Code eine neue geplante Aufgabe anlegen:

- **Repository:** `stadiejan015-ux/Ironman-27`
- **Connector:** Strava einschalten (ohne Strava-Connector kann die Aufgabe nichts abrufen)
- **Neue Sitzung bei jedem Lauf** (nicht an einen Chat gebunden)
- **Zeitplan:** täglich 12:40 und 21:40 in deiner Zeitzone (in Bali `Asia/Makassar`, in Deutschland `Europe/Berlin`)
- Falls gefragt wird, wohin gepusht werden darf: direkt auf `main`
- **Aufgabentext:** den Block unten komplett einfügen

```
Strava-Update der Ironman-Website. Die Aufgabe startet jedes Mal in einer neuen Sitzung – alles Nötige steht hier.

1. Im Repository stadiejan015-ux/Ironman-27 (ist in der Sitzung ausgecheckt; falls nicht, mit add_repo hinzufügen, access "push"): `git checkout main && git pull origin main`.

2. Genau nach scripts/UPDATE.md im Repository vorgehen: Strava-Daten über den Strava-Connector holen, als JSON in ein temporäres Verzeichnis außerhalb des Repos schreiben, `python3 scripts/update_strava.py --activities … --profile … --date <heutiges Datum in Europe/Berlin>` ausführen und mit node prüfen (snapshotAt muss gesetzt sein), Zone 2 laut Schritt 5 (get_activity_streams ohne resolution, Dateipfad übernehmen, nicht einlesen; `node scripts/process_streams.js <jobs.json>`), danach `node scripts/save_prediction.js`.

3. Nur js/strava-data.js, data/z2-metrics.json und data/prediction-history.json als "Strava-Update <Datum>" committen und direkt auf main pushen – auch ohne neue Einheiten (snapshotAt zeigt, dass der Sync lief). Bei Ablehnung `git pull --rebase origin main`, Konflikte wie in UPDATE.md lösen; bei Netzwerkfehlern bis zu 4× mit Backoff. Rohe Streams niemals ins Repo. Keine anderen Dateien ändern, keine Branches und keine Pull Requests anlegen.

4. Am Ende 1–2 Sätze auf Deutsch: neue Einheiten, gewertete Zone-2-Werte, Prognose-Gesamtzeit und Stand (snapshotAt) – oder klar, was fehlgeschlagen ist und warum (z. B. Strava-Connector fehlt).
```

## Prüfen

Nach dem ersten Lauf sollte auf `main` ein Commit „Strava-Update <Datum>“ stehen und in der Fußzeile der
Website „Strava <Datum> <Uhrzeit>“. Läuft die Aufgabe einmal nicht, kann man das Update auch in einem Chat
anstoßen: „Strava-Update laut scripts/UPDATE.md machen“.
