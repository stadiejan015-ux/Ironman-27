/* Tests für js/charts.js (Achsen & Diagramm-Bausteine) – ausführen mit: node tests/charts.test.js */
"use strict";
const assert = require("node:assert/strict");
const C = require("../js/charts.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
// Schritt ist 1, 2 oder 5 × 10ⁿ
const isRound = (s) => { const p = 10 ** Math.floor(Math.log10(s) + 1e-9); return [1, 2, 5, 10].some((f) => Math.abs(s / p - f) < 1e-9); };
const evenSteps = (ticks, step) => ticks.every((t, i) => i === 0 || Math.abs(t - ticks[i - 1] - step) < 1e-6);
const onGrid = (ticks, step) => ticks.every((t) => Math.abs(t / step - Math.round(t / step)) < 1e-6);

test("runde Ticks: Schritt 1/2/5 × 10ⁿ, 3–5 Ticks, Vielfache des Schritts", () => {
  const cases = [[0, 7.7], [0, 12.6], [0, 175], [55.5, 94.5], [42.8, 53.2], [73.96, 76.04], [51.85, 53.15], [145.5, 184.5], [0, 0.8], [-3.3, 12.1], [0, 1234]];
  for (const [lo, hi] of cases) {
    const { step, ticks } = C.ticksIn(lo, hi);
    assert.ok(isRound(step), `Schritt ${step} für ${lo}–${hi}`);
    assert.ok(ticks.length >= 3 && ticks.length <= 5, `${ticks.length} Ticks für ${lo}–${hi}: ${ticks}`);
    assert.ok(evenSteps(ticks, step) && onGrid(ticks, step), `${ticks}`);
    assert.ok(ticks[0] >= lo - 1e-9 && ticks[ticks.length - 1] <= hi + 1e-9, `Ticks im Bereich ${lo}–${hi}: ${ticks}`);
  }
  assert.deepEqual(C.ticksIn(42.8, 53.2).ticks, [44, 46, 48, 50, 52]);
  assert.deepEqual(C.ticksIn(55.5, 94.5).ticks, [60, 70, 80, 90]);
});

test("Mengen-Achse beginnt bei 0 und endet auf einem runden Wert", () => {
  assert.deepEqual(C.zeroAxis(7.3), { lo: 0, hi: 8, step: 2, ticks: [0, 2, 4, 6, 8] });
  assert.deepEqual(C.zeroAxis(167), { lo: 0, hi: 200, step: 50, ticks: [0, 50, 100, 150, 200] });
  const z = C.zeroAxis(0);                       // keine Daten: trotzdem gültige Achse
  assert.equal(z.lo, 0); assert.ok(z.hi > 0);
  const neg = C.zeroAxis(12, { min: -2.4 });     // Entkopplung kann negativ sein
  assert.ok(neg.lo < 0 && neg.lo <= -2.4 && neg.hi >= 12 && neg.ticks.includes(0));
});

test("Begrenzung auf 0–100 (Sleep Score, Body Battery, Prozente)", () => {
  const a = C.padAxis([88, 95, 100, 97], { clamp: [0, 100] });
  assert.ok(a.hi <= 100 && a.ticks.every((t) => t <= 100), `hi ${a.hi}, ${a.ticks}`);
  const b = C.padAxis([2, 10, 25], { clamp: [0, 100] });
  assert.ok(b.lo >= 0 && b.ticks.every((t) => t >= 0), `lo ${b.lo}, ${b.ticks}`);
  const c = C.zeroAxis(98, { clamp: [0, 100] });
  assert.equal(c.hi, 100); assert.ok(c.ticks.every((t) => t >= 0 && t <= 100));
  const d = C.padAxis([0, 100], { clamp: [0, 100] });
  assert.equal(d.lo, 0); assert.equal(d.hi, 100);
});

test("Achse ohne Null-Start mit Luft um die Daten (HRV, Ruhepuls, Gewicht, 1RM)", () => {
  const hrv = C.padAxis([62, 70, 85, 77]);
  assert.ok(hrv.lo > 40 && hrv.lo < 62 && hrv.hi > 85, `HRV ${hrv.lo}–${hrv.hi}`);
  assert.ok(hrv.ticks[0] > 0);
  const w = C.padAxis([74.2, 75.1, 75.8]);
  assert.ok(w.lo > 73 && w.lo < 74.2 && w.hi > 75.8 && w.hi < 77, `Gewicht ${w.lo}–${w.hi}`);
  assert.deepEqual(w.ticks, [74, 75, 76]);
  const rm = C.padAxis([80, 92, 100], { include: [140] });   // Ziel immer sichtbar
  assert.ok(rm.lo > 60 && rm.hi >= 140, `1RM ${rm.lo}–${rm.hi}`);
  assert.deepEqual(rm.ticks, [80, 100, 120, 140]);
  const flat = C.padAxis([50, 50, 50]);         // alle gleich: trotzdem Spanne
  assert.ok(flat.lo < 50 && flat.hi > 50 && flat.ticks.length >= 3);
});

test("Pace-Ticks: runde Schritte von 10, 15 oder 30 s", () => {
  const run = C.paceAxis([330, 352, 371, 390]);              // 5:30–6:30 /km
  assert.equal(run.step, 15);
  assert.deepEqual(run.ticks, [330, 345, 360, 375, 390]);
  const swim = C.paceAxis([122, 131, 138]);                  // 2:02–2:18 /100 m → mind. 30 s Spanne
  assert.equal(swim.step, 10);
  assert.ok(swim.ticks.length >= 3 && swim.ticks.length <= 5);
  const wide = C.paceAxis([300, 420]);                       // 5:00–7:00
  assert.equal(wide.step, 30);
  for (const ax of [run, swim, wide]) {
    assert.ok([10, 15, 30].includes(ax.step));
    assert.ok(ax.ticks.every((t) => t % ax.step === 0), `${ax.ticks}`);
  }
  const race = C.durationAxis([42100, 43900], { include: [43200, 41400] });   // Prognose h:mm, Schritte in Minuten
  assert.ok(race.step % 60 === 0 && race.ticks.length <= 5 && race.ticks.every((t) => t % race.step === 0));
});

test("Nachkommastellen passend zum Schritt", () => {
  assert.equal(C.decimals(10), 0); assert.equal(C.decimals(1), 0);
  assert.equal(C.decimals(0.5), 1); assert.equal(C.decimals(0.2), 1); assert.equal(C.decimals(0.05), 2);
});

test("X-Achse: höchstens 6 Labels, die neueste Woche immer beschriftet", () => {
  for (const cnt of [1, 5, 12, 19, 40]) {
    const idx = C.labelIndices(cnt, 6);
    assert.ok(idx.length <= 6 && idx.length >= 1);
    assert.equal(idx[idx.length - 1], cnt - 1);
  }
  const DAY = 86400000, t0 = new Date(2026, 8, 6).getTime(), t1 = new Date(2026, 10, 5).getTime();
  for (const w of [150, 300, 700, 1200]) {
    const ts = C.dateTicks(t0, t1, w);
    assert.ok(ts.length >= 2 && ts.length <= 6, `${ts.length} bei ${w} px`);
    assert.ok(ts.every((t) => t >= t0 && t <= t1 && new Date(t).getHours() === 0));
  }
  assert.equal(C.dm(new Date(2026, 8, 6)), "06.09.");
  assert.ok(C.dateTicks(t0, t0 + 3 * DAY, 400).length >= 2);
});

test("Diagramme: echte Pixelgröße, role=img, aria-label, Akzent nur für den aktuellen Punkt", () => {
  const d = (i) => new Date(2026, 9, 1 + i * 3);
  const pts = [70, 72, 75, 74, 77].map((v, i) => ({ d: d(i), v }));
  const ax = { ...C.padAxis(pts.map((p) => p.v)), fmt: (v) => String(v) };
  const svg = C.lineChart({ width: 333, height: C.SMALL, aria: "HRV letzte 60 Tage, aktuell 77 ms", y: ax, series: [{ pts, color: "var(--text-2)" }], latest: { ...pts[4], label: "77" }, hits: pts });
  assert.match(svg, /width="333" height="160" viewBox="0 0 333 160"/);
  assert.match(svg, /role="img" aria-label="HRV letzte 60 Tage, aktuell 77 ms"/);
  assert.equal((svg.match(/var\(--accent\)/g) || []).length, 1);
  assert.equal((svg.match(/class="hit"/g) || []).length, 5);
  assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b/i);              // keine festen Farben
  const many = Array.from({ length: 30 }, (_, i) => ({ d: new Date(2026, 8, 1 + i), v: 60 + (i % 7) }));
  const svg2 = C.lineChart({ width: 300, y: { ...C.padAxis(many.map((p) => p.v)), fmt: String }, series: [{ pts: many, color: "var(--text-2)" }] });
  assert.equal((svg2.match(/<circle/g) || []).length, 0);     // viele Werte: keine Punkte
  const bars = C.barChart({ width: 400, height: C.LARGE, aria: "Test", y: { ...C.zeroAxis(10), fmt: String },
    bands: [{ label: "a", stacks: [{ v: 3, color: "var(--swim)" }, { v: 2, color: "var(--run)" }] }, { label: "b", stacks: [{ v: 6, color: "var(--swim)" }], current: true }] });
  assert.match(bars, /width="400" height="220"/);
  assert.match(bars, /var\(--accent-soft\)/);
  assert.doesNotMatch(bars, /var\(--accent\)/);
  assert.match(C.legend([{ label: "Rad", color: "var(--bike)" }]), /lg lg-square/);
  assert.match(C.empty("Zu wenig Daten."), /chart-empty/);
});

test("Ringe (Wochen-Minimum): Fortschritt begrenzt, bei 100 % geschlossen, bei 0 kein Bogen", () => {
  const r = 50, circ = 2 * Math.PI * r;
  const half = C.ringArc(0.5, r);
  assert.ok(Math.abs(half.C - circ) < 1e-9 && Math.abs(half.offset - circ / 2) < 1e-9 && half.frac === 0.5);
  const full = C.ringArc(5 / 4, r);   // 5 von 4 Gym → voll, nicht mehr
  assert.equal(full.frac, 1); assert.ok(Math.abs(full.offset) < 1e-9);
  assert.equal(C.ringArc(NaN, r).frac, 0);
  const svg = C.rings({ size: 150, items: [{ frac: 1, color: "var(--strength)" }, { frac: 0.5, color: "var(--run)" }, { frac: 0, color: "var(--swim)" }], aria: "Wochen-Minimum: Gym 4 von 4" });
  assert.match(svg, /role="img" aria-label="Wochen-Minimum: Gym 4 von 4"/);
  assert.equal((svg.match(/class="ring-arc/g) || []).length, 2);         // 0 % → nur die Spur, kein Bogen
  assert.equal((svg.match(/stroke-opacity=".24"/g) || []).length, 3);    // drei Spuren
  assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b/i);
});

console.log(`\n${n} Tests bestanden.`);
