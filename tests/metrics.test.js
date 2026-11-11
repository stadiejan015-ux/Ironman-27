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
    assert.ok(m.name && m.cat && (m.field || m.source) && m.tab, m.key);   // Garmin-Feld oder eigene Quelle (Zone 2, Woche)
    assert.ok(["avg", "median", "sum", "last", "max"].includes(m.summary), m.key);
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
  assert.equal(M.summarize(pts, "median"), 20);
  assert.equal(M.summarize(pts.concat({ date: "2026-11-05", v: 100 }), "median"), 25);   // gerade Anzahl: Mitte der beiden mittleren, Ausreißer zählt kaum
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

test("Schritt 2: Zone 2, Woche und 1RM im Register", () => {
  for (const k of ["z2pace", "z2watts", "z2dec", "z2zones", "belastung"]) assert.ok(M.byKey[k], k);
  assert.equal(M.byKey.z2pace.invert, true);                        // Pace: schneller = oben
  assert.deepEqual(M.byKey.belastung.periods, ["30", "60", "all"]);  // Wochensummen: kein 7 T
  assert.equal(M.slug("Bankdrücken"), "bankdruecken");
  assert.equal(M.slug("Latzug (Maschine)"), "latzug-maschine");
  const lm = M.register(M.liftMetric("Beinpresse", 300));
  assert.equal(lm.key, "1rm-beinpresse"); assert.equal(lm.tab, "training"); assert.equal(lm.summary, "max");
  assert.deepEqual(lm.refs, [{ v: 300, label: "Ziel 300" }]);
  const pu = M.liftMetric("Weighted Pull-ups", 50, 73.9);                 // Körpergewicht → Über-Text erklärt das Zusatzgewicht
  assert.equal(pu.key, "1rm-weighted-pull-ups");
  assert.match(pu.about, /Zusatzgewicht/); assert.match(pu.about, /73,9 kg/);
  assert.equal(M.byKey["1rm-beinpresse"], lm);
  M.register(M.liftMetric("Beinpresse", 310));                       // gleicher Schlüssel → ersetzt, nicht doppelt
  assert.equal(M.REGISTRY.filter((m) => m.key === "1rm-beinpresse").length, 1);
  assert.equal(M.byKey["1rm-beinpresse"].refs[0].v, 310);
});

test("Zusammenfassung per Bestwert und per eigener Rechnung (zeitgewichteter Z1–2-Anteil)", () => {
  const pts = [{ date: "2026-10-01", v: 240 }, { date: "2026-10-20", v: 253.3 }, { date: "2026-11-02", v: 250 }];
  assert.equal(M.summarize(pts, "max"), 253.3);
  assert.equal(M.summarizeMetric(M.liftMetric("Beinpresse"), pts), 253.3);
  // Woche 1: 9 h, davon 8 h Z1–2 (89 %); Woche 2: 1 h, davon 0 h (0 %) → nach Zeit gewichtet 80 %, nicht Ø 44 %
  const weeks = [{ date: "2026-10-26", v: 88.9, z12: 8 * 3600, tot: 9 * 3600 }, { date: "2026-11-02", v: 0, z12: 0, tot: 3600 }];
  assert.ok(Math.abs(M.summarizeMetric(M.byKey.z2zones, weeks) - 80) < 1e-9);
  assert.equal(M.summarizeMetric(M.byKey.z2zones, []), null);
  // Veränderung nutzt dieselbe Rechnung: Zeitraum 31.10.–06.11. (Woche 02.11.: 0 %) gegen 24.10.–30.10. (Woche 26.10.: 88,9 %)
  const c = M.change(weeks, M.windowOf("7", "2026-11-06"), M.byKey.z2zones);
  assert.ok(c && c.cur === 0 && Math.abs(c.prev - 88.888888) < 1e-3 && c.diff < 0);
});

test("Verfügbare Zeiträume mit Einschränkung je Kennzahl", () => {
  const weekly = []; for (let i = 10; i >= 0; i--) weekly.push({ date: M.addDays("2026-11-02", -7 * i), v: 300 });
  assert.deepEqual(M.availablePeriods(weekly, "2026-11-06", ["30", "60", "all"]), ["30", "60", "all"]);
  assert.deepEqual(M.availablePeriods(weekly, "2026-11-06"), ["7", "30", "60", "all"]);
  assert.deepEqual(M.byKey.z2zones.periods, ["30", "60", "all"]);    // Wochenwerte: kein 7 T
});

test("Zeitraum beim Öffnen: 30 T, eigener Standard oder kompletter Verlauf", () => {
  assert.equal(M.defaultPeriod(M.byKey.hrv, ["7", "30", "60", "all"]), "30");
  assert.equal(M.defaultPeriod(M.byKey.hrv, ["60", "all"]), "60");          // 30 T fehlt → erster vorhandener
  assert.equal(M.defaultPeriod(M.byKey.belastung, ["30", "60", "all"]), "60");
  const lift = M.liftMetric("Bankdrücken");
  assert.equal(M.defaultPeriod(lift, ["7", "30", "60", "all"]), "all");     // 1RM: kompletter Verlauf
  assert.equal(M.defaultPeriod(lift, ["7", "30", "60"]), "60");             // „Alle“ wäre gleich 60 T → längster
  assert.equal(M.defaultPeriod(lift, []), null);
});

console.log(`\n${n} Tests bestanden.`);
