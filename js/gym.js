/*
 * Gym-Tracker – reine Funktionen (kein DOM, kein Date.now()).
 * ------------------------------------------------------------
 *   parseGymTitle(title, desc, cfg)  → { split, exercise, sets, reps, weight, place, entry } | null
 *   epley(weight, reps)              → geschätztes 1RM = Gewicht × (1 + Wdh./30)
 *   gymSessions(garminActs, stravaActs, cfg, otherActs) → Krafteinheiten (Garmin vor Strava, ±10 min zusammengeführt;
 *                                    in Strava anders eingetragene Einheiten, z. B. Klettern, fallen raus)
 *   exerciseHistory(sessions, exercise, cfg) → Einträge mit 1RM und PR-Markierung
 *   splitCounts(sessions, from, to)  → Einheiten je Split im Zeitraum
 *   nextTarget(entry, prog)          → nächstes Ziel nach doppelter Progression { sets, reps, weight, rule }
 *   currentPlace(sessions)           → Ort der letzten Gym-Einheit mit @Ort
 *   liftPlan(sessions, exercise, cfg) → nächstes Ziel, „Ziel erreicht“, Stagnation (Maschinen: nur aktueller Ort)
 *   targetChecks(sessions, exercise, cfg) → je Eintrag: Ziel aus dem Eintrag davor und ob es erreicht wurde
 *   goalProgress(sessions, exercise, cfg) → Fortschritt zum 1RM-Ziel (cfg.goals), null ohne Ziel
 * Formate im Titel (oder in der Beschreibung): „Push 6x100“, „Pull · Latzug 8x90“, „Legs 3x10x180“,
 * „Push 6x100 @Bali“, „Push“ (Einheit ohne Eintrag). „kg“ optional, Komma-Dezimalen erlaubt.
 * Läuft im Browser (window.Gym) und in Node (require("./js/gym.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Gym = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    mainExercise: { Push: "Bankdrücken", Pull: "Latzug", Legs: "Beinpresse" },
    aliases: {
      "Bankdrücken": ["bankdrücken", "bankdruecken", "bench press", "bench"],
      "Latzug": ["latzug", "lat pulldown", "pulldown", "lat"],
      "Beinpresse": ["beinpresse", "leg press"],
    },
    splitKeywords: {
      Push: ["push"],
      Pull: ["pull"],
      Legs: ["leg day", "legday", "legs", "leg", "beine"],
    },
    perPlace: [],   // Übungen, die nur am selben Ort verglichen werden (z. B. Maschinen); leer = alle ortsübergreifend
    unknownPlace: "unbekannt",
    // Doppelte Progression: Wiederholungsbereich [unten, oben] und Gewichtsschritt (kg) je Hauptübung
    progression: {
      "Bankdrücken": { reps: [6, 8], step: 2.5 },
      "Latzug": { reps: [8, 12], step: 5 },
      "Beinpresse": { reps: [8, 12], step: 10 },
      stagnation: 3,   // so viele Einträge ohne neues bestes 1RM → Hinweis
    },
  };
  const conf = (cfg) => ({ ...DEFAULTS, ...(cfg || {}) });
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = (w) => new RegExp(`(^|[^a-zäöüß])${esc(w)}(?=[^a-zäöüß]|$)`, "i");
  const num = (s) => parseFloat(String(s).replace(",", "."));

  function findFirst(text, map) {
    let best = null, pos = Infinity;
    for (const [key, words] of Object.entries(map)) {
      for (const w of words) {
        const m = text.match(word(w));
        if (m && m.index < pos) { pos = m.index; best = key; }
      }
    }
    return best;
  }

  function parseOne(text, c) {
    const t = String(text || "").trim();
    if (!t) return null;
    let split = findFirst(t, c.splitKeywords);
    const exAlias = findFirst(t, c.aliases);
    if (!split && exAlias) split = Object.keys(c.mainExercise).find((k) => c.mainExercise[k] === exAlias) || null;
    if (!split) return null;
    const exercise = exAlias || c.mainExercise[split] || null;
    const placeM = t.match(/@\s*([^@·,;|]+?)\s*(?=$|[·,;|])/);
    const place = placeM ? placeM[1].trim() : null;
    const body = placeM ? t.slice(0, placeM.index) : t;
    const n = "(\\d+(?:[.,]\\d+)?)";
    const x = "\\s*[x×*]\\s*";
    const m3 = body.match(new RegExp(`(\\d+)${x}(\\d+)${x}${n}\\s*(?:kg)?`, "i"));
    const m2 = !m3 && body.match(new RegExp(`(\\d+)${x}${n}\\s*(?:kg)?`, "i"));
    if (m3) return { split, exercise, sets: +m3[1], reps: +m3[2], weight: num(m3[3]), place, entry: true };
    if (m2) return { split, exercise, sets: 1, reps: +m2[1], weight: num(m2[2]), place, entry: true };
    return { split, exercise, sets: null, reps: null, weight: null, place, entry: false };
  }

  // Titel zuerst; liefert die Beschreibung einen Eintrag mit Zahlen, wird dieser ergänzt
  function parseGymTitle(title, desc, cfg) {
    const c = conf(cfg);
    const a = parseOne(title, c), b = parseOne(desc, c);
    if (a && a.entry) return a;
    if (b && b.entry) return { ...b, split: a ? a.split : b.split, place: b.place || (a && a.place) || null };
    return a || b || null;
  }

  const epley = (weight, reps) => weight * (1 + reps / 30);

  /* ---------- Einheiten zusammenführen ---------- */
  // garminActs: [{ id, start: "YYYY-MM-DDTHH:MM", name, desc, sec }]  stravaActs: [{ date: Date|string, name, sec }]
  function gymSessions(garminActs, stravaActs, cfg, otherActs) {
    const c = conf(cfg);
    const toMin = (d) => (d instanceof Date ? d.getTime() : Date.parse(String(d).slice(0, 16))) / 60000;
    const others = (otherActs || []).map((o) => toMin(o.date));
    const out = (garminActs || [])
      .map((g) => ({ start: g.start, t: toMin(g.start), name: g.name, desc: g.desc || "", sec: g.sec || 0, source: "Garmin" }))
      // Garmin speichert z. B. Klettern als Krafttraining – ist es in Strava anders eingetragen, gilt Strava
      .filter((g) => !others.some((t) => Math.abs(t - g.t) <= 10) || (stravaActs || []).some((s) => Math.abs(toMin(s.date) - g.t) <= 10));
    for (const s of stravaActs || []) {
      const t = toMin(s.date);
      const twin = out.find((g) => Math.abs(g.t - t) <= 10);
      if (twin) { if (!parseOne(twin.name, c) && !parseOne(twin.desc, c)) { twin.alt = s.name; twin.altDesc = s.desc || ""; } continue; }
      const d = s.date instanceof Date ? s.date : new Date(s.date);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      out.push({ start: iso, t, name: s.name, desc: s.desc || "", sec: s.sec || 0, source: "Strava" });
    }
    return out.sort((a, b) => a.t - b.t).map((s) => {
      const p = parseGymTitle(s.name, s.desc, c) || (s.alt != null ? parseGymTitle(s.alt, s.altDesc, c) : null);
      return { ...s, parsed: p, split: p ? p.split : null };
    });
  }

  /* ---------- Verlauf je Hauptübung mit PRs ---------- */
  function exerciseHistory(sessions, exercise, cfg) {
    const c = conf(cfg);
    const byPlace = c.perPlace.includes(exercise);
    const best = {};   // Schlüssel: Ort (Maschinen) bzw. "alle"
    return sessions.filter((s) => s.parsed && s.parsed.entry && s.parsed.exercise === exercise).map((s) => {
      const p = s.parsed, place = p.place || c.unknownPlace, key = byPlace ? place : "alle";
      const e1rm = Math.round(epley(p.weight, p.reps) * 10) / 10;
      const prev = best[key];
      const pr = prev != null && e1rm > prev;
      if (prev == null || e1rm > prev) best[key] = e1rm;
      return { date: s.start.slice(0, 10), start: s.start, place, sets: p.sets, reps: p.reps, weight: p.weight, e1rm, pr, first: prev == null, compareKey: key };
    });
  }

  function splitCounts(sessions, fromIso, toIso) {
    const out = { Push: 0, Pull: 0, Legs: 0, ohne: 0, total: 0 };
    for (const s of sessions) {
      const d = s.start.slice(0, 10);
      if (d < fromIso || d > toIso) continue;
      out.total++;
      if (s.split && out[s.split] != null) out[s.split]++; else out.ohne++;
    }
    return out;
  }

  /* ---------- Doppelte Progression ---------- */
  const PROG_FALLBACK = { reps: [8, 12], step: 2.5 };
  function progOf(exercise, cfg) {
    const all = { ...DEFAULTS.progression, ...((cfg && cfg.progression) || {}) };
    return { ...PROG_FALLBACK, ...(DEFAULTS.progression[exercise] || {}), ...(all[exercise] || {}), stagnation: all.stagnation ?? 3 };
  }
  const round2 = (x) => Math.round(x * 100) / 100;

  // Basis: ein Eintrag { sets, reps, weight }. Ziel gilt pro Satz, die Satzzahl bleibt.
  function nextTarget(e, prog) {
    const [lo, hi] = prog.reps, sets = e.sets || 1;
    if (e.reps >= hi) return { sets, reps: lo, weight: round2(e.weight + prog.step), rule: "up" };   // oberes Ende → schwerer
    if (e.reps >= lo) return { sets, reps: e.reps + 1, weight: e.weight, rule: "rep" };              // im Bereich → 1 Wdh. mehr
    return { sets, reps: lo, weight: e.weight, rule: "low" };                                         // darunter → unteres Ende
  }

  // Ziel erreicht: gleiches Gewicht mit mindestens den Ziel-Wdh., oder schwerer mit Wdh. im Bereich – jeweils mit allen Sätzen
  function reachedTarget(e, t, prog) {
    if (!e || !t || (e.sets || 1) < (t.sets || 1)) return false;
    return (e.weight === t.weight && e.reps >= t.reps) || (e.weight > t.weight && e.reps >= prog.reps[0]);
  }

  function currentPlace(sessions) {
    const withPlace = (sessions || []).filter((s) => s.parsed && s.parsed.place);
    return withPlace.length ? withPlace[withPlace.length - 1].parsed.place : null;
  }

  function targetChecks(sessions, exercise, cfg) {
    const c = conf(cfg), prog = progOf(exercise, cfg);
    const byPlace = c.perPlace.includes(exercise), prevAt = {};
    return exerciseHistory(sessions, exercise, cfg).map((e) => {
      const key = byPlace ? e.place : "alle", prev = prevAt[key];
      prevAt[key] = e;
      const target = prev ? nextTarget(prev, prog) : null;
      return { ...e, target, reached: target ? reachedTarget(e, target, prog) : null };
    });
  }

  function liftPlan(sessions, exercise, cfg) {
    const c = conf(cfg), prog = progOf(exercise, cfg);
    const perPlace = c.perPlace.includes(exercise);
    const checks = targetChecks(sessions, exercise, cfg);
    const cur = currentPlace(sessions);
    const place = perPlace ? (cur || (checks.length ? checks[checks.length - 1].place : null)) : null;
    // Maschinen: nur Einträge vom aktuellen Ort, nichts von anderen Orten übertragen
    const scope = perPlace ? checks.filter((e) => e.place === place) : checks;
    const last = scope.length ? scope[scope.length - 1] : null;
    const n = prog.stagnation;
    return {
      exercise, perPlace, place, prog,
      entries: scope,
      last,
      target: last ? nextTarget(last, prog) : null,
      prevTarget: last ? last.target : null,
      reached: !!(last && last.reached),
      noEntryAtPlace: perPlace && !last && checks.length > 0,
      noEntries: checks.length === 0,
      // kein neues bestes 1RM (bei Maschinen am selben Ort) in den letzten n Einträgen; braucht einen Vergleichswert davor
      stagnation: scope.length > n && scope.slice(-n).every((e) => !e.pr),
    };
  }

  /* ---------- 1RM-Ziel ---------- */
  // Aktueller Wert = bestes geschätztes 1RM; bei Übungen in perPlace nur am aktuellen Ort
  function goalProgress(sessions, exercise, cfg) {
    const goal = cfg && cfg.goals ? Number(cfg.goals[exercise]) : NaN;
    if (!(goal > 0)) return null;
    const c = conf(cfg), perPlace = c.perPlace.includes(exercise);
    const hist = exerciseHistory(sessions, exercise, cfg);
    const place = perPlace ? (currentPlace(sessions) || (hist.length ? hist[hist.length - 1].place : null)) : null;
    const scope = perPlace ? hist.filter((e) => e.place === place) : hist;
    const best = scope.reduce((m, e) => (!m || e.e1rm > m.e1rm ? e : m), null);
    const current = best ? best.e1rm : null;
    return { goal, current, best, place, perPlace, pct: current == null ? 0 : Math.round((current / goal) * 100), reached: current != null && current >= goal };
  }

  return { DEFAULTS, parseGymTitle, epley, gymSessions, exerciseHistory, splitCounts, nextTarget, reachedTarget, currentPlace, targetChecks, liftPlan, progOf, goalProgress };
});
