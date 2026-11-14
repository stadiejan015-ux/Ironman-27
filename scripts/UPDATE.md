# Tägliches Strava-Update

Diese Schritte führt die geplante Claude-Aufgabe zweimal täglich (mittags und abends) aus. Man kann
sie auch jederzeit von Hand in einer Claude-Session anstoßen.

1. Letzten Stand lesen: `snapshotDate` in `js/strava-data.js`.
2. Über den Strava-Connector holen (immer `use_preferred_units: true`):
   - `list_activities` mit `range_start` = (snapshotDate − 3 Tage)T00:00:00,
     `first: 100`, `include_tags: true`, bei `has_next_page` weiterblättern.
   - `get_athlete_profile`, `get_athlete_zones`, `get_active_streak`,
     `get_athlete_best_efforts` (ohne Parameter).
3. Ergebnisse unverändert als JSON in temporäre Dateien schreiben (nicht ins Repo):
   - `acts.json`: das `activities`-Array (Felder `name`, `description`,
     `sport_type`, `start_local`, `summary` reichen). Von Beschreibungen speichert
     das Skript nur gym-relevante Zeilen bei Krafteinheiten (Push/Pull/Legs, „6x100“, „@Ort“).
   - `profile.json`: `{"athlete": …, "zones": …, "streak": …, "bests": …}`.
4. `python3 scripts/update_strava.py --activities acts.json --profile profile.json --date <heute>`
   Das Skript schreibt neben `snapshotDate` automatisch `snapshotAt` (Zeitpunkt des Abrufs, UTC mit
   Zeitzone, z. B. `2026-11-05T13:40+00:00`). Daran erkennt die Website, wie alt die Daten sind, und
   warnt, wenn der Sync ausfällt. Prüfen, dass `snapshotAt` in `js/strava-data.js` steht.
5. Zone 2 (Streams): Für jede Lauf- oder Radeinheit aus Schritt 2 (Run, TrailRun,
   VirtualRun, Ride, VirtualRide, GravelRide, MountainBikeRide), deren `id` noch
   nicht in `data/z2-metrics.json` steht:
   - `get_activity_streams` OHNE `resolution`, mit `streams` = time, heart_rate,
     velocity_smooth, watts, grade_smooth, altitude, moving, distance, cadence,
     temp, location. Die Antwort ist groß und wird automatisch als Datei
     gespeichert – den Pfad aus der Meldung übernehmen (nicht einlesen).
   - Antwort `{}` → `"skip": "keine Streams (manuell erfasst)"`; erscheint die
     Antwort ausnahmsweise direkt (sehr kurze Einheit) → `"skip": "Stream zu kurz"`.
   - `jobs.json` im Scratchpad anlegen:
     `[{ "id": "…", "file": "<Pfad>" | "skip": "<Grund>", "meta": { "date": start_local,
     "sport": sport_type, "name": …, "km": distance, "sec": moving_time,
     "elev": elevation_gain, "trainer": is_trainer, "description": description } }]`
     (Beschreibung wird für die Markierung `#gurt` / `#uhr` gebraucht)
   - `node scripts/process_streams.js <jobs.json>` – speichert nur Kennzahlen.
     Rohe Streams kommen NIE ins Repo (es ist öffentlich).
6. Rennprognose speichern: `node scripts/save_prediction.js`
7. Nur `js/strava-data.js`, `data/z2-metrics.json` und `data/prediction-history.json` committen
   (`Strava-Update <Datum>`) und auf `main` pushen – **auch wenn es keine neuen Einheiten gibt**,
   damit `snapshotAt` zeigt, dass der Sync gelaufen ist. GitHub Pages veröffentlicht
   die Seite danach automatisch.
   Wird der Push abgelehnt: `git pull --rebase origin main`. Bei einem Konflikt
   in `data/prediction-history.json` die Version von `main` nehmen
   (`git checkout --theirs …` bzw. Rebase abbrechen, neu aufsetzen) und
   `node scripts/save_prediction.js` erneut ausführen.

Das Skript erkennt bereits vorhandene Einheiten (Startzeit + Sportart) und
ersetzt sie, sodass sich überlappende Zeiträume nicht doppeln.

## Wenn Strava nicht antwortet

Antwortet der Strava-Connector nicht (Verbindungsfehler wie 502, Zeitüberschreitung, oder die Strava-Werkzeuge
fehlen in der Sitzung):

1. Nichts committen und nichts pushen. Die Seite zeigt weiter den letzten Stand.
2. **Genau einen** neuen Versuch in etwa 60 Minuten einplanen (Erinnerung an dieselbe Sitzung, sonst eine
   einmalige geplante Aufgabe mit demselben Auftrag). Im Bericht nennen, dass und wann der zweite Versuch läuft.
3. Schlägt auch der zweite Versuch fehl, keinen weiteren einplanen und den Fehler klar melden. Das nächste
   reguläre Update holt die letzten 3 Tage ohnehin mit ab.

Das gilt nur für Verbindungsfehler. Bei einem Fehler im Skript oder beim Push hilft kein Warten: Ursache nennen.
