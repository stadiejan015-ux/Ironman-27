/* Tests für js/phases.js – ausführen mit: node tests/phases.test.js */
"use strict";
const assert = require("node:assert/strict");
const P = require("../js/phases.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const last = (p) => ymd(new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() - 1));   // letzter Tag (end ist exklusiv)
const table = (r) => r.phases.map((p) => `${p.short} ${ymd(p.start)}–${last(p)}`);
const RACE = "2027-06-27", START = "2026-06-27";
const FLEX = { active: true, from: "2026-10-27", until: "2027-01-10", label: "Gym-Block & Reisen" };
const d = (s) => new Date(...s.split("-").map((x, i) => (i === 1 ? +x - 1 : +x)));

// lückenlos, ohne Überschneidung, vom Anmeldetag bis einschließlich Renntag
function contiguous(r) {
  const ps = r.phases;
  assert.equal(ymd(ps[0].start), START);
  for (let i = 1; i < ps.length; i++) assert.equal(ps[i].start.getTime(), ps[i - 1].end.getTime(), `Lücke/Überschneidung vor ${ps[i].short}`);
  assert.equal(last(ps[ps.length - 1]), RACE);
  ps.forEach((p) => assert.ok(p.end > p.start, `${p.short} leer`));
}

test("Ohne Flex: Phasen wie bisher rückwärts vom Renntag, aber im Montags-Raster", () => {
  const r = P.buildPhases({ race: RACE, planStart: START });
  assert.deepEqual(table(r), [
    "Einstieg 2026-06-27–2026-09-06", "Grundlage 1 2026-09-07–2026-12-13", "Grundlage 2 2026-12-14–2027-02-07",
    "Aufbau 1 2027-02-08–2027-04-04", "Aufbau 2 2027-04-05–2027-05-23", "Peak 2027-05-24–2027-06-13", "Taper 2027-06-14–2027-06-27",
  ]);
  contiguous(r);
  r.phases.slice(1).forEach((p) => assert.equal(p.start.getDay(), 1, `${p.short} beginnt nicht am Montag`));
  assert.equal(r.warning, null);
  // flex.active false oder ohne from → genauso
  assert.deepEqual(table(P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, active: false } })), table(r));
  assert.deepEqual(table(P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, from: null } })), table(r));
});

test("Mit Flex: Grundlage 1 endet vor Flex, danach Wiedereinstieg, Grundlage 2, Aufbau 1, Aufbau 2 (Rest), Peak, Taper", () => {
  const r = P.buildPhases({ race: RACE, planStart: START, flex: FLEX });
  assert.deepEqual(table(r), [
    "Einstieg 2026-06-27–2026-09-06", "Grundlage 1 2026-09-07–2026-10-26", "Flex 2026-10-27–2027-01-10",
    "Wiedereinstieg 2027-01-11–2027-01-24", "Grundlage 2 2027-01-25–2027-03-07", "Aufbau 1 2027-03-08–2027-04-18",
    "Aufbau 2 2027-04-19–2027-05-23", "Peak 2027-05-24–2027-06-13", "Taper 2027-06-14–2027-06-27",
  ]);
  contiguous(r);
  assert.equal(r.phases.find((p) => p.key === "flex").name, "Flex: Gym-Block & Reisen");
  assert.equal(r.phases.filter((p) => p.key === "base2").length, 1);   // alte Grundlage 2 fällt weg
  r.phases.filter((p) => !["einstieg", "flex"].includes(p.key)).forEach((p) => assert.equal(p.start.getDay(), 1, `${p.short} nicht Montag`));
  assert.equal(r.warning, null);
  assert.equal(r.phases.find((p) => p.key === "reentry").hours, "6–9 h");
});

test("Ausgleich über Aufbau 2 und anpassbare Wochenzahlen", () => {
  const a2 = (r) => { const p = r.phases.find((x) => x.key === "build2"); return p ? Math.round((p.end - p.start) / (7 * 86400000)) : 0; };
  assert.equal(a2(P.buildPhases({ race: RACE, planStart: START, flex: FLEX })), 5);
  assert.equal(a2(P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, until: "2027-01-24" } })), 3);
  const g8 = P.buildPhases({ race: RACE, planStart: START, flex: FLEX, plan: { base2Weeks: 8 } });
  assert.equal(a2(g8), 3); contiguous(g8);
  // Flex endet an einem Mittwoch: Wiedereinstieg bekommt die Resttage, Grundlage 2 startet trotzdem am Montag
  const wed = P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, until: "2027-01-13" } });
  contiguous(wed);
  const re = wed.phases.find((p) => p.key === "reentry"), g2 = wed.phases.find((p) => p.key === "base2");
  assert.equal(ymd(re.start), "2027-01-14"); assert.equal(ymd(g2.start), "2027-02-01"); assert.equal(g2.start.getDay(), 1);
});

test("Warnung, wenn für Aufbau 2 weniger als 3 Wochen bleiben; ohne Überschneidungen", () => {
  const two = P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, until: "2027-01-31" } });
  assert.ok(two.warning); assert.equal(two.warning.weeks, 2);
  assert.match(two.warning.text, /nur 2 Wochen für Aufbau 2/);
  contiguous(two);
  assert.equal(P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, until: "2027-01-24" } }).warning, null);   // genau 3 Wochen
  // viel zu wenig Zeit: Aufbau 1, dann Grundlage 2 werden gekürzt, nichts überschneidet sich
  const tight = P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, until: "2027-03-28" } });
  contiguous(tight);
  assert.equal(tight.warning.weeks, 0);
  assert.ok(!tight.phases.some((p) => p.key === "build2"));
  // Flex bis in den Peak
  const late = P.buildPhases({ race: RACE, planStart: START, flex: { ...FLEX, until: "2027-06-01" } });
  contiguous(late); assert.match(late.warning.text, /reicht bis in den Peak/);
});

test("„Aktuelle Phase“ vor, während und nach Flex", () => {
  const r = P.buildPhases({ race: RACE, planStart: START, flex: FLEX });
  const cur = (s) => (P.currentPhase(r.phases, d(s)) || {}).short;
  assert.equal(cur("2026-10-20"), "Grundlage 1");
  assert.equal(cur("2026-10-26"), "Grundlage 1");
  assert.equal(cur("2026-10-27"), "Flex");
  assert.equal(cur("2027-01-10"), "Flex");
  assert.equal(cur("2027-01-11"), "Wiedereinstieg");
  assert.equal(cur("2027-01-25"), "Grundlage 2");
  assert.equal(cur("2027-06-27"), "Taper");            // Renntag gehört zum Taper
  assert.equal(P.currentPhase(r.phases, d("2027-06-28")), null);
  assert.equal(P.currentPhase(r.phases, d("2026-06-01")), null);
});

console.log(`\n${n} Tests bestanden.`);
