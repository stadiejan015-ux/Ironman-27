/*
 * Wochenzusammenfassung – reine Funktionen aus festen Regeln (kein DOM, kein Date.now(), keine KI/API).
 * ------------------------------------------------------------------------------------------------
 *   defaultWeekStart(today) → Montag der gezeigten Woche (Mo/Di: abgeschlossene Vorwoche, sonst laufende)
 *   weeklySummary({ acts, gymSessions, garminDays, garminLoads, today, weekStart, cfg, equipment }) → Zusammenfassung
 *   loadWeeks({ garminLoads, acts, gymSessions, today, weeks }) → Garmin-Belastung je Woche (neueste zuerst),
 *     aufgeteilt in Kraft / Ausdauer / Sonstiges – nur echte Garmin-Werte, nichts geschätzt
 * Nutzt die vorhandenen Bausteine statt eigener Logik:
 *   Calendar.buildCalendar  – Wochenraster Mo–So, Stunden, Einheiten, Flex-Wochen
 *   Gym.splitCounts / exerciseHistory – Splits und PRs der Hauptübungen
 *   Flex.mergeActs / weekMinimum / lastWhere / flexState / SINCE_DEFAULTS – Minimum, Schwimmen, Flex
 * cfg = { weekly, flex, gym, sinceLast } (aus js/data.js)
 * Läuft im Browser (window.Weekly) und in Node (require("./js/weekly.js")).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./calendar.js"), require("./gym.js"), require("./flex.js"));
  else root.Weekly = factory(root.Calendar, root.Gym, root.Flex);
})(typeof self !== "undefined" ? self : this, function (Calendar, Gym, Flex) {
  "use strict";

  const DAY = 86400000;
  const DEFAULTS = { hrvDropPct: 10, sleepMinH: 7, loadFactor: 1.5, maxHints: 3, weeksBack: 8 };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const mondayOf = Flex.mondayOf;
  const hm = (sec) => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
  const dur = (sec) => (sec >= 3600 ? `${hm(sec)} h` : `${Math.round(sec / 60)} min`);
  const de = (n, d = 0) => n.toFixed(d).replace(".", ",");
  const kg = (w) => de(w, w % 1 ? 1 : 0);
  const entryText = (e) => `${e.sets > 1 ? e.sets + "×" : ""}${e.reps}×${kg(e.weight)} kg`;
  const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  const MIN_NAMES = { gym: "Gym", endurance: "lockere Ausdauer", swim: "Schwimmen" };
  // "YYYY-MM-DDTHH:MM" als lokale Zeit
  const timeFrom = (iso) => { const [dd, t = "00:00"] = String(iso).split("T"); const [h, mi] = t.split(":").map(Number); const x = parseDay(dd); x.setHours(h || 0, mi || 0); return x; };
  const toMin = (x) => (x instanceof Date ? x : timeFrom(x)).getTime() / 60000;
  const MATCH_MIN = 10;   // gleiche Einheit in Strava und Garmin: Start höchstens 10 min auseinander

  /* ---------- Trainingsbelastung (Garmin) ---------- */
  const LOAD_CATS = ["strength", "endurance", "other"];   // Stapelreihenfolge von unten
  // Garmin-Typ → Sportart wie in Strava (swim | bike | run | row | strength | other) → Stapel-Kategorie
  const garminSport = (type) => { const t = type || ""; return /swim/.test(t) ? "swim" : /cycl|bik|ride/.test(t) ? "bike" : /run/.test(t) ? "run" : /row/.test(t) ? "row" : /strength|fitness_equipment|indoor_cardio/.test(t) ? "strength" : "other"; };
  const loadCat = (sport) => (sport === "strength" ? "strength" : ["swim", "bike", "run", "row"].includes(sport) ? "endurance" : "other");

  // Garmin-Einträge den Strava-/Gym-Einheiten zuordnen – jede Einheit höchstens einmal:
  //   1) Startzeit höchstens 10 min auseinander (nächster Treffer)
  //   2) sonst gleicher Tag und gleiche Sportart (z. B. in Strava mit anderer Uhrzeit eingetragen)
  function pairLoads(garminLoads, acts, gymSessions) {
    const S = Flex.mergeActs(acts, gymSessions).map((a) => ({ t: toMin(a.date), day: ymd(a.date), sport: a.cat, used: false }));
    const L = (garminLoads || []).filter((l) => l.start).map((l) => ({ t: toMin(l.start), day: l.start.slice(0, 10), load: l.load, gsport: garminSport(l.type), s: null }))
      .sort((a, b) => a.t - b.t);
    for (const l of L) {
      let best = null;
      for (const x of S) if (!x.used && Math.abs(x.t - l.t) <= MATCH_MIN && (!best || Math.abs(x.t - l.t) < Math.abs(best.t - l.t))) best = x;
      if (best) { best.used = true; l.s = best; }
    }
    for (const l of L) {
      if (l.s) continue;
      const x = S.find((y) => !y.used && y.day === l.day && y.sport === l.gsport);
      if (x) { x.used = true; l.s = x; }
    }
    return {
      // Kategorie: Sportart der zugeordneten Einheit (Garmin speichert z. B. Klettern als Kraft), sonst Garmin-Typ
      loads: L.map((l) => ({ day: l.day, load: l.load, cat: loadCat(l.s ? l.s.sport : l.gsport) })),
      sessions: S.map((x) => ({ day: x.day, loaded: L.some((l) => l.s === x && l.load != null) })),
    };
  }

  // Belastung je Woche – nur echte Garmin-Werte, Einheiten ohne Wert zählen nicht mit
  function loadWeeks({ garminLoads = [], acts = [], gymSessions = [], today, weeks = 8 }) {
    const loads = pairLoads(garminLoads, acts, gymSessions).loads.filter((l) => l.load != null);
    const thisMon = mondayOf(today);
    return Array.from({ length: weeks }, (_, i) => {
      const mon = addDays(thisMon, -7 * i), monIso = ymd(mon), sunIso = ymd(addDays(mon, 6));
      const inWeek = loads.filter((l) => l.day >= monIso && l.day <= sunIso);
      const by = { strength: 0, endurance: 0, other: 0 };
      inWeek.forEach((l) => { by[l.cat] += l.load; });
      return { monday: monIso, ...by, total: by.strength + by.endurance + by.other, n: inWeek.length };
    });
  }

  function defaultWeekStart(today) {
    const mon = mondayOf(today);
    return (today.getDay() + 6) % 7 <= 1 ? addDays(mon, -7) : mon;
  }

  // Schnitt eines Garmin-Tageswerts zwischen zwei Daten (inklusive), nur Tage mit Wert
  function garminAvg(days, fromIso, toIso, key) {
    return avg(days.filter((d) => d.date >= fromIso && d.date <= toIso && d[key] != null).map((d) => d[key]));
  }
  const trend = (cur, prev, eps) => (cur == null || prev == null ? null : cur - prev > eps ? "up" : prev - cur > eps ? "down" : "flat");

  function weeklySummary({ acts = [], gymSessions = [], garminDays = [], garminLoads = null, today, weekStart, cfg = {}, equipment = null }) {
    const c = { ...DEFAULTS, ...(cfg.weekly || {}) };
    const flexCfg = cfg.flex || {}, gymCfg = cfg.gym || {};
    const mon = mondayOf(weekStart), sun = addDays(mon, 6);
    const monIso = ymd(mon), sunIso = ymd(sun), todayIso = ymd(today);
    const running = todayIso >= monIso && todayIso <= sunIso;

    // Wochenraster wie im Kalender: Zielwoche + die 4 Wochen davor
    const back = Math.max(0, Math.round((mondayOf(today) - mon) / (7 * DAY)));
    const isFlex = (d) => Flex.flexState(flexCfg, d).active;
    const cal = Calendar.buildCalendar({ acts, gymSessions, today, weeks: back + 5, isFlex });
    const [week, ...prev4] = cal.weeks.slice(back, back + 5);
    const items = week.days.flatMap((d) => d.items);

    // Gym: Splits (Gym.splitCounts) und Einträge der Hauptübungen
    const splits = Gym.splitCounts(gymSessions, monIso, sunIso);
    const lifts = items.filter((x) => x.cat === "strength" && x.exercise && x.entry)
      .map((x) => ({ exercise: x.exercise, date: x.day, text: `${x.exercise} ${entryText(x.entry)}${x.entry.place ? " @" + x.entry.place : ""}` }));

    // PRs der Hauptübungen in dieser Woche (Gym.exerciseHistory)
    const exercises = [...new Set(Object.values(gymCfg.mainExercise || Gym.DEFAULTS.mainExercise))];
    const prs = exercises.flatMap((ex) => Gym.exerciseHistory(gymSessions, ex, gymCfg)
      .filter((h) => h.pr && h.date >= monIso && h.date <= sunIso).map((h) => ({ ...h, exercise: ex })))
      .sort((a, b) => a.start.localeCompare(b.start));

    // Ziele der Hauptübungen (Gym.targetChecks): Einträge der Woche, die ein Ziel aus dem Eintrag davor hatten
    const checks = exercises.flatMap((ex) => Gym.targetChecks(gymSessions, ex, gymCfg).filter((e) => e.target && e.date >= monIso && e.date <= sunIso));
    const goals = checks.length ? { reached: checks.filter((e) => e.reached).length, total: checks.length } : null;
    // Stagnation zum Wochenende (Gym.liftPlan mit den Einheiten bis Sonntag)
    const upToSun = gymSessions.filter((g) => String(g.start).slice(0, 10) <= sunIso);
    const stagnant = exercises.filter((ex) => Gym.liftPlan(upToSun, ex, gymCfg).stagnation);

    // Ausdauer & Sonstiges je Sportart
    const sports = ["swim", "bike", "run", "other"].map((cat) => {
      const l = items.filter((x) => x.cat === cat);
      return { cat, count: l.length, sec: l.reduce((s, x) => s + x.sec, 0) };
    }).filter((x) => x.count);

    // Gesamtstunden vs. Schnitt der 4 Wochen davor
    const prevSecs = prev4.map((w) => w.totalSec);
    const avg4Sec = prevSecs.length === 4 && prevSecs.some(Boolean) ? avg(prevSecs) : null;
    const totalDiffPct = avg4Sec ? Math.round((week.totalSec / avg4Sec - 1) * 100) : null;

    // Wochen-Minimum (gibt es nur im Flex-Zeitraum)
    const merged = Flex.mergeActs(acts, gymSessions);
    let minimum = null;
    if (week.flex) {
      const wm = Flex.weekMinimum(merged, mon, flexCfg);
      minimum = { ok: wm.ok, items: wm.items, missing: wm.items.filter((x) => !x.ok).map((x) => `${x.need - x.have}× ${MIN_NAMES[x.key] || x.key}`) };
    }

    // Erholung (Garmin): Wochenschnitt vs. Vorwoche
    const prevMonIso = ymd(addDays(mon, -7)), prevSunIso = ymd(addDays(mon, -1));
    const rec = [["sleepH", "Schlaf", 0.1], ["sleepScore", "Sleep Score", 1], ["hrv", "HRV", 1], ["rhr", "Ruhepuls", 1]].map(([key, label, eps]) => {
      const value = garminAvg(garminDays, monIso, sunIso, key), prev = garminAvg(garminDays, prevMonIso, prevSunIso, key);
      return { key, label, value, prev, trend: trend(value, prev, eps) };
    });
    const recovery = rec.some((r) => r.value != null) ? rec : null;
    const recOf = (k) => rec.find((r) => r.key === k).value;

    // Highlight: neuer PR > Wochen-Minimum komplett > längste Einheit
    const longest = items.reduce((m, x) => (!m || x.sec > m.sec ? x : m), null);
    let highlight = null;
    if (prs.length) {
      const p = prs[prs.length - 1];
      highlight = { type: "pr", text: `Neuer PR: ${p.exercise} ${entryText(p)} (1RM ${kg(Math.round(p.e1rm))} kg)${prs.length > 1 ? ` · +${prs.length - 1} weitere` : ""}` };
    } else if (minimum && minimum.ok) {
      highlight = { type: "minimum", text: "Wochen-Minimum komplett erfüllt" };
    } else if (longest) {
      highlight = { type: "longest", cat: longest.cat, text: `Längste Einheit: ${longest.name || "Einheit"} · ${dur(longest.sec)}` };
    }

    // Trainingsbelastung (Garmin): Summe der Einheiten Mo–So, nur echte Werte
    let load = null;
    if (garminLoads && garminLoads.length) {
      const series = loadWeeks({ garminLoads, acts, gymSessions, today, weeks: Math.max(back + 6, c.weeksBack) });
      const cur = series[back], prev = series[back + 1], prev4 = series.slice(back + 1, back + 5);
      const withoutLoad = pairLoads(garminLoads, acts, gymSessions).sessions.filter((x) => x.day >= monIso && x.day <= sunIso && !x.loaded).length;
      const avg4 = prev4.length === 4 && prev4.every((w) => w.n > 0) ? avg(prev4.map((w) => w.total)) : null;
      const day = garminDays.filter((g) => g.date >= monIso && g.date <= sunIso && g.acuteLoad != null)
        .sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
      load = {
        sum: cur.n ? Math.round(cur.total) : null, n: cur.n, withoutLoad,
        prevSum: prev && prev.n ? Math.round(prev.total) : null,
        diffPct: cur.n && prev && prev.n && prev.total > 0 ? Math.round((cur.total / prev.total - 1) * 100) : null,
        byCat: { strength: Math.round(cur.strength), endurance: Math.round(cur.endurance), other: Math.round(cur.other) },
        avg4: avg4 == null ? null : Math.round(avg4),
        acute: day ? day.acuteLoad : null, chronic: day ? day.chronicLoad : null, ratio: day ? day.loadRatio : null,
        status: day ? day.loadStatus || null : null, statusDate: day ? day.date : null,
        weeks: series.slice(0, c.weeksBack), index: back,
      };
    }

    // Hinweise – nur wenn eine Regel greift, nach Wichtigkeit, höchstens maxHints
    const hints = [];
    const hrvBase = garminAvg(garminDays, ymd(addDays(mon, -28)), prevSunIso, "hrv");
    const hrvW = recOf("hrv"), sleepW = recOf("sleepH");
    if (hrvBase && hrvW != null && sleepW != null && hrvW < hrvBase * (1 - c.hrvDropPct / 100) && sleepW < c.sleepMinH) {
      hints.push({ key: "recovery", text: `Erholung im Blick behalten: HRV ${Math.round((1 - hrvW / hrvBase) * 100)} % unter dem 4-Wochen-Schnitt, Schlaf Ø ${hm(sleepW * 3600)} h.` });
    }
    if (load && load.avg4 && load.sum != null && load.sum > c.loadFactor * load.avg4) {
      hints.push({ key: "load", text: "Belastung deutlich gestiegen. Umfang langsam aufbauen." });
    }
    if (stagnant.length) {
      const nStag = Gym.progOf(stagnant[0], gymCfg).stagnation;
      hints.push({ key: "stagnation", text: `Seit ${nStag} Einheiten kein Fortschritt bei ${stagnant.join(", ")}.` });
    }
    if (!splits.Legs) hints.push({ key: "legs", text: running ? "Legs kam diese Woche bisher nicht vor." : "Legs kam in dieser Woche nicht vor." });
    const swimCfg = { ...Flex.SINCE_DEFAULTS.swim, ...((cfg.sinceLast || {}).swim || {}) };
    const poolOk = !(week.flex && equipment && !equipment.includes("pool"));
    if (poolOk) {
      const last = Flex.lastWhere(merged, (a) => a.cat === "swim", running ? today : sun);
      if (!last) hints.push({ key: "swim", text: "Seit der Anmeldung noch kein Schwimmen." });
      else if (last.days > swimCfg.yellow) hints.push({ key: "swim", text: `Schwimmen ist ${last.days} Tage her.` });
    }
    if (week.flex && flexCfg.until) {
      const left = Math.ceil(Math.round((parseDay(flexCfg.until) - sun) / DAY) / 7);
      if (left > 0) hints.push({ key: "flex", text: `Noch ${left} ${left === 1 ? "Woche" : "Wochen"} bis zum Ende der Flex-Phase.` });
      else hints.push({ key: "flex", text: "Letzte Woche der Flex-Phase." });
    }

    return {
      monday: monIso, sunday: sunIso, running, flex: week.flex, empty: week.count === 0,
      highlight, totalSec: week.totalSec, count: week.count, avg4Sec, totalDiffPct,
      gym: { count: splits.total, splits, lifts, goals, stagnant }, prs, sports, minimum, recovery, load,
      hints: hints.slice(0, c.maxHints),
    };
  }

  return { DEFAULTS, LOAD_CATS, defaultWeekStart, weeklySummary, loadWeeks, pairLoads, garminAvg };
});
