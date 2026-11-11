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

test("PR: standardmäßig alle Hauptübungen über alle Orte; mit gym.perPlace Maschinen nur am selben Ort", () => {
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
  // Standard (perPlace leer): Latzug über alle Orte – 8×100 in Kuta ist PR, 10×90 in Bali danach nicht mehr
  const lat = G.exerciseHistory(sessions, "Latzug");
  assert.deepEqual(lat.map((e) => [e.place, e.pr, e.compareKey]), [["Bali", false, "alle"], ["Kuta", true, "alle"], ["Bali", false, "alle"], ["unbekannt", false, "alle"]]);
  // mit perPlace: nur am selben Ort
  const latP = G.exerciseHistory(sessions, "Latzug", { perPlace: ["Latzug", "Beinpresse"] });
  assert.deepEqual(latP.map((e) => [e.place, e.pr, e.first]), [["Bali", false, true], ["Kuta", false, true], ["Bali", true, false], ["unbekannt", false, true]]);
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

test("Standard: nächstes Ziel aus dem letzten Eintrag, egal an welchem Ort", () => {
  const s = sess([[day(0), "Pull · Latzug 7x80 @Abu Dhabi"], [day(2), "Push @Bali"]]);
  const p = G.liftPlan(s, "Latzug", {});
  assert.equal(p.perPlace, false); assert.equal(p.place, null); assert.equal(p.noEntryAtPlace, false);
  assert.deepEqual(p.target, { sets: 1, reps: 8, weight: 80, rule: "low" });   // Standardbereich Latzug 8–12 → 7 Wdh. liegen darunter
  const s2 = sess([[day(0), "Legs 10x240 @Abu Dhabi"], [day(2), "Legs 8x200 @Bali"]]);
  const p2 = G.liftPlan(s2, "Beinpresse", {});
  assert.equal(p2.entries.length, 2); assert.equal(p2.last.place, "Bali");
});

const PP = { perPlace: ["Latzug", "Beinpresse"] };
test("Mit gym.perPlace: nur Einträge vom aktuellen Ort, kein Übertrag von anderen Orten", () => {
  // Latzug in Abu Dhabi, danach Gym-Einheit in Bali ohne Latzug-Eintrag → aktueller Ort Bali
  const s1 = sess([[day(0), "Pull · Latzug 10x80 @Abu Dhabi"], [day(2), "Push @Bali"]]);
  assert.equal(G.currentPlace(s1), "Bali");
  const p1 = G.liftPlan(s1, "Latzug", PP);
  assert.equal(p1.place, "Bali"); assert.equal(p1.noEntryAtPlace, true); assert.equal(p1.target, null); assert.equal(p1.last, null);
  // erster Eintrag in Bali: Ziel nur daraus, nicht aus Abu Dhabi
  const s2 = sess([[day(0), "Pull · Latzug 12x80 @Abu Dhabi"], [day(2), "Pull · Latzug 8x60 @Bali"]]);
  const p2 = G.liftPlan(s2, "Latzug", PP);
  assert.deepEqual(p2.target, { sets: 1, reps: 9, weight: 60, rule: "rep" });
  assert.equal(p2.entries.length, 1); assert.equal(p2.reached, false); assert.equal(p2.prevTarget, null);
  // Bankdrücken ist keine Maschine: zählt über alle Orte
  const s3 = sess([[day(0), "Push 7x100 @Abu Dhabi"], [day(2), "Legs @Bali"]]);
  assert.deepEqual(G.liftPlan(s3, "Bankdrücken", PP).target, { sets: 1, reps: 8, weight: 100, rule: "rep" });
  // gar kein Eintrag
  const p4 = G.liftPlan(sess([[day(0), "Pull @Bali"]]), "Latzug", PP);
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

test("Stagnation: kein neues bestes 1RM in den letzten 3 Einträgen (Standard über alle Orte, mit perPlace am selben Ort)", () => {
  const plan = (titles, ex = "Bankdrücken", cfg = {}) => G.liftPlan(sess(titles.map((t, i) => [day(i), t])), ex, cfg);
  assert.equal(plan(["Push 7x100", "Push 6x100", "Push 7x100", "Push 6x100"]).stagnation, true);
  assert.equal(plan(["Push 7x100", "Push 6x100", "Push 8x100", "Push 6x100"]).stagnation, false);   // 8×100 = neues 1RM
  assert.equal(plan(["Push 7x100", "Push 6x100", "Push 7x100"]).stagnation, false);                 // erst 2 Einträge nach dem Bestwert
  const lat4 = ["Pull · Latzug 10x80 @Bali", "Pull · Latzug 9x80 @Bali", "Pull · Latzug 12x90 @Abu Dhabi", "Pull · Latzug 10x80 @Bali", "Pull · Latzug 10x80 @Bali"];
  // Standard: 12×90 in Abu Dhabi ist ein neues bestes 1RM (über alle Orte) → danach erst 2 Einträge, keine Stagnation
  const all = plan(lat4, "Latzug");
  assert.equal(all.entries.length, 5); assert.equal(all.stagnation, false);
  // mit perPlace: Fortschritt an einem anderen Ort zählt nicht
  const p = plan(lat4, "Latzug", PP);
  assert.equal(p.place, "Bali"); assert.equal(p.entries.length, 4); assert.equal(p.stagnation, true);
  // Schwelle anpassbar
  assert.equal(G.liftPlan(sess(["Push 7x100", "Push 6x100", "Push 7x100", "Push 6x100"].map((t, i) => [day(i), t])), "Bankdrücken", { progression: { stagnation: 4 } }).stagnation, false);
});

test("1RM-Ziel: bestes geschätztes 1RM, Prozent, erreicht; ohne Ziel nichts", () => {
  const goals = { goals: { "Bankdrücken": 100, "Latzug": 140, "Beinpresse": 300 } };
  const s = sess([[day(0), "Push 6x80"], [day(1), "Push 5x85 @Bali"], [day(2), "Push 8x75"]]);
  const gp = G.goalProgress(s, "Bankdrücken", goals);
  assert.equal(gp.goal, 100);
  assert.equal(gp.current, 99.2);                 // 85 × (1 + 5/30) = 99,17 – bester Eintrag, ortsübergreifend
  assert.equal(gp.best.weight, 85); assert.equal(gp.pct, 99); assert.equal(gp.reached, false); assert.equal(gp.place, null);
  const done = G.goalProgress(sess([[day(0), "Push 6x84"]]), "Bankdrücken", goals);   // 84 × 1,2 = 100,8
  assert.equal(done.reached, true); assert.equal(done.pct, 101);
  // kein Ziel konfiguriert → null
  assert.equal(G.goalProgress(s, "Bankdrücken", {}), null);
  assert.equal(G.goalProgress(s, "Bankdrücken", { goals: { "Latzug": 140 } }), null);
});

test("1RM-Ziel: Standard bestes 1RM über alle Orte; mit perPlace nur der aktuelle Ort", () => {
  const s = sess([[day(0), "Legs 10x240 @Abu Dhabi"], [day(2), "Legs 8x200 @Bali"]]);
  const all = G.goalProgress(s, "Beinpresse", { goals: { "Beinpresse": 300 } });
  assert.equal(all.perPlace, false); assert.equal(all.place, null);
  assert.equal(all.current, 320); assert.equal(all.pct, 107); assert.equal(all.reached, true);   // 240 × (1 + 10/30) aus Abu Dhabi
  const goals = { goals: { "Beinpresse": 300 }, ...PP };
  const gp = G.goalProgress(s, "Beinpresse", goals);
  assert.equal(gp.place, "Bali"); assert.equal(gp.perPlace, true);
  assert.equal(gp.current, 253.3); assert.equal(gp.pct, 84);   // 200 × (1 + 8/30), nicht die 320 aus Abu Dhabi
  // aktueller Ort ohne Eintrag → kein aktueller Wert
  const none = G.goalProgress(sess([[day(0), "Legs 10x240 @Abu Dhabi"], [day(2), "Push @Bali"]]), "Beinpresse", goals);
  assert.equal(none.place, "Bali"); assert.equal(none.current, null); assert.equal(none.pct, 0); assert.equal(none.reached, false);
});

test("Anzeigename: Garmin-Titel bei Krafteinheiten, sonst Strava-Name", () => {
  const garmin = [
    { start: "2026-11-04T16:53", name: "Krafttraining", sec: 4436 },        // nur generisch → Strava-Name
    { start: "2026-11-06T09:51", name: "Push 5×70kg @Bali", sec: 5727 },    // erkannter Gym-Titel → Garmin
    { start: "2026-11-07T18:00", name: "Pull @Bali", sec: 3600 },
  ];
  const strava = [
    { date: new Date("2026-11-04T16:53"), name: "Pull", sec: 4436 },
    { date: new Date("2026-11-06T09:55"), name: "Pull", sec: 5727 },        // 4 min daneben → gleiche Einheit
    { date: new Date("2026-11-08T08:00"), name: "Gewichtstraining am Morgen", sec: 3000 },   // ohne Garmin-Einheit
    { date: new Date("2026-11-07T18:20"), name: "Abendtraining", sec: 3600 },               // 20 min daneben → nicht dieselbe
  ];
  const sessions = G.gymSessions(garmin, strava, {});
  assert.equal(G.displayName(strava[0], sessions), "Pull");
  assert.equal(G.displayName(strava[1], sessions), "Push 5×70kg @Bali");
  assert.equal(G.displayName(strava[2], sessions), "Gewichtstraining am Morgen");
  assert.equal(G.displayName(strava[3], sessions), "Abendtraining");
  assert.equal(G.displayName({ date: new Date("2026-11-06T09:51"), name: "Pull" }, []), "Pull");   // ohne Garmin-Daten
});

test("Weighted Pull-ups: Hauptübung für Pull, 1RM mit Körpergewicht, Ziel 50 kg Zusatz", () => {
  // Konfiguration wie in js/data.js
  global.window = {}; delete require.cache[require.resolve("../js/data.js")]; require("../js/data.js");
  const cfg = { ...global.window.TRAINING.gym, bodyKg: 73.9 };
  const p = (t) => G.parseGymTitle(t, "", cfg);
  assert.deepEqual(p("Pull 5x20 @Ubud"), { split: "Pull", exercise: "Weighted Pull-ups", sets: 1, reps: 5, weight: 20, place: "Ubud", entry: true });
  assert.equal(p("Weighted Pull-ups 3x5x15").exercise, "Weighted Pull-ups");
  assert.equal(p("Pull ups 8x10").exercise, "Weighted Pull-ups");
  assert.equal(p("Klimmzüge 6x12,5").weight, 12.5);
  assert.equal(p("Pull · Latzug 8x90").exercise, "Latzug");   // Latzug bleibt Latzug, zählt nicht als Klimmzug
  // 1RM: (73,9 + 20) × (1 + 5/30) − 73,9 = 35,65 statt 23,3 (nur Zusatzgewicht)
  assert.ok(Math.abs(G.oneRepMax(20, 5, 73.9) - 35.65) < 0.01);
  assert.ok(Math.abs(G.oneRepMax(20, 5, 0) - G.epley(20, 5)) < 1e-9);   // ohne Körpergewicht wie Epley
  assert.ok(Math.abs(G.oneRepMax(50, 1, 73.9) - 54.13) < 0.01);         // 1 Wdh. mit 50 kg ≈ Ziel erreicht
  const s = G.gymSessions([
    { id: "1", start: "2026-11-12T10:00", name: "Pull 5x20 @Ubud", desc: "", sec: 3600 },
    { id: "2", start: "2026-11-15T10:00", name: "Pull 6x20 @Ubud", desc: "", sec: 3600 },
    { id: "3", start: "2026-11-16T10:00", name: "Push 6x100", desc: "", sec: 3600 },
  ], [], cfg);
  const h = G.exerciseHistory(s, "Weighted Pull-ups", cfg);
  assert.deepEqual(h.map((e) => e.e1rm), [35.7, 38.8]);
  assert.equal(h[1].pr, true);
  assert.equal(G.exerciseHistory(s, "Bankdrücken", cfg)[0].e1rm, 120);   // andere Übungen unverändert (Epley)
  const gp = G.goalProgress(s, "Weighted Pull-ups", cfg);
  assert.equal(gp.goal, 50); assert.equal(Math.round(gp.current), 39); assert.equal(gp.reached, false);
  const plan = G.liftPlan(s, "Weighted Pull-ups", cfg);
  assert.deepEqual([plan.target.reps, plan.target.weight], [7, 20]);   // 5–8 Wdh., dann +2,5 kg
});

test("Körpergewicht: der neuere Wert aus Garmin-Waage und eigenem Eintrag", () => {
  const days = [{ date: "2026-10-02", weight: 74.7 }, { date: "2026-10-10", weight: 73.9 }, { date: "2026-11-01" }];
  const own = { kg: 75, date: "2026-11-11" };
  assert.deepEqual(G.currentBodyKg(days, own, 73), { kg: 75, date: "2026-11-11", source: "eigener Eintrag" });
  assert.deepEqual(G.currentBodyKg(days.concat({ date: "2026-11-20", weight: 74.2 }), own, 73), { kg: 74.2, date: "2026-11-20", source: "Garmin" });   // neuere Waage gewinnt
  assert.equal(G.currentBodyKg([{ date: "2026-11-11", weight: 76 }], own).source, "eigener Eintrag");   // gleicher Tag: eigener Eintrag
  assert.deepEqual(G.currentBodyKg(days, null, 73), { kg: 73.9, date: "2026-10-10", source: "Garmin" });
  assert.deepEqual(G.currentBodyKg([], null, 73), { kg: 73, date: null, source: "Strava-Profil" });
  assert.equal(G.currentBodyKg([], null, null), null);
  assert.ok(Math.abs(G.oneRepMax(20, 5, 75) - 35.83) < 0.01);   // 5 × 20 kg bei 75 kg
});

console.log(`\n${n} Tests bestanden.`);
