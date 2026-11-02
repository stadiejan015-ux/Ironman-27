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

## Anpassen

Alles Persönliche steht in [`js/data.js`](js/data.js):

| Feld | Bedeutung |
|------|-----------|
| `race` | Name, Datum und Ort deines Rennens (**Datum ist aktuell ein Platzhalter: 11.07.2027**) |
| `goals` | Zielzeiten für Schwimmen, T1, Rad, T2, Laufen |
| `zones`, `bests` | Trainingszonen und Bestleistungen (aus Strava) |
| `activities` | Aktivitäten-Snapshot aus Strava (Stand 02.11.2026) |

Die Saisonphasen und ihre Wochenstunden sind in `js/app.js` (`PHASES`) definiert.
