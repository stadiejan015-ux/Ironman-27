/*
 * Trainingskalender – reine Funktion (kein DOM, kein Date.now()).
 * -----------------------------------------------------------------
 *   buildCalendar({ acts, gymSessions, today, weeks, levels, isFlex }) →
 *     { weeks: [{ monday, days: [Tag × 7], totalSec, count, flex }] }   (neueste Woche zuerst)
 *   Tag = { date, weekday, isToday, future, items, totalSec, level, cats, more, split }
 * acts:        Strava-Aktivitäten [{ date: Date (lokale Startzeit), cat, sport, name, sec }]
 *              – Kraft wird hier ignoriert, sie kommt ausschließlich aus gymSessions
 * gymSessions: zusammengeführte Krafteinheiten (Gym.gymSessions) [{ start: "YYYY-MM-DDTHH:MM", sec, name, split, parsed }]
 * Läuft im Browser (window.Calendar) und in Node (require("./js/calendar.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Calendar = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SPLIT_SHORT = { Push: "Pu", Pull: "Pl", Legs: "L" };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const dayFrom = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  // "YYYY-MM-DDTHH:MM" als lokale Zeit (für die Reihenfolge innerhalb des Tages)
  const timeFrom = (iso) => { const [d, t = "00:00"] = String(iso).split("T"); const [h, mi] = t.split(":").map(Number); const x = dayFrom(d); x.setHours(h || 0, mi || 0); return x; };

  // Stufe nach Gesamtdauer des Tages: 0 = Ruhetag, 1 = < 45 min, 2 = 45–90 min, 3 = > 90 min
  function levelOf(sec, levels) {
    const [a, b] = levels || [45, 90];
    if (!sec) return 0;
    const min = sec / 60;
    return min < a ? 1 : min <= b ? 2 : 3;
  }

  function buildCalendar({ acts = [], gymSessions = [], today, weeks = 10, levels = [45, 90], isFlex = null } = {}) {
    const items = [];
    for (const a of acts) {
      if (a.cat === "strength") continue;   // Kraft nur aus gymSessions → keine Doppelzählung
      items.push({ day: ymd(a.date), cat: a.cat, sport: a.sport, name: a.name, sec: a.sec || 0, start: a.date });
    }
    for (const g of gymSessions) {
      const p = g.parsed || null;
      items.push({
        day: String(g.start).slice(0, 10), cat: "strength", sport: "WeightTraining", name: g.name, sec: g.sec || 0,
        start: timeFrom(g.start), split: g.split || null, exercise: p ? p.exercise : null,
        entry: p && p.entry ? { sets: p.sets, reps: p.reps, weight: p.weight, place: p.place } : null,
      });
    }
    const byDay = {};
    for (const it of items) (byDay[it.day] = byDay[it.day] || []).push(it);

    const todayIso = ymd(today), thisMonday = mondayOf(today);
    const out = [];
    for (let w = 0; w < weeks; w++) {
      const mon = addDays(thisMonday, -7 * w);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(mon, i), iso = ymd(d);
        const list = (byDay[iso] || []).slice().sort((x, y) => x.start - y.start);
        const totalSec = list.reduce((s, x) => s + x.sec, 0);
        const perCat = {};
        list.forEach((x) => { perCat[x.cat] = (perCat[x.cat] || 0) + x.sec; });
        const catsAll = Object.keys(perCat).sort((x, y) => perCat[y] - perCat[x]);
        const gym = list.find((x) => x.cat === "strength" && x.split);
        days.push({
          date: iso, weekday: i, isToday: iso === todayIso, future: iso > todayIso,
          items: list, totalSec, level: levelOf(totalSec, levels),
          cats: catsAll.slice(0, 3), more: Math.max(0, catsAll.length - 3),
          split: gym ? SPLIT_SHORT[gym.split] || null : null,
        });
      }
      out.push({
        monday: ymd(mon), days,
        totalSec: days.reduce((s, d) => s + d.totalSec, 0),
        count: days.reduce((s, d) => s + d.items.length, 0),
        flex: typeof isFlex === "function" ? days.some((d) => isFlex(dayFrom(d.date))) : false,
      });
    }
    return { weeks: out };
  }

  return { buildCalendar, levelOf, SPLIT_SHORT };
});
