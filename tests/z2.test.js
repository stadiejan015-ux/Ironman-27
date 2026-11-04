/* Tests für js/z2.js – ausführen mit: node tests/z2.test.js */
"use strict";
const assert = require("node:assert/strict");
const Z2 = require("../js/z2.js");

const zones = [[0, 129], [130, 152], [153, 175], [176, 200], [201, null]];
const cfg = {
  warmupSec: 600, smoothSec: 60, maxGapSec: 10,
  run: { hrBand: [140, 148], gradeRange: [-2, 2], minBandSec: 480, maxElevPerKm: 10, maxHighShare: 0.10, minSpeed: 1.5,
    gap: { enabled: true, maxElevPerKm: 25, gradeRange: [-6, 6] } },
  ride: { hrBand: [135, 145], gradeRange: [-2, 2], minBandSec: 480, maxHighShare: 0.10 },
  decoupling: { runMinSec: 3600, rideMinSec: 5400, minZ12Share: 0.8, maxVi: 1.10, thresholds: [5, 10] },
  zonesIncludeWarmup: true, windowDays: 28, minPoints: 3, longRunWindowDays: 56,
};
// Künstlicher Stream mit 1 Hz
function stream(sec, fn) {
  const s = { time: [], heart_rate: [], velocity_smooth: [], grade_smooth: [], altitude: [], moving: [], watts: [] };
  for (let t = 0; t < sec; t++) {
    const x = fn(t);
    s.time.push(t); s.heart_rate.push(x.hr); s.velocity_smooth.push(x.v ?? 3); s.grade_smooth.push(x.g ?? 0);
    s.altitude.push(400); s.moving.push(x.moving ?? true); if (x.w != null) s.watts.push(x.w);
  }
  if (!s.watts.length) delete s.watts;
  return s;
}
const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} (±${tol})`);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const runMeta = (o = {}) => ({ id: 1, date: "2026-10-11T14:00", sport: "Run", name: "Lauf", km: 16, sec: 4800, elev: 40, ...o });

test("Entkopplung: konstantes Tempo, HF in der 2. Hälfte +5 % → ≈ 4,8 %", () => {
  // 80 min, nach 10 min Aufwärmen bleiben 70 min; Hälfte bei 45 min
  const s = stream(4800, (t) => ({ v: 3.0, hr: t < 2700 ? 140 : 147 }));
  const rec = Z2.analyzeActivity(runMeta(), s, cfg, zones);
  assert.equal(rec.status.decoupling, "ok");
  approx(rec.decoupling.pct, 4.8, 0.15, "Entkopplung");
  // ohne Glättungseffekt exakt: (1 − 1/1,05) × 100 = 4,76 %
  approx((1 - 1 / 1.05) * 100, 4.76, 0.01, "Formel");
});

test("Pace @ HF: Median im Band 140–148 bpm auf flachen Abschnitten", () => {
  // 40 min: HF 144, Tempo 3,0 m/s (5:33 /km); ein steiler Abschnitt (5 %) mit 2,5 m/s wird ignoriert
  const s = stream(2400, (t) => ({ hr: 144, v: t > 1500 && t < 1800 ? 2.5 : 3.0, g: t > 1500 && t < 1800 ? 5 : 0 }));
  const rec = Z2.analyzeActivity(runMeta({ sec: 2400, km: 7 }), s, cfg, zones);
  assert.equal(rec.status.pace, "ok");
  approx(rec.pace.sec, 333, 1, "Pace s/km");
  assert.ok(rec.pace.bandSec < 1800 && rec.pace.bandSec > 1400, "Steilstück nicht im Band");
});

test("Pace @ HF: unter 8 min im Band wird nicht gewertet", () => {
  const s = stream(1800, (t) => ({ hr: t < 1500 ? 150 : 144 })); // nach Aufwärmen 20 min, davon nur 5 min im Band (+ Glättung)
  const rec = Z2.analyzeActivity(runMeta({ sec: 1800, km: 5 }), s, cfg, zones);
  assert.equal(rec.pace, null);
  assert.match(rec.status.pace, /nur \d+ min im Band/);
});

test("Ausschlüsse: TrailRun, Laufband, hügelig, Intervalle", () => {
  const s = stream(3000, () => ({ hr: 144 }));
  assert.equal(Z2.analyzeActivity(runMeta({ sport: "TrailRun" }), s, cfg, zones).status.pace, "TrailRun");
  assert.equal(Z2.analyzeActivity(runMeta({ name: "Laufband" }), s, cfg, zones).status.pace, "Laufband");
  assert.equal(Z2.analyzeActivity(runMeta({ trainer: true }), s, cfg, zones).status.pace, "Laufband");
  assert.match(Z2.analyzeActivity(runMeta({ km: 5, elev: 155 }), s, cfg, zones).status.pace, /zu hügelig \(31 Hm\/km\)/);
  const iv = stream(3000, (t) => ({ hr: t % 600 < 240 ? 182 : 140 })); // 4-min-Intervalle ≥ Z4
  assert.match(Z2.analyzeActivity(runMeta(), iv, cfg, zones).status.pace, /Intervalle/);
});

test("Rad: Watt @ HF nur mit echten Watt; Indoor erkannt", () => {
  const meta = { id: 2, date: "2026-10-04T14:00", sport: "VirtualRide", name: "Zwift", km: 70, sec: 7200, elev: 300 };
  const withW = stream(7200, () => ({ hr: 140, w: 180, v: 10 }));
  const rec = Z2.analyzeActivity(meta, withW, cfg, zones);
  assert.equal(rec.indoor, true);
  assert.equal(rec.deviceWatts, true);
  assert.equal(rec.watts.w, 180);
  assert.equal(rec.status.decoupling, "ok");
  approx(rec.decoupling.pct, 0, 0.01, "keine Entkopplung");
  approx(rec.decoupling.vi, 1, 0.001, "VI bei konstanter Leistung");
  const noW = stream(7200, () => ({ hr: 140, v: 9 }));
  const out = Z2.analyzeActivity({ ...meta, sport: "Ride", name: "Orbea" }, noW, cfg, zones);
  assert.equal(out.watts, null);
  assert.equal(out.status.watts, "keine echten Watt (geschätzt)");
  assert.equal(out.indoor, false);
});

test("Rad: Entkopplung nur bei VI ≤ 1,10", () => {
  const meta = { id: 3, date: "2026-10-04T14:00", sport: "VirtualRide", name: "Zwift", km: 70, sec: 7200, elev: 300 };
  const s = stream(7200, (t) => ({ hr: 140, w: t % 120 < 60 ? 320 : 60, v: 10 })); // stark schwankend
  assert.match(Z2.analyzeActivity(meta, s, cfg, zones).status.decoupling, /ungleichmäßig \(VI/);
});

test("Stillstand wird entfernt und Aufwärmen verworfen", () => {
  const s = stream(1200, (t) => ({ hr: 100, moving: !(t >= 300 && t < 600) }));
  const p = Z2.prepare(s, cfg);
  assert.equal(p.all.length, 900);
  approx(p.movingSec, 899, 1, "Bewegungszeit");
  assert.ok(p.main.every((x) => x.mt >= 600));
});

test("Zonenzeiten mit eigenen Zonen (Z1 < 130 … Z5 ≥ 201)", () => {
  assert.equal(Z2.zoneIndex(129.9, Z2.zoneMins(zones)), 0);
  assert.equal(Z2.zoneIndex(130, Z2.zoneMins(zones)), 1);
  assert.equal(Z2.zoneIndex(176, Z2.zoneMins(zones)), 3);
  assert.equal(Z2.zoneIndex(205, Z2.zoneMins(zones)), 4);
  const s = stream(1200, () => ({ hr: 145 }));
  const rec = Z2.analyzeActivity(runMeta({ sec: 1200, km: 3 }), s, cfg, zones);
  assert.deepEqual(rec.zoneSec.map((x) => x > 0), [false, true, false, false, false]);
});

test("Zeitreihen: gleitender Median, Kacheln, Wochen", () => {
  const pts = [["2026-09-01", 350], ["2026-09-08", 346], ["2026-09-15", 344], ["2026-10-10", 340], ["2026-10-20", 338], ["2026-10-30", 336]].map(([date, v]) => ({ date, v }));
  const roll = Z2.rollingMedian(pts, 28);
  assert.equal(roll[2].v, 346);
  const k = Z2.kpi(pts, "2026-11-03", 28, 3);
  assert.equal(k.value, 338); assert.equal(k.n, 3); assert.equal(k.enough, true);
  assert.equal(Z2.kpi(pts.slice(0, 2), "2026-11-03", 28, 3).enough, false);
  assert.equal(Z2.mondayIso("2026-11-04"), "2026-11-02");
  const wk = Z2.weeklyZones([{ date: "2026-11-03T08:00", kind: "run", zoneSec: [60, 120, 0, 0, 0] }, { date: "2026-11-04T08:00", kind: "ride", zoneSec: [30, 0, 0, 0, 0] }]);
  assert.deepEqual(wk, [{ week: "2026-11-02", sec: [90, 120, 0, 0, 0] }]);
  assert.equal(Z2.ampel(4.9, [5, 10]), "good"); assert.equal(Z2.ampel(7, [5, 10]), "warn"); assert.equal(Z2.ampel(10.5, [5, 10]), "bad");
});

test("GAP: Faktor nach Minetti (eben 1, bergauf > 1, bergab < 1)", () => {
  approx(Z2.gapFactor(0), 1, 1e-9, "eben");
  approx(Z2.gapFactor(5), 4.685 / 3.6, 0.01, "+5 %");
  assert.ok(Z2.gapFactor(-5) < 1 && Z2.gapFactor(-5) > 0.7, "−5 %");
});

test("GAP: hügeliger Lauf (10–25 Hm/km) wird mit GAP gewertet und markiert", () => {
  // 40 min auf und ab: 3 min +4 % mit 2,6 m/s, 3 min −4 % mit 3,4 m/s; HF 144
  const s = stream(2400, (t) => { const up = Math.floor(t / 180) % 2 === 0; return { hr: 144, v: up ? 2.6 : 3.4, g: up ? 4 : -4 }; });
  const rec = Z2.analyzeActivity(runMeta({ km: 7.2, elev: 110, sec: 2400 }), s, cfg, zones); // 15 Hm/km
  assert.equal(rec.status.pace, "ok (GAP)");
  assert.equal(rec.pace.gap, true);
  // Ohne GAP würde dieser Lauf (Steigung ±4 % außerhalb ±2 %) gar nicht gewertet
  const off = Z2.analyzeActivity(runMeta({ km: 7.2, elev: 110, sec: 2400 }), s, { ...cfg, run: { ...cfg.run, gap: { enabled: false } } }, zones);
  assert.match(off.status.pace, /zu hügelig/);
  // > 25 Hm/km bleibt ausgeschlossen
  assert.match(Z2.analyzeActivity(runMeta({ km: 5, elev: 150 }), s, cfg, zones).status.pace, /zu hügelig \(30 Hm\/km\)/);
});

test("Pulsmesser-Markierung #gurt / #uhr aus Titel oder Beschreibung", () => {
  const s = stream(1200, () => ({ hr: 144 }));
  assert.equal(Z2.analyzeActivity(runMeta({ name: "Easy Run #gurt" }), s, cfg, zones).hrTag, "strap");
  assert.equal(Z2.analyzeActivity(runMeta({ description: "mit #Brustgurt" }), s, cfg, zones).hrTag, "strap");
  assert.equal(Z2.analyzeActivity(runMeta({ name: "Lauf #uhr" }), s, cfg, zones).hrTag, "wrist");
  assert.equal(Z2.analyzeActivity(runMeta(), s, cfg, zones).hrTag, undefined);
});

console.log(`\n${n} Tests bestanden.`);
