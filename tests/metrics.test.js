/* Tests für js/metrics.js (Kennzahlen-Register, Zeiträume, Zusammenfassungen) – ausführen mit: node tests/metrics.test.js */
"use strict";
const assert = require("node:assert/strict");
const M = require("../js/metrics.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const TODAY = "2026-11-06";
// 93 Tage Garmin-Daten wie im Repo (06.08.–06.11.), HRV steigt langsam, einzelne Lücken
const days = [];
for (let i = 92; i >= 0; i--) {
  const date = M.addDays(TODAY, -i);
  const d = { date, hrv: 60 + Math.round((92 - i) / 6), rhr: 46, steps: 8000 + (i % 3) * 1000, sleepScore: 70 + (i % 30) };
  if (i === 3 || i === 10) delete d.hrv;   // fehlende Nächte
  days.push(d);
}

test("Register: alle Start-Kennzahlen mit Pflichtfeldern", () => {
  const keys = M.REGISTRY.map((m) => m.key);
  for (const k of ["sleep", "sleepScore", "hrv", "rhr", "bodyBattery", "stress", "readiness", "load", "vo2run", "vo2bike", "weight", "steps"]) assert.ok(keys.includes(k), k);
  for (const m of M.REGISTRY) {
    assert.ok(m.name && m.cat && m.field && m.tab, m.key);
    assert.ok(["avg", "sum", "last"].includes(m.summary), m.key);
    assert.ok(m.about && m.about.length > 20, `Über-Text ${m.key}`);
  }
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(M.byKey.sleepScore.clamp, [0, 100]);
});

test("Zeiträume 7/30/60/Alle: richtige Grenzen und Länge", () => {
  assert.deepEqual(M.windowOf("7", TODAY), { from: "2026-10-31", to: TODAY, days: 7 });
  assert.deepEqual(M.windowOf("30", TODAY), { from: "2026-10-08", to: TODAY, days: 30 });
  assert.deepEqual(M.windowOf("60", TODAY), { from: "2026-09-08", to: TODAY, days: 60 });
  assert.deepEqual(M.windowOf("all", TODAY, "2026-08-06"), { from: "2026-08-06", to: TODAY, days: 93 });
  const pts = M.series(days, "rhr");
  assert.equal(M.inWindow(pts, M.windowOf("7", TODAY)).length, 7);
  assert.equal(M.inWindow(pts, M.windowOf("30", TODAY)).length, 30);
  assert.equal(M.inWindow(pts, M.windowOf("all", TODAY, pts[0].date)).length, 93);
  assert.deepEqual(M.previousWindow(M.windowOf("7", TODAY)), { from: "2026-10-24", to: "2026-10-30", days: 7 });
  // Monatswechsel und Zeitumstellung (25.10.) ohne Verschiebung
  assert.equal(M.addDays("2026-10-24", 2), "2026-10-26");
});

test("Fehlende Tage: Statistik nur über vorhandene Werte, Tagesreihe mit Lücken", () => {
  const pts = M.series(days, "hrv");
  const w = M.windowOf("7", TODAY);
  const inW = M.inWindow(pts, w);
  assert.equal(inW.length, 6);                                   // 03.11. fehlt
  const dl = M.daily(pts, w);
  assert.equal(dl.length, 7);
  assert.equal(dl.find((x) => x.date === "2026-11-03").v, null);
  const s = M.stats(dl);
  assert.equal(s.n, 6);                                          // null zählt nicht mit
  assert.equal(M.stats([]), null);
  assert.equal(M.summarize([], "avg"), null);
  assert.equal(M.stats([{ date: "2026-11-01", v: null }]), null);
});

test("Zusammenfassung per Durchschnitt, Summe und letztem Wert; Minimum/Maximum mit Datum", () => {
  const pts = [{ date: "2026-11-01", v: 10 }, { date: "2026-11-02", v: 30 }, { date: "2026-11-04", v: 20 }];
  assert.equal(M.summarize(pts, "avg"), 20);
  assert.equal(M.summarize(pts, "sum"), 60);
  assert.equal(M.summarize(pts, "last"), 20);
  const s = M.stats(pts);
  assert.deepEqual([s.min, s.minAt, s.max, s.maxAt, s.last, s.lastDate], [10, "2026-11-01", 30, "2026-11-02", 20, "2026-11-04"]);
});

test("Veränderung zum gleich langen Vorzeitraum", () => {
  const pts = M.series(days, "hrv");
  const w = M.windowOf("7", TODAY);
  const c = M.change(pts, w, "avg");
  const cur = M.summarize(M.inWindow(pts, w), "avg"), prev = M.summarize(M.inWindow(pts, M.previousWindow(w)), "avg");
  assert.ok(c && Math.abs(c.diff - (cur - prev)) < 1e-9 && c.diff > 0);   // HRV steigt
  assert.equal(M.change(pts, M.windowOf("all", TODAY, pts[0].date), "avg", "all"), null);   // bei „Alle“ kein Vorzeitraum
  const recent = pts.filter((p) => p.date >= "2026-10-31");
  assert.equal(M.change(recent, w, "avg"), null);                          // Vorzeitraum ohne Daten
  const steps = M.series(days, "steps");
  assert.equal(M.change(steps, w, "sum").cur, M.summarize(M.inWindow(steps, w), "sum"));
});

test("Verfügbare Zeiträume: nur mit Daten, „Alle“ nicht doppelt", () => {
  assert.deepEqual(M.availablePeriods(M.series(days, "rhr"), TODAY), ["7", "30", "60", "all"]);
  // Gewicht wie im Repo: 5 Werte 25.09.–10.10. → kein 7 T, „Alle“ wäre gleich 60 T
  const weight = [["2026-09-25", 75.6], ["2026-09-26", 74.8], ["2026-09-27", 77], ["2026-10-02", 74.7], ["2026-10-10", 73.9]].map(([date, v]) => ({ date, v }));
  assert.deepEqual(M.availablePeriods(weight, TODAY), ["30", "60"]);
  // nur sehr alte Werte → nur „Alle“
  assert.deepEqual(M.availablePeriods([{ date: "2026-06-01", v: 1 }], TODAY), ["all"]);
  assert.deepEqual(M.availablePeriods([], TODAY), []);
  // seit 39 Tagen (VO2max Rad): 7, 30, „Alle“ (60 T wäre gleich „Alle“, hat aber Daten → 60 T statt „Alle“)
  const vo2 = []; for (let i = 38; i >= 0; i--) vo2.push({ date: M.addDays(TODAY, -i), v: 61 });
  assert.deepEqual(M.availablePeriods(vo2, TODAY), ["7", "30", "60"]);
});

test("Achsengrenzen aus dem Register: 0–100, Null-Start nur bei Mengen", () => {
  const ss = M.axis(M.byKey.sleepScore, [62, 88, 97, 100]);
  assert.ok(ss.hi <= 100 && ss.ticks.every((t) => t >= 0 && t <= 100));
  const hrv = M.axis(M.byKey.hrv, [62, 70, 78, 81]);
  assert.ok(hrv.lo > 40 && hrv.ticks[0] > 0);                    // HRV nicht ab 0
  const steps = M.axis(M.byKey.steps, [6000, 10430, 12000]);
  assert.equal(steps.lo, 0); assert.ok(steps.hi >= 12000);       // Schritte ab 0
  const sleep = M.axis(M.byKey.sleep, [6.5, 8.8]);
  assert.equal(sleep.lo, 0);
  const empty = M.axis(M.byKey.hrv, []);
  assert.ok(empty.ticks.length >= 2);
});

console.log(`\n${n} Tests bestanden.`);
