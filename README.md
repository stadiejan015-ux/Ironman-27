# Ironman 27 – Trainings-Cockpit

Eine statische Website, die einen strukturierten Überblick über mein Ironman-Training gibt:

- **Countdown & aktuelle Phase** bis zum Renntag
- **Die letzten 4 Wochen** – Umfang je Disziplin im Vergleich zur Vorperiode, FTP, Streak
- **Wo du gerade stehst** – Highlights wie in Apple Health: je Sport ein kurzer Satz und eine Kennzahl
- **Saisonplan** – Periodisierung (Grundlage → Aufbau → Peak → Taper) rückwärts vom Renntag
- **Wochenumfang** – gestapelte Stunden Schwimmen/Rad/Laufen (optional inkl. Kraft & Sonstiges, Tabellenansicht)
- **Disziplinen** – Kennzahlen, Pace-Verlauf und Wochenkilometer
- **Rennvorbereitung** – längste Einheit vs. Renndistanz und Zielzeiten
- **Aktivitäten** – die neuesten 5, „Alle anzeigen ›“ öffnet die ganze Liste mit Filter

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

**Verhalten wie eine iOS-App** (`js/native.js` mit reinen Funktionen, Tests: `node tests/native.test.js`):

- **Großer Titel:** Oben liegt eine unsichtbare Leiste. Verschwindet der große Tab-Titel beim Scrollen darunter,
  wird sie im selben Maß durchscheinend und zeigt den kleinen Titel: auf dem iPhone mittig, auf dem iPad links
  neben der Tab-Kapsel.
- **Tabs:** Jeder Tab merkt sich seine Scroll-Position. Tippen auf den aktiven Tab scrollt weich nach ganz oben.
  Das klappt auch, wenn gerade ein Abschnitt wie `#gym` in der Adresse steht.
- **Runterziehen zum Aktualisieren:** Nur im Home-Bildschirm-Modus auf Touch-Geräten; im Browser macht Safari das
  selbst. Beim Ziehen erscheint nach und nach ein kleiner iOS-Spinner. Über die Schwelle gezogen und losgelassen,
  lädt die Seite neu wie mit ↻. Das Scrollen wird dabei nie blockiert.
- **Start ohne Aufblitzen:** Es gibt Startbilder in Hell und Dunkel für die gängigen iPhones und iPads; sie erzeugt
  `node scripts/make_startup.js` ohne Abhängigkeiten. Die gewählte Darstellung (Einstellungen) greift schon vor dem
  ersten Bild. Bis die Inhalte gezeichnet sind, stehen graue Platzhalter in ihrer späteren Größe da, auch für
  Zone 2 und den Prognose-Verlauf, die nachgeladen werden. Damit ein neues Startbild greift, die App einmal vom
  Home-Bildschirm entfernen und neu hinzufügen.
- **Übergänge:** Beim Tab-Wechsel blendet der neue Tab kurz ein (200 ms). Die Zahlen in den Ringen und in den
  großen Kacheln zählen beim ersten Anzeigen hoch, im selben Tempo wie die Ringe. Das passiert einmal pro Kachel und
  Sitzung, Uhrzeiten und Pace zählen nicht.
- **Eigene Ansicht von rechts:** Lange Listen zeigen im Tab nur die ersten Einträge und „Alle anzeigen ›“. Das
  öffnet eine eigene Ansicht, die von rechts hereinschiebt, mit „‹ Training“ bzw. „‹ Plan“ oben links. Zurück geht
  es auch durch Wischen vom linken Rand (folgt dem Finger, Schnippen reicht), mit Esc, mit dem Zurück des Browsers
  oder durch erneutes Tippen auf den Tab. Adressen: `#training-aktivitaeten` (alle Aktivitäten mit Filter) und
  `#plan-phasen` (alle Phasen).
- **Bewegung reduzieren:** Kein Einblenden, kein Hochzählen, kein Pulsieren der Platzhalter, und der Spinner
  dreht sich nicht. Die Ansicht von rechts blendet nur ein.

## Automatische Aktualisierung

Die Strava-Daten liegen in [`js/strava-data.js`](js/strava-data.js) und werden mittags und abends
von einer geplanten Claude-Aufgabe aktualisiert (Ablauf: [`scripts/UPDATE.md`](scripts/UPDATE.md),
Zusammenführen: [`scripts/update_strava.py`](scripts/update_strava.py)). Der Stand steht im Einstellungen-Blatt unter „Über die Daten“.
Die geplante Aufgabe neu anlegen (unabhängig von einem Chat): [`scripts/STRAVA_AUFGABE.md`](scripts/STRAVA_AUFGABE.md).

## Tabs

Die Seite ist in vier Tabs aufgeteilt, wie eine iOS-App:

| Tab | Inhalt |
|---|---|
| **Heute** | Startbildschirm und Woche |
| **Training** | Gym, Kalender, Die letzten 4 Wochen, Umfang, Disziplinen, Aktivitäten |
| **Erholung** | Erholung & Form, Zone 2 |
| **Plan** | Wo du gerade stehst, Saisonplan, Rennvorbereitung |

- **Tab-Leiste:** Auf dem iPhone sitzt sie unten (durchscheinend), auf dem iPad schwebt sie oben als Kapsel.
- **Adressen:** Umschalten geht über `#heute`, `#training`, `#erholung` und `#plan`. Alte Anker wie `#zone2` öffnen
  den passenden Tab und scrollen hin.
- **Überschriften:** Abschnitte lassen sich nicht mehr einklappen. Lange Listen sind stattdessen gekürzt (siehe
  „Eigene Ansicht von rechts“ oben).
- **Verhalten:** Jeder Tab merkt sich seine Scroll-Position. Erneutes Tippen auf den aktiven Tab scrollt nach oben.
- **Knöpfe:** Neben „Heute“ stehen Aktualisieren und das Zahnrad. Das Zahnrad öffnet ein Blatt mit dem
  Erscheinungsbild (Automatisch / Hell / Dunkel) und „Über die Daten“. Dort stehen der Datenstand von Strava und
  Garmin, wann die nächsten Updates kommen und die Quellen. Eine Fußzeile gibt es nicht mehr.
- **Hilfetexte:** Erklärungen stehen nicht mehr als Untertitel unter den Überschriften, sondern hinter einem kleinen
  ⓘ daneben, das ein kurzes Blatt öffnet. Das gilt z. B. für das Titel-Format im Gym, die Quellen der Split-Verteilung
  und Garmins Belastung.
- **Blätter:** Sie schließen über „Fertig“, durch Wischen nach unten, Tippen daneben oder Esc.

## Design

Das Design orientiert sich an Apple Health und Apple Fitness. Alle Farben, Flächen und Schriftgrößen stehen als
Variablen am Anfang von [`css/style.css`](css/style.css).

- **Flächen:** Karten ohne Rahmen und Schatten, getrennt nur durch Flächenkontrast. Der Dunkelmodus nutzt echtes
  Schwarz.
- **Farben:** Apple-Systemfarben, das Akzent-Rot entspricht dem App-Icon.
- **Schrift:** die Systemschrift (auf iPad und iPhone SF Pro), große Zahlen in SF Pro Rounded, Größen nach der
  iOS-Skala.
- **Kontrast:** Jeder Text hat mindestens 4,5:1. Wo eine Systemfarbe als Schrift zu hell wäre, gibt es eine dunklere
  Schrift-Variante (`--accent-ink`, `--good-ink`, `--warn-ink`, `--bad-ink`, Sekundärgrau im hellen Modus). Flächen,
  Balken und Punkte nutzen die Systemfarben unverändert.

Wiederkehrende Bausteine:

- **Gruppierte Listen** im Stil der iOS-Einstellungen, z. B. Wochen-Minimum, Zuletzt gemacht, Phasen, Aktivitäten
  und Bereitschaft.
- **Health-Kacheln** mit der Kategorie in Farbe, einer großen Zahl und einer grauen Einheit.
- **Highlights** („Wo du gerade stehst“): Symbol und Titel in der Sportfarbe, ein kurzer Satz und eine Kennzahl.
  Antippen öffnet ein Blatt mit dem ausführlichen Text.
- **Symbole:** Jede Sportart hat ihr Symbol. Schritte haben Fußspuren, Body Battery eine Batterie, Trainingsstatus
  und Belastung einen Trendpfeil (`icon` im Register in `js/metrics.js`).
- **Segmented Controls** für Filter.
- **Kapseln mit Häkchen** für Auswahl.
- **Text-Knöpfe** in Akzentfarbe.

Startbildschirm „Heute“ wie in Apple Fitness:

- **Kopf:** oben die Datumszeile, darunter der große Titel und eine ruhige Zeile, z. B. „Noch 233 Tage bis Frankfurt
  · Flex bis 10. Januar“.
- **Haupt-Karte:** Im Flex-Zeitraum zeigt sie das Wochen-Minimum als Ringe, außen Gym, innen Ausdauer. Ein
  Schwimm-Ring kommt nur dazu, wenn Schwimmen im Minimum verlangt ist. Die Ringe sind 160 px groß auf dem iPhone und
  200 px auf dem iPad. Daneben stehen die Werte in
  Ringfarbe, darunter, was tatsächlich noch fehlt.
- **Heute dran:** zwei kompakte Zeilen für Gym-Split und Ausdauer. Antippen klappt die Details auf.
- **Vor Ort:** Die Zeile öffnet ein Blatt mit Schaltern für die Ausstattung.
- **Darunter:** „Zuletzt gemacht“, die kompakte Wochenkarte und eine Zeile „Bereitschaft 88 · Bereit ›“, die die
  Detailansicht öffnet. Die Einzelwerte (Sleep Score, HRV usw.) stehen nur im Erholung-Tab. Kein Wert kommt im
  Heute-Tab doppelt vor; Erledigtes zeigen „Heute dran“ und „Zuletzt gemacht“. Auf dem iPad quer stehen Haupt-Karte
  und Woche nebeneinander.
- **Renninfos:** Countdown, Distanzen und Fortschritt stehen im Tab Plan unter „Rennvorbereitung“.

**Bewegung und Bedienung** (nach den Design-Skills in `.claude/skills`):

- **Kurven:** Alle Übergänge nutzen kräftige Kurven aus `css/style.css` (`--ease-out`, `--ease-drawer`) statt der
  CSS-Standards. UI-Übergänge bleiben unter 300 ms; Blätter öffnen in 420 ms mit der iOS-Kurve und schließen in
  240 ms.
- **Blätter:** Die Abdunklung ist eine eigene Fläche und wird beim Wischen im selben Maß heller, wie das Blatt nach
  unten geht. Ein schnelles Schnippen nach unten schließt auch über kurze Strecken. Nach oben gibt das Blatt mit
  Widerstand nach, statt hart zu stoppen. Ein zweiter Finger wird ignoriert. Auf dem iPad kommt das mittige Blatt
  vollständig vom unteren Rand herein.
- **Druck-Feedback:** Knöpfe, Kapseln, Kalendertage, Tabs und Kacheln geben beim Aufsetzen des Fingers leicht nach
  (`scale(.96)` bzw. `.98`).
- **Touch:** Hover-Effekte gibt es nur mit Maus oder Trackpad. Es gibt keinen grauen Tipp-Blitz und kein Warten auf
  Doppeltippen. Langes Drücken auf Bedienelemente markiert keinen Text.
- **Bewegung reduzieren:** Blätter blenden nur ein und aus, die Ringe erscheinen ohne Animation.

Das App-Icon erzeugt `node scripts/make_icons.js`.

## Design-Skills für Claude

In [`.claude/skills/`](.claude/skills/) liegen 14 Skills von Emil Kowalski
([emilkowalski/skills](https://github.com/emilkowalski/skills), MIT-Lizenz). Sie enthalten Regeln für Design und
Animation, die Claude in jeder Session für dieses Projekt nutzen kann. Dazu gehören zum Beispiel `emil-design-eng`
(Hauptskill), `apple-design`, `mobile-native`, `animate`, `gestures` und `review-animations`. Quelle, Stand und
Lizenz stehen in [`.claude/skills/QUELLE.md`](.claude/skills/QUELLE.md).

## Diagramme

Alle Diagramme nutzen einen gemeinsamen Baukasten, [`js/charts.js`](js/charts.js). Darin stecken Achsen,
Gitterlinien, Linie, Balken (auch gestapelt), Punkte, Ziel- und Schwellenlinien, Legende und Leerzustand. Gezeichnet
wird in der echten Pixelbreite des Containers. Dadurch bleibt die Schrift immer 11 px groß. Bei Größenänderung,
beim Drehen und beim Öffnen einer Ansicht wird neu gezeichnet. Die Höhen sind einheitlich: 160 px (klein) und
220 px (groß).

Die Achsen haben runde Schritte (1, 2 oder 5 × 10ⁿ) und 3–5 Ticks. Sleep Score und Body Battery sind auf 0–100
begrenzt. HRV, Ruhepuls, Gewicht und 1RM beginnen nicht bei 0. Pace wird in m:ss mit Schritten von 10, 15 oder 30 s
angezeigt, schneller ist oben. Die X-Achse hat höchstens 6 Datumslabels.

Im Stil von Apple Health:

- **Kopf:** Über jedem Diagramm steht der Kernwert groß (z. B. „Ø 75 ms“), darunter der Zeitraum.
- **Antippen oder Hovern:** Eine dünne senkrechte Linie markiert den Punkt oder Balken, und sein Wert erscheint oben
  im Kopf. Antippen daneben stellt zurück. Im Belastungsdiagramm wählt Antippen die Woche.
- **Darstellung:** Balken mit runden Enden, fein gestrichelte Gitterlinien, Y-Achse rechts. Der neueste Wert bekommt
  einen Punkt in der Akzentfarbe, die laufende Woche ist hinterlegt.
- **Layout:** Die Erholungs-Diagramme stehen auf dem iPad quer zweispaltig.
- **Barrierefreiheit:** Jedes Diagramm hat `role="img"` und eine Kurzbeschreibung.

Tests: `node tests/charts.test.js`.

## Datenstand-Warnung

Ein Banner unter dem Header warnt, wenn ein automatischer Sync ausgefallen ist: Strava gelb ab 20 h, rot ab
48 h; Garmin gelb ab 8 h, rot ab 24 h – mit Tipp, was zu tun ist, und „Ausblenden“ bis zum nächsten Update.
Ist der Garmin-Sync frisch, der letzte Schlafwert aber älter als gestern, erscheint ein grauer Hinweis, dass die
Uhr nicht synchronisiert hat. Das Einstellungen-Blatt („Über die Daten“) zeigt beide Zeitstempel in Gerätezeit. Grundlage: `snapshotAt` in
`js/strava-data.js` (schreibt `update_strava.py` bei jedem Lauf) und `updated` in `js/garmin-data.js`.
Berechnung: [`js/freshness.js`](js/freshness.js), Schwellen: `freshness` in `js/data.js`.
Tests: `node tests/freshness.test.js`.

## Detailansichten (wie Apple Health)

Tippen auf eine Kennzahl öffnet eine eigene Ansicht. Sie enthält:

- den Zeitraum-Umschalter 7 T / 30 T / 60 T / Alle, wobei nur Zeiträume mit Daten erscheinen
- den großen Wert, z. B. „Durchschnitt 73 ms“, und den Zeitraum
- das Diagramm: Antippen oder Ziehen zeigt den Tageswert, Loslassen setzt zurück
- eine Liste mit Durchschnitt, Minimum, Maximum, Veränderung zum Vorzeitraum und letztem Wert
- ganz unten „Über diese Werte“

Darstellung und Bedienung:

- **Blatt:** Auf dem iPhone geht es über die ganze Höhe, auf dem iPad ist es ein 700 px breites, mittiges Blatt.
- **Adresse:** Jede Ansicht hat einen eigenen Hash, z. B. `#erholung-hrv`. „Zurück“ im Browser schließt sie, ein
  Link führt direkt hin.
- **Erholung-Tab:** Die 4 großen Kacheln zeigen eine Mini-Linie der letzten 7 Tage. Alle Kacheln und Listenzeilen
  öffnen ihre Detailansicht.
- **Zone 2:** Die Kacheln Pace bei 144 bpm, Watt bei 140 bpm, Entkopplung und Anteil Z1–2 öffnen
  `#erholung-z2pace`, `-z2watts`, `-z2dec` und `-z2zones`. Die Diagramme stehen jetzt dort. Pace und Watt zeigen
  den Median der Einheiten, die Pace mit „schneller = oben“. Beim Z1–2-Anteil kannst du zwischen Alle, Laufen und
  Rad wechseln; der Anteil ist nach Zeit gewichtet. Die Texte aus „Wie wird gemessen?“ stehen unter
  „Über diese Werte“.
- **Gym:** Jede Übungskarte öffnet `#training-1rm-<übung>`, z. B. `#training-1rm-beinpresse`. Dort siehst du den
  ganzen 1RM-Verlauf mit Ziellinie und PR-Ringen sowie die Liste aller Einträge (Datum, Satz, Ort, geschätztes 1RM,
  PR).
- **Woche:** Die Zeile „Trainingsbelastung“ in der Wochenkarte öffnet `#heute-belastung`. Dort stehen die
  Wochensummen; Durchschnitt, Minimum und Maximum zählen nur abgeschlossene Wochen. Darunter folgt akut/chronisch
  aus Garmin.
- **Zeitraum:** Die x-Achse zeigt immer den ganzen gewählten Zeitraum, auch wenn es nur wenige Punkte gibt.
  Wochenwerte bieten kein „7 T“. Eine Woche zählt zum Zeitraum, wenn ihr Montag darin liegt.

Register und Berechnungen stehen in [`js/metrics.js`](js/metrics.js): Zeitraumfilter,
Durchschnitt/Median/Min/Max/Summe/letzter Wert/Bestwert, eigene Rechnung je Kennzahl (zeitgewichteter Z1–2-Anteil),
Vorzeitraum, fehlende Tage, erlaubte Zeiträume, Standard-Zeitraum und Achsengrenzen. Die 1RM-Kennzahlen trägt die
Seite für jede Hauptübung zur Laufzeit ein (`Metrics.liftMetric`, `Metrics.register`). Tests: `node tests/metrics.test.js`.

**Wie weit die Daten zurückreichen** (Stand 06.11.2026):

| Daten | Zeitraum |
|---|---|
| Garmin-Tageswerte | seit 06.08.2026, 93 Tage |
| VO2max Rad | seit 29.09. |
| Gewicht | 5 Einträge |
| Strava | seit der Anmeldung (27.06.) |
| Zone 2 | seit 01.07. |

Die Garmin-Daten wachsen auf bis zu 400 Tage (`KEEP_DAYS`). Älteres lässt sich einmalig über die Action
„Garmin-Update“ mit `days` nachladen.

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
`js/data.js` unter `zones` und `z2`. Die Kacheln öffnen die Detailansichten mit den Diagrammen (siehe
[Detailansichten](#detailansichten-wie-apple-health)). Tests: `node tests/z2.test.js`.

## Flex-Modus

Bis zum Datum `flex.until` in `js/data.js` (aktuell 10.01.2027) läuft die Seite im Flex-Modus
([`js/flex.js`](js/flex.js)): „Heute“ zeigt den nächsten Gym-Split (Rotation Push → Pull → Legs)
und eine optionale lockere Ausdauereinheit passend zur gewählten Ausstattung vor Ort; statt
Umfangszielen zählt das Wochen-Minimum (4× Gym, 2× Ausdauer ≥ 20 min; Schwimmen ist keine Pflicht,
`flex.minimum.swim: 0`).
**Zwift im Flex-Zeitraum:** Zwift-Fahrten in dieser Zeit fährt jemand anderes über den Account. Deshalb zählen sie
nirgends: nicht in der Aktivitätenliste, Woche, Minimum, Kalender, Umfängen, Zone 2 und der Garmin-Belastung je Woche.
Erkannt werden Strava „VirtualRide“, Garmin „virtual_ride“ und Radfahrten mit „Zwift“ im Namen; Läufe zählen immer.
Zwift-Fahrten vor dem Flex-Beginn und nach dem Ende zählen normal. Die Liste nennt, wie viele ausgeblendet sind.
Schalter: `flex.ignoreVirtualRides`. Garmins eigene Tageswerte (akute Belastung, Trainingsstatus) rechnet Garmin
selbst und enthalten solche Fahrten, wenn sie in Garmin Connect landen.
`flex.active: false` schaltet alles zurück. Tests: `node tests/flex.test.js`.

Der **Saisonplan** passt sich an ([`js/phases.js`](js/phases.js)): Phasen beginnen montags (wie das Wochenraster),
Phasen vor dem Flex-Beginn enden dort, danach folgen Flex, **Wiedereinstieg** (2 Wochen, lockere Einheiten nach Puls,
3× Schwimmtechnik, Gym 2–3×), Grundlage 2 (6), Aufbau 1 (6) und Aufbau 2 bis zum Peak; Peak und Taper bleiben
rückwärts vom Renntag. Wochenzahlen: `plan` in `js/data.js`; bleiben für Aufbau 2 weniger als 3 Wochen, warnt der
Saisonplan. Tests: `node tests/phases.test.js`.

## Gym-Tracker

Titel der Krafteinheit in Garmin Connect: `Push 6x100`, `Pull 5x20` (Klimmzüge mit 20 kg Zusatz), `Legs 3x10x180`,
`Push 6x100 @Bali` (mit Gym-Ort) oder nur `Push` (Einheit ohne Eintrag). „kg“ ist optional,
Komma-Dezimalen (82,5) sind erlaubt, auch die Beschreibung wird geprüft. `scripts/update_garmin.py`
speichert dafür Titel und Beschreibung der Krafteinheiten; [`js/gym.js`](js/gym.js) erkennt Split,
Übung, Wiederholungen, Gewicht, Sätze und Ort und berechnet das 1RM nach Epley. Alle Hauptübungen werden
ortsübergreifend verglichen (PRs, bestes 1RM, Ziele; im Diagramm der Detailansicht eine Linie, Punkte nach Ort gefärbt). Wer einzelne
Übungen nur am selben Ort vergleichen will (z. B. Maschinen), trägt sie in `gym.perPlace` ein – dann zählen dafür nur
Einträge vom aktuellen Ort (letzte Einheit mit @Ort). Zuordnung Split → Hauptübung und Aliase: `gym` in `js/data.js`.
**Hauptübungen:** Push = Bankdrücken, Pull = Weighted Pull-ups (Klimmzüge mit Zusatzgewicht), Legs = Beinpresse.
Für die Klimmzüge steht im Titel das Zusatzgewicht. Das 1RM rechnet das Körpergewicht mit, und zwar den neueren Wert
aus Garmin-Waage und eigenem Eintrag (`gym.bodyWeight`, zurzeit 75 kg vom 11.11.):
(Körpergewicht + Zusatz) × (1 + Wdh. ÷ 30) − Körpergewicht. Angezeigt wird wieder das Zusatzgewicht. Beispiel:
5 Wdh. mit 20 kg bei 75 kg ergeben rund 36 kg statt 23 kg. Erkannt werden auch „Pull ups“, „Pull-ups“ und
„Klimmzüge“. Ein „Latzug“ im Titel zählt weiter als eigene Übung und nicht als Klimmzug (`gym.bodyweight`, `gym.aliases`).
**Nächstes Ziel** nach doppelter Progression (`gym.progression`: Bankdrücken 6–8 Wdh./+2,5 kg, Weighted Pull-ups
5–8 Wdh./+2,5 kg, Beinpresse 5–8 Wdh./+10 kg): oberes Ende erreicht → schwerer und zurück aufs untere Ende, im Bereich →
1 Wdh. mehr, darunter → unteres Ende; bei Sätzen pro Satz. Badge „Wdh.-Ziel ✓“, wenn das letzte Wiederholungsziel
geschafft ist (nicht zu verwechseln mit dem 1RM-Ziel), und Hinweis bei Stagnation (3 Einträge ohne neues bestes 1RM).
**1RM-Ziel** je Hauptübung (`gym.goals`: Bankdrücken 100 kg, Weighted Pull-ups 50 kg Zusatzgewicht, Beinpresse 300 kg):
kleiner Fortschrittsring neben dem 1RM (bestes geschätztes 1RM) und gestrichelte Ziellinie im Diagramm.
**Übungskarte:** oben einmal der große 1RM-Wert, daneben der Ring mit Prozent und Ziel. Darunter eine Mini-Linie des
1RM-Verlaufs und eine Liste mit letztem Eintrag, bestem Satz und nächstem Ziel, ohne Kästen. Die Karte öffnet die
Detailansicht mit dem kompletten 1RM-Verlauf und allen Einträgen.
**Namen in Listen:** In der Aktivitäten-Liste steht bei Krafteinheiten der Garmin-Titel,
wenn er als Gym-Titel erkannt wird (z. B. „Push 5×70kg @Bali“). Sonst steht dort der Strava-Name, etwa wenn Garmin
nur „Krafttraining“ heißt (`Gym.displayName`).
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
laufende. In „Heute“ ist sie kompakt: eine Highlight-Zeile in Kurzform (z. B. „Neuer PR: Bankdrücken“) und drei
große Werte (Stunden, Einheiten, Belastung). Antippen öffnet das Blatt „Woche“ (`#heute-woche`) mit dem kompletten
Rückblick; dort lassen sich mit ← → 8 Wochen durchblättern. Ein „Wochen-Minimum erfüllt“ als Highlight entfällt in
der kompakten Karte, wenn sie dieselbe Woche zeigt wie die Ringe. Inhalt des Blatts: Highlight (neuer PR > Wochen-Minimum erfüllt >
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
| `gym` | Hauptübung je Split, Aliase, Progression, 1RM-Ziele, `perPlace` (leer = alles ortsübergreifend) |
| `flex` | Flex-Zeitraum, Wochen-Minimum, Split-Rotation und -Erkennung |
| `sinceLast` | Ampel-Schwellen (Tage) und Mindestdauern für „Zuletzt gemacht“ |
| `weekly` | Schwellen der Wochen-Hinweise (HRV-Abfall, Schlaf, Belastungsfaktor), Anzahl Hinweise und Wochen |
| `freshness` | Ab wie vielen Stunden die Datenstand-Warnung gelb/rot wird, Link zu GitHub Actions |
| `layout` | Welche Abschnitte im Flex- und im Normalzeitraum standardmäßig eingeklappt sind |
| `plan` | Wochen je Phase nach einem Flex-Zeitraum (Wiedereinstieg, Grundlage 2, Aufbau 1; Aufbau 2 = Rest) |
| `zones`, `z2` | Eigene HF-Zonen und Parameter der Zone-2-Auswertung |
| `prediction` | Parameter der Rennprognose (CSS-Tests, IF, CdA, Ironman-Faktor …) |

Die Saisonphasen und ihre Wochenstunden sind in `js/app.js` (`PHASES`) definiert.
