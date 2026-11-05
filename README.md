# Ironman 27 – Trainings-Cockpit

Eine statische Website, die einen strukturierten Überblick über mein Ironman-Training gibt:

- **Countdown & aktuelle Phase** bis zum Renntag
- **Die letzten 4 Wochen** – Umfang je Disziplin im Vergleich zur Vorperiode, FTP, Streak
- **Wo du gerade stehst** – automatisch abgeleitete Stärken & Baustellen
- **Saisonplan** – Periodisierung (Grundlage → Aufbau → Peak → Taper) rückwärts vom Renntag
- **Wochenumfang** – gestapelte Stunden Schwimmen/Rad/Laufen (optional inkl. Kraft & Sonstiges, Tabellenansicht)
- **Disziplinen** – Kennzahlen, Pace-Verlauf und Wochenkilometer
- **Rennvorbereitung** – längste Einheit vs. Renndistanz und Zielzeiten
- **Aktivitäten** – filterbare Liste, die neuesten 10 sichtbar, alle per Knopf aufklappbar

## Ansehen

Kein Build-Schritt nötig: `index.html` im Browser öffnen. Für GitHub Pages:
*Settings → Pages → Deploy from branch* und den Branch/Root-Ordner auswählen.

## Als App installieren (iPad / iPhone)

1. Die Seite in **Safari** öffnen: https://stadiejan015-ux.github.io/Ironman-27/
2. Auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm“** wählen und mit **„Hinzufügen“** bestätigen.

Die App „Ironman 27“ startet dann im Vollbild ohne Browser-Leiste. Aktualisieren: Knopf ↻ oben rechts; kommt die
App nach mehr als 15 Minuten wieder in den Vordergrund, lädt sie die Daten selbst neu. Offline zeigt sie den
zuletzt geladenen Stand mit einem Hinweis „Offline · Daten: …“.
Technik: `manifest.webmanifest`, Service Worker `sw.js` (immer zuerst das Netz, offline die gespeicherte
Kopie), `js/pwa.js`; Icons erzeugt `node scripts/make_icons.js` aus einer SVG (braucht Playwright).

## Automatische Aktualisierung

Die Strava-Daten liegen in [`js/strava-data.js`](js/strava-data.js) und werden mittags und abends
von einer geplanten Claude-Aufgabe aktualisiert (Ablauf: [`scripts/UPDATE.md`](scripts/UPDATE.md),
Zusammenführen: [`scripts/update_strava.py`](scripts/update_strava.py)). Der Stand steht unten auf der Seite.
Die geplante Aufgabe neu anlegen (unabhängig von einem Chat): [`scripts/STRAVA_AUFGABE.md`](scripts/STRAVA_AUFGABE.md).

## Einklappbare Abschnitte

Alle Abschnitte außer Überblick und Heute lassen sich über ihre Überschrift ein- und ausklappen (Tastatur,
`aria-expanded`); eingeklappt steht eine Kurzfassung daneben. In „Erholung“ bleiben die Kacheln sichtbar, nur die
Verläufe sind separat einklappbar. Standard: im Flex-Zeitraum Zone 2, Disziplinen, Rennen und die Erholungs-Verläufe
zu, sonst nur die Verläufe (`layout` in `js/data.js`). Die eigene Wahl wird gemerkt, bis die Phase wechselt;
„Ansicht zurücksetzen“ in der Fußzeile. Navigation und Anker öffnen eingeklappte Abschnitte. Logik:
[`js/layout.js`](js/layout.js), Tests: `node tests/layout.test.js`.

## Datenstand-Warnung

Ein Banner unter dem Header warnt, wenn ein automatischer Sync ausgefallen ist: Strava gelb ab 20 h, rot ab
48 h; Garmin gelb ab 8 h, rot ab 24 h – mit Tipp, was zu tun ist, und „Ausblenden“ bis zum nächsten Update.
Ist der Garmin-Sync frisch, der letzte Schlafwert aber älter als gestern, erscheint ein grauer Hinweis, dass die
Uhr nicht synchronisiert hat. Die Fußzeile zeigt beide Zeitstempel in Gerätezeit. Grundlage: `snapshotAt` in
`js/strava-data.js` (schreibt `update_strava.py` bei jedem Lauf) und `updated` in `js/garmin-data.js`.
Berechnung: [`js/freshness.js`](js/freshness.js), Schwellen: `freshness` in `js/data.js`.
Tests: `node tests/freshness.test.js`.

## Garmin (Erholung & Form, Tagesvorschlag)

Die GitHub Action [`.github/workflows/garmin.yml`](.github/workflows/garmin.yml) holt alle 3 Stunden
Schlaf, Sleep Score, HRV, Ruhepuls, Stress, Body Battery, Trainingsbereitschaft, Trainingsstatus/-belastung,
VO2max und Gewicht aus Garmin Connect ([`scripts/update_garmin.py`](scripts/update_garmin.py)) und schreibt
sie nach `js/garmin-data.js`. Daraus berechnet die Seite die Form des Tages und passt den Trainingsvorschlag an.

Einrichtung (einmalig): Im Repo unter *Settings → Secrets and variables → Actions → New repository secret*
`GARMIN_EMAIL` und `GARMIN_PASSWORD` anlegen, dann unter *Actions → Garmin-Update → Run workflow* einmal starten.
Hinweis: Der Zugang nutzt die inoffizielle Bibliothek `garminconnect`; Zwei-Faktor-Anmeldung wird dabei nicht unterstützt.

## Rennprognose

[`js/prediction.js`](js/prediction.js) berechnet „Wenn heute Renntag wäre“ (reine Funktion `predictRace(data, config)`):
Schwimmen über CSS-Test bzw. Median-Pace der letzten Wochen, Rad über ein Physikmodell
(FTP × IF, CdA, Rollwiderstand, 1.600 Hm), Laufen über Riegel aus der 10-km-Bestzeit mit
Ironman-Faktor und Aufschlag für fehlende lange Läufe. Alle Parameter stehen in `js/data.js`
unter `prediction`. Tests: `node tests/prediction.test.js`.
Bei jedem Sync speichert [`scripts/save_prediction.js`](scripts/save_prediction.js) die Prognose
in `data/prediction-history.json` (Verlaufslinie auf der Seite).

## Zone-2-Entwicklung

[`js/z2.js`](js/z2.js) wertet die Strava-Streams jeder Lauf- und Radeinheit aus (reine Funktionen):
Pace bei 140–148 bpm, Watt bei 135–145 bpm (nur echte Watt), Entkopplung (Pa:HR / Pw:HR) langer
ruhiger Einheiten und Zeit pro HF-Zone. Das abendliche Update lädt die Streams neuer Einheiten,
[`scripts/process_streams.js`](scripts/process_streams.js) speichert daraus **nur die Kennzahlen** in
`data/z2-metrics.json` – rohe Streams kommen nie ins Repo. Hügelige Läufe (10–25 Hm/km) werden mit
steigungsbereinigter Pace (GAP, Minetti-Modell) gewertet. Ob Brustgurt oder Uhr gemessen hat, erkennt
[`scripts/update_hr_sources.py`](scripts/update_hr_sources.py) in der Garmin-Action aus den Sensordaten
(`data/hr-sources.json`); `#gurt` / `#uhr` im Strava-Titel oder in der Beschreibung hat Vorrang. Eigene HF-Zonen und alle Grenzen stehen in
`js/data.js` unter `zones` und `z2`. Tests: `node tests/z2.test.js`.

## Flex-Modus

Bis zum Datum `flex.until` in `js/data.js` (aktuell 10.01.2027) läuft die Seite im Flex-Modus
([`js/flex.js`](js/flex.js)): „Heute“ zeigt den nächsten Gym-Split (Rotation Push → Pull → Legs)
und eine optionale lockere Ausdauereinheit passend zur gewählten Ausstattung vor Ort; statt
Umfangszielen zählt das Wochen-Minimum (4× Gym, 2× Ausdauer ≥ 30 min, davon 1× Schwimmen).
`flex.active: false` schaltet alles zurück. Tests: `node tests/flex.test.js`.

Der **Saisonplan** passt sich an ([`js/phases.js`](js/phases.js)): Phasen beginnen montags (wie das Wochenraster),
Phasen vor dem Flex-Beginn enden dort, danach folgen Flex, **Wiedereinstieg** (2 Wochen, lockere Einheiten nach Puls,
3× Schwimmtechnik, Gym 2–3×), Grundlage 2 (6), Aufbau 1 (6) und Aufbau 2 bis zum Peak; Peak und Taper bleiben
rückwärts vom Renntag. Wochenzahlen: `plan` in `js/data.js`; bleiben für Aufbau 2 weniger als 3 Wochen, warnt der
Saisonplan. Tests: `node tests/phases.test.js`.

## Gym-Tracker

Titel der Krafteinheit in Garmin Connect: `Push 6x100`, `Pull · Latzug 8x90`, `Legs 3x10x180`,
`Push 6x100 @Bali` (mit Gym-Ort) oder nur `Push` (Einheit ohne Eintrag). „kg“ ist optional,
Komma-Dezimalen (82,5) sind erlaubt, auch die Beschreibung wird geprüft. `scripts/update_garmin.py`
speichert dafür Titel und Beschreibung der Krafteinheiten; [`js/gym.js`](js/gym.js) erkennt Split,
Übung, Wiederholungen, Gewicht, Sätze und Ort und berechnet das 1RM nach Epley. PRs bei Latzug und
Beinpresse zählen nur am selben Ort. Zuordnung Split → Hauptübung und Aliase: `gym` in `js/data.js`.
**Nächstes Ziel** nach doppelter Progression (`gym.progression`: Bankdrücken 6–8 Wdh./+2,5 kg, Latzug und
Beinpresse 5–8 Wdh./+5 bzw. +10 kg): oberes Ende erreicht → schwerer und zurück aufs untere Ende, im Bereich →
1 Wdh. mehr, darunter → unteres Ende; bei Sätzen pro Satz. Latzug und Beinpresse nur mit Einträgen vom aktuellen
Ort (letzte Einheit mit @Ort). Badge „Ziel erreicht“ und Hinweis bei Stagnation (3 Einträge ohne neues bestes 1RM).
**1RM-Ziel** je Hauptübung (`gym.goals`, z. B. Bankdrücken 100, Latzug 140, Beinpresse 300 kg): Fortschrittsbalken unter
dem 1RM (bei Maschinen bestes 1RM am aktuellen Ort) und gestrichelte Ziellinie im Diagramm.
Tests: `node tests/gym.test.js`.

## Zuletzt gemacht

Unter dem Wochen-Minimum in „Heute“: wie lange Schwimmen, Rad, Laufen, Langer Lauf (≥ 75 min),
Lange Fahrt (≥ 2,5 h) und Legs her sind, mit Ampel nach den Schwellen in `sinceLast` (`js/data.js`).
Im Flex-Modus wird eine Sportart ohne passende Ausstattung grau („nicht verfügbar“) statt rot, lange
Einheiten sind dort nur Info. Berechnung: `sinceLast()` in [`js/flex.js`](js/flex.js), dieselbe
`lastWhere()`-Logik nutzt auch der Leg-Day-Check im Tagesvorschlag. Tests: `node tests/flex.test.js`.

## Wochenzusammenfassung

Karte „Woche“ in „Heute“ unter „Zuletzt gemacht“, nur aus festen Regeln (keine KI, keine API), direkt im
Browser berechnet ([`js/weekly.js`](js/weekly.js)). Mo/Di zeigt sie die abgeschlossene Vorwoche, sonst die
laufende; mit ← → lassen sich 8 Wochen durchblättern. Inhalt: Highlight (neuer PR > Wochen-Minimum erfüllt >
längste Einheit), Gym mit Splits und Einträgen, Ausdauer je Sportart, Gesamtstunden gegenüber dem Schnitt der
4 Wochen davor, Wochen-Minimum (Flex), Garmin-Erholung mit Pfeil zur Vorwoche und höchstens 3 Hinweise.
Wiederverwendet werden Kalender-Raster, Gym-Splits/PRs, Wochen-Minimum und „Zuletzt gemacht“.
Dazu die **Trainingsbelastung von Garmin**: Summe der Einheiten Mo–So mit Vergleich zur Vorwoche, Balken der
letzten 8 Wochen (Kraft / Ausdauer / Sonstiges), akut/chronisch mit Garmins Status. Einheiten ohne
Garmin-Belastungswert werden gezählt, nicht geschätzt. `scripts/update_garmin.py` speichert dafür für jede
Einheit aller Sportarten `activityTrainingLoad` (beim ersten Lauf 10 Wochen rückwirkend).
Schwellen: `weekly` in `js/data.js`. Tests: `node tests/weekly.test.js`.

## Kalender

Die letzten 10 Wochen als Raster Mo–So (neueste oben, [`js/calendar.js`](js/calendar.js)): Farbe nach
Sportart, mehrere Sportarten als Streifen (max. 3, Rest „+“), kräftiger bei längerer Tagesdauer
(< 45 / 45–90 / > 90 min), Gym-Split als Kürzel (Pu/Pl/L). Kraft kommt nur aus den zusammengeführten
Gym-Einheiten, damit nichts doppelt zählt. Antippen eines Tages zeigt die Einheiten darunter.
Tests: `node tests/calendar.test.js`.

## Anpassen

Alles Persönliche steht in [`js/data.js`](js/data.js):

| Feld | Bedeutung |
|------|-----------|
| `race` | Name, Datum und Ort deines Rennens (aktuell 27.06.2027 laut Presseberichten – offizielle Bestätigung prüfen) |
| `commitDate` | Start der Vorbereitung (Anmeldung, ein Jahr vor dem Rennen) |
| `goals` | Zielzeiten für Schwimmen, T1, Rad, T2, Laufen |
| `gym` | Hauptübung je Split, Aliase, Übungen mit Orts-Vergleich |
| `flex` | Flex-Zeitraum, Wochen-Minimum, Split-Rotation und -Erkennung |
| `sinceLast` | Ampel-Schwellen (Tage) und Mindestdauern für „Zuletzt gemacht“ |
| `weekly` | Schwellen der Wochen-Hinweise (HRV-Abfall, Schlaf, Belastungsfaktor), Anzahl Hinweise und Wochen |
| `freshness` | Ab wie vielen Stunden die Datenstand-Warnung gelb/rot wird, Link zu GitHub Actions |
| `layout` | Welche Abschnitte im Flex- und im Normalzeitraum standardmäßig eingeklappt sind |
| `plan` | Wochen je Phase nach einem Flex-Zeitraum (Wiedereinstieg, Grundlage 2, Aufbau 1; Aufbau 2 = Rest) |
| `zones`, `z2` | Eigene HF-Zonen und Parameter der Zone-2-Auswertung |
| `prediction` | Parameter der Rennprognose (CSS-Tests, IF, CdA, Ironman-Faktor …) |

Die Saisonphasen und ihre Wochenstunden sind in `js/app.js` (`PHASES`) definiert.
