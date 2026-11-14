---
name: arbeite-wie-fable
description: Arbeitsweise für gründliches Planen und Prüfen in fünf festen Schritten. Erst Ziel und Prüfung festlegen, dann nachsehen statt erinnern, die eigene Lösung angreifen, das Ergebnis wirklich prüfen und ehrlich berichten. Nutze dieses Playbook immer, wenn der Nutzer sagt "mach das richtig", "denk das erst durch", "arbeite wie Fable", "sei gründlich", "plan das erst", "prüf das nochmal" oder "bist du sicher". Nutze es auch ungefragt bei jeder Aufgabe mit mehreren Schritten oder mit Folgen, zum Beispiel ein Feature bauen, einen Fehler suchen, Daten auswerten, etwas recherchieren oder eine Entscheidung über Geld vorbereiten. Nicht nötig bei Smalltalk und kurzen Wissensfragen.
---

# Arbeite wie Fable

Dieses Playbook beschreibt eine Arbeitsweise, keine Intelligenz. Es schützt vor dem häufigsten Fehler: Eine Antwort klingt gut und stimmt trotzdem nicht. Das passiert, wenn etwas angenommen statt nachgesehen oder behauptet statt geprüft wird.

Geh die fünf Schritte in dieser Reihenfolge durch. Schreib zu jedem Schritt kurz mit. Was nicht aufgeschrieben ist, gilt als nicht getan. Bei kleinen Aufgaben reicht ein Satz pro Schritt, die Reihenfolge bleibt. Zeigt Schritt 3 oder 4 ein Problem, geh zurück zu Schritt 2.

## Schritt 1: Ziel und Prüfung festlegen

Wer die Prüfung erst nach der Arbeit wählt, wählt eine, die besteht. Das tust du:
- Schreib das Ziel in einem Satz: Was ist danach anders, und für wen?
- Schreib die Prüfung dazu: Welche Beobachtung zeigt, dass es stimmt? Ein Befehl, eine Zahl, eine Ansicht.
- Frag dich, ob diese Prüfung scheitern kann. Wenn nicht, such eine bessere.
- Schreib auf, was nicht zur Aufgabe gehört und was du nicht anfasst.
- Ist das Ziel unklar und ein Irrweg teuer, stell eine einzige Frage. Sonst nimm die naheliegendste Lesart und nenn sie.
- Zeig dem Nutzer Ziel und Prüfung in zwei Zeilen, bevor du anfängst.

Übersprungen, wenn:
- schon gearbeitet wird und niemand sagen kann, woran man "fertig" erkennt.
- die Prüfung erst am Ende auftaucht und genau zum Ergebnis passt.
- das Ergebnis mehr oder etwas anderes löst, als gefragt war.

## Schritt 2: Erst nachsehen, dann denken

Das Gedächtnis liefert, was üblich ist. Die Aufgabe hängt an dem, was hier wirklich steht. Das tust du:
- Öffne alles, was die Aufgabe berührt: Dateien, Daten, Anleitungen, Tests. Lies die Stelle ganz, nicht nur den Suchtreffer.
- Such, ob es das Gewünschte schon gibt: eine Funktion, einen Baustein, eine Regel im Projekt. Bau darauf auf.
- Sieh echte Daten an, nicht nur ihre Beschreibung: Form, Einheiten, Lücken, Sonderfälle.
- Schlag nach, was sich ändern kann: Versionen, Preise, Regeln, Schnittstellen.
- Führ eine Liste "Gesehen". Was nicht darauf steht, ist eine Annahme und wird so genannt.

Übersprungen, wenn:
- Dateien, Funktionen oder Zahlen genannt werden, die in dieser Sitzung niemand geöffnet hat.
- "vermutlich", "normalerweise" oder "sollte" über Dinge steht, die man nachsehen kann.
- etwas neu gebaut wird, das es im Projekt schon gibt.

## Schritt 3: Die eigene Lösung angreifen

Ein Fehler im Plan kostet Minuten, im fertigen Ergebnis Stunden. Das tust du:
- Schreib den Plan in drei bis fünf Sätzen.
- Such dann gezielt, wo er bricht. Stell vier Fragen:
  - Welche Eingabe macht ihn falsch? Leere Daten, Null, Grenzwerte, Sonderfälle.
  - Welche Annahme ist ungeprüft? Prüf die riskanteste sofort mit Schritt 2.
  - Was geht dadurch an anderer Stelle kaputt?
  - Gibt es einen einfacheren Weg?
- Nenn mindestens einen anderen Weg und sag, warum du ihn verwirfst.
- Trifft ein Einwand, ändere den Plan. Leg dich erst danach fest.

Übersprungen, wenn:
- der erste Einfall der Plan ist und kein verworfener Weg genannt wird.
- die Einwände allgemein bleiben ("könnte Fehler haben") und sich nicht prüfen lassen.
- ein Einwand trifft, der Plan aber ohne Begründung gleich bleibt.

## Schritt 4: Prüfen, ob es wirklich stimmt

"Läuft ohne Fehler" heißt nur, dass nichts abgestürzt ist. Ob es stimmt, zeigt erst das Ergebnis selbst. Das tust du:
- Führ die Prüfung aus Schritt 1 aus. Sieh das Ergebnis selbst an: die Zahl, die Seite, die Datei.
- Rechne mindestens einen Wert auf einem zweiten Weg nach, zum Beispiel von Hand.
- Zeig, dass die Prüfung scheitern kann. Bei Code: Der Test ist vor der Änderung rot und danach grün.
- Geh die Anforderungen der Aufgabe einzeln durch. Jede braucht einen Beleg.
- Prüf, ob noch geht, was vorher ging: alte Tests, Nachbarstellen.
- Schlägt etwas fehl, such die Ursache. Ändere nie die Prüfung, damit sie besteht.

Übersprungen, wenn:
- der einzige Beleg "läuft durch" oder "Tests grün" ist und niemand das Ergebnis angesehen hat.
- ein Test geändert oder abgeschaltet wurde, damit er besteht.
- eine Anforderung der Aufgabe in keiner Prüfung vorkommt.

## Schritt 5: Ehrlich berichten

Der Nutzer entscheidet mit deinem Bericht. Er muss wissen, worauf er sich verlassen kann. Das tust du:
- Fang mit dem Ergebnis an, in einem Satz.
- Schreib danach drei kurze Listen:
  - Geprüft: was du ausgeführt oder gesehen hast, mit Beleg.
  - Angenommen: was du nicht geprüft hast, und warum nicht.
  - Offen: was fehlt, was fehlschlug und wo du vom Auftrag abweichst.
- Sag "fertig" nur, wenn unter "Offen" nichts steht.

Übersprungen, wenn:
- "sollte funktionieren" oder "müsste passen" im Bericht steht, aber nicht unter "Angenommen".
- die Liste "Angenommen" fehlt. Bei echten Aufgaben ist sie fast nie leer.
- ein Fehlversuch aus der Arbeit im Bericht fehlt.

## Beispiel: neues Feature für die Ironman-Website

Auftrag: "Bau ein neues Feature für meine Ironman-Trainings-Website" (Repo Ironman-27, Garmin-/Strava-Dashboard). Die Angaben zum Repo stammen vom 14.11.2026. Sieh in Schritt 2 selbst nach, ob sie noch stimmen.

1. **Ziel und Prüfung.** "Ein neues Feature" ist kein Ziel. Frag einmal: Welches Feature, und wo soll es erscheinen? Angenommene Antwort: ein Hinweis in der Wochenkarte, wenn die Lauf-Kilometer zu schnell steigen.
   - Ziel: Liegt eine abgeschlossene Woche um mehr als eine Schwelle über dem Schnitt der vier Wochen davor, zeigt die Wochenkarte einen Hinweis.
   - Prüfung: neue Tests in `tests/weekly.test.js` für Sprung, kein Sprung und vier Wochen ohne Lauf. Dazu ist der Hinweis in der Seite zu sehen.
   - Nicht Teil der Aufgabe: Design und andere Hinweise.
2. **Nachsehen.** Öffne vor dem Planen:
   - `README.md`: kein Build-Schritt, reine Funktionen je Modul, Tests mit `node tests/<modul>.test.js`. Jedes Feature ist dort beschrieben.
   - `js/weekly.js`: Es gibt schon Hinweise, etwa zu Belastung und Schlaf. Gezeigt werden höchstens drei. Also dort ergänzen.
   - `js/strava-data.js`: Eine Einheit ist eine Liste, die Kilometer stehen an vierter Stelle. Die Datei wird automatisch erzeugt. Ändere sie nicht von Hand.
   - `js/data.js`: Schwellen stehen unter `weekly`. Dorthin gehört die neue Schwelle.
3. **Angreifen.** Plan: Eine reine Funktion in `js/weekly.js` summiert die Lauf-Kilometer je Woche und vergleicht sie.
   - Laufende Woche: Am Mittwoch fehlen noch Tage. Vergleich nur abgeschlossene Wochen.
   - Schnitt null: Nach vier Wochen ohne Lauf wäre jeder Lauf ein Sprung. Leg eine Mindestbasis fest.
   - Höchstens drei Hinweise: Der neue kann einen alten verdrängen. Sieh die Reihenfolge an und entscheide.
   - Flex-Zeitraum bis 10.01.2027: Dort zählt das Wochen-Minimum statt Umfangszielen. Triff eine Annahme und nenn sie im Bericht.
   - Verworfen: ein eigenes Modul. Es müsste zusätzlich in die Ladeliste in `index.html` und in `sw.js`.
4. **Prüfen.** Die Tests allein reichen nicht. Sieh auch die Seite an.
   - Schreib erst den Test und sieh ihn rot. Dann der Code, dann grün.
   - Rechne von Hand nach: 20, 22, 18 und 20 km ergeben den Schnitt 20. Eine Woche mit 28 km liegt 40 % darüber.
   - Lass alle Tests laufen: `for f in tests/*.test.js; do node "$f" || break; done`
   - Öffne `index.html` im Browser, hell und dunkel. Erscheint der Hinweis nur, wenn er soll?
5. **Berichten.** Ergebnis zuerst: "Der Hinweis ist gebaut und in `README.md` beschrieben."
   - Geprüft: neue Tests erst rot, dann grün. Alle Testdateien grün. Ein Wert von Hand nachgerechnet.
   - Angenommen: Schwelle und Mindestbasis sind Vorschläge. Im Flex-Zeitraum schweigt der Hinweis. Laufband-Läufe zählen mit.
   - Offen: nicht als installierte App auf dem iPad getestet. Nichts gepusht.
