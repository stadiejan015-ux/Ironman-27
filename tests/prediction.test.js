/* Tests für js/prediction.js – ausführen mit: node tests/prediction.test.js */
"use strict";
const assert = require("node:assert/strict");
const { predictRace, solveSpeed, riegel, quantile } = require("../js/prediction.js");

// Feste Konfiguration (entspricht den Standardwerten in js/data.js)
const config = {
  swim: { distanceKm: 3.8, cssTests: [], cssOffset: 8, cssOffsetRange: [5, 12], wetsuitBonus: -4, openWaterFactor: 1.03, fallbackWeeks: 6, fallbackMinMeters: 1000 },
  bike: { distanceKm: 180, elevationM: 1600, climbGrade: 0.025, intensity: 0.70, intensityRange: [0.73, 0.68], cda: 0.30, cdaRange: [0.28, 0.33],
    crr: 0.0045, rho: 1.18, eta: 0.97, bikeMassKg: 11, climbPowerFactor: 1.08, descentPowerFactor: 0.85, maxDescentKmh: 60, overheadFactor: 1.02, note: "" },
  run: { distanceKm: 42.195, reference: "10k", optimisticReference: "5k", riegelExponent: 1.06, ironmanFactor: 1.18, ironmanFactorRange: [1.12, 1.25],
    longRunWeeks: 8, longRunPenalties: [[25, 0.04], [30, 0.02]] },
  transitions: { t1Min: 6, t2Min: 4 },
  subTarget: "12:00:00",
  fallback: { ftp: 250, weightKg: 80, swimPace100: 150, run5k: 1500, run10k: 3100 },
};

// Feste Eingaben: FTP 286 W, 74 kg, 5 km 21:28, 10 km 49:05, Schwimmen & Läufe
const strava = {
  snapshotDate: "2026-11-03",
  athlete: { weightKg: 74 },
  zones: { ftp: 286 },
  bests: { run: [["5 km", 1288, "2026-03-27"], ["10 km", 2945, "2026-07-19"], ["Halbmarathon", 9805, "2026-03-07"]] },
  activities: [
    ["2026-10-30T10:00", "Run", "kurz", 5, 1500, 0],
    ["2026-10-11T09:00", "Swim", "A", 2.0, 2600, 0],   // 2:10 /100 m
    ["2026-10-07T09:00", "Swim", "B", 2.0, 2800, 0],   // 2:20 /100 m
    ["2026-10-04T09:00", "Swim", "C", 1.5, 2250, 0],   // 2:30 /100 m
    ["2026-10-02T09:00", "Swim", "kurz", 0.5, 500, 0], // < 1.000 m → ignoriert
    ["2026-08-01T09:00", "Swim", "alt", 2.0, 2000, 0], // älter als 6 Wochen → ignoriert
    ["2026-09-28T17:00", "Run", "lang", 17.1, 5739, 0],
    ["2026-08-15T17:00", "Run", "alt-lang", 32, 11000, 0], // älter als 8 Wochen → ignoriert
  ],
};
const data = { strava, garmin: { days: [] }, asOf: "2026-11-03" };
const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} (±${tol})`);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };

test("Quantil/Median", () => {
  assert.equal(quantile([1, 2, 3], 0.5), 2);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
});

test("Schwimmen ohne CSS-Test: Median der Einheiten ≥ 1.000 m der letzten 6 Wochen", () => {
  const p = predictRace(data, config);
  assert.equal(p.swim.method, "median");
  assert.equal(p.swim.confidence, "niedrig");
  // Median 140 s/100 m − 4 s Neo = 136 s × 38 × 1,03
  approx(p.swim.realistic, 136 * 38 * 1.03, 0.01, "Schwimmzeit");
  assert.ok(p.swim.optimistic < p.swim.realistic && p.swim.realistic < p.swim.conservative);
});

test("Schwimmen mit CSS-Test: CSS = (t400 − t200) / 2, Renn-Pace = CSS + 8 s", () => {
  const cfg = { ...config, swim: { ...config.swim, cssTests: [{ date: "2026-10-20", t400: "6:00", t200: "2:50" }] } };
  const p = predictRace(data, cfg);
  assert.equal(p.swim.method, "css");
  assert.equal(p.swim.confidence, "hoch"); // Test ≤ 6 Wochen alt
  // CSS = (360 − 170) / 2 = 95 s → Renn-Pace 95 + 8 − 4 = 99 s/100 m
  approx(p.swim.pace100, 99, 1e-9, "Renn-Pace");
  approx(p.swim.realistic, 99 * 38 * 1.03, 0.01, "Schwimmzeit");
  approx(p.swim.optimistic, (95 + 5 - 4) * 38 * 1.03, 0.01, "optimistisch");
  approx(p.swim.conservative, (95 + 12 - 4) * 38 * 1.03, 0.01, "konservativ");
});

test("Rad: Geschwindigkeit erfüllt die Leistungsgleichung", () => {
  const p = { crr: 0.0045, rho: 1.18, eta: 0.97, cda: 0.30, mass: 85 };
  for (const grade of [0, 0.025, -0.025]) {
    const v = solveSpeed(200, grade, p), th = Math.atan(grade);
    const lhs = 200 * 0.97;
    const rhs = (0.0045 * 85 * 9.81 * Math.cos(th) + 85 * 9.81 * Math.sin(th)) * v + 0.5 * 1.18 * 0.30 * v ** 3;
    approx(lhs, rhs, 1e-6, `Gleichung bei ${grade * 100} %`);
  }
});

test("Rad: Abfahrt wird bei 60 km/h begrenzt", () => {
  const cfg = { ...config, bike: { ...config.bike, climbGrade: 0.08, descentPowerFactor: 3 } };
  const p = predictRace(data, cfg);
  const down = p.bike.segments.find((s) => s.name === "bergab");
  approx(down.kmh, 60, 1e-9, "Abfahrtstempo");
});

test("Rad: Plausibilität FTP 286 W, 74 kg, CdA 0,30 → 5:20–5:50 h", () => {
  const p = predictRace(data, config);
  approx(p.bike.powerW, 200.2, 1e-9, "Zielleistung");
  assert.ok(p.bike.realistic >= 5 * 3600 + 20 * 60 && p.bike.realistic <= 5 * 3600 + 50 * 60, `Radzeit ${p.bike.realistic / 3600} h`);
  assert.ok(p.bike.optimistic < p.bike.realistic && p.bike.realistic < p.bike.conservative);
  const km = p.bike.segments.reduce((a, s) => a + s.km, 0);
  approx(km, 180, 1e-9, "Streckenlänge");
});

test("Laufen: Riegel aus 10 km, Ironman-Faktor und +4 % bei längstem Lauf < 25 km", () => {
  const p = predictRace(data, config);
  const base = 2945 * Math.pow(42.195 / 10, 1.06);
  approx(riegel(2945, 10, 42.195, 1.06), base, 1e-9, "Riegel");
  assert.equal(p.run.longestKm, 17.1);
  assert.equal(p.run.penalty, 0.04);
  approx(p.run.realistic, base * 1.18 * 1.04, 0.01, "realistisch");
  approx(p.run.optimistic, 1288 * Math.pow(42.195 / 5, 1.06) * 1.12 * 1.04, 0.01, "optimistisch aus 5 km");
  approx(p.run.conservative, base * 1.25 * 1.04, 0.01, "konservativ");
});

test("Laufen: Aufschlag +2 % bzw. 0 % je nach längstem Lauf; Referenz wählbar", () => {
  const withRun = (km) => ({ ...data, strava: { ...strava, activities: [...strava.activities, ["2026-10-25T08:00", "Run", "x", km, km * 360, 0]] } });
  assert.equal(predictRace(withRun(27), config).run.penalty, 0.02);
  assert.equal(predictRace(withRun(31), config).run.penalty, 0);
  const p5 = predictRace(data, { ...config, run: { ...config.run, reference: "5k" } });
  approx(p5.run.realistic, 1288 * Math.pow(42.195 / 5, 1.06) * 1.18 * 1.04, 0.01, "Referenz 5 km");
});

test("Gesamtzeit = Summe inkl. Wechsel, Sub-12-Abstand", () => {
  const p = predictRace(data, config);
  const sum = p.swim.realistic + 360 + p.bike.realistic + 240 + p.run.realistic;
  approx(p.total.realistic, sum, 1e-6, "Summe");
  approx(p.subGap, sum - 12 * 3600, 1e-6, "Sub-12-Abstand");
  assert.ok(p.total.optimistic < p.total.realistic && p.total.realistic < p.total.conservative);
});

test("Fallbacks, wenn Daten fehlen", () => {
  const p = predictRace({ strava: { snapshotDate: "2026-11-03", activities: [] }, garmin: {}, asOf: "2026-11-03" }, config);
  assert.equal(p.inputs.ftp, 250);
  assert.equal(p.inputs.weightKg, 80);
  approx(p.swim.pace100, 150 - 4, 1e-9, "Schwimm-Fallback");
  assert.ok(p.warnings.length >= 3);
});

test("Garmin-Gewicht hat Vorrang vor dem Strava-Profil", () => {
  const p = predictRace({ ...data, garmin: { days: [{ date: "2026-10-01", weight: 76 }, { date: "2026-10-10", weight: 73.9 }] } }, config);
  assert.equal(p.inputs.weightKg, 73.9);
});

console.log(`\n${n} Tests bestanden.`);
