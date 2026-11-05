/*
 * Saisonplan – reine Funktionen (kein DOM, kein Date.now()).
 * ----------------------------------------------------------
 *   buildPhases({ race, planStart, flex, plan, base }) → { phases, warning }
 *     Phasen im Montags-Raster (wie Kalender und Wochenkarte): die Renntagswoche (Mo–So) ist die letzte
 *     Woche, jede Phase beginnt an einem Montag (Ausnahme: Einstieg am Anmeldetag, Flex an flex.from).
 *     Ohne Flex: alle Phasen rückwärts vom Renntag (Wochen vor dem Rennen, wie bisher).
 *     Mit Flex (flex.active, from und until): Phasen vor dem Flex-Beginn enden dort, danach Flex, dann
 *     Wiedereinstieg, Grundlage 2, Aufbau 1 und Aufbau 2 (= Rest bis zum Peak). Peak und Taper bleiben
 *     rückwärts vom Renntag. Bleiben für Aufbau 2 weniger als plan.minBuild2Weeks, gibt es eine Warnung.
 *   currentPhase(phases, date) → Phase, in der date liegt (start ≤ date < end), sonst null
 * Phase = { key, name, short, hours, focus, start: Date, end: Date (exklusiv), flex? }
 * Läuft im Browser (window.Phases) und in Node (require("./js/phases.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Phases = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY = 86400000;
  const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const mondayOnOrAfter = (d) => (d.getDay() === 1 ? d : addDays(mondayOf(d), 7));
  const weeksBetween = (a, b) => Math.round((b - a) / (7 * DAY));

  // Bisherige Phasen: from/to = Wochen vor dem Rennen (die Renntagswoche zählt als Woche 1)
  const BASE = [
    { key: "einstieg", name: "Einstieg & Sommer", short: "Einstieg", from: null, to: 42, hours: "6–10 h", focus: ["Anmeldung Ironman Frankfurt ✔", "Lange Ausfahrten & Alpenpässe", "Krafttraining etablieren", "Laufbasis aufbauen"] },
    { key: "base1", name: "Grundlage 1", short: "Grundlage 1", from: 42, to: 28, hours: "8–11 h", focus: ["Schwimmtechnik (3×/Woche, Drills, Wasserlage)", "Viel lockere Zone 2 auf Rad & Lauf", "2–3× Krafttraining (Beine, Rumpf)", "FTP- und Laufbasis stabilisieren"] },
    { key: "base2", name: "Grundlage 2", short: "Grundlage 2", from: 28, to: 20, hours: "10–13 h", focus: ["Schwimmumfang auf 8–10 km/Woche", "Sweet-Spot-Intervalle auf dem Rad", "Langer Lauf bis 20–24 km", "Kraft auf 2× reduzieren, Wartung"] },
    { key: "build1", name: "Aufbau 1", short: "Aufbau 1", from: 20, to: 12, hours: "12–15 h", focus: ["Schwellenarbeit in allen drei Disziplinen", "Lange Ausfahrten 4–5 h, Bergtraining", "Erste Koppeleinheiten (Rad → Lauf)", "Rennernährung testen"] },
    { key: "build2", name: "Aufbau 2 – rennspezifisch", short: "Aufbau 2", from: 12, to: 5, hours: "14–18 h", focus: ["Ironman-Renntempo (65–75 % FTP)", "Langer Lauf bis 30–32 km", "Freiwasserschwimmen im Neo", "Generalprobe / Mitteldistanz"] },
    { key: "peak", name: "Peak", short: "Peak", from: 5, to: 2, hours: "15–18 h", focus: ["Höchste Umfangswochen", "Letzte lange Koppeleinheit (5 h + 1 h)", "Material & Ernährung final"] },
    { key: "taper", name: "Taper", short: "Taper", from: 2, to: 0, hours: "6–9 h", focus: ["Umfang −40–60 %, Intensität kurz halten", "Schlaf, Carb-Loading, Check-in"] },
  ];
  const REENTRY = {
    key: "reentry", name: "Wiedereinstieg", short: "Wiedereinstieg", hours: "6–9 h",
    focus: ["Nach dem Rückflug die ersten 2–3 Tage nur locker", "Rad und Lauf nur Zone 2 nach Puls", "3× Schwimmtechnik pro Woche", "Gym auf 2–3× pro Woche reduzieren", "Umfang Woche für Woche steigern"],
  };
  const PLAN_DEFAULTS = { reentryWeeks: 2, base2Weeks: 6, build1Weeks: 6, minBuild2Weeks: 3 };

  function basePhases(race, planStart) {
    const raceMon = mondayOf(race);
    const weekStart = (n) => addDays(raceMon, -(n - 1) * 7);
    return BASE.map((p) => ({
      key: p.key, name: p.name, short: p.short, hours: p.hours, focus: p.focus.slice(),
      start: p.from == null ? planStart : weekStart(p.from),
      end: p.to === 0 ? addDays(race, 1) : weekStart(p.to),
    }));
  }

  function buildPhases({ race, planStart, flex = null, plan = {} }) {
    const raceD = parseDay(race), startD = parseDay(planStart);
    const base = basePhases(raceD, startD);
    const useFlex = !!(flex && flex.active && flex.from && flex.until);
    if (!useFlex) return { phases: base, warning: null };

    const c = { ...PLAN_DEFAULTS, ...(plan || {}) };
    const byKey = Object.fromEntries(base.map((p) => [p.key, p]));
    const peak = byKey.peak, taper = byKey.taper;
    const fFrom = new Date(Math.max(parseDay(flex.from), startD)), fEnd = addDays(parseDay(flex.until), 1);   // fEnd exklusiv
    const out = [];
    // Phasen vor dem Flex-Beginn: enden mit dem Flex-Beginn, spätere fallen weg
    for (const p of base) {
      if (p.key === "peak" || p.key === "taper") continue;
      if (p.start >= fFrom) continue;
      out.push({ ...p, end: p.end > fFrom ? fFrom : p.end });
    }
    out.push({
      key: "flex", flex: true, name: flex.label ? `Flex · ${flex.label}` : "Flex", short: "Flex", hours: "Minimum",
      focus: ["Wochen-Minimum statt Umfangsziel", "Schwerpunkt Gym", "Ausdauer zur Erhaltung"],
      start: fFrom, end: new Date(Math.min(fEnd, peak.start)),
    });

    let warning = null;
    if (fEnd < peak.start) {
      // Wiedereinstieg ab dem Tag nach Flex; ab Grundlage 2 wieder im Montags-Raster
      const g2Start = new Date(Math.min(addDays(mondayOnOrAfter(fEnd), c.reentryWeeks * 7), peak.start));
      const free = Math.max(0, weeksBetween(g2Start, peak.start));
      let g2 = c.base2Weeks, a1 = c.build1Weeks, a2 = free - g2 - a1;
      if (a2 < 0) { a1 = Math.max(0, a1 + a2); a2 = free - g2 - a1; }   // zu wenig Zeit: erst Aufbau 1 kürzen …
      if (a2 < 0) { g2 = Math.max(0, g2 + a2); a2 = free - g2 - a1; }   // … dann Grundlage 2
      a2 = Math.max(0, a2);
      out.push({ ...REENTRY, focus: REENTRY.focus.slice(), start: fEnd, end: g2Start });
      let s = g2Start;
      for (const [key, weeks] of [["base2", g2], ["build1", a1], ["build2", a2]]) {
        if (weeks <= 0) continue;
        const b = byKey[key];
        out.push({ ...b, focus: b.focus.slice(), start: s, end: addDays(s, weeks * 7) });
        s = addDays(s, weeks * 7);
      }
      if (a2 < c.minBuild2Weeks) {
        warning = { weeks: a2, text: `Zwischen Flex-Ende und Peak bleiben nur ${a2} ${a2 === 1 ? "Woche" : "Wochen"} für Aufbau 2 (empfohlen mindestens ${c.minBuild2Weeks}). Plan prüfen: Flex kürzer oder Grundlage 2 / Aufbau 1 in data.js (plan) verkürzen.` };
      }
    } else {
      warning = { weeks: 0, text: "Der Flex-Zeitraum reicht bis in den Peak – für Wiedereinstieg und Aufbau bleibt keine Zeit. Bitte flex.until in data.js prüfen." };
    }
    out.push({ ...peak, start: new Date(Math.max(peak.start, out[out.length - 1].end)) }, taper);
    return { phases: out.filter((p) => p.end > p.start), warning };
  }

  function currentPhase(phases, date) {
    return (phases || []).find((p) => date >= p.start && date < p.end) || null;
  }

  return { buildPhases, currentPhase, mondayOf, PLAN_DEFAULTS, BASE, REENTRY };
});
