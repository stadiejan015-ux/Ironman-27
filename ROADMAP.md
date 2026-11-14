# Roadmap: vom Dashboard zum Trainings-Cockpit

Stand: 14.11.2026. Ziel: Ironman Frankfurt am 27.06.2027. Grundlage ist der Prüfbericht in [`AUDIT.md`](AUDIT.md).

Die App soll drei Dinge können: alle Daten aus Strava und Garmin im Überblick zeigen, deinen Trainingsstand
ehrlich einordnen und eine realistische Zielzeit nennen. Ohne KI-Coach und ohne laufende Kosten.

## Deine Saison und was bis wann stehen muss

| Zeitraum | Was bei dir ansteht | Was die App bis dahin können muss | Etappe |
|---|---|---|---|
| bis 30.11. | Flex-Block, Schwerpunkt Gym | Fundament: `js/app.js` aufgeteilt, Browser-Prüfung im Repo | A |
| bis 14.12. | Flex-Block | Daten kommen zuverlässig, auch morgens | B |
| **bis 10.01.** | Ende Flex-Block | **Saison mit Wettkämpfen, Hinweis des Tages, Knopf „Zusammenfassung kopieren“** | C |
| 11.01.–19.02. | Spielraum, Ski und Langlauf | Wintersport zählt richtig, Soll und Ist je Woche | D |
| 20.–27.02. | Trainingsreise | Trainingslager wird als solches erkannt | D |
| bis ca. 14.03. | Aufbau zum Marathon | Aufbau der langen Läufe im Blick | E |
| Mitte/Ende März | Marathon in Zone 2 (privat) | Marathon-Karte und Erholung danach | E |
| **bis 24.04.** | Aufbau zum Halbmarathon | **Prognose nutzt echte Wettkampf-Ergebnisse** | F |
| 25.04. | Halbmarathon (offiziell) | Ergebnis fließt in die Zielzeit ein | F |
| 01.–31.05. | Flexibel, unterwegs | Zweiter Flex-Block, Plan rechnet damit | G |
| 01.–27.06. | Rennwochen und Ironman | Taper, Rennwoche, Renntag-Karte | G |

**Ein Hinweis zum Training, kein App-Thema:** Der Mai liegt 8 bis 4 Wochen vor dem Rennen. Das sind sonst die
umfangreichsten Wochen. Zwischen Reise-Ende und Renntag bleiben knapp 4 Wochen einschließlich Taper. Schritt C3
macht das im Saisonplan sichtbar, damit du früh entscheiden kannst, wie du den Mai nutzt.

## So liest du die Roadmap

- **Jeder Schritt ist ein eigener Auftrag und ein eigener Pull Request.** Du schreibst zum Beispiel:
  „Setz Schritt C1 aus ROADMAP.md um. Sag mir vorher kurz deinen Plan.“
- **Größe:** klein = unter einer Stunde Arbeit für Claude, mittel = ein bis zwei Stunden, groß = mehrere Stunden
  und besser in einer frischen Sitzung.
- **Modell:** „normal“ heißt, das normale Modell reicht (z. B. Sonnet). „stark“ heißt, nimm das stärkste Modell
  (z. B. Opus oder Fable), weil viele Stellen gleichzeitig stimmen müssen.
- **Prüfen am iPad:** Nach dem Mergen ein bis zwei Minuten warten, dann die Seite neu laden (↻ oder runterziehen).
- **Reihenfolge:** Innerhalb einer Etappe von oben nach unten. Steht bei einem Schritt „braucht“, muss der
  genannte Schritt vorher fertig sein.
- **Dateinamen:** Ab Etappe C stehen die Dateien so da, wie sie nach Etappe A heißen (`js/app/heute.js`,
  `js/app/plan.js` …). Ziehst du einen Schritt vor, liegt der Code noch in `js/app.js`. Das geht, kostet aber
  mehr.
- **Abhaken:** Ist ein Schritt gemergt, wird aus `[ ]` ein `[x]`.

## Läuft schon

- [x] Audit mit sechs behobenen Funden (PR #58).
- [ ] Nachprüfung der Zeitzonen-Korrektur im echten Garmin-Lauf (geplant für den Morgen des 15.11.).
- [ ] Deine drei Schritte aus `AUDIT.md`: alte Garmin-Kopien löschen, E-Mail-Adresse verbergen (S1), fremde
  Pull Requests nie freigeben.

---

## Etappe A · Fundament (bis 30.11.)

Diese Etappe bringt nichts Sichtbares. Sie macht aber jeden späteren Schritt billiger und sicherer: Heute muss
Claude für fast jede Änderung die ganze Datei `js/app.js` lesen (2.280 Zeilen). Danach reicht die Datei des
betroffenen Tabs.

### [ ] A1 · Browser-Prüfung ins Repo

- **Ziel:** Eine Prüfung, die jede künftige Änderung in Sekunden absichert. Bisher liegen diese Skripte nur in
  einer Sitzung und gehen verloren.
- **Dateien:** neu `tests/browser/smoke.js`, neu `tests/files.test.js`, `README.md`, `CLAUDE.md`.
- **Umsetzung:**
  1. `tests/browser/smoke.js` öffnet die Seite mit dem vorinstallierten Playwright (keine neue Abhängigkeit im
     Repo) auf iPhone und iPad, hell und dunkel, in allen vier Tabs und den wichtigsten Blättern.
  2. Es meldet JS-Fehler, seitliches Verrutschen, „NaN“ oder „undefined“ im Text, Kontrast unter 4,5:1 und die
     Ausfall-Szenarien aus dem Audit (Strava-Datei fehlt, Garmin fehlt, Zone-2-Datei fehlt).
  3. `tests/files.test.js` prüft, dass die Skript-Liste in `index.html` und die Liste in `sw.js` gleich sind
     (erledigt S18).
- **Prüfen am iPad:** Nichts zu sehen. Claude zeigt dir die Ausgabe: alle Zeilen mit „OK“.
- **Größe:** mittel. **Modell:** normal.

### [ ] A2 · Rechenlogik aus `js/app.js` herauslösen

- **Ziel:** Bereitschaft, Tagesvorschlag und die 4-Wochen-Werte werden reine, getestete Funktionen. Die Etappe C
  braucht genau diese Werte für die Hinweise und für die Zusammenfassung.
- **Dateien:** neu `js/readiness.js`, neu `js/suggest.js`, neu `js/stats.js`, je eine Testdatei in `tests/`,
  `js/app.js`, `index.html`, `sw.js`.
- **Umsetzung:**
  1. `readiness()` samt `gAvg` und `gLast` wandert nach `js/readiness.js` und bekommt die Garmin-Tage als
     Eingabe statt globaler Variablen.
  2. `suggestion()` mit `WEEK`, `REENTRY_WEEK` und `PHASE_SCALE` wandert nach `js/suggest.js`.
  3. Die Rechnungen aus `kpis()`, `disciplines()` und `raceReady()` wandern nach `js/stats.js`. Dabei werden
     leere Listen abgefangen: „–“ statt „NaN“ (erledigt S9).
  4. `js/app.js` ruft nur noch auf und zeichnet. Die Anzeige bleibt Zeichen für Zeichen gleich.
- **Prüfen am iPad:** Alle vier Tabs sehen aus wie vorher, dieselben Zahlen. Oben keine rote Meldung.
- **Größe:** mittel. **Modell:** normal. **Braucht:** A1.

### [ ] A3 · `js/app.js` aufteilen, Teil 1: Kern und „Heute“

- **Ziel:** Ein gemeinsamer Kern und eine eigene Datei für den Tab „Heute“ (erledigt die Hälfte von S15).
- **Dateien:** neu `js/app/core.js`, neu `js/app/heute.js`, neu `js/format.js`, `js/app.js`, `index.html`,
  `sw.js`, `README.md`.
- **Umsetzung:**
  1. `js/format.js` sammelt die Zahlen- und Zeitformate (`nf`, `mmss`, `hms`, `hm`, `fmtDate`), die heute in
     mehreren Dateien doppelt stehen (erledigt S16 für die Seite; die Rechenmodule bleiben eigenständig).
  2. `js/app/core.js` enthält, was alle Tabs brauchen: Daten zusammenführen, Symbole, Kacheln, Listen-Zeilen,
     Blätter, Diagramm-Hilfen. Es stellt das über ein Objekt `window.App` bereit.
  3. `js/app/heute.js` enthält `hero`, `today`, die Wochenkarte, das Wochenblatt, „Zuletzt gemacht“ und
     „Vor Ort“.
  4. Unbenutzter Code fliegt raus: `tSum`, `tipBox`, `longestRun` in `kpis()`, die CSS-Klassen `chart-note`,
     `t-sec`, `t-good`, `how` (erledigt S17).
- **Prüfen am iPad:** Tab „Heute“ wie vorher. Wochenkarte antippen, Blatt öffnet sich. „Vor Ort“ antippen,
  Schalter funktionieren. Die anderen Tabs wie vorher.
- **Größe:** groß. **Modell:** stark. **Braucht:** A1, A2.

### [ ] A4 · `js/app.js` aufteilen, Teil 2: Training, Erholung, Plan, Details

- **Ziel:** Jeder Tab hat seine Datei. `js/app.js` enthält nur noch Start und Navigation (erledigt S15).
- **Dateien:** neu `js/app/training.js`, neu `js/app/erholung.js`, neu `js/app/plan.js`,
  neu `js/app/detail.js`, neu `js/app/nav.js`, `js/app.js`, `index.html`, `sw.js`, `README.md`, `CLAUDE.md`.
- **Umsetzung:**
  1. Training: Gym, Kalender, 4-Wochen-Kacheln, Wochenumfang, Disziplinen, Aktivitäten.
  2. Erholung: Garmin-Kacheln und Zone 2. Plan: Highlights, Saisonplan, Rennvorbereitung, Prognose.
  3. Details: Detailansichten und die Ansicht von rechts. Navigation: Tabs, Adressen, obere Leiste, Hochzählen.
  4. `CLAUDE.md` bekommt die Tabelle „Welche Datei für welchen Tab“.
- **Prüfen am iPad:** Jeden Tab öffnen, je eine Kachel antippen (Detailansicht), unter Training „Alle anzeigen“
  antippen und zurückwischen. Alles wie vorher.
- **Größe:** groß. **Modell:** stark. **Braucht:** A3.

### [ ] A5 · Kleine Absicherungen aus dem Audit

- **Ziel:** Vier unauffällige Schwachstellen schließen.
- **Dateien:** `scripts/process_streams.js`, `scripts/save_prediction.js`, `sw.js`, `robots.txt`, `README.md`,
  `tests/z2.test.js`.
- **Umsetzung:**
  1. S10: `process_streams.js` warnt deutlich, wenn die Puls-Zonen in `js/data.js` nicht mehr zu den
     gespeicherten passen, und bricht ohne `--force` ab.
  2. S12: `save_prediction.js` bricht bei unlesbarem Verlauf mit einer Fehlermeldung ab, statt neu anzufangen.
  3. S11: Der Service Worker nimmt die gespeicherte Kopie auch dann, wenn der Server mit einem Fehler antwortet.
  4. S2: `robots.txt` löschen, weil sie im Unterordner nicht wirkt. Die Seite bleibt über „noindex“ geschützt.
  5. S19: Im ⓘ-Text zum Gym steht, dass die Formel auch bei einer Wiederholung 3,3 % dazurechnet.
- **Prüfen am iPad:** Seite laden, dann Flugmodus einschalten und neu laden: Die Seite erscheint weiter.
- **Größe:** klein. **Modell:** normal.

---

## Etappe B · Daten kommen zuverlässig (bis 14.12.)

### [ ] B1 · Garmin-Lauf zu festen Zeiten anstoßen

- **Ziel:** Garmin-Daten sind morgens, mittags und abends sicher frisch. GitHub lässt die stündlich geplanten
  Läufe meist aus (S6).
- **Dateien:** `scripts/UPDATE.md`, `scripts/STRAVA_AUFGABE.md`, `README.md`.
- **Umsetzung:**
  1. `UPDATE.md` bekommt einen letzten Schritt: nach dem Strava-Update den Workflow `garmin.yml` auf `main`
     starten. Das ergibt zwei sichere Läufe am Tag.
  2. Dazu eine dritte geplante Aufgabe am Morgen (07:15 Uhr Ortszeit), die nur den Garmin-Lauf startet. Claude
     legt sie auf deinen Wunsch an.
  3. Der stündliche Plan bleibt als Zugabe bestehen.
- **Prüfen am iPad:** Zahnrad antippen, „Über die Daten“: Bei Garmin steht morgens eine Uhrzeit kurz nach 07:15.
- **Größe:** klein. **Modell:** normal.

### [ ] B2 · Gelöschte Einheiten verschwinden, Datum in Ortszeit

- **Ziel:** Was du auf Strava löschst oder umbenennst, ändert sich auch auf der Seite (S7). Einheiten vom
  frühen Morgen zählen sofort mit (S8).
- **Dateien:** `scripts/update_strava.py`, `scripts/process_streams.js`, `scripts/UPDATE.md`,
  neu `tests/update_strava_test.py`.
- **Umsetzung:**
  1. `update_strava.py` bekommt `--since <Datum>`: Im abgefragten Zeitraum ersetzt die neue Liste die alte
     vollständig. Schutz: Liefert Strava für den Zeitraum gar nichts, wird nichts gelöscht.
  2. `process_streams.js` entfernt Einträge, deren Einheit es nicht mehr gibt.
  3. Der Stand (`snapshotDate`) richtet sich nach dem Datum der neuesten Einheit, wenn es später liegt.
- **Prüfen am iPad:** Die gelöschte Zwift-Fahrt vom 13.11. steht nicht mehr unter Training, „Alle anzeigen“.
- **Größe:** mittel. **Modell:** normal.

### [ ] B3 · Garmin-Update einfrieren und auffrischen

- **Ziel:** Das Update installiert nicht mehr ungeprüft die neueste Bibliothek, die dein Passwort bekommt (S3),
  und nutzt aktuelle Bausteine (S4).
- **Dateien:** `.github/workflows/garmin.yml`, neu `scripts/requirements-garmin.txt`, `README.md`.
- **Umsetzung:**
  1. Die genaue Version von `garminconnect` samt Unterpaketen mit Prüfsummen in
     `scripts/requirements-garmin.txt` festschreiben, Installation mit `--require-hashes`.
  2. `actions/checkout`, `setup-python` und `cache` auf die Versionen heben, die GitHub aktuell empfiehlt.
  3. Danach einen Lauf von Hand starten und das Protokoll prüfen.
- **Prüfen am iPad:** GitHub, Actions: Der neueste „Garmin-Update“-Lauf hat einen grünen Haken.
- **Größe:** klein. **Modell:** normal.

### [ ] B4 · Weniger öffentlich preisgeben

- **Ziel:** Die Strava-Nummern der Einheiten stehen nicht mehr lesbar im Repo (S5).
- **Dateien:** `scripts/process_streams.js`, `js/z2.js`, `data/z2-metrics.json`, `scripts/UPDATE.md`.
- **Umsetzung:** Als Schlüssel dient künftig Startzeit plus Sportart statt der Strava-ID. Die vorhandene Datei
  wird einmalig umgeschrieben.
- **Prüfen am iPad:** Tab Erholung, Zone 2: dieselben Werte wie vorher.
- **Größe:** klein. **Modell:** normal. **Braucht:** B2.

---

## Etappe C · Saison, Hinweise, Zusammenfassung (bis 10.01.)

Das ist der Kern für den Start des strukturierten Trainings am 11.01.

### [ ] C1 · Saisonkalender als Daten

- **Ziel:** Die App kennt deine Saison: Wettkämpfe, Trainingsreise, flexible Zeiträume.
- **Dateien:** `js/data.js`, neu `js/season.js`, neu `tests/season.test.js`, `index.html`, `sw.js`, `README.md`.
- **Umsetzung:**
  1. In `js/data.js` ein Block `season` mit zwei Listen. `events`: Marathon in Zone 2 (Art „Training“),
     Halbmarathon am 25.04.2027 (Art „Wettkampf“), Ironman am 27.06.2027 (Art „Hauptrennen“). `blocks`:
     Flex-Block bis 10.01., Winter mit Spielraum bis 19.02., Trainingsreise 20.–27.02., Flex-Block im Mai.
  2. `js/season.js` mit reinen Funktionen: `nextEvent(heute)`, `blockAt(datum)`, `eventsBetween(von, bis)`,
     `daysTo(event, heute)`.
  3. Die bisherigen Einträge `race` und `flex` bleiben gültig und werden daraus abgeleitet, damit nichts bricht.
- **Prüfen am iPad:** Noch nichts zu sehen. Claude zeigt dir die Tests.
- **Größe:** mittel. **Modell:** normal. **Braucht:** A4 (spart Tokens, geht aber auch ohne).

### [ ] C2 · Saison anzeigen

- **Ziel:** Du siehst auf einen Blick, was als Nächstes kommt.
- **Dateien:** `js/app/heute.js`, `js/app/plan.js`, `index.html`, `css/style.css`, `README.md`.
- **Umsetzung:**
  1. Kopfzeile unter „Heute“: „Noch 41 Tage bis Halbmarathon · 104 bis Frankfurt“ statt nur des Ironman.
  2. Tab Plan, Saisonplan: Wettkämpfe als Markierungen auf der Zeitleiste, darunter eine Liste „Termine“ mit
     Datum, Art und Tagen bis dahin. Vergangene Termine zeigen das Ergebnis, sobald die Einheit in Strava steht
     (erkannt an Datum, Sportart und Strecke).
  3. Trainingskalender: Tage mit Termin tragen einen kleinen Punkt.
- **Prüfen am iPad:** Unter „Heute“ steht der nächste Termin. Tab Plan: Die Zeitleiste zeigt Marathon,
  Halbmarathon und Ironman, die Liste darunter stimmt mit deinen Daten überein.
- **Größe:** mittel. **Modell:** normal. **Braucht:** C1.

### [ ] C3 · Saisonplan rechnet mit mehreren Blöcken

- **Ziel:** Die Phasen passen zu deiner echten Saison. Heute kennt der Plan nur einen Flex-Zeitraum.
- **Dateien:** `js/phases.js`, `js/flex.js`, `tests/phases.test.js`, `tests/flex.test.js`, `js/app/plan.js`,
  `js/data.js`, `README.md`.
- **Umsetzung:**
  1. `Flex.flexState` und `Phases.buildPhases` nehmen die Liste `season.blocks` statt eines einzelnen
     Zeitraums. Jeder Block hat eine Art: „flex“ (Wochen-Minimum statt Plan), „locker“ (Plan mit Spielraum),
     „camp“ (Trainingsreise).
  2. Zwischen den Blöcken verteilt der Plan die Phasen neu: Wiedereinstieg ab 11.01., Grundlage bis zur
     Trainingsreise, Aufbau bis zum Halbmarathon, Flex im Mai, danach Schärfen und Taper.
  3. Der Plan warnt sichtbar, wenn ein Flex-Block in die letzten 8 Wochen vor dem Rennen fällt, und zeigt, wie
     viele Planwochen danach bleiben.
  4. Jeder Block kann ein eigenes Wochen-Minimum haben (im Mai eher Ausdauer als Gym).
- **Prüfen am iPad:** Tab Plan: Die Zeitleiste zeigt zwei Flex-Blöcke und die Trainingsreise. Über dem Plan
  steht der Hinweis zum Mai. „Alle Phasen“ antippen: Die Daten der Phasen passen zu deiner Saison.
- **Größe:** groß. **Modell:** stark. **Braucht:** C1.

### [ ] C4 · Hinweis des Tages

- **Ziel:** Ein bis drei klare Hinweise unter „Heute“, nach festen Regeln, ohne KI.
- **Dateien:** neu `js/hints.js`, neu `tests/hints.test.js`, `js/app/heute.js`, `js/data.js`, `index.html`,
  `sw.js`, `README.md`.
- **Umsetzung:**
  1. `js/hints.js` bekommt eine Liste von Regeln. Jede Regel hat einen Namen, eine Bedingung, einen Satz und
     einen Rang. Die Schwellen stehen in `js/data.js` unter `hints`.
  2. Regeln zum Start (die meisten Bausteine gibt es schon verstreut, sie werden hier gebündelt):
     - Bereitschaft unter 50 oder Schlaf unter 6 Stunden: „Heute nur locker.“
     - Belastung akut zu chronisch über 1,5: „Belastung stark gestiegen. Heute locker oder Ruhetag.“
     - HRV an zwei Tagen unter deinem Normalbereich: „Erholung hat Vorrang.“
     - Ruhepuls 5 Schläge über dem 7-Tage-Schnitt: „Auf Infekt achten, heute locker.“
     - Drei harte Tage in Folge: „Morgen Ruhetag einplanen.“
     - Langer Lauf mehr als 10 % über dem längsten der letzten 4 Wochen: „Nicht zu schnell steigern.“
     - 48 Stunden nach Leg Day: „Kein harter Lauf.“
     - Sieben Tage vor einem Termin: „Umfang zurücknehmen.“ Nach einem Wettkampf: „Erholungstage.“
     - Garmin-Daten nicht von heute: Der Hinweis nennt das dazu.
  3. Gezeigt werden höchstens drei, der wichtigste zuerst. Jeder Hinweis nennt seinen Grund mit Zahl.
- **Prüfen am iPad:** Unter „Heute“ steht eine Karte „Hinweise“. An einem Tag mit Bereitschaft unter 50 steht
  dort „Heute nur locker“ mit dem Wert dahinter.
- **Größe:** mittel. **Modell:** normal. **Braucht:** A2.

### [ ] C5 · Knopf „Zusammenfassung kopieren“

- **Ziel:** Ein Tipp kopiert einen kompakten Text mit deinem Stand. Den fügst du in Claude ein und stellst deine
  Frage dazu. Es entstehen keine Kosten, und nichts verlässt das Gerät, bevor du es selbst einfügst.
- **Dateien:** neu `js/summary.js`, neu `tests/summary.test.js`, `js/app/heute.js`, `index.html`, `sw.js`,
  `README.md`.
- **Umsetzung:**
  1. `js/summary.js` baut aus den vorhandenen Werten einen Text von rund 30 Zeilen: Datum, Phase und Block,
     Tage bis zum nächsten Termin und bis Frankfurt, letzte 7 und 28 Tage je Disziplin (Stunden, Kilometer,
     Einheiten), Belastung akut und chronisch, Erholung heute und im 7-Tage-Schnitt, Zone-2-Kennzahlen,
     1RM-Werte, Prognose mit Spanne, aktuelle Hinweise.
  2. Der Knopf sitzt im Wochenblatt und im Einstellungen-Blatt. Nach dem Tippen steht dort „Kopiert“.
  3. Erlaubt der Browser das Kopieren nicht, öffnet sich ein Blatt mit dem Text zum Markieren.
- **Prüfen am iPad:** Knopf antippen, dann in Claude lange ins Textfeld tippen und „Einsetzen“ wählen. Der Text
  erscheint und nennt das heutige Datum.
- **Größe:** mittel. **Modell:** normal. **Braucht:** A2, C1.

---

## Etappe D · Winter und Trainingsreise (bis 19.02.)

### [ ] D1 · Wintersport zählt richtig

- **Ziel:** Langlauf zählt als Ausdauer, Skifahren als Bewegung, beides ohne die Rad- und Laufzahlen zu
  verfälschen.
- **Dateien:** `js/z2.js`, `js/app/core.js`, `js/flex.js`, `tests/z2.test.js`, `tests/flex.test.js`, `README.md`.
- **Umsetzung:**
  1. Langlauf (Strava: `NordicSki`, `RollerSki`) bekommt die Bezeichnung „Langlauf“, ein eigenes Symbol und
     zählt beim Wochen-Minimum und in den Triathlon-Stunden als Ausdauer.
  2. Skifahren und Skitouren (`AlpineSki`, `BackcountrySki`, `Snowboard`) heißen „Ski“ und zählen unter
     „Sonstiges“, mit Stunden in der Gesamtzeit.
  3. Die Prognose bleibt unberührt.
- **Prüfen am iPad:** Nach der ersten Langlauf-Einheit: Unter Training steht „Langlauf“, und die Einheit zählt in
  der Wochenkarte bei den Stunden mit.
- **Größe:** klein. **Modell:** normal.

### [ ] D2 · Soll und Ist je Woche

- **Ziel:** Ab dem 11.01. siehst du, wie die Woche zum Plan passt, je Disziplin.
- **Dateien:** `js/phases.js`, `js/weekly.js`, `tests/weekly.test.js`, `js/app/heute.js`, `js/data.js`,
  `README.md`.
- **Umsetzung:**
  1. Jede Phase bekommt neben den Gesamtstunden einen Richtwert je Disziplin (Schwimmen, Rad, Laufen, Kraft).
  2. Das Wochenblatt zeigt je Disziplin einen Balken „Ist von Soll“. In Flex-Blöcken bleibt es beim
     Wochen-Minimum.
  3. Ein Hinweis aus C4 meldet, wenn eine Disziplin zwei Wochen in Folge unter 60 % liegt.
- **Prüfen am iPad:** Wochenkarte antippen: vier Balken mit Stunden, die Summe passt zur Phase im Tab Plan.
- **Größe:** mittel. **Modell:** normal. **Braucht:** C3, C4.

### [ ] D3 · Trainingsreise als Trainingslager

- **Ziel:** In der Woche vom 20. bis 27.02. warnt die App nicht vor hoher Belastung, sondern begleitet sie.
- **Dateien:** `js/hints.js`, `js/weekly.js`, `tests/hints.test.js`, `js/app/heute.js`, `README.md`.
- **Umsetzung:**
  1. In einem Block der Art „camp“ gilt für die Belastungs-Warnung eine höhere Schwelle. Die Erholungs-Regeln
     (Schlaf, HRV, Ruhepuls) bleiben scharf.
  2. Nach dem Block schlägt die App drei lockere Tage vor.
  3. Das Wochenblatt zeigt für die Lagerwoche eine eigene Zeile „Trainingslager: Stunden und Einheiten“.
- **Prüfen am iPad:** In der Lagerwoche steht unter „Heute“ „Trainingslager“ statt der Phase, und nach einem
  harten Tag erscheint keine Belastungs-Warnung.
- **Größe:** klein. **Modell:** normal. **Braucht:** C3, C4.

### [ ] D4 · Darstellung auf dem kleinen iPhone

- **Ziel:** Drei kleine Mängel aus dem Audit beheben. Das sind Design-Entscheidungen, deshalb mit Vorschau.
- **Dateien:** `css/style.css`, `js/app/heute.js`, `js/app/training.js`.
- **Umsetzung:**
  1. S20: „Bereitschaft“ bricht auf dem iPhone SE nicht mehr mitten im Wort um. Vorschlag: Auf schmalen
     Geräten entfällt das Etikett neben der Zahl.
  2. S13: Die Kalender-Kästchen werden auf dem iPhone 44 px breit. Vorschlag: Die Wochenspalten links und
     rechts wandern unter den Kalender.
  3. S14: Der Pfeil im Wochenblatt bekommt die dunklere Akzentfarbe.
  4. Claude zeigt dir vorher Bilder beider Varianten.
- **Prüfen am iPad:** Betrifft nur das iPhone. Dort: Tab Heute und Tab Training, Kalender ansehen.
- **Größe:** klein. **Modell:** normal.

---

## Etappe E · Marathon in Zone 2 (bis ca. 14.03.)

### [ ] E1 · Aufbau der langen Läufe

- **Ziel:** Du siehst, ob deine langen Läufe rechtzeitig zum Marathon reichen.
- **Dateien:** `js/stats.js`, `tests/stats.test.js`, `js/app/plan.js`, `js/metrics.js`, `README.md`.
- **Umsetzung:**
  1. Eine neue Detailansicht „Lange Läufe“: der längste Lauf je Woche als Balken, dazu die Ziel-Linie zum
     Marathon-Termin (Steigerung höchstens 10 % pro Woche, zwei Wochen vorher kürzer).
  2. In der Rennvorbereitung zeigt die Zeile „Laufen“ zusätzlich „nächster langer Lauf: ca. 24 km“.
  3. Dieselbe Ansicht gibt es für lange Fahrten mit Blick auf den Ironman.
- **Prüfen am iPad:** Tab Plan, Rennvorbereitung: Zeile „Laufen“ antippen. Es erscheinen Balken je Woche und
  eine gestrichelte Ziel-Linie.
- **Größe:** mittel. **Modell:** normal. **Braucht:** A2, C1.

### [ ] E2 · Marathon-Karte und Erholung danach

- **Ziel:** Am Marathon-Tag hast du Pulsband und Richt-Pace parat. Danach bremst dich die App bewusst.
- **Dateien:** `js/app/heute.js`, `js/hints.js`, `js/summary.js`, `tests/hints.test.js`, `README.md`.
- **Umsetzung:**
  1. In der Woche vor einem Termin der Art „Training“ zeigt „Heute“ eine Karte: Pulsband Zone 2, Richt-Pace aus
     deiner Zone-2-Auswertung, erwartete Dauer, Erinnerung an Trinken und Essen alle 30 Minuten.
  2. Danach gelten 10 Tage lang nur lockere Vorschläge, und die Belastungs-Regel bewertet den Marathon nicht als
     Ausreißer.
  3. Die Prognose nimmt den Marathon als längsten Lauf, aber nicht als Bestzeit.
- **Prüfen am iPad:** Sechs Tage vor dem Marathon steht unter „Heute“ die Karte mit Pulsband und Pace. Am Tag
  danach steht unter Hinweise „Erholungstage“.
- **Größe:** mittel. **Modell:** normal. **Braucht:** C2, C4, C5.

---

## Etappe F · Realistische Zielzeit (bis 24.04.)

### [ ] F1 · Was der Prognose noch fehlt

- **Ziel:** Du siehst, welche drei Dinge die Prognose am meisten verbessern würden.
- **Dateien:** `js/prediction.js`, `tests/prediction.test.js`, `js/app/plan.js`, `README.md`.
- **Umsetzung:**
  1. `predictRace` liefert zusätzlich eine Liste „fehlt“: zum Beispiel kein Schwimmtest, kein Lauf über 25 km in
     8 Wochen, FTP-Test älter als 12 Wochen, keine Fahrt über 120 km mit Leistungsmesser.
  2. Die Karte „Ziel vs. Prognose“ zeigt diese Liste als „So wird die Prognose genauer“, je Punkt mit dem
     erwarteten Gewinn an Sicherheit.
  3. Neue Testwerte trägst du nicht selbst ein. Du schreibst sie Claude, zum Beispiel „Schwimmtest: 400 m in
     7:20, 200 m in 3:30“, und Claude trägt sie in `js/data.js` ein.
- **Prüfen am iPad:** Tab Plan, „Ziel vs. Prognose“: Unter der Tabelle steht die Liste mit mindestens einem Punkt.
- **Größe:** klein. **Modell:** normal.

### [ ] F2 · Lauf-Prognose aus echten Wettkämpfen

- **Ziel:** Der Halbmarathon vom 25.04. wird zur Grundlage der Lauf-Prognose. Heute rechnet sie aus der
  10-km-Bestzeit hoch.
- **Dateien:** `js/prediction.js`, `tests/prediction.test.js`, `js/data.js`, `js/app/plan.js`, `README.md`.
- **Umsetzung:**
  1. Die Prognose wählt die Bezugszeit selbst: die längste Wettkampf-Strecke der letzten 16 Wochen aus dem
     Saisonkalender, sonst wie bisher.
  2. Die bisherige Sonderregel „Halbmarathon-Bestzeit ignorieren“ entfällt und wird durch „nur Termine der Art
     Wettkampf zählen“ ersetzt.
  3. Die Prognose-Karte zeigt, welche Zeit die Grundlage ist und wie alt sie ist.
- **Prüfen am iPad:** Nach dem Halbmarathon: Tab Plan, Zeile „Laufen“ in der Prognose antippen. Dort steht
  „Grundlage: Halbmarathon vom 25.04.“.
- **Größe:** mittel. **Modell:** stark, weil sich hier die wichtigste Zahl der App ändert. **Braucht:** C1.

### [ ] F3 · Rad-Prognose an echten Fahrten prüfen

- **Ziel:** Die Rad-Zeit stützt sich nicht nur auf ein Modell mit geschätzten Werten.
- **Dateien:** `js/prediction.js`, `tests/prediction.test.js`, `js/app/plan.js`, `README.md`.
- **Umsetzung:**
  1. Für lange Fahrten im Freien (über 90 km) rechnet das Modell rückwärts: Welche Geschwindigkeit hätte es für
     diese Strecke und Höhenmeter erwartet, und wie schnell warst du wirklich?
  2. Weicht das Modell im Schnitt um mehr als 5 % ab, zeigt die Karte das an und nennt die angepasste Zeit als
     zweite Zahl. Die Einstellungen ändert die App nicht von selbst.
  3. Ohne passende Fahrten steht dort „noch keine lange Fahrt zum Abgleich“.
- **Prüfen am iPad:** Tab Plan, Zeile „Rad“ in der Prognose antippen: Es erscheint „Abgleich mit deinen langen
  Fahrten“ mit mindestens einer Fahrt oder dem Hinweis, dass noch keine vorliegt.
- **Größe:** mittel. **Modell:** stark.

### [ ] F4 · Halbmarathon: Ziel-Pace und Auswertung

- **Ziel:** Vor dem Rennen eine realistische Ziel-Pace, danach eine ehrliche Auswertung.
- **Dateien:** `js/app/heute.js`, `js/app/plan.js`, `js/season.js`, `js/summary.js`, `README.md`.
- **Umsetzung:**
  1. In der Rennwoche zeigt „Heute“ eine Karte mit Ziel-Zeit und Pace je Kilometer, hochgerechnet aus deiner
     10-km-Zeit, mit vorsichtiger und mutiger Variante.
  2. Nach dem Rennen zeigt der Termin im Tab Plan Ergebnis, Pace und den Vergleich zur Erwartung.
  3. Der Ironman-Prognose-Verlauf bekommt an diesem Tag eine Markierung.
- **Prüfen am iPad:** In der Woche vor dem 25.04. steht unter „Heute“ die Karte „Halbmarathon“. Am Tag danach
  steht im Tab Plan beim Termin deine Zeit.
- **Größe:** klein. **Modell:** normal. **Braucht:** C2, C5, F2.

---

## Etappe G · Mai und Rennen (bis 30.04. vorbereitet)

### [ ] G1 · Flex-Block im Mai einrichten

- **Ziel:** Im Mai gilt ein Wochen-Minimum, das zur Ironman-Vorbereitung passt.
- **Dateien:** `js/data.js`, `README.md`.
- **Umsetzung:** Für den Mai-Block eigenes Minimum eintragen (Vorschlag: drei Ausdauer-Einheiten, davon eine
  lange, dazu eine Kraft-Einheit) und die Ausstattung „Vor Ort“ zurücksetzen. Reine Einstellung, kein neuer Code.
- **Prüfen am iPad:** Am 01.05. zeigt „Heute“ die Ringe des neuen Minimums.
- **Größe:** klein. **Modell:** normal. **Braucht:** C3.

### [ ] G2 · Rennwochen und Renntag-Karte

- **Ziel:** In den letzten drei Wochen führt dich die App: weniger Umfang, klare Zahlen für den Renntag.
- **Dateien:** `js/app/heute.js`, `js/app/plan.js`, `js/hints.js`, `js/prediction.js`, `js/summary.js`,
  `README.md`.
- **Umsetzung:**
  1. Taper-Regeln in `js/hints.js`: Umfang je Woche gegenüber dem Schnitt, keine neuen Reize, Schlaf im Blick.
  2. Renntag-Karte im Tab Plan: Ziel-Zeiten je Abschnitt aus der Prognose, Watt-Bereich für das Rad,
     Pulsgrenze und Pace für den Lauf, Verpflegungsplan zum Eintragen in `js/data.js`.
  3. Die Karte funktioniert ohne Netz, damit sie am Renntag sicher da ist.
- **Prüfen am iPad:** Tab Plan, „Renntag“: Die Zeiten addieren sich zur Prognose. Flugmodus an, neu laden: Die
  Karte ist weiter da.
- **Größe:** mittel. **Modell:** normal. **Braucht:** C4, C5, F2, F3.

### [ ] G3 · Nach dem Rennen

- **Ziel:** Ergebnis gegen Prognose, und ein Abschluss der Saison.
- **Dateien:** `js/app/plan.js`, `js/season.js`, `README.md`.
- **Umsetzung:** Der Tab Plan zeigt nach dem 27.06. die Abschnittszeiten gegen die Prognose und den Verlauf der
  Prognose über die Saison. Die Seite schaltet auf „Saison abgeschlossen“ statt auf „0 Tage“.
- **Prüfen am iPad:** Am 28.06. zeigt der Tab Plan den Vergleich.
- **Größe:** klein. **Modell:** normal. **Braucht:** C1.

---

## Wo die „Später“-Punkte aus dem Audit gelandet sind

| Punkt | Thema | Schritt |
|---|---|---|
| S1 | E-Mail-Adresse in der Historie | dein Schritt in `AUDIT.md` |
| S2 | `robots.txt` wirkt nicht | A5 |
| S3 | Garmin-Bibliothek nicht eingefroren | B3 |
| S4 | veraltete Bausteine im Garmin-Update | B3 |
| S5 | Strava-Nummern öffentlich | B4 |
| S6 | GitHub lässt geplante Läufe aus | B1 |
| S7 | gelöschte Einheiten bleiben stehen | B2 |
| S8 | Datum des Strava-Stands in deutscher Zeit | B2 |
| S9 | leere Disziplin zeigt „NaN“ | A2 |
| S10 | geänderte Puls-Zonen ohne Warnung | A5 |
| S11 | Offline-Kopie bei Server-Fehlern | A5 |
| S12 | defekter Prognose-Verlauf | A5 |
| S13 | Kalender-Kästchen auf dem iPhone | D4 |
| S14 | Pfeil-Kontrast im Wochenblatt | D4 |
| S15 | `js/app.js` zu groß | A3, A4 |
| S16 | doppelte Hilfsfunktionen | A3 |
| S17 | toter Code | A3 |
| S18 | Datei-Liste doppelt gepflegt | A1 |
| S19 | 1RM bei einer Wiederholung | A5 |
| S20 | „Bereitschaft“ bricht um | D4 |

## Was ich von dir noch brauche

Die Antworten ändern keinen Code, nur Einträge in `js/data.js`. Du kannst sie jederzeit nachreichen.

1. **Marathon:** Welches Datum, sobald es feststeht?
2. **Trainingsreise im Februar:** Welche Sportarten, und gibt es dort ein Schwimmbad?
3. **Mai:** Was kannst du unterwegs trainieren (Laufen, Schwimmen, Rad, Gym)?
4. **Winter bis 19.02.:** Soll der Plan dann schon Soll-Stunden zeigen, oder nur lockere Richtwerte?
5. **Halbmarathon:** Voll auf Zeit laufen oder als Trainingslauf?
6. **Bezeichnungen:** Die Zeiträume stehen öffentlich im Repo. Sollen sie neutral heißen („Flex-Block“) statt
   „Reise“?

## Bewusst nicht geplant

- **Kein KI-Coach in der App.** Hinweise kommen aus festen Regeln. Für Fragen gibt es den Kopier-Knopf.
- **Keine Anmeldung, kein Server, keine Datenbank.** Die Seite bleibt statisch und kostenlos.
- **Keine eigene Trainingsplan-Erstellung.** Die App zeigt Phasen, Richtwerte und Hinweise, sie schreibt dir
  keinen Tag für Tag festen Plan.
- **Keine neuen Abhängigkeiten.**
