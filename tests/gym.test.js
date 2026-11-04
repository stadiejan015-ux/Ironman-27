/* Tests für js/gym.js – ausführen mit: node tests/gym.test.js */
"use strict";
const assert = require("node:assert/strict");
const G = require("../js/gym.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const P = (t, d) => G.parseGymTitle(t, d);

test("Parser: alle Beispielformate", () => {
  assert.deepEqual(P("Push 6x100"), { split: "Push", exercise: "Bankdrücken", sets: 1, reps: 6, weight: 100, place: null, entry: true });
  assert.deepEqual(P("Pull · Latzug 8x90"), { split: "Pull", exercise: "Latzug", sets: 1, reps: 8, weight: 90, place: null, entry: true });
  assert.deepEqual(P("Legs 3x10x180"), { split: "Legs", exercise: "Beinpresse", sets: 3, reps: 10, weight: 180, place: null, entry: true });
  assert.deepEqual(P("Push 6x100 @Bali"), { split: "Push", exercise: "Bankdrücken", sets: 1, reps: 6, weight: 100, place: "Bali", entry: true });
  assert.deepEqual(P("Push"), { split: "Push", exercise: "Bankdrücken", sets: null, reps: null, weight: null, place: null, entry: false });
});

test("Parser: Schreibweisen, kg, Komma-Dezimalen, Aliase", () => {
  assert.equal(P("push 6 x 82,5 kg").weight, 82.5);
  assert.equal(P("LEG DAY 3×10×180kg").split, "Legs");
  assert.equal(P("Beine 12x200").exercise, "Beinpresse");
  assert.deepEqual([P("Bench 5x100").split, P("Bench 5x100").exercise], ["Push", "Bankdrücken"]);
  assert.deepEqual([P("Lat Pulldown 10x70").split, P("Lat Pulldown 10x70").exercise], ["Pull", "Latzug"]);
  assert.equal(P("Leg Press 3x12x160 @Gold's Gym Canggu").place, "Gold's Gym Canggu");
  assert.equal(P("Pull · Lat 8x90.5").weight, 90.5);
});

test("Parser: Beschreibung wird geprüft, Unbekanntes zählt als Einheit ohne Eintrag", () => {
  assert.deepEqual(P("Push", "Bankdrücken 6x100 @Bali"), { split: "Push", exercise: "Bankdrücken", sets: 1, reps: 6, weight: 100, place: "Bali", entry: true });
  assert.equal(P("Gym Bali"), null);
  assert.equal(P("Gewichtstraining am Morgen", "war gut"), null);
  assert.equal(P("Push heute ohne Zahlen").entry, false);
});

test("1RM nach Epley: Gewicht × (1 + Wdh./30)", () => {
  assert.equal(G.epley(100, 6), 120);
  assert.equal(G.epley(90, 8), 114);
  assert.ok(Math.abs(G.epley(82.5, 10) - 110) < 1e-9);
});

test("PR: Bankdrücken über alle Orte, Maschinen nur am selben Ort", () => {
  const s = (start, name) => ({ start, name, desc: "", sec: 3600 });
  const sessions = G.gymSessions([
    s("2026-11-01T10:00", "Push 6x100 @Bali"),     // 120
    s("2026-11-03T10:00", "Push 5x105 @Kuta"),     // 122,5 → PR (über alle Orte)
    s("2026-11-02T10:00", "Pull · Latzug 8x90 @Bali"),   // 114
    s("2026-11-05T10:00", "Pull · Latzug 8x100 @Kuta"),  // 126,7 – anderer Ort, erster Eintrag dort → kein PR
    s("2026-11-08T10:00", "Pull · Latzug 10x90 @Bali"),  // 120 → PR am Ort Bali
    s("2026-11-09T10:00", "Pull · Latzug 8x80"),         // ohne Ort → „unbekannt“, erster Eintrag
  ], []);
  const bench = G.exerciseHistory(sessions, "Bankdrücken");
  assert.deepEqual(bench.map((e) => [e.e1rm, e.pr]), [[120, false], [122.5, true]]);
  const lat = G.exerciseHistory(sessions, "Latzug");
  assert.deepEqual(lat.map((e) => [e.place, e.pr, e.first]), [["Bali", false, true], ["Kuta", false, true], ["Bali", true, false], ["unbekannt", false, true]]);
});

test("Einheiten: Garmin-Titel vor Strava-Namen (±10 min), Strava-only bleibt erhalten", () => {
  const sessions = G.gymSessions(
    [{ start: "2026-11-03T08:45", name: "Push 6x100 @Bali", desc: "", sec: 4297 }],
    [{ date: new Date("2026-11-03T08:48"), name: "Push", sec: 4300 }, { date: new Date("2026-11-02T10:35"), name: "Leg Day", sec: 5911 }],
  );
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((x) => [x.source, x.split]), [["Strava", "Legs"], ["Garmin", "Push"]]);
  assert.equal(sessions[1].parsed.weight, 100);
});

test("Split-Zählung pro Zeitraum", () => {
  const sessions = G.gymSessions([
    { start: "2026-11-02T10:00", name: "Legs" }, { start: "2026-11-03T10:00", name: "Push" },
    { start: "2026-11-04T10:00", name: "Pull" }, { start: "2026-11-05T10:00", name: "Gym Bali" },
    { start: "2026-10-28T10:00", name: "Push" },
  ], []);
  assert.deepEqual(G.splitCounts(sessions, "2026-11-02", "2026-11-08"), { Push: 1, Pull: 1, Legs: 1, ohne: 1, total: 4 });
});

console.log(`\n${n} Tests bestanden.`);
