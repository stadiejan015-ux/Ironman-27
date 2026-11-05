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

test("Garmin-„Krafttraining“, das in Strava Klettern ist, zählt nicht als Gym", () => {
  const sessions = G.gymSessions(
    [{ start: "2026-10-18T11:04", name: "Krafttraining" }, { start: "2026-11-02T10:35", name: "Krafttraining" }],
    [{ date: new Date("2026-11-02T10:35"), name: "Leg Day" }],
    undefined,
    [{ date: new Date("2026-10-18T11:04"), name: "Klettern Kalymnos" }],
  );
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].split, "Legs");   // Garmin-Titel unbrauchbar → Strava-Name „Leg Day“
});

test("Strava-Beschreibung wird geprüft (Titel ohne Split, „Push“ in der Beschreibung)", () => {
  const sessions = G.gymSessions(
    [{ start: "2026-10-30T15:00", name: "Krafttraining" }],
    [{ date: new Date("2026-10-30T15:00"), name: "Maxed out Abu Dhabi Gym", desc: "Push" },
     { date: new Date("2026-10-26T10:15"), name: "Gewichtstraining am Morgen", desc: "Push · Bankdrücken 6x95" }],
  );
  assert.deepEqual(sessions.map((x) => x.split), ["Push", "Push"]);
  assert.equal(sessions[0].parsed.weight, 95);
});

/* ---------- Doppelte Progression ---------- */
// Einheiten wie in der App: Garmin-Titel → gymSessions (Split, Übung, Eintrag, Ort)
const sess = (list) => G.gymSessions(list.map(([start, name], i) => ({ id: String(i), start, name, desc: "", sec: 3600 })), [], {});
const day = (i) => `2026-10-${String(1 + i).padStart(2, "0")}T09:00`;
const bench = G.progOf("Bankdrücken"), lat = G.progOf("Latzug"), leg = G.progOf("Beinpresse");

test("Progression: Startwerte je Übung, anpassbar über cfg.progression", () => {
  assert.deepEqual([bench.reps, bench.step, lat.reps, lat.step, leg.reps, leg.step, bench.stagnation], [[6, 8], 2.5, [8, 12], 5, [8, 12], 10, 3]);
  const own = G.progOf("Bankdrücken", { progression: { "Bankdrücken": { reps: [5, 7] }, stagnation: 4 } });
  assert.deepEqual([own.reps, own.step, own.stagnation], [[5, 7], 2.5, 4]);
});

test("Nächstes Ziel: oberes Ende → schwerer, im Bereich → 1 Wdh. mehr, darunter → unteres Ende", () => {
  assert.deepEqual(G.nextTarget({ sets: 1, reps: 8, weight: 100 }, bench), { sets: 1, reps: 6, weight: 102.5, rule: "up" });
  assert.deepEqual(G.nextTarget({ sets: 1, reps: 9, weight: 100 }, bench), { sets: 1, reps: 6, weight: 102.5, rule: "up" });   // darüber
  assert.deepEqual(G.nextTarget({ sets: 1, reps: 6, weight: 100 }, bench), { sets: 1, reps: 7, weight: 100, rule: "rep" });
  assert.deepEqual(G.nextTarget({ sets: 1, reps: 7, weight: 82.5 }, bench), { sets: 1, reps: 8, weight: 82.5, rule: "rep" });
  assert.deepEqual(G.nextTarget({ sets: 1, reps: 4, weight: 105 }, bench), { sets: 1, reps: 6, weight: 105, rule: "low" });
});

test("Nächstes Ziel bei Sätzen: gilt pro Satz, Satzzahl bleibt", () => {
  assert.deepEqual(G.nextTarget({ sets: 3, reps: 10, weight: 180 }, leg), { sets: 3, reps: 11, weight: 180, rule: "rep" });
  assert.deepEqual(G.nextTarget({ sets: 3, reps: 12, weight: 180 }, leg), { sets: 3, reps: 8, weight: 190, rule: "up" });
  const plan = G.liftPlan(sess([[day(0), "Legs 3x10x180 @Bali"]]), "Beinpresse", {});
  assert.deepEqual(plan.target, { sets: 3, reps: 11, weight: 180, rule: "rep" });
});

test("Ort-Logik Maschinen: nur Einträge vom aktuellen Ort, kein Übertrag von anderen Orten", () => {
  // Latzug in Abu Dhabi, danach Gym-Einheit in Bali ohne Latzug-Eintrag → aktueller Ort Bali
  const s1 = sess([[day(0), "Pull · Latzug 10x80 @Abu Dhabi"], [day(2), "Push @Bali"]]);
  assert.equal(G.currentPlace(s1), "Bali");
  const p1 = G.liftPlan(s1, "Latzug", {});
  assert.equal(p1.place, "Bali"); assert.equal(p1.noEntryAtPlace, true); assert.equal(p1.target, null); assert.equal(p1.last, null);
  // erster Eintrag in Bali: Ziel nur daraus, nicht aus Abu Dhabi
  const s2 = sess([[day(0), "Pull · Latzug 12x80 @Abu Dhabi"], [day(2), "Pull · Latzug 8x60 @Bali"]]);
  const p2 = G.liftPlan(s2, "Latzug", {});
  assert.deepEqual(p2.target, { sets: 1, reps: 9, weight: 60, rule: "rep" });
  assert.equal(p2.entries.length, 1); assert.equal(p2.reached, false); assert.equal(p2.prevTarget, null);
  // Bankdrücken ist keine Maschine: zählt über alle Orte
  const s3 = sess([[day(0), "Push 7x100 @Abu Dhabi"], [day(2), "Legs @Bali"]]);
  assert.deepEqual(G.liftPlan(s3, "Bankdrücken", {}).target, { sets: 1, reps: 8, weight: 100, rule: "rep" });
  // gar kein Eintrag
  const p4 = G.liftPlan(sess([[day(0), "Pull @Bali"]]), "Latzug", {});
  assert.equal(p4.noEntries, true); assert.equal(p4.noEntryAtPlace, false);
});

test("„Ziel erreicht“: neuester Eintrag erreicht oder übertrifft das Ziel aus dem Eintrag davor", () => {
  const plan = (titles) => G.liftPlan(sess(titles.map((t, i) => [day(i), t])), "Bankdrücken", {});
  assert.equal(plan(["Push 6x100", "Push 7x100"]).reached, true);        // Ziel 7×100 genau
  assert.equal(plan(["Push 6x100", "Push 8x100"]).reached, true);        // übertroffen
  assert.equal(plan(["Push 8x100", "Push 6x102,5"]).reached, true);      // nach Erhöhung
  assert.equal(plan(["Push 6x100", "Push 6x105"]).reached, true);        // schwerer, Wdh. im Bereich
  assert.equal(plan(["Push 6x100", "Push 6x100"]).reached, false);
  assert.equal(plan(["Push 6x100", "Push 4x110"]).reached, false);       // schwerer, aber unter dem Bereich
  assert.equal(plan(["Push 6x100"]).reached, false);                     // kein vorheriges Ziel
  const sets = G.liftPlan(sess([[day(0), "Legs 3x10x180"], [day(1), "Legs 2x11x180"]]), "Beinpresse", {});
  assert.equal(sets.reached, false);                                     // ein Satz zu wenig
  const checks = G.targetChecks(sess([[day(0), "Push 6x100"], [day(1), "Push 7x100"], [day(2), "Push 7x100"]]), "Bankdrücken", {});
  assert.deepEqual(checks.map((x) => x.reached), [null, true, false]);
});

test("Stagnation: kein neues bestes 1RM in den letzten 3 Einträgen (Maschinen am selben Ort)", () => {
  const plan = (titles, ex = "Bankdrücken") => G.liftPlan(sess(titles.map((t, i) => [day(i), t])), ex, {});
  assert.equal(plan(["Push 7x100", "Push 6x100", "Push 7x100", "Push 6x100"]).stagnation, true);
  assert.equal(plan(["Push 7x100", "Push 6x100", "Push 8x100", "Push 6x100"]).stagnation, false);   // 8×100 = neues 1RM
  assert.equal(plan(["Push 7x100", "Push 6x100", "Push 7x100"]).stagnation, false);                 // erst 2 Einträge nach dem Bestwert
  // Maschine: Fortschritt an einem anderen Ort zählt nicht, Stillstand dort auch nicht
  const lat4 = ["Pull · Latzug 10x80 @Bali", "Pull · Latzug 9x80 @Bali", "Pull · Latzug 12x90 @Abu Dhabi", "Pull · Latzug 10x80 @Bali", "Pull · Latzug 10x80 @Bali"];
  const p = plan(lat4, "Latzug");
  assert.equal(p.place, "Bali"); assert.equal(p.entries.length, 4); assert.equal(p.stagnation, true);
  // Schwelle anpassbar
  assert.equal(G.liftPlan(sess(["Push 7x100", "Push 6x100", "Push 7x100", "Push 6x100"].map((t, i) => [day(i), t])), "Bankdrücken", { progression: { stagnation: 4 } }).stagnation, false);
});

console.log(`\n${n} Tests bestanden.`);
