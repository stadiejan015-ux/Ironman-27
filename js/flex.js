/*
 * Flex-Modus („Gym-Block & Reisen“) – reine Funktionen (kein DOM, kein Date.now()).
 * -----------------------------------------------------------------------------------
 *   flexState(cfg, date)                    → ist der Flex-Zeitraum aktiv, Tage bis Ende, Wiedereinstieg?
 *   isIgnored({ date, sport, name }, cfg)   → Zwift-Fahrt im Flex-Zeitraum, die nicht zählt (flex.ignoreVirtualRides)
 *   splitOf(text, cfg)                      → "Push" | "Pull" | "Legs" | null
 *   gymSessions(acts, cfg)                  → Krafteinheiten mit erkanntem Split
 *   nextSplit(sessions, cfg)                → nächster Split der Rotation
 *   weekMinimum(acts, weekStart, cfg)       → Stand des Wochen-Minimums
 *   suggestFlex({ now, acts, equipment, level, cfg, zones, paceHint }) → Tagesvorschlag
 *   sinceLast({ now, acts, cfg, splitCfg, flexActive, equipment }) → „Zuletzt gemacht“-Kacheln
 *   lastWhere(acts, pred, now)              → letzte passende Einheit + Tage seitdem (gemeinsam genutzt)
 *   mergeActs(acts, gymSessions)            → Strava ohne Kraft + zusammengeführte Gym-Einheiten
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

  // Zwift-Fahrt im Flex-Zeitraum, die nicht zählt (flex.ignoreVirtualRides). a = { date (Date oder ISO), sport, name }:
  // Strava „VirtualRide“, Garmin „virtual_ride“ oder eine Radfahrt mit „Zwift“ im Namen. Läufe zählen immer.
  function isIgnored(a, cfg) {
    if (!a || !cfg || !cfg.ignoreVirtualRides) return false;
    const sport = String(a.sport || ""), name = String(a.name || "");
    const virtual = sport === "VirtualRide" || sport === "virtual_ride" || (/ride|cycling/i.test(sport) && /zwift/i.test(name));
    if (!virtual || !a.date) return false;
    const dt = a.date instanceof Date ? a.date : new Date(String(a.date).length === 10 ? `${a.date}T00:00` : String(a.date).slice(0, 16));
    return flexState(cfg, dt).active;
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

  /* ---------- Zuletzt gemacht ---------- */
  // Kalendertage zwischen zwei Zeitpunkten (lokales Datum, robust bei Monatswechsel und Zeitumstellung)
  const daysBetween = (a, b) => Math.round((parseDay(ymd(b)) - parseDay(ymd(a))) / DAY);
  // Letzte Einheit bis einschließlich heute, auf die pred passt → { act, days } | null
  function lastWhere(acts, pred, now) {
    let last = null;
    for (const a of acts) if (pred(a) && daysBetween(a.date, now) >= 0 && (!last || a.date > last.date)) last = a;
    return last ? { act: last, days: daysBetween(last.date, now) } : null;
  }
  const agoText = (days) => (days == null ? "noch nie" : days === 0 ? "heute" : days === 1 ? "gestern" : `vor ${days} Tagen`);

  // Startwerte (Tage: grün bis / gelb bis, danach rot); in js/data.js unter sinceLast anpassbar
  const SINCE_DEFAULTS = {
    swim: { label: "Schwimmen", green: 7, yellow: 14 },
    bike: { label: "Rad", green: 10, yellow: 21 },
    run: { label: "Laufen", green: 4, yellow: 10 },
    longRun: { label: "Langer Lauf", green: 14, yellow: 28, minMinutes: 75 },
    longRide: { label: "Lange Fahrt", green: 21, yellow: 42, minMinutes: 150 },
    legs: { label: "Legs", green: 5, yellow: 9 },
  };
  // Was zählt und welche Ausstattung (Flex) dafür nötig ist
  const SINCE_RULES = {
    swim: { cat: "swim", needs: ["pool"] },
    bike: { cat: "bike", needs: ["bike"] },
    run: { cat: "run", needs: ["treadmill", "runOutside"] },
    longRun: { cat: "run", long: true, needs: ["treadmill", "runOutside"] },
    longRide: { cat: "bike", long: true, needs: ["bike"] },
    legs: { split: "Legs", needs: ["gym"] },
  };

  /*  sinceLast({ now, acts, cfg, splitCfg, flexActive, equipment }) →
   *    [{ key, label, days, text, state, note, last, minMinutes }]
   *  state: good | warn | bad | na (Ausstattung fehlt, Flex) | info (lange Einheit im Flex, ohne Ampel) */
  function sinceLast({ now, acts = [], cfg = {}, splitCfg, flexActive = false, equipment = null }) {
    const eq = new Set(equipment || []);
    const sessions = gymSessions(acts, splitCfg);
    return Object.keys(SINCE_DEFAULTS).map((key) => {
      const c = { ...SINCE_DEFAULTS[key], ...(cfg[key] || {}) }, r = SINCE_RULES[key];
      const minSec = r.long ? (c.minMinutes || 0) * 60 : 0;
      const hit = r.split
        ? lastWhere(sessions, (s) => s.split === r.split, now)
        : lastWhere(acts, (a) => a.cat === r.cat && (a.sec || 0) >= minSec, now);
      const days = hit ? hit.days : null;
      let state = days == null ? "bad" : days <= c.green ? "good" : days <= c.yellow ? "warn" : "bad", note = "";
      if (flexActive && r.long) { state = "info"; note = "Info im Flex"; }
      else if (flexActive && equipment && !r.needs.some((k) => eq.has(k))) { state = "na"; note = "nicht verfügbar"; }
      return { key, label: c.label, days, text: agoText(days), state, note, last: hit ? hit.act : null, minMinutes: r.long ? c.minMinutes : null };
    });
  }

  // Eine Einheitenliste für Flex, „Zuletzt gemacht“ und Wochenkarte: Ausdauer & Co. aus Strava,
  // Kraft ausschließlich aus den zusammengeführten Gym-Einheiten (Gym.gymSessions) → nichts doppelt
  function mergeActs(acts, gymSess) {
    return (acts || []).filter((a) => a.cat !== "strength").concat((gymSess || []).map((x) => ({
      date: new Date(x.start), cat: "strength", sport: "WeightTraining", sec: x.sec, title: x.alt || x.name,
      name: x.split || [x.name, x.desc, x.alt].filter(Boolean).join(" "),
    })));
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
      // Schwimmen nur, wenn es im Minimum verlangt ist (swim: 0 → kein Eintrag, kein Ring)
      ...((min.swim || 0) > 0 ? [{ key: "swim", label: `davon ${min.swim}× Schwimmen`, have: swim, need: min.swim }] : []),
    ].map((x) => ({ ...x, ok: x.have >= x.need }));
    return { weekStart: start, items, ok: items.every((x) => x.ok), missing: items.filter((x) => !x.ok).map((x) => x.key) };
  }

  // Was beim Wochen-Minimum tatsächlich noch fehlt, z. B. „1× lockere Ausdauer, davon Schwimmen“ (leer = erfüllt).
  // Schwimmen zählt als Ausdauer: fehlen beide, ist die fehlende Ausdauer „davon Schwimmen“.
  function minimumRest(week) {
    const by = Object.fromEntries(((week && week.items) || []).map((x) => [x.key, x]));
    const rest = (k) => (by[k] ? Math.max(0, by[k].need - by[k].have) : 0);
    const g = rest("gym"), e = rest("endurance"), sw = rest("swim"), parts = [];
    if (g) parts.push(`${g}× Gym`);
    if (e) parts.push(`${e}× lockere Ausdauer`);
    if (sw && e) {
      const d = Math.min(sw, e);
      parts.push(d === 1 ? "davon Schwimmen" : `davon ${d}× Schwimmen`);
      if (sw > e) parts.push(`dazu ${sw - e}× Schwimmen`);
    } else if (sw) parts.push(`${sw}× Schwimmen`);
    return parts.join(", ");
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
    const lastLegs = lastWhere(sessions, (s) => s.split === "Legs", now);
    const legHours = lastLegs ? Math.max(0, (now - lastLegs.act.date) / 3600000) : Infinity;   // nie negativ (Gerät in anderer Zeitzone)
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
    else gym = { title: next.split, detail: level === 2 ? "Leichter Tag: Technik, 1 Satz weniger, nicht ans Limit." : `Rotation ${((cfg.rotation) || ["Push", "Pull", "Legs"]).join(" → ")}${next.basis ? `, zuletzt ${next.basis.split}` : ""}.` };

    // Ausdauer – heute schon erledigt? Sonst bevorzugt, was beim Minimum fehlt
    let endurance = null;
    const minMin = ((cfg && cfg.minimum) || {}).enduranceMinMinutes ?? 30;
    const enduToday = acts.filter((a) => ["swim", "bike", "run"].includes(a.cat) && ymd(a.date) === today);
    if (enduToday.length) {
      const main = enduToday.reduce((x, y) => (y.sec > x.sec ? y : x));
      const total = Math.round(enduToday.reduce((s, a) => s + a.sec, 0) / 60);
      const counts = enduToday.some((a) => a.sec >= minMin * 60);
      const it = week.items.find((x) => x.key === "endurance");
      const label = { swim: "Schwimmen", bike: "Radfahren", run: "Laufen" }[main.cat];
      endurance = {
        type: main.cat, title: `${label} erledigt`, minutes: total, done: true, forMinimum: false,
        detail: `${enduToday.map((a) => a.name).filter(Boolean).join(", ") || label}. `
          + (!counts ? `Zählt erst ab ${minMin} min fürs Wochen-Minimum.`
            : it && !it.ok ? `Zählt fürs Wochen-Minimum (${it.have}/${it.need}) – noch ${it.need - it.have}× an einem anderen Tag.`
              : "Ausdauer-Minimum für diese Woche erfüllt."),
      };
    } else if (level < 3) {
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

  return { flexState, isIgnored, splitOf, gymSessions, mergeActs, nextSplit, weekMinimum, minimumRest, suggestFlex, sinceLast, lastWhere, daysBetween, agoText, mondayOf, EQUIPMENT, SINCE_DEFAULTS };
});
