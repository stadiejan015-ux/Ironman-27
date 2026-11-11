/* Tests für js/native.js (Verhalten wie in einer iOS-App) – ausführen mit: node tests/native.test.js */
"use strict";
const assert = require("node:assert/strict");
const N = require("../js/native.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };

test("Großer Titel: 0 solange er unter der Leiste liegt, 1 wenn er ganz darunter verschwunden ist", () => {
  // Leiste endet bei 91 px (47 px Statusleiste + 44 px), Titel 41 px hoch
  assert.equal(N.titleProgress(120, 41, 91), 0);       // in Ruhe: Titel unter der Leiste
  assert.equal(N.titleProgress(91, 41, 91), 0);        // Oberkante erreicht die Leiste
  assert.ok(Math.abs(N.titleProgress(70.5, 41, 91) - 0.5) < 1e-9);
  assert.equal(N.titleProgress(50, 41, 91), 1);        // ganz darunter
  assert.equal(N.titleProgress(-300, 41, 91), 1);      // weit weggescrollt
  assert.equal(N.titleProgress(50, 0, 91), 0);         // ohne Titel (versteckter Tab): nichts tun
});

test("Gummiband wie iOS: wächst, wird immer zäher, nie über die Fläche hinaus", () => {
  const d = 800;
  assert.equal(N.rubberBand(0, d), 0); assert.equal(N.rubberBand(-40, d), 0);
  const a = N.rubberBand(60, d), b = N.rubberBand(120, d), c = N.rubberBand(240, d);
  assert.ok(a > 0 && b > a && c > b);
  assert.ok((c - b) / 120 < (b - a) / 60);             // jeder weitere Pixel bringt weniger
  assert.ok(N.rubberBand(1e6, d) < d);
  assert.ok(Math.abs(N.rubberBand(120, d) - (1 - 1 / (120 * 0.55 / 800 + 1)) * 800) < 1e-9);
});

test("Runterziehen: Fortschritt bis zur Schwelle, erst dann scharf", () => {
  assert.deepEqual(N.pullState(0, 64), { progress: 0, armed: false });
  assert.deepEqual(N.pullState(32, 64), { progress: 0.5, armed: false });
  assert.deepEqual(N.pullState(64, 64), { progress: 1, armed: true });
  assert.deepEqual(N.pullState(90, 64), { progress: 1, armed: true });
  assert.deepEqual(N.pullState(-10, 64), { progress: 0, armed: false });
});

test("Deutsche Zahlen lesen: Tausenderpunkt, Komma, Minus; Uhrzeiten und Text nicht", () => {
  assert.deepEqual(N.parseNumber("4.950"), { value: 4950, decimals: 0, grouping: true, minus: "-" });
  assert.deepEqual(N.parseNumber("73,9"), { value: 73.9, decimals: 1, grouping: false, minus: "-" });
  assert.deepEqual(N.parseNumber(" 88 "), { value: 88, decimals: 0, grouping: false, minus: "-" });
  assert.deepEqual(N.parseNumber("−0,4"), { value: -0.4, decimals: 1, grouping: false, minus: "−" });
  assert.deepEqual(N.parseNumber("-12"), { value: -12, decimals: 0, grouping: false, minus: "-" });
  assert.equal(N.parseNumber("1.234,56").value, 1234.56);
  for (const t of ["5:31", "8:57", "–", "", "12 %", "3/4", "1.23", "abc", null]) assert.equal(N.parseNumber(t), null, String(t));
});

test("Deutsche Zahlen schreiben: gleiches Format wie vorher", () => {
  assert.equal(N.formatNumber(4950, 0, true), "4.950");
  assert.equal(N.formatNumber(1234567.891, 2, true), "1.234.567,89");
  assert.equal(N.formatNumber(73.9, 1), "73,9");
  assert.equal(N.formatNumber(-0.4, 1, false, "−"), "−0,4");
  assert.equal(N.formatNumber(-0.04, 1), "0,0");      // gerundet null → kein Minus
  assert.equal(N.formatNumber(0, 0), "0");
  for (const t of ["4.950", "73,9", "88", "−0,4", "1.234,56", "0"]) {
    const p = N.parseNumber(t);
    assert.equal(N.formatNumber(p.value, p.decimals, p.grouping, p.minus), t, t);   // hin und zurück identisch
  }
});

test("Hochzählen: startet bei 0, steigt monoton, endet genau beim Zielwert", () => {
  const p = N.parseNumber("4.950");
  assert.equal(N.countText(p, 0), "0");
  assert.equal(N.countText(p, 1), "4.950");
  let last = -1;
  for (let i = 0; i <= 20; i++) {
    const v = N.parseNumber(N.countText(p, i / 20)).value;
    assert.ok(v >= last, `monoton bei ${i}`); last = v;
  }
  assert.ok(N.parseNumber(N.countText(p, 0.5)).value > 4950 * 0.9);   // kräftiges ease-out: zur Hälfte fast am Ziel
  assert.equal(N.countText(N.parseNumber("73,9"), 1), "73,9");
  assert.equal(N.countText(N.parseNumber("−0,4"), 1), "−0,4");
  assert.equal(N.countText(null, 0.5), "");
  assert.equal(N.easeOut(0), 0); assert.equal(N.easeOut(1), 1); assert.equal(N.easeOut(2), 1);
});

test("Home-Bildschirm-Modus erkennen (iOS navigator.standalone oder display-mode)", () => {
  const mm = (on) => (q) => ({ matches: on && q === "(display-mode: standalone)" });
  assert.equal(N.isStandalone({ standalone: true }, mm(false)), true);
  assert.equal(N.isStandalone({}, mm(true)), true);
  assert.equal(N.isStandalone({ standalone: false }, mm(false)), false);
  assert.equal(N.isStandalone(null, null), false);
  assert.equal(N.isStandalone({}, () => { throw new Error("x"); }), false);
});

console.log(`\n${n} Tests bestanden.`);
