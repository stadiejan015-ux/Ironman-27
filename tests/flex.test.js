/* Tests für js/flex.js – ausführen mit: node tests/flex.test.js */
"use strict";
const assert = require("node:assert/strict");
const F = require("../js/flex.js");

const cfg = {
  active: true, from: "2026-11-02", until: "2027-01-10", label: "Gym-Block & Reisen",
  minimum: { gym: 4, endurance: 2, enduranceMinMinutes: 30, swim: 1 },
  rotation: ["Push", "Pull", "Legs"], legDayHours: 48, reentryDays: 14,
  defaultEquipment: ["gym", "treadmill", "runOutside"],
};
const zones = [[0, 129], [130, 152], [153, 175], [176, 200], [201, null]];
const d = (s) => new Date(s);
const act = (date, cat, name, min = 60) => ({ date: d(date), cat, name, sec: min * 60 });
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };

test("Flex-Zeitraum: aktiv bis einschließlich 10.01., danach und bei active=false nicht", () => {
  assert.equal(F.flexState(cfg, d("2026-11-05T10:00")).active, true);
  assert.equal(F.flexState(cfg, d("2027-01-10T23:00")).active, true);
  assert.equal(F.flexState(cfg, d("2027-01-11T00:30")).active, false);
  assert.equal(F.flexState({ ...cfg, active: false }, d("2026-11-05T10:00")).active, false);
  assert.equal(F.flexState(cfg, d("2026-10-30T10:00")).active, false); // vor Beginn
  const s = F.flexState(cfg, d("2026-12-31T08:00"));
  assert.equal(s.daysLeft, 10); assert.equal(s.reentry, true);
  assert.equal(F.flexState(cfg, d("2026-12-20T08:00")).reentry, false);
});

test("Split-Erkennung aus Titeln", () => {
  assert.equal(F.splitOf("Leg Day"), "Legs");
  assert.equal(F.splitOf("Beine"), "Legs");
  assert.equal(F.splitOf("Push 6x100 @Bali"), "Push");
  assert.equal(F.splitOf("pull · Latzug 8x90"), "Pull");
  assert.equal(F.splitOf("Gym Bali"), null);
  assert.equal(F.splitOf("Pullover kaufen"), null);
});

test("Split-Rotation Push → Pull → Legs anhand der letzten erkannten Einheit", () => {
  const acts = [act("2026-11-01T11:00", "strength", "Gym Bali"), act("2026-11-02T10:00", "strength", "Leg Day"), act("2026-11-03T08:45", "strength", "Push")];
  assert.equal(F.nextSplit(F.gymSessions(acts)).split, "Pull");
  assert.equal(F.nextSplit(F.gymSessions(acts.slice(0, 2))).split, "Push");   // nach Legs kommt Push
  assert.equal(F.nextSplit(F.gymSessions(acts.slice(0, 1))).split, "Push");   // nichts erkannt → Start
});

test("Wochen-Minimum: 4× Gym, 2× Ausdauer ≥ 30 min, davon 1× Schwimmen", () => {
  const week = [
    act("2026-11-02T10:00", "strength", "Leg Day"), act("2026-11-03T08:00", "strength", "Push"),
    act("2026-11-04T08:00", "strength", "Pull"), act("2026-11-03T18:00", "run", "Laufband", 25),   // zu kurz
    act("2026-11-05T18:00", "run", "Lauf", 40), act("2026-11-09T10:00", "swim", "nächste Woche", 45),
  ];
  let w = F.weekMinimum(week, d("2026-11-05T12:00"), cfg);
  assert.deepEqual(w.items.map((x) => [x.key, x.have, x.ok]), [["gym", 3, false], ["endurance", 1, false], ["swim", 0, false]]);
  w = F.weekMinimum(week.concat([act("2026-11-06T08:00", "strength", "Legs"), act("2026-11-08T09:00", "swim", "Meer", 35)]), d("2026-11-05T12:00"), cfg);
  assert.equal(w.ok, true);
  assert.deepEqual(w.missing, []);
});

test("Vorschlag: nach Leg Day kein harter Lauf, Schwimmen bevorzugt wenn es fehlt", () => {
  const acts = [act("2026-11-04T09:00", "strength", "Leg Day")];
  const s = F.suggestFlex({ now: d("2026-11-05T08:00"), acts, equipment: ["gym", "pool", "runOutside"], level: 0, cfg, zones });
  assert.equal(s.gym.title, "Push");
  assert.equal(s.afterLegs, true);
  assert.equal(s.endurance.type, "swim");
  assert.equal(s.endurance.forMinimum, true);
  // ohne Pool nach Leg Day: Laufen nur mit Hinweis „ganz locker“
  const r = F.suggestFlex({ now: d("2026-11-05T08:00"), acts, equipment: ["gym", "treadmill"], level: 0, cfg, zones });
  assert.equal(r.endurance.type, "treadmill");
  assert.match(r.endurance.detail, /130–152 bpm/);
  assert.match(r.endurance.detail, /kein hartes Laufen/);
  assert.match(r.endurance.detail, /Laufband darf die Pace deutlich langsamer sein/);
});

test("Vorschlag: Ausdauer von heute wird als erledigt erkannt", () => {
  const now = d("2026-11-04T20:00");
  const acts = [act("2026-11-03T18:55", "run", "Laufband", 25), act("2026-11-04T08:52", "run", "Laufband", 31), act("2026-11-04T16:53", "strength", "Pull")];
  const s = F.suggestFlex({ now, acts, equipment: ["gym", "treadmill"], level: 0, cfg, zones });
  assert.equal(s.endurance.done, true);
  assert.equal(s.endurance.title, "Laufen erledigt");
  assert.equal(s.endurance.minutes, 31);
  assert.equal(s.endurance.forMinimum, false);
  assert.match(s.endurance.detail, /Wochen-Minimum \(1\/2\) – noch 1×/);
  assert.equal(s.gym.done, true);
  // zu kurz fürs Minimum, aber trotzdem erledigt
  const short = F.suggestFlex({ now: d("2026-11-03T20:00"), acts, equipment: ["treadmill"], level: 0, cfg, zones });
  assert.equal(short.endurance.done, true);
  assert.match(short.endurance.detail, /erst ab 30 min/);
  // ohne Ausdauer heute weiterhin ein Vorschlag
  const none = F.suggestFlex({ now: d("2026-11-05T08:00"), acts, equipment: ["treadmill"], level: 0, cfg, zones });
  assert.equal(none.endurance.done, undefined);
  assert.equal(none.endurance.type, "treadmill");
});

const since = (opts) => Object.fromEntries(F.sinceLast({ cfg: {}, splitCfg: cfg, ...opts }).map((x) => [x.key, x]));

test("Zuletzt gemacht: Tage über den Monatswechsel, heute/gestern, Ampel-Grenzen", () => {
  const now = d("2026-11-02T09:00");
  assert.equal(F.daysBetween(d("2026-10-30T19:30"), now), 3);
  assert.equal(F.daysBetween(d("2026-10-24T07:00"), d("2026-10-26T23:00")), 2); // über die Zeitumstellung
  assert.equal(F.daysBetween(d("2026-12-31T22:00"), d("2027-01-01T06:00")), 1); // Jahreswechsel
  const s = since({ now, acts: [act("2026-10-30T19:30", "run", "Lauf", 40), act("2026-11-02T07:00", "swim", "Pool", 40), act("2026-11-01T10:00", "bike", "Zwift", 60)] });
  assert.equal(s.run.days, 3); assert.equal(s.run.text, "vor 3 Tagen"); assert.equal(s.run.state, "good");
  assert.equal(s.swim.text, "heute");
  assert.equal(s.bike.text, "gestern");
  // Grenzen Laufen 4 / 10: Tag 4 grün, 5 gelb, 10 gelb, 11 rot
  const st = (iso) => since({ now, acts: [act(iso, "run", "Lauf", 40)] }).run.state;
  assert.deepEqual([st("2026-10-29T08:00"), st("2026-10-28T08:00"), st("2026-10-23T08:00"), st("2026-10-22T08:00")], ["good", "warn", "warn", "bad"]);
  // eigene Schwellen aus der Konfiguration
  assert.equal(since({ now, acts: [act("2026-10-28T08:00", "run", "Lauf", 40)], cfg: { run: { green: 6, yellow: 10 } } }).run.state, "good");
});

test("Zuletzt gemacht: „noch nie“, Einheiten in der Zukunft zählen nicht", () => {
  const s = since({ now: d("2026-11-02T09:00"), acts: [act("2026-11-03T08:00", "swim", "Morgen", 40)] });
  assert.equal(s.swim.days, null); assert.equal(s.swim.text, "noch nie"); assert.equal(s.swim.state, "bad"); assert.equal(s.swim.last, null);
  assert.equal(s.legs.text, "noch nie");
});

test("Zuletzt gemacht: Mindestdauer für Langen Lauf und Lange Fahrt, Legs aus dem Gym-Split", () => {
  const now = d("2026-11-10T09:00");
  const acts = [
    act("2026-11-08T08:00", "run", "74 min", 74), act("2026-11-01T08:00", "run", "75 min", 75),
    act("2026-11-09T08:00", "bike", "2:29", 149), act("2026-10-20T08:00", "bike", "2:30", 150),
    act("2026-11-07T10:00", "strength", "Legs"), act("2026-11-09T10:00", "strength", "Push"),
  ];
  const s = since({ now, acts });
  assert.equal(s.run.days, 2);
  assert.equal(s.longRun.days, 9); assert.equal(s.longRun.last.name, "75 min"); assert.equal(s.longRun.minMinutes, 75);
  assert.equal(s.longRide.days, 21); assert.equal(s.longRide.last.name, "2:30"); assert.equal(s.longRide.state, "good");
  assert.equal(s.legs.days, 3); assert.equal(s.legs.state, "good");
  // Mindestdauer anpassbar
  assert.equal(since({ now, acts, cfg: { longRun: { minMinutes: 70 } } }).longRun.days, 2);
});

test("Zuletzt gemacht im Flex-Modus: grau ohne Ausstattung, lange Einheiten nur Info", () => {
  const now = d("2026-11-10T09:00");
  const acts = [act("2026-10-01T08:00", "bike", "Rad", 60), act("2026-10-01T09:00", "run", "Lang", 120)];
  const s = since({ now, acts, flexActive: true, equipment: ["gym", "treadmill"] });
  assert.equal(s.bike.state, "na"); assert.equal(s.bike.note, "nicht verfügbar"); assert.equal(s.bike.days, 40);
  assert.equal(s.swim.state, "na");
  assert.equal(s.run.state, "bad"); // Laufband vorhanden → normale Ampel
  assert.equal(s.legs.state, "bad"); // Gym vorhanden, noch nie Legs
  assert.equal(s.longRun.state, "info"); assert.equal(s.longRide.state, "info");
  // mit Rad/Zwift wieder Ampel, außerhalb von Flex immer Ampel
  assert.equal(since({ now, acts, flexActive: true, equipment: ["bike"] }).bike.state, "bad");
  const off = since({ now, acts, flexActive: false, equipment: null });
  assert.equal(off.bike.state, "bad"); assert.equal(off.longRun.state, "bad");
});

test("Vorschlag: Hitze-Hinweis, Garmin-Bereitschaft und fehlendes Gym", () => {
  const s = F.suggestFlex({ now: d("2026-11-10T08:00"), acts: [], equipment: ["gym", "runOutside", "heat"], level: 0, cfg, zones, paceHint: "ca. 6:00–6:30 /km" });
  assert.match(s.endurance.detail, /Bei Hitze darf die Pace deutlich langsamer sein/);
  assert.match(s.endurance.detail, /ca\. 6:00–6:30/);
  const rest = F.suggestFlex({ now: d("2026-11-10T08:00"), acts: [], equipment: ["gym", "pool"], level: 3, cfg, zones });
  assert.equal(rest.gym.rest, true); assert.equal(rest.endurance, null);
  const noGym = F.suggestFlex({ now: d("2026-11-10T08:00"), acts: [], equipment: ["pool"], level: 0, cfg, zones });
  assert.equal(noGym.gym.skip, true);
  const fallback = F.suggestFlex({ now: d("2026-11-10T08:00"), acts: [], equipment: [], level: 0, cfg, zones });
  assert.equal(fallback.endurance.type, "runOutside"); // Fallback-Ausstattung: Gym, Laufband, Draußen laufen
});

test("Wochen-Minimum: „Fehlt noch“ nennt den tatsächlichen Rest, nicht das ganze Minimum", () => {
  const wk = (g, e, s) => ({ items: [{ key: "gym", have: g, need: 4 }, { key: "endurance", have: e, need: 2 }, { key: "swim", have: s, need: 1 }] });
  assert.equal(F.minimumRest(wk(4, 1, 0)), "1× lockere Ausdauer, davon Schwimmen");
  assert.equal(F.minimumRest(wk(4, 2, 0)), "1× Schwimmen");                 // Ausdauer erfüllt, Schwimmen fehlt zusätzlich
  assert.equal(F.minimumRest(wk(2, 0, 0)), "2× Gym, 2× lockere Ausdauer, davon Schwimmen");
  assert.equal(F.minimumRest(wk(3, 1, 1)), "1× Gym, 1× lockere Ausdauer");
  assert.equal(F.minimumRest(wk(5, 3, 1)), "");                            // erfüllt (auch übererfüllt)
  // echte Woche über weekMinimum
  const d = (s) => new Date(s);
  const a = (iso, cat, name, min = 45) => ({ date: d(iso), cat, name, sec: min * 60 });
  const week = [a("2026-11-02T10:00", "strength", "Legs"), a("2026-11-03T08:00", "strength", "Push"), a("2026-11-04T16:00", "strength", "Pull"),
    a("2026-11-05T09:00", "strength", "Legs"), a("2026-11-04T08:00", "run", "Laufband", 31)];
  assert.equal(F.minimumRest(F.weekMinimum(week, d("2026-11-06T12:00"), {})), "1× lockere Ausdauer, davon Schwimmen");
});

console.log(`\n${n} Tests bestanden.`);
