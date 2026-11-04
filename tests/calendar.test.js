/* Tests für js/calendar.js – ausführen mit: node tests/calendar.test.js */
"use strict";
const assert = require("node:assert/strict");
const C = require("../js/calendar.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const today = new Date(2026, 10, 4, 18, 0); // Mittwoch, 04.11.2026
const act = (iso, cat, name, min, sport = "Run") => ({ date: new Date(iso), cat, sport, name, sec: min * 60 });
const gym = (start, name, min, split, parsed = null) => ({ start, name, sec: min * 60, split, parsed });

test("Wochenraster: 10 Wochen Mo–So, neueste zuerst, heute und Zukunft markiert", () => {
  const cal = C.buildCalendar({ today });
  assert.equal(cal.weeks.length, 10);
  assert.equal(cal.weeks[0].monday, "2026-11-02");
  assert.equal(cal.weeks[1].monday, "2026-10-26");
  assert.equal(cal.weeks[9].monday, "2026-08-31");
  assert.deepEqual(cal.weeks[0].days.map((d) => d.date), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.deepEqual(cal.weeks[0].days.map((d) => d.isToday), [false, false, true, false, false, false, false]);
  assert.deepEqual(cal.weeks[0].days.map((d) => d.future), [false, false, false, true, true, true, true]);
  // Sonntag gehört zur Woche ab Montag davor
  const sun = C.buildCalendar({ today: new Date(2026, 10, 8, 9, 0) });
  assert.equal(sun.weeks[0].monday, "2026-11-02");
});

test("Datum nach lokaler Startzeit, Wochensumme in Stunden und Anzahl", () => {
  const cal = C.buildCalendar({ today, acts: [act("2026-11-03T23:30", "run", "Spätlauf", 30), act("2026-11-04T00:10", "swim", "Nachtschwimmen", 20, "Swim")] });
  const [mon, tue, wed] = cal.weeks[0].days;
  assert.equal(tue.items.length, 1); assert.equal(wed.items.length, 1); assert.equal(mon.items.length, 0);
  assert.equal(cal.weeks[0].totalSec, 50 * 60);
  assert.equal(cal.weeks[0].count, 2);
});

test("Mehrere Sportarten an einem Tag: nach Dauer sortiert, max. 3 Streifen, Rest als „+“", () => {
  const cal = C.buildCalendar({
    today,
    acts: [
      act("2026-11-03T07:00", "swim", "Schwimmen", 30, "Swim"), act("2026-11-03T12:00", "bike", "Zwift", 60, "VirtualRide"),
      act("2026-11-03T17:00", "run", "Lauf", 20), act("2026-11-03T19:00", "other", "Klettern", 90, "RockClimbing"),
    ],
    gymSessions: [gym("2026-11-03T09:00", "Push 6x100", 45, "Push")],
  });
  const tue = cal.weeks[0].days[1];
  assert.deepEqual(tue.cats, ["other", "bike", "strength"]);
  assert.equal(tue.more, 2);
  assert.equal(tue.split, "Pu");
  assert.deepEqual(tue.items.map((x) => x.name), ["Schwimmen", "Push 6x100", "Zwift", "Lauf", "Klettern"]); // chronologisch
});

test("Dauer-Stufen: < 45 min, 45–90 min, > 90 min, Ruhetag 0", () => {
  assert.equal(C.levelOf(0), 0);
  assert.equal(C.levelOf(44 * 60), 1);
  assert.equal(C.levelOf(45 * 60), 2);
  assert.equal(C.levelOf(90 * 60), 2);
  assert.equal(C.levelOf(91 * 60), 3);
  const cal = C.buildCalendar({ today, acts: [act("2026-11-02T10:00", "run", "a", 30), act("2026-11-02T18:00", "run", "b", 30)] });
  assert.equal(cal.weeks[0].days[0].level, 2); // Summe des Tages zählt (60 min)
});

test("Keine Doppelzählung: Kraft nur aus den zusammengeführten Gym-Einheiten", () => {
  const cal = C.buildCalendar({
    today,
    acts: [act("2026-11-02T10:35", "strength", "Leg Day", 98, "WeightTraining"), act("2026-11-02T17:00", "run", "Lauf", 30)],
    gymSessions: [gym("2026-11-02T10:35", "Krafttraining", 98, "Legs", { exercise: "Beinpresse", entry: true, sets: 3, reps: 10, weight: 180, place: "Bali" })],
  });
  const mon = cal.weeks[0].days[0];
  assert.equal(mon.items.filter((x) => x.cat === "strength").length, 1);
  assert.equal(mon.items.length, 2);
  assert.equal(mon.split, "L");
  assert.equal(mon.items[0].exercise, "Beinpresse");
  assert.deepEqual(mon.items[0].entry, { sets: 3, reps: 10, weight: 180, place: "Bali" });
  assert.equal(cal.weeks[0].count, 2);
});

test("Flex-Wochen werden markiert", () => {
  const isFlex = (d) => d >= new Date(2026, 9, 27) && d <= new Date(2027, 0, 10);
  const cal = C.buildCalendar({ today, isFlex });
  assert.deepEqual(cal.weeks.slice(0, 3).map((w) => w.flex), [true, true, false]); // Woche ab 26.10. enthält den 27.10.
});

console.log(`\n${n} Tests bestanden.`);
