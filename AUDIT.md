# Audit der Ironman-Trainings-App

Stand: 14.11.2026. Geprüft wurden Sicherheit, Fehlerfälle, Berechnungen, Darstellung und Struktur.

## Kurzfazit

- **Keine Schlüssel, Passwörter oder Tokens im Code**, auch nicht in der Git-Historie (188 Commits, alle Zweige).
- **Nichts Kritisches gefunden.**
- **6 wichtige Punkte**, alle behoben (Status steht jeweils dabei).
- **3 Dinge kannst nur du tun**, siehe [Was du selbst tun musst](#was-du-selbst-tun-musst).
- Deine Trainings- und Gesundheitsdaten sind **öffentlich sichtbar**. Das ist kein Fehler, sondern folgt aus der
  Art, wie die Seite gebaut ist. Details und deine Möglichkeiten: [Was Fremde sehen können](#was-fremde-sehen-können).

## Kritisch

Keine Funde.

## Wichtig

### W1 · Garmin-Anmeldung lag ungeschützt im Zwischenspeicher von GitHub

- **Was:** Damit sich das Garmin-Update nicht bei jedem Lauf neu anmelden muss, speichert es die Anmelde-Tokens
  im „Actions-Cache“ von GitHub. Bei jedem Lauf kam eine neue Kopie dazu, unverschlüsselt.
- **Warum ein Problem:** Das Repo ist öffentlich. Würdest du den automatischen Test eines fremden Pull Requests
  mit „Approve and run“ freigeben, könnte dessen Code diese Kopien lesen und hätte damit Zugriff auf dein
  Garmin-Konto.
- **Einordnung:** Es gibt keine Hinweise auf Missbrauch: 0 Forks, alle 57 Pull Requests stammen aus diesem Repo.
- **Status: behoben.** Die Tokens werden jetzt verschlüsselt gespeichert. Die alten Kopien musst du einmal
  löschen, siehe Schritt 1 unten.

### W2 · Morgens fehlten in Bali stundenlang die Garmin-Daten des neuen Tages

- **Was:** Das Garmin-Skript rechnete mit der Weltzeit (UTC) statt mit deiner Ortszeit. In Bali beginnt der Tag
  8 Stunden früher. Bis 08:00 Uhr Ortszeit holte das Skript deshalb nur den Vortag.
- **Warum ein Problem:** Schlaf, HRV und Bereitschaft der letzten Nacht erschienen erst mit dem ersten Lauf nach
  08:00 Uhr, am 14.11. zum Beispiel erst um 15:02 Uhr.
- **Status: behoben.** Das Skript erkennt deine Zeitzone jetzt an der neuesten Garmin-Aktivität.

### W3 · „Bereitschaft“ zeigte bis mittags unbemerkt die Werte von gestern

- **Was:** Der Hinweis „Garmin-Daten vom …, nicht von heute“ erschien erst, wenn die Daten älter als 1,5 Tage
  waren, also erst ab 12:00 Uhr.
- **Warum ein Problem:** Vormittags stand unter „Heute“ die Bereitschaft von gestern, und der Tagesvorschlag
  richtete sich danach, ohne dass du es sehen konntest.
- **Status: behoben.** Der Hinweis erscheint jetzt, sobald die Daten nicht vom heutigen Tag sind.

### W4 · Die Seite blieb ohne Meldung grau, wenn die Strava-Datei fehlte oder defekt war

- **Was:** Lässt sich `js/strava-data.js` nicht laden, oder enthält sie keine Aktivitäten, bricht der Start ab.
  Zu sehen waren dann dauerhaft nur die grauen Platzhalter, in allen vier Tabs.
- **Warum ein Problem:** Du hättest nicht erkennen können, ob die Seite noch lädt oder kaputt ist, und auch nicht,
  was zu tun ist.
- **Status: behoben.** In diesem Fall steht jetzt oben eine klare Meldung mit dem nächsten Schritt.
- **Schon vorher in Ordnung:** Fehlen Garmin-Daten, Zone-2-Daten oder der Prognose-Verlauf, läuft die Seite
  normal weiter und blendet nur den betroffenen Teil aus.

### W5 · Kein zweiter Versuch, wenn Strava beim geplanten Update nicht antwortet

- **Was:** Am 13.11. war die Verbindung zu Strava beim Abend-Update gestört. Das nächste Update kam erst zum
  nächsten Termin, rund 10 Stunden später.
- **Warum ein Problem:** Eine kurze Störung führt so zu einer halben Tageslücke in den Daten.
- **Status: behoben.** Die Anleitung für das Update (`scripts/UPDATE.md`) verlangt jetzt nach einem
  Verbindungsfehler genau einen neuen Versuch nach etwa einer Stunde.

### W6 · Gravel-, Mountainbike- und E-Bike-Fahrten sowie virtuelle Läufe zählten als „Sonstiges“

- **Was:** Die Seite kannte als Rad nur „Ride“ und „VirtualRide“ und als Laufen nur „Run“ und „TrailRun“.
  Die Zone-2-Auswertung und das Update-Skript kannten mehr Sportarten.
- **Warum ein Problem:** Sobald du eine solche Einheit aufzeichnest, fehlt sie in den Rad- bzw. Lauf-Kilometern,
  im Wochenumfang und beim Wochen-Minimum. Bisher gibt es keine solche Einheit, die Zahlen stimmen also noch.
- **Status: behoben.** Es gibt jetzt eine einzige Liste, die überall gilt.

## Später

Diese Punkte sind dokumentiert, aber nicht geändert. Nichts davon verfälscht heute eine Zahl.

**Sicherheit und Privatsphäre**

- **S1 · E-Mail-Adresse in der Historie:** In 58 Merge-Commits steht deine private E-Mail-Adresse. Jeder kann sie
  lesen, das kann zu Spam führen. Für die Zukunft lässt sich das abstellen, siehe Schritt 2 unten.
- **S2 · `robots.txt` wirkt nicht:** Die Datei liegt im Unterordner `/Ironman-27/`, Suchmaschinen lesen sie nur
  ganz oben auf der Adresse. Die Seite selbst ist trotzdem geschützt, weil sie „noindex“ im Kopf trägt. Das Repo
  auf github.com bleibt aber auffindbar.
- **S3 · Garmin-Bibliothek nicht fest eingefroren:** Das Update installiert bei jedem Lauf die neueste Version
  0.3.x von `garminconnect`, und diese Bibliothek bekommt dein Garmin-Passwort. Eine manipulierte Version wäre
  ein Risiko. Besser wäre eine fest eingetragene Version.
- **S4 · Veraltete Bausteine im Garmin-Update:** GitHub meldet, dass `actions/checkout@v4`, `setup-python@v5`
  und `cache@v4` auf einer alten Node-Version beruhen. Sie laufen noch, sollten aber angehoben werden.
- **S5 · Strava-Nummern der Einheiten sind öffentlich:** `data/z2-metrics.json` enthält die Strava-ID jeder
  Lauf- und Radeinheit. Damit lässt sich die Einheit auf Strava aufrufen, wenn sie dort öffentlich ist.

**Zuverlässigkeit**

- **S6 · GitHub lässt geplante Läufe aus:** Trotz stündlichem Plan lief das Garmin-Update zuletzt nur etwa 5-mal
  am Tag. Das liegt an GitHub. Abhilfe wäre, dass das Strava-Update den Garmin-Lauf zusätzlich anstößt.
- **S7 · Gelöschte Strava-Einheiten bleiben stehen:** Löschst du eine Einheit auf Strava oder änderst ihre
  Sportart, bleibt der alte Eintrag auf der Seite. Aktuell gibt es keine solchen Dubletten.
- **S8 · Datum des Strava-Stands in deutscher Zeit:** Läuft ein Update zwischen 00:00 und 07:00 Uhr Bali-Zeit,
  zählen Einheiten dieses Morgens erst nach dem nächsten Update in den 4-Wochen-Werten mit. Die geplanten Zeiten
  (12:40 und 21:40 Uhr Bali) sind nicht betroffen.
- **S9 · Leere Disziplin zeigt „NaN“:** Gäbe es gar keine Schwimm-, Rad- oder Laufeinheit, stünde unter
  Disziplinen und Rennvorbereitung „NaN“ bzw. „−∞“. Fehlten FTP und Zonen ganz, stünde in der FTP-Kachel
  „undefined W“. Mit deinen Daten kann beides nicht passieren.
- **S10 · Geänderte Puls-Zonen wirken nicht rückwirkend:** Die Zeit je Zone wird einmal je Einheit berechnet und
  gespeichert. Änderst du die Zonen in `js/data.js`, behalten alte Einheiten die alte Einteilung, ohne Warnung.
  Seit dem Start wurden die Zonen nicht geändert.
- **S11 · Offline-Kopie greift nicht bei Server-Fehlern:** Antwortet GitHub mit einem Fehler statt gar nicht,
  zeigt die Seite den Fehler und nicht die gespeicherte Kopie.
- **S12 · Defekter Prognose-Verlauf wird stillschweigend neu angelegt:** Wäre `data/prediction-history.json`
  unlesbar, beginnt der Verlauf ohne Warnung von vorn.

**Darstellung**

- **S13 · Kalender-Kästchen auf dem iPhone schmaler als 44 px:** 41 px breit auf dem iPhone 13, 31 px auf dem
  iPhone SE. Antippen klappt, ist aber enger als Apples Empfehlung. Das braucht ein anderes Kalender-Layout.
- **S14 · Pfeil im Wochenblatt mit Kontrast 4,2:1:** Der Pfeil „←“ liegt im hellen Modus knapp unter 4,5:1. Für
  Symbole reichen 3:1, deshalb unverändert.
- **S20 · „Bereitschaft“ bricht auf dem iPhone SE mitten im Wort um:** Auf dem schmalsten iPhone (320 px) steht
  unter „Heute“ „Bereitsch-aft“ in zwei Zeilen, weil Zahl und Etikett daneben den Platz brauchen. Auf dem
  iPhone 13 und dem iPad passt es. Die Lösung ist eine Design-Entscheidung (z. B. Etikett auf kleinen Geräten
  weglassen), deshalb nicht geändert.

**Struktur**

- **S15 · Eine sehr große Datei:** `js/app.js` hat 2.280 Zeilen mit teils über 500 Zeichen pro Zeile. Das
  erschwert Änderungen. Sinnvoll wäre eine Aufteilung nach Tabs.
- **S16 · Doppelte Hilfsfunktionen:** Zeit- und Zahlenformate (`mmss`, `hms`, `nf`, `daysBetween`) stehen in
  mehreren Dateien. Das ist Absicht, damit jedes Modul allein testbar ist, kostet aber Pflege.
- **S17 · Toter Code:** Unbenutzt sind `tSum` und `tipBox` (Tooltip-Helfer), `longestRun` in `kpis()` sowie die
  CSS-Klassen `chart-note`, `t-sec`, `t-good` und `how`.
- **S18 · Liste der Dateien doppelt gepflegt:** Die Skript-Liste steht in `index.html` und in `sw.js`. Beide
  stimmen aktuell überein, müssen aber bei jeder neuen Datei von Hand angepasst werden.
- **S19 · 1RM bei einer Wiederholung:** Die Epley-Formel rechnet auch bei 1 Wiederholung 3,3 % dazu. Ein
  echter Einzelversuch mit 100 kg erscheint also als 103,3 kg. Das ist üblich, sollte man aber wissen.

## Was Fremde sehen können

Das Repo und die Seite sind öffentlich. GitHub Pages gibt es im kostenlosen Tarif nur für öffentliche Repos.
Wer den Link kennt oder auf GitHub sucht, sieht:

- **Alle Einheiten seit der Anmeldung:** Datum, Uhrzeit, Sportart, Titel, Strecke, Dauer, Höhenmeter.
- **Wo du gerade bist:** Titel wie „Social Run Ubud“ oder „Push 7×70kg @Bali“ verraten deinen Aufenthaltsort
  fast in Echtzeit, und damit auch, dass du nicht zu Hause bist.
- **Gesundheitsdaten von Garmin:** Schlaf, HRV, Ruhepuls, Stress, Body Battery, Schritte, Gewicht, Körperfett,
  VO2max, Trainingsbereitschaft.
- **Leistungsdaten:** FTP, Puls-Zonen, Bestzeiten, Gym-Gewichte.
- **Deine E-Mail-Adresse** in der Commit-Historie (S1).
- **Die Protokolle der Garmin-Läufe** unter „Actions“. Sie enthalten dieselben Tageswerte, aber kein Passwort.

Nicht enthalten sind GPS-Strecken, Rohdaten der Einheiten, Passwörter und Tokens. Dein Name und Wohnort standen
unbenutzt in `js/data.js`; ich habe sie dort entfernt, in der Historie bleiben sie lesbar.

**Deine Möglichkeiten:**

1. **So lassen.** Das ist vertretbar, wenn dich die Punkte oben nicht stören.
2. **Titel neutral halten.** Ortsnamen in Strava- und Garmin-Titeln weglassen. `@Bali` im Gym-Titel dient nur
   dem Vergleich am selben Ort und ist nicht nötig.
3. **Repo privat stellen.** Dann sieht niemand mehr etwas. Die Seite funktioniert danach nur noch mit einem
   bezahlten GitHub-Tarif (GitHub Pro).

## Was du selbst tun musst

### Schritt 1 · Alte Garmin-Kopien löschen (wegen W1)

Mach das erst, nachdem ich dir bestätigt habe, dass der erste Lauf mit der neuen Verschlüsselung geklappt hat.

1. Öffne in Safari `github.com/stadiejan015-ux/Ironman-27`.
2. Tippe oben auf **Actions**.
3. Tippe links unter „Management“ auf **Caches**. Auf dem iPad im Hochformat musst du die linke Spalte eventuell
   erst über das Menü-Symbol einblenden.
4. Bei jedem Eintrag, dessen Name mit `garmin-tokens-` beginnt: tippe rechts auf den **Papierkorb** und bestätige.
5. Einträge, die mit `garmin-enc-` beginnen, bleiben stehen. Das sind die neuen, verschlüsselten.

Löschst du nichts, verschwinden die alten Kopien nach 7 Tagen von selbst.

**Wenn du ganz sicher gehen willst** (nach heutigem Stand nicht nötig):

- Ändere dein Garmin-Passwort und trag das neue in GitHub ein:
  **Settings → Secrets and variables → Actions → GARMIN_PASSWORD → Update**.
- Leg einen eigenen Schlüssel für die Verschlüsselung an, damit sie nicht am Garmin-Passwort hängt:
  **Settings → Secrets and variables → Actions → New repository secret**, Name `GARMIN_CACHE_KEY`, als Wert
  eine lange Zufallsfolge (mindestens 30 Zeichen, z. B. den Passwort-Vorschlag des iPads).

### Schritt 2 · E-Mail-Adresse künftig verbergen (wegen S1)

1. Öffne in Safari `github.com/settings/emails`.
2. Setze den Haken bei **Keep my email addresses private**.
3. Setze den Haken bei **Block command line pushes that expose my email**.

Ab dann steht in neuen Merge-Commits eine neutrale GitHub-Adresse. Die alten Commits bleiben, wie sie sind.

### Schritt 3 · Fremde Pull Requests nie freigeben

Erscheint bei einem Pull Request von einer fremden Person der Knopf **Approve and run**, tippe ihn nicht an.
Zusätzlich kannst du die Freigabe für alle Fremden zur Pflicht machen:

1. Öffne `github.com/stadiejan015-ux/Ironman-27/settings/actions`.
2. Wähle unter „Approval for running fork pull request workflows from contributors“ die Option
   **Require approval for all external contributors**.
3. Tippe auf **Save**.

### Falls Strava oder Garmin einmal dauerhaft ausfallen

- **Strava:** Die Verbindung läuft über den Strava-Connector in Claude, nicht über einen Schlüssel im Repo. Meldet
  das Update einen Verbindungsfehler über mehrere Tage, verbinde Strava neu: in Claude unter
  **Einstellungen → Connectors → Strava**.
- **Garmin:** Schlägt die Anmeldung fehl, schickt GitHub dir eine E-Mail („Run failed: Garmin-Update“), und die
  Seite zeigt nach 8 Stunden einen Hinweis. Meist hilft es, unter **Actions → Garmin-Update → Run workflow** einen
  Lauf von Hand zu starten. Hast du dein Garmin-Passwort geändert, trag es wie in Schritt 1 beschrieben neu ein.

## Geprüft und in Ordnung

- **Git-Historie:** Alle 188 Commits aller Zweige nach bekannten Schlüsselformaten, Zuweisungen von Passwörtern
  und Tokens, verdächtigen Dateinamen und Zugangsdaten in Adressen durchsucht. Kein Treffer.
- **Garmin-Zugang:** E-Mail und Passwort liegen als GitHub-Secrets vor und erscheinen in den Protokollen nur als
  `***`.
- **Keine fremden Skripte:** Die Seite lädt nichts von anderen Servern.
- **Berechnungen:** Unabhängig nachgerechnet und identisch mit der Anzeige: 4-Wochen-Werte, Wochenkarte,
  Zonen-Anteile (51 % / 40 % / 9 %), Rad-Prognose mit eigenem Rechenweg (5:42:14), Schwimm-Prognose (1:21:21),
  Lauf-Prognose (4:37:06), 1RM-Werte und Ziel-Prozente.
- **Formeln und Einheiten:** Epley (1RM), Riegel (Marathon aus 10 km), Radphysik (Rollwiderstand, Steigung,
  Luftwiderstand), Minetti (steigungsbereinigte Pace), Entkopplung, Pace in s/100 m und s/km.
- **Zonen:** Deine eigenen Puls-Zonen aus `js/data.js` gelten überall; die Zone-2-Daten wurden mit genau diesen
  Zonen berechnet.
- **Fehlerfälle:** 26 Szenarien im Browser durchgespielt, darunter fehlende und defekte Dateien, gesperrter
  Speicher, Renntag und die Zeit nach dem Rennen.
- **Darstellung:** 17 Ansichten auf 6 Geräte-Einstellungen (iPhone SE, iPhone 13 hoch und quer, iPad hoch und
  quer, iPad mini; hell und dunkel; auch im Home-Bildschirm-Modus). Kein seitliches Verrutschen, kein
  abgeschnittener Text, keine Fehler, Kontrast überall mindestens 4,5:1 bis auf S14.
- **Tests:** Alle 11 JavaScript-Testdateien und der neue Python-Test laufen durch.

## So wurden die Korrekturen geprüft

- **W1:** Ver- und Entschlüsseln in 10 Fällen lokal durchgespielt (richtiger, falscher und fehlender Schlüssel,
  defekte Datei, leerer Ordner). Der echte Lauf auf GitHub lässt sich erst nach dem Mergen prüfen.
- **W2:** Neuer Test `tests/update_garmin_test.py`, vorher rot, danach grün. Dazu ein Trockenlauf des ganzen
  Skripts mit einem nachgebauten Garmin-Zugang.
- **W3, W6:** Neue Tests in `tests/freshness.test.js` und `tests/z2.test.js`, vorher rot, danach grün. Im
  Browser gegen die alte Version verglichen.
- **W4:** 5 Ausfall-Szenarien im Browser: vorher graue Platzhalter ohne Meldung, jetzt die Meldung.
- **W5:** Regel in der Anleitung; sie greift beim nächsten Verbindungsfehler.
- **Nichts kaputt gemacht:** Alle 28 Fehler-Szenarien und der Darstellungs-Check erneut gelaufen, Ergebnis wie
  vor den Änderungen.
