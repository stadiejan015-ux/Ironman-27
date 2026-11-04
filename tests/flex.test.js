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

console.log(`\n${n} Tests bestanden.`);
