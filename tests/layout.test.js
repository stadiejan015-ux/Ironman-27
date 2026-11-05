/* Tests für js/layout.js – ausführen mit: node tests/layout.test.js */
"use strict";
const assert = require("node:assert/strict");
const L = require("../js/layout.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const IDS = ["letzte4", "stand", "erholungVerlauf", "zone2", "gym", "kalender", "saison", "umfang", "disziplinen", "rennen", "aktivitaeten"];
const closed = (open) => Object.keys(open).filter((k) => !open[k]).sort();

test("Standard im Flex-Zeitraum: Zone 2, Disziplinen, Rennen und Erholungs-Verläufe zu", () => {
  const r = L.resolve({ ids: IDS, phase: L.phaseOf(true) });
  assert.deepEqual(closed(r.open), ["disziplinen", "erholungVerlauf", "rennen", "zone2"]);
  assert.equal(r.open.gym, true); assert.equal(r.open.aktivitaeten, true);
  assert.equal(r.reset, false);
});

test("Standard außerhalb des Flex-Zeitraums: alles offen außer den Erholungs-Verläufen", () => {
  const r = L.resolve({ ids: IDS, phase: L.phaseOf(false) });
  assert.deepEqual(closed(r.open), ["erholungVerlauf"]);
});

test("Standardwerte anpassbar über data.js (layout)", () => {
  const cfg = { flex: { collapsed: ["kalender"] } };
  assert.deepEqual(closed(L.resolve({ ids: IDS, cfg, phase: "flex" }).open), ["kalender"]);
  assert.deepEqual(closed(L.resolve({ ids: IDS, cfg, phase: "normal" }).open), ["erholungVerlauf"]); // normal unverändert
});

test("Gespeicherte Wahl hat Vorrang vor dem Standard", () => {
  let saved = L.remember(null, "flex", "zone2", true);       // Zone 2 aufgeklappt
  saved = L.remember(saved, "flex", "gym", false);             // Gym zugeklappt
  assert.deepEqual(saved, { phase: "flex", open: { zone2: true, gym: false } });
  const r = L.resolve({ ids: IDS, phase: "flex", saved });
  assert.equal(r.open.zone2, true); assert.equal(r.open.gym, false);
  assert.equal(r.open.rennen, false);                           // Rest bleibt beim Standard
  assert.deepEqual(r.saved, saved); assert.equal(r.reset, false);
  // erneutes Umschalten überschreibt nur diesen Abschnitt
  assert.deepEqual(L.remember(saved, "flex", "zone2", false).open, { zone2: false, gym: false });
});

test("Phasenwechsel (Flex endet) setzt auf die Standardwerte der neuen Phase zurück", () => {
  const saved = { phase: "flex", open: { zone2: true, gym: false, erholungVerlauf: true } };
  const r = L.resolve({ ids: IDS, phase: "normal", saved });
  assert.equal(r.reset, true);
  assert.deepEqual(closed(r.open), ["erholungVerlauf"]);
  assert.deepEqual(r.saved, { phase: "normal", open: {} });
  // erste Wahl in der neuen Phase verwirft die alte
  assert.deepEqual(L.remember(saved, "normal", "rennen", false), { phase: "normal", open: { rennen: false } });
});

test("Kaputte oder fremde gespeicherte Werte werden ignoriert", () => {
  for (const bad of ["x", 42, { open: { zone2: true } }, { phase: "flex", open: "ja" }]) {
    const r = L.resolve({ ids: IDS, phase: "flex", saved: bad });
    assert.deepEqual(closed(r.open), ["disziplinen", "erholungVerlauf", "rennen", "zone2"]);
    assert.equal(r.reset, true);
  }
  // Nicht-Boolean-Werte fallen auf den Standard zurück, unbekannte ids stören nicht
  const r = L.resolve({ ids: IDS, phase: "flex", saved: { phase: "flex", open: { zone2: "ja", alt: true } } });
  assert.equal(r.open.zone2, false); assert.equal("alt" in r.open, false);
});

console.log(`\n${n} Tests bestanden.`);
