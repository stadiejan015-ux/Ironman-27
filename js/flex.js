/*
 * Flex-Modus („Gym-Block & Reisen“) – reine Funktionen (kein DOM, kein Date.now()).
 * -----------------------------------------------------------------------------------
 *   flexState(cfg, date)                    → ist der Flex-Zeitraum aktiv, Tage bis Ende, Wiedereinstieg?
 *   splitOf(text, cfg)                      → "Push" | "Pull" | "Legs" | null
 *   gymSessions(acts, cfg)                  → Krafteinheiten mit erkanntem Split
 *   nextSplit(sessions, cfg)                → nächster Split der Rotation
 *   weekMinimum(acts, weekStart, cfg)       → Stand des Wochen-Minimums
 *   suggestFlex({ now, acts, equipment, level, cfg, zones, paceHint }) → Tagesvorschlag
 * acts: [{ date: Date, sport, name, sec, cat }]  (cat: swim | bike | run | strength | other)
 * Läuft im Browser (window.Flex) und in Node (require("./js/flex.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Flex = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY = 86400000;
  const DEFAULT_SPLITS = {
    Push: ["push", "brust", "chest", "bankdrücken", "bench"],
    Pull: ["pull", "rücken", "back", "latzug", "lat pulldown"],
    Legs: ["legs", "leg day", "legday", "leg", "beine", "beinpresse", "leg press", "squat"],
  };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

  /* ---------- Zeitraum ---------- */
  function flexState(cfg, date) {
    if (!cfg || !cfg.active || !cfg.until) return { active: false };
    const day = parseDay(ymd(date)), until = parseDay(cfg.until), from = cfg.from ? parseDay(cfg.from) : null;
    if (day > until || (from && day < from)) return { active: false };
    const daysLeft = Math.round((until - day) / DAY);
    return { active: true, from, until, daysLeft, reentry: daysLeft <= (cfg.reentryDays ?? 14), label: cfg.label || "Flex-Phase" };
  }

  /* ---------- Splits ---------- */
  function splitOf(text, cfg) {
    const map = (cfg && cfg.splitKeywords) || DEFAULT_SPLITS;
    const t = ` ${String(text || "").toLowerCase()} `;
    let best = null, pos = Infinity;
    for (const [split, words] of Object.entries(map)) {
      for (const w of words) {
        const re = new RegExp(`(^|[^a-zäöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zäöüß]|$)`, "i");
        const m = t.match(re);
        if (m && m.index < pos) { pos = m.index; best = split; }
      }
    }
    return best;
  }

  function gymSessions(acts, cfg) {
    return acts.filter((a) => a.cat === "strength")
      .map((a) => ({ ...a, split: splitOf(`${a.name || ""} ${a.description || ""}`, cfg) }))
      .sort((a, b) => a.date - b.date);
  }

  function nextSplit(sessions, cfg) {
    const order = (cfg && cfg.rotation) || ["Push", "Pull", "Legs"];
    const known = sessions.filter((s) => s.split);
    if (!known.length) return { split: order[0], basis: null };
    const last = known[known.length - 1];
    return { split: order[(order.indexOf(last.split) + 1) % order.length], basis: last };
  }

  /* ---------- Wochen-Minimum ---------- */
  function weekMinimum(acts, weekStart, cfg) {
    const min = (cfg && cfg.minimum) || { gym: 4, endurance: 2, enduranceMinMinutes: 30, swim: 1 };
    const start = mondayOf(weekStart);
    const days = new Set(Array.from({ length: 7 }, (_, i) => ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))));
    const inWeek = acts.filter((a) => days.has(ymd(a.date)));
    const gym = inWeek.filter((a) => a.cat === "strength").length;
    const endu = inWeek.filter((a) => ["swim", "bike", "run"].includes(a.cat) && a.sec >= min.enduranceMinMinutes * 60);
    const swim = endu.filter((a) => a.cat === "swim").length;
    const items = [
      { key: "gym", label: `${min.gym}× Gym`, have: gym, need: min.gym },
      { key: "endurance", label: `${min.endurance}× lockere Ausdauer (≥ ${min.enduranceMinMinutes} min)`, have: endu.length, need: min.endurance },
      { key: "swim", label: `davon ${min.swim}× Schwimmen`, have: swim, need: min.swim },
    ].map((x) => ({ ...x, ok: x.have >= x.need }));
    return { weekStart: start, items, ok: items.every((x) => x.ok), missing: items.filter((x) => !x.ok).map((x) => x.key) };
  }

  /* ---------- Tagesvorschlag ---------- */
  const EQUIPMENT = {
    pool: "Pool/Meer", treadmill: "Laufband", runOutside: "Draußen laufen", bike: "Rad/Zwift", gym: "Gym", heat: "Hitze (> 25 °C)",
  };

  function suggestFlex({ now, acts, equipment, level = 0, cfg, zones, paceHint }) {
    const eq = new Set(equipment && equipment.length ? equipment : (cfg.defaultEquipment || ["gym", "treadmill", "runOutside"]));
    const sessions = gymSessions(acts, cfg);
    const next = nextSplit(sessions, cfg);
    const today = ymd(now);
    const gymToday = sessions.filter((s) => ymd(s.date) === today);
    const lastLegs = [...sessions].reverse().find((s) => s.split === "Legs");
    const legHours = lastLegs ? (now - lastLegs.date) / 3600000 : Infinity;
    const afterLegs = legHours <= (cfg.legDayHours ?? 48);
    const week = weekMinimum(acts, now, cfg);
    const z2 = zones && zones[1] ? `${zones[1][0]}–${zones[1][1]} bpm` : "Zone 2";
    const z1max = zones && zones[1] ? zones[1][0] : 130;
    const notes = [];

    // Gym
    let gym;
    if (level >= 3) gym = { title: "Gym-Pause", detail: "Heute regenerieren: Spaziergang, 20 min Mobility, früh schlafen.", rest: true };
    else if (!eq.has("gym")) gym = { title: `Kein Gym verfügbar – ${next.split} verschieben`, detail: "Optional 20–30 min Körpergewicht (Liegestütze, Ausfallschritte, Rumpf).", skip: true };
    else if (gymToday.length) gym = { title: `${gymToday[gymToday.length - 1].split || "Gym"} erledigt`, detail: `Als Nächstes dran: ${next.split}.`, done: true };
    else gym = { title: next.split, detail: level === 2 ? "Leichter Tag: Technik, 1 Satz weniger, nicht ans Limit." : `Rotation ${((cfg.rotation) || ["Push", "Pull", "Legs"]).join(" → ")}${next.basis ? ` · zuletzt ${next.basis.split}` : ""}.` };

    // Ausdauer – bevorzugt, was beim Minimum fehlt
    let endurance = null;
    if (level < 3) {
      const needSwim = week.missing.includes("swim"), needEndu = week.missing.includes("endurance");
      const opts = [];
      if (eq.has("pool")) opts.push("swim");
      if (eq.has("bike")) opts.push("bike");
      if (eq.has("runOutside")) opts.push("runOutside");
      if (eq.has("treadmill")) opts.push("treadmill");
      // Nach Leg Day: Schwimmen und Rad vor Laufen; ohne Bedarf: Schwimmen fürs Minimum zuerst
      const rank = (o) => (o === "swim" ? (needSwim ? 0 : afterLegs ? 1 : 2) : o === "bike" ? (afterLegs ? 2 : 3) : afterLegs ? 6 : o === "runOutside" ? 4 : 5);
      const pick = opts.sort((a, b) => rank(a) - rank(b))[0];
      if (pick) {
        const minutes = level >= 1 ? 30 : pick === "swim" ? 40 : 45;
        const slower = eq.has("heat") || pick === "treadmill";
        const pace = paceHint && (pick === "runOutside" || pick === "treadmill") ? ` Grobe Pace: ${paceHint}.` : "";
        const runNote = afterLegs && (pick === "runOutside" || pick === "treadmill") ? " Nach dem Leg Day nur ganz locker, kein hartes Laufen." : "";
        const titles = { swim: "Lockeres Schwimmen", bike: "Lockeres Radfahren", runOutside: "Lockerer Lauf", treadmill: "Lockerer Lauf (Laufband)" };
        endurance = {
          type: pick, title: titles[pick], minutes, forMinimum: (pick === "swim" && needSwim) || needEndu,
          detail: pick === "swim"
            ? `${minutes} min ruhig, Technik und Wasserlage, Puls unter ${z1max + 15} bpm.`
            : `${minutes} min in Zone 2: ${z2} – nach Puls, nicht nach Tempo.${pace}${slower ? ` ${eq.has("heat") ? "Bei Hitze" : "Auf dem Laufband"} darf die Pace deutlich langsamer sein.` : ""}${runNote}`,
        };
      }
    }
    if (afterLegs) notes.push(`Leg Day vor ${Math.round(legHours)} h – kein harter Lauf`);
    if (level === 1) notes.push("Garmin: moderate Bereitschaft – Ausdauer kürzer und locker");
    if (level === 2) notes.push("Garmin: eingeschränkt – nur leicht trainieren");
    if (level >= 3) notes.push("Garmin: Erholung hat Vorrang");
    return { gym, endurance, week, next, afterLegs, notes };
  }

  return { flexState, splitOf, gymSessions, nextSplit, weekMinimum, suggestFlex, mondayOf, EQUIPMENT };
});
