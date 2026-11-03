# Ironman 27 – Trainings-Cockpit

Eine statische Website, die einen strukturierten Überblick über mein Ironman-Training gibt:

- **Countdown & aktuelle Phase** bis zum Renntag
- **Die letzten 4 Wochen** – Umfang je Disziplin im Vergleich zur Vorperiode, FTP, Streak
- **Wo du gerade stehst** – automatisch abgeleitete Stärken & Baustellen
- **Saisonplan** – Periodisierung (Grundlage → Aufbau → Peak → Taper) rückwärts vom Renntag
- **Wochenumfang** – gestapelte Stunden Schwimmen/Rad/Laufen (optional inkl. Kraft & Sonstiges, Tabellenansicht)
- **Disziplinen** – Kennzahlen, Pace-Verlauf und Wochenkilometer
- **Rennvorbereitung** – längste Einheit vs. Renndistanz und Zielzeiten
- **Zonen & Bestleistungen** – HF-, Leistungs- und Pace-Zonen aus Strava
- **Aktivitäten** – filterbare Liste aller Einheiten

## Ansehen

Kein Build-Schritt nötig: `index.html` im Browser öffnen. Für GitHub Pages:
*Settings → Pages → Deploy from branch* und den Branch/Root-Ordner auswählen.

## Automatische Aktualisierung

Die Strava-Daten liegen in [`js/strava-data.js`](js/strava-data.js) und werden jeden Abend
von einer geplanten Claude-Aufgabe aktualisiert (Ablauf: [`scripts/UPDATE.md`](scripts/UPDATE.md),
Zusammenführen: [`scripts/update_strava.py`](scripts/update_strava.py)). Der Stand steht unten auf der Seite.

## Garmin (Erholung & Form, Tagesvorschlag)

Die GitHub Action [`.github/workflows/garmin.yml`](.github/workflows/garmin.yml) holt alle 3 Stunden
Schlaf, Sleep Score, HRV, Ruhepuls, Stress, Body Battery, Trainingsbereitschaft, Trainingsstatus/-belastung,
VO2max und Gewicht aus Garmin Connect ([`scripts/update_garmin.py`](scripts/update_garmin.py)) und schreibt
sie nach `js/garmin-data.js`. Daraus berechnet die Seite die Form des Tages und passt den Trainingsvorschlag an.

Einrichtung (einmalig): Im Repo unter *Settings → Secrets and variables → Actions → New repository secret*
`GARMIN_EMAIL` und `GARMIN_PASSWORD` anlegen, dann unter *Actions → Garmin-Update → Run workflow* einmal starten.
Hinweis: Der Zugang nutzt die inoffizielle Bibliothek `garminconnect`; Zwei-Faktor-Anmeldung wird dabei nicht unterstützt.

## Anpassen

Alles Persönliche steht in [`js/data.js`](js/data.js):

| Feld | Bedeutung |
|------|-----------|
| `race` | Name, Datum und Ort deines Rennens (aktuell 27.06.2027 laut Presseberichten – offizielle Bestätigung prüfen) |
| `commitDate` | Start der Vorbereitung (Anmeldung, ein Jahr vor dem Rennen) |
| `goals` | Zielzeiten für Schwimmen, T1, Rad, T2, Laufen |

Die Saisonphasen und ihre Wochenstunden sind in `js/app.js` (`PHASES`) definiert.
