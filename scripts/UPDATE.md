# Tägliches Strava-Update

Diese Schritte führt die geplante Claude-Aufgabe jeden Abend aus. Man kann
sie auch jederzeit von Hand in einer Claude-Session anstoßen.

1. Letzten Stand lesen: `snapshotDate` in `js/strava-data.js`.
2. Über den Strava-Connector holen (immer `use_preferred_units: true`):
   - `list_activities` mit `range_start` = (snapshotDate − 3 Tage)T00:00:00,
     `first: 100`, bei `has_next_page` weiterblättern.
   - `get_athlete_profile`, `get_athlete_zones`, `get_active_streak`,
     `get_athlete_best_efforts` (ohne Parameter).
3. Ergebnisse unverändert als JSON in temporäre Dateien schreiben (nicht ins Repo):
   - `acts.json`: das `activities`-Array (Felder `name`, `sport_type`,
     `start_local`, `summary` reichen).
   - `profile.json`: `{"athlete": …, "zones": …, "streak": …, "bests": …}`.
4. `python3 scripts/update_strava.py --activities acts.json --profile profile.json --date <heute>`
5. Rennprognose speichern: `node scripts/save_prediction.js`
6. Nur `js/strava-data.js` und `data/prediction-history.json` committen
   (`Strava-Update <Datum>`) und auf `main` pushen. GitHub Pages veröffentlicht
   die Seite danach automatisch.
   Wird der Push abgelehnt: `git pull --rebase origin main`. Bei einem Konflikt
   in `data/prediction-history.json` die Version von `main` nehmen
   (`git checkout --theirs …` bzw. Rebase abbrechen, neu aufsetzen) und
   `node scripts/save_prediction.js` erneut ausführen.

Das Skript erkennt bereits vorhandene Einheiten (Startzeit + Sportart) und
ersetzt sie, sodass sich überlappende Zeiträume nicht doppeln.
