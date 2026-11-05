/* Tests für js/weekly.js – ausführen mit: node tests/weekly.test.js */
"use strict";
const assert = require("node:assert/strict");
const W = require("../js/weekly.js");
const Gym = require("../js/gym.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const d = (s) => new Date(s);
const flex = { active: true, from: "2026-10-27", until: "2027-01-10", minimum: { gym: 4, endurance: 2, enduranceMinMinutes: 30, swim: 1 } };
const noFlex = { ...flex, active: false };
const act = (date, cat, name, min, sport = { swim: "Swim", bike: "Ride", run: "Run", other: "RockClimbing" }[cat]) => ({ date: d(date), cat, sport, name, sec: min * 60 });
// Gym-Einheiten wie in der App: Titel → Gym.gymSessions (Split, Übung, Eintrag)
const gymSess = (list) => Gym.gymSessions(list.map(([start, name, min], i) => ({ id: String(i), start, name, desc: "", sec: min * 60 })), [], {});
const day = (date, o) => ({ date, ...o });
const sum = (o) => W.weeklySummary({ cfg: { flex: noFlex }, garminDays: [], ...o });
const hintKeys = (s) => s.hints.map((h) => h.key);

test("Standardwoche: Mo/Di die abgeschlossene Vorwoche, sonst die laufende", () => {
  const ws = (s) => { const m = W.defaultWeekStart(d(s)); return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`; };
  assert.equal(ws("2026-11-02T08:00"), "2026-10-26"); // Montag
  assert.equal(ws("2026-11-03T21:00"), "2026-10-26"); // Dienstag
  assert.equal(ws("2026-11-04T06:00"), "2026-11-02"); // Mittwoch
  assert.equal(ws("2026-11-08T23:00"), "2026-11-02"); // Sonntag
});

test("Wochengrenzen Mo–So nach lokaler Startzeit, „läuft noch“ nur für die laufende Woche", () => {
  const acts = [act("2026-11-01T23:30", "run", "So spät", 40), act("2026-11-02T00:10", "run", "Mo früh", 30), act("2026-11-08T23:50", "bike", "So", 60), act("2026-11-09T00:05", "bike", "nächste", 60)];
  const cur = sum({ acts, today: d("2026-11-05T20:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(cur.monday, "2026-11-02"); assert.equal(cur.sunday, "2026-11-08");
  assert.equal(cur.count, 2); assert.equal(cur.totalSec, 90 * 60); assert.equal(cur.running, true);
  const prev = sum({ acts, today: d("2026-11-05T20:00"), weekStart: d("2026-10-26T00:00") });
  assert.equal(prev.count, 1); assert.equal(prev.running, false);
});

test("Highlight-Priorität: neuer PR vor Wochen-Minimum vor längster Einheit", () => {
  const today = d("2026-11-10T12:00"), weekStart = d("2026-11-02T00:00");
  const g = gymSess([["2026-10-27T09:00", "Push 5x95", 60], ["2026-11-03T09:00", "Push 6x100", 60], ["2026-11-04T09:00", "Pull", 60], ["2026-11-05T09:00", "Legs", 60], ["2026-11-06T09:00", "Push", 60]]);
  const acts = [act("2026-11-02T08:00", "swim", "Pool", 40), act("2026-11-07T08:00", "run", "Lang", 95)];
  const cfg = { flex };
  const pr = W.weeklySummary({ acts, gymSessions: g, today, weekStart, cfg });
  assert.equal(pr.highlight.type, "pr");
  assert.equal(pr.highlight.text, "Neuer PR: Bankdrücken 6×100 kg (1RM 120 kg)");
  assert.equal(pr.minimum.ok, true);
  // ohne PR (gleiches Gewicht wie zuvor) → Minimum erfüllt
  const g2 = gymSess([["2026-10-27T09:00", "Push 6x100", 60], ["2026-11-03T09:00", "Push 6x100", 60], ["2026-11-04T09:00", "Pull", 60], ["2026-11-05T09:00", "Legs", 60], ["2026-11-06T09:00", "Push", 60]]);
  const mi = W.weeklySummary({ acts, gymSessions: g2, today, weekStart, cfg });
  assert.equal(mi.prs.length, 0); assert.equal(mi.highlight.type, "minimum");
  // Minimum nicht erfüllt (kein Schwimmen) → längste Einheit
  const lo = W.weeklySummary({ acts: acts.slice(1), gymSessions: g2, today, weekStart, cfg });
  assert.equal(lo.minimum.ok, false); assert.deepEqual(lo.minimum.missing, ["1× lockere Ausdauer", "1× Schwimmen"]);
  assert.equal(lo.highlight.type, "longest"); assert.equal(lo.highlight.text, "Längste Einheit: Lang · 1:35 h");
  // außerhalb von Flex gibt es kein Minimum
  assert.equal(W.weeklySummary({ acts, gymSessions: g2, today, weekStart, cfg: { flex: noFlex } }).minimum, null);
});

test("Training: Gym mit Splits und Einträgen, Ausdauer je Sportart, Vergleich mit Ø der 4 Wochen davor", () => {
  const g = gymSess([["2026-11-02T09:00", "Push 6x100 @Bali", 70], ["2026-11-03T09:00", "Pull · Latzug 8x90", 60], ["2026-11-04T09:00", "Legs", 80], ["2026-11-05T09:00", "Krafttraining", 50]]);
  const acts = [act("2026-11-02T18:00", "run", "Laufband", 30), act("2026-11-06T18:00", "run", "Lauf", 45), act("2026-11-07T10:00", "bike", "Zwift", 90, "VirtualRide"),
    // 4 Wochen davor: je 5 h
    ...[5, 12, 19, 26].map((x) => act(`2026-10-${String(x).padStart(2, "0")}T10:00`, "bike", "Rad", 300))];
  const s = sum({ acts, gymSessions: g, today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(s.gym.count, 4);
  assert.deepEqual([s.gym.splits.Push, s.gym.splits.Pull, s.gym.splits.Legs, s.gym.splits.ohne], [1, 1, 1, 1]);
  assert.deepEqual(s.gym.lifts.map((x) => x.text), ["Bankdrücken 6×100 kg @Bali", "Latzug 8×90 kg"]);
  assert.deepEqual(s.sports.map((x) => [x.cat, x.count, x.sec / 60]), [["bike", 1, 90], ["run", 2, 75]]);
  assert.equal(s.totalSec / 60, 70 + 60 + 80 + 50 + 30 + 45 + 90); // 425 min
  assert.equal(s.avg4Sec, 300 * 60);
  assert.equal(s.totalDiffPct, 42);
});

test("Erholung: Wochenschnitt mit Pfeil im Vergleich zur Vorwoche", () => {
  const garminDays = [
    day("2026-10-27", { sleepH: 7.0, sleepScore: 70, hrv: 70, rhr: 46 }), day("2026-10-28", { sleepH: 7.2, sleepScore: 74, hrv: 72, rhr: 46 }),
    day("2026-11-03", { sleepH: 8.0, sleepScore: 72, hrv: 66, rhr: 46 }), day("2026-11-04", { sleepH: 8.2, sleepScore: 72, hrv: 64, rhr: null }),
  ];
  const s = sum({ garminDays, today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  const r = Object.fromEntries(s.recovery.map((x) => [x.key, x]));
  assert.equal(r.sleepH.value, 8.1); assert.equal(r.sleepH.trend, "up");
  assert.equal(r.sleepScore.trend, "flat");
  assert.equal(r.hrv.value, 65); assert.equal(r.hrv.trend, "down");
  assert.equal(r.rhr.value, 46); assert.equal(r.rhr.trend, "flat");
});

test("Woche ohne Daten", () => {
  const s = sum({ today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(s.empty, true); assert.equal(s.count, 0); assert.equal(s.highlight, null);
  assert.deepEqual(s.sports, []); assert.equal(s.recovery, null); assert.equal(s.avg4Sec, null); assert.equal(s.totalDiffPct, null);
  assert.equal(s.gym.count, 0);
});

test("Hinweis Legs: greift ohne Legs, nicht mit Legs; „bisher“ in der laufenden Woche", () => {
  const today = d("2026-11-10T12:00"), weekStart = d("2026-11-02T00:00");
  const swim = [act("2026-11-03T08:00", "swim", "Pool", 40)];
  assert.ok(hintKeys(sum({ acts: swim, gymSessions: gymSess([["2026-11-03T09:00", "Push", 60]]), today, weekStart })).includes("legs"));
  assert.ok(!hintKeys(sum({ acts: swim, gymSessions: gymSess([["2026-11-03T09:00", "Leg Day", 60]]), today, weekStart })).includes("legs"));
  const running = sum({ acts: swim, today: d("2026-11-04T12:00"), weekStart });
  assert.equal(running.hints.find((h) => h.key === "legs").text, "Legs kam diese Woche bisher nicht vor.");
});

test("Hinweis Schwimmen: nur über der gelben Schwelle und wenn Pool/Meer möglich war", () => {
  const today = d("2026-11-10T12:00"), weekStart = d("2026-11-02T00:00"), legs = gymSess([["2026-11-03T09:00", "Legs", 60]]);
  const at = (iso) => sum({ acts: [act(iso, "swim", "Pool", 40)], gymSessions: legs, today, weekStart });
  assert.ok(!hintKeys(at("2026-10-25T08:00")).includes("swim"));  // 14 Tage bis So 08.11. = gelb, noch kein Hinweis
  const late = at("2026-10-24T08:00");                              // 15 Tage
  assert.equal(late.hints.find((h) => h.key === "swim").text, "Schwimmen ist 15 Tage her.");
  // eigene Schwelle aus sinceLast
  assert.ok(!hintKeys(W.weeklySummary({ acts: [act("2026-10-24T08:00", "swim", "Pool", 40)], gymSessions: legs, today, weekStart, cfg: { flex: noFlex, sinceLast: { swim: { yellow: 20 } } } })).includes("swim"));
  // Flex-Woche ohne Pool/Meer in der Ausstattung → kein Hinweis, mit Pool → Hinweis
  const fx = (equipment) => W.weeklySummary({ acts: [act("2026-10-24T08:00", "swim", "Pool", 40)], gymSessions: legs, today, weekStart, cfg: { flex }, equipment });
  assert.ok(!hintKeys(fx(["gym", "treadmill"])).includes("swim"));
  assert.ok(hintKeys(fx(["gym", "pool"])).includes("swim"));
});

test("Hinweis Erholung: nur wenn HRV > 10 % unter dem 4-Wochen-Schnitt UND Schlaf unter 7 h", () => {
  const today = d("2026-11-10T12:00"), weekStart = d("2026-11-02T00:00");
  const base = Array.from({ length: 28 }, (_, i) => { const x = new Date(2026, 9, 5 + i); return day(`2026-10-${String(x.getDate()).padStart(2, "0")}`, { hrv: 80, sleepH: 8 }); });
  const week = (hrv, sleepH) => [3, 4, 5].map((x) => day(`2026-11-0${x}`, { hrv, sleepH }));
  const keys = (hrv, sleepH, cfg) => hintKeys(sum({ garminDays: base.concat(week(hrv, sleepH)), today, weekStart, ...(cfg ? { cfg: { flex: noFlex, weekly: cfg } } : {}) }));
  assert.ok(keys(70, 6.5).includes("recovery"));    // −12,5 % und 6,5 h
  assert.ok(!keys(73, 6.5).includes("recovery"));   // nur −8,75 %
  assert.ok(!keys(70, 7.2).includes("recovery"));   // genug Schlaf
  assert.ok(!keys(70, 6.5, { hrvDropPct: 15 }).includes("recovery")); // Schwelle anpassbar
  const h = sum({ garminDays: base.concat(week(70, 6.5)), today, weekStart }).hints[0];
  assert.equal(h.text, "Erholung im Blick behalten: HRV 13 % unter dem 4-Wochen-Schnitt, Schlaf Ø 6:30 h.");
});

test("Hinweis Flex: Wochen bis zum Ende, nur in Flex-Wochen; höchstens 3 Hinweise", () => {
  const today = d("2026-11-10T12:00"), weekStart = d("2026-11-02T00:00");
  const s = W.weeklySummary({ today, weekStart, cfg: { flex }, equipment: ["gym", "pool"] });
  assert.deepEqual(hintKeys(s), ["legs", "swim", "flex"]);
  assert.equal(s.hints[2].text, "Noch 9 Wochen bis zum Ende der Flex-Phase.");   // 08.11. → 10.01.
  const last = W.weeklySummary({ today: d("2027-01-12T12:00"), weekStart: d("2027-01-04T00:00"), cfg: { flex }, equipment: ["gym"] });
  assert.equal(last.hints.find((x) => x.key === "flex").text, "Letzte Woche der Flex-Phase.");
  assert.ok(!hintKeys(W.weeklySummary({ today: d("2027-01-20T12:00"), weekStart: d("2027-01-11T00:00"), cfg: { flex } })).includes("flex"));
  // mit Erholungs-Hinweis sind es 4 Kandidaten → nur 3, Flex fällt weg
  const base = Array.from({ length: 28 }, (_, i) => { const x = new Date(2026, 9, 5 + i); return day(`2026-10-${String(x.getDate()).padStart(2, "0")}`, { hrv: 80, sleepH: 8 }); });
  const four = W.weeklySummary({ today, weekStart, cfg: { flex }, equipment: ["pool"], garminDays: base.concat([day("2026-11-03", { hrv: 60, sleepH: 6 })]) });
  assert.deepEqual(hintKeys(four), ["recovery", "legs", "swim"]);
});

/* ---------- Teil 2: Trainingsbelastung ---------- */
const gl = (start, type, load, id = start) => ({ id, start, type, sec: 3600, load });
// 4 Wochen vor der Zielwoche (02.11.) je 300 Belastung (zum Vergleich)
const base4 = [5, 12, 19, 26].map((x) => gl(`2026-10-${String(x).padStart(2, "0")}T10:00`, "running", 300));

test("Belastung: Summe Mo–So, Vergleich mit der Vorwoche, Aufteilung nach Ausdauer/Kraft/Sonstiges", () => {
  const acts = [act("2026-11-02T18:00", "run", "Lauf", 45), act("2026-11-04T10:00", "other", "Klettern", 120, "RockClimbing")];
  const g = gymSess([["2026-11-03T09:00", "Push", 60]]);
  const garminLoads = [
    gl("2026-11-02T18:01", "running", 80), gl("2026-11-03T09:02", "strength_training", 30),
    gl("2026-11-04T10:05", "strength_training", 40),           // Garmin: Kraft, Strava: Klettern → Sonstiges
    gl("2026-11-08T23:30", "cycling", 262),                     // Sonntag spät gehört noch dazu
    gl("2026-11-09T07:00", "cycling", 999),                     // nächste Woche
    gl("2026-10-28T10:00", "running", 356),                     // Vorwoche
  ];
  const s = sum({ acts, gymSessions: g, garminLoads, today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(s.load.sum, 412);
  assert.equal(s.load.prevSum, 356);
  assert.equal(s.load.diffPct, 16);
  assert.deepEqual(s.load.byCat, { strength: 30, endurance: 342, other: 40 });
  assert.equal(s.load.n, 4);
  // Wochenreihe fürs Diagramm: 8 Wochen, neueste zuerst; Zielwoche = Index 1
  assert.equal(s.load.weeks.length, 8); assert.equal(s.load.index, 1);
  assert.equal(s.load.weeks[1].monday, "2026-11-02"); assert.equal(Math.round(s.load.weeks[1].total), 412);
  assert.equal(s.load.weeks[0].total, 999);
});

test("Belastung: Einheiten ohne Garmin-Wert werden gezählt, nicht geschätzt", () => {
  const acts = [act("2026-11-02T18:00", "run", "Lauf", 45), act("2026-11-05T18:00", "bike", "Zwift", 60, "VirtualRide"), act("2026-11-06T07:00", "swim", "Pool", 40, "Swim")];
  const garminLoads = [gl("2026-11-02T18:00", "running", 80), gl("2026-11-06T07:01", "lap_swimming", null)];
  const s = sum({ acts, garminLoads, today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(s.load.sum, 80);            // nur der echte Wert
  assert.equal(s.load.withoutLoad, 2);     // Zwift ohne Garmin-Eintrag, Schwimmen ohne Wert
  // Woche ganz ohne Werte: keine Summe, aber Anzahl ohne Wert
  const none = sum({ acts, garminLoads: [gl("2026-09-01T10:00", "running", 50)], today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(none.load.sum, null); assert.equal(none.load.withoutLoad, 3); assert.equal(none.load.diffPct, null);
  // ganz ohne Garmin-Belastungsdaten gibt es keinen Belastungsblock
  assert.equal(sum({ acts, today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") }).load, null);
});

test("Belastung: Zuordnung über gleichen Tag + Sportart, wenn die Startzeit nicht passt", () => {
  // Strava-Lauf 18:55 (von Hand eingetragen), Garmin-Laufband 18:37 → dieselbe Einheit
  const acts = [act("2026-11-03T18:55", "run", "Laufband", 25), act("2026-11-03T08:45", "strength", "Push", 70, "WeightTraining")];
  const g = gymSess([["2026-11-03T08:45", "Push", 70]]);
  const garminLoads = [gl("2026-11-03T18:37", "treadmill_running", 70.7), gl("2026-11-03T08:46", "strength_training", 8)];
  const s = sum({ acts, gymSessions: g, garminLoads, today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(s.load.withoutLoad, 0);
  assert.equal(s.load.sum, 79);
  // andere Sportart am gleichen Tag (Garmin-Lauf, Strava-Rad) wird nicht zugeordnet
  const bike = sum({ acts: [act("2026-11-03T18:55", "bike", "Zwift", 60, "VirtualRide")], garminLoads: [gl("2026-11-03T07:00", "running", 50)], today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.equal(bike.load.withoutLoad, 1); assert.equal(bike.load.sum, 50);
  // jede Einheit nur einmal: zwei Garmin-Läufe, ein Strava-Lauf → der zweite bleibt Garmin-only (zählt trotzdem zur Summe)
  const two = W.pairLoads([gl("2026-11-03T07:00", "running", 40), gl("2026-11-03T19:00", "running", 30)], [act("2026-11-03T12:00", "run", "Lauf", 30)], []);
  assert.equal(two.sessions.filter((x) => x.loaded).length, 1); assert.equal(two.loads.length, 2);
});

test("Belastung: akut/chronisch mit Garmins Status vom letzten Tag der Woche", () => {
  const garminDays = [day("2026-11-05", { acuteLoad: 280, chronicLoad: 360, loadRatio: 0.78, loadStatus: "LOW" }), day("2026-11-07", { acuteLoad: 299, chronicLoad: 373, loadRatio: 0.8, loadStatus: "OPTIMAL" }), day("2026-11-09", { acuteLoad: 500 })];
  const s = sum({ garminDays, garminLoads: [gl("2026-11-03T10:00", "running", 50)], today: d("2026-11-10T12:00"), weekStart: d("2026-11-02T00:00") });
  assert.deepEqual([s.load.acute, s.load.chronic, s.load.ratio, s.load.status, s.load.statusDate], [299, 373, 0.8, "OPTIMAL", "2026-11-07"]);
});

test("Hinweis Belastung: über dem 1,5-Fachen des 4-Wochen-Schnitts, nur mit Daten in allen 4 Wochen", () => {
  const today = d("2026-11-10T12:00"), weekStart = d("2026-11-02T00:00");
  const legs = gymSess([["2026-11-03T09:00", "Legs", 60]]), swim = [act("2026-11-03T07:00", "swim", "Pool", 40, "Swim")];
  const run = (load, extra = base4, cfg) => W.weeklySummary({ acts: swim, gymSessions: legs, today, weekStart, garminLoads: extra.concat([gl("2026-11-04T10:00", "running", load)]), cfg: { flex: noFlex, weekly: cfg } });
  assert.ok(hintKeys(run(451)).includes("load"));     // > 450 = 1,5 × 300
  assert.ok(!hintKeys(run(450)).includes("load"));
  assert.ok(!hintKeys(run(451, base4.slice(1))).includes("load"));   // eine der 4 Wochen ohne Werte → keine Aussage
  assert.ok(!hintKeys(run(451, base4, { loadFactor: 2 })).includes("load"));
  assert.equal(run(451).hints.find((h) => h.key === "load").text, "Belastung deutlich gestiegen. Umfang langsam aufbauen.");
  // Reihenfolge: Erholung vor Belastung vor Legs
  const base = Array.from({ length: 28 }, (_, i) => { const x = new Date(2026, 9, 5 + i); return day(`2026-10-${String(x.getDate()).padStart(2, "0")}`, { hrv: 80, sleepH: 8 }); });
  const s = W.weeklySummary({ today, weekStart, cfg: { flex: noFlex }, garminDays: base.concat([day("2026-11-03", { hrv: 60, sleepH: 6 })]), garminLoads: base4.concat([gl("2026-11-04T10:00", "running", 600)]) });
  assert.deepEqual(hintKeys(s), ["recovery", "load", "legs"]);
});

console.log(`\n${n} Tests bestanden.`);
