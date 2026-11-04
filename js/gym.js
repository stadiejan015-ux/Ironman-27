/*
 * Gym-Tracker – reine Funktionen (kein DOM, kein Date.now()).
 * ------------------------------------------------------------
 *   parseGymTitle(title, desc, cfg)  → { split, exercise, sets, reps, weight, place, entry } | null
 *   epley(weight, reps)              → geschätztes 1RM = Gewicht × (1 + Wdh./30)
 *   gymSessions(garminActs, stravaActs, cfg) → Krafteinheiten (Garmin vor Strava, ±10 min zusammengeführt)
 *   exerciseHistory(sessions, exercise, cfg) → Einträge mit 1RM und PR-Markierung
 *   splitCounts(sessions, from, to)  → Einheiten je Split im Zeitraum
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
      Legs: ["leg day", "legs", "leg", "beine"],
    },
    perPlace: ["Latzug", "Beinpresse"],   // Maschinen: PR nur am selben Ort vergleichen
    unknownPlace: "unbekannt",
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
  function gymSessions(garminActs, stravaActs, cfg) {
    const c = conf(cfg);
    const toMin = (d) => (d instanceof Date ? d.getTime() : Date.parse(String(d).slice(0, 16))) / 60000;
    const out = (garminActs || []).map((g) => ({ start: g.start, t: toMin(g.start), name: g.name, desc: g.desc || "", sec: g.sec || 0, source: "Garmin" }));
    for (const s of stravaActs || []) {
      const t = toMin(s.date);
      const twin = out.find((g) => Math.abs(g.t - t) <= 10);
      if (twin) { if (!parseOne(twin.name, c) && !parseOne(twin.desc, c)) twin.alt = s.name; continue; }
      const d = s.date instanceof Date ? s.date : new Date(s.date);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      out.push({ start: iso, t, name: s.name, desc: "", sec: s.sec || 0, source: "Strava" });
    }
    return out.sort((a, b) => a.t - b.t).map((s) => {
      const p = parseGymTitle(s.name, s.desc, c) || (s.alt ? parseGymTitle(s.alt, "", c) : null);
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

  return { DEFAULTS, parseGymTitle, epley, gymSessions, exerciseHistory, splitCounts };
});
