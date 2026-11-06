/*
 * Datenstand – reine Funktionen (kein DOM, kein Date.now()).
 * ---------------------------------------------------------
 *   freshness({ now, strava: { snapshotAt, snapshotDate }, garmin: { updated, lastDay }, cfg }) →
 *     { strava, garmin, watch, messages, worst, stamp, footer }
 * strava.snapshotAt / garmin.updated: ISO-Zeit mit Zeitzone (z. B. "2026-11-05T13:40+00:00").
 * Fehlt snapshotAt (ältere Daten), zählt snapshotDate (nur Datum) – dann erst ab 2 Tagen eine Warnung.
 * garmin.lastDay: neuester Garmin-Tag mit Schlafwert ("YYYY-MM-DD") – für „Uhr nicht synchronisiert“.
 * Alle Zeiten werden in der lokalen Zeit des Geräts angezeigt.
 * Läuft im Browser (window.Freshness) und in Node (require("./js/freshness.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Freshness = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HOUR = 3600000, DAY = 86400000;
  const DEFAULTS = {
    stravaWarnH: 20, stravaBadH: 48,   // Strava-Update läuft mittags und abends
    garminWarnH: 8, garminBadH: 24,    // Garmin-Update alle 3 h
    fallbackWarnDays: 2,               // ohne snapshotAt: erst ab so vielen Tagen warnen
    watchDays: 2,                      // letzter Tageswert älter als gestern → Uhr nicht synchronisiert
    actionsUrl: "https://github.com/stadiejan015-ux/Ironman-27/actions",
  };
  const pad = (n) => String(n).padStart(2, "0");
  const parseIso = (s) => { if (!s) return null; const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t); };
  const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return y && m && d ? new Date(y, m - 1, d) : null; };
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
  // Anzeige in Gerätezeit: "05.11." bzw. "05.11. 21:42"
  const dm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const stamp = (d) => `${dm(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const ageText = (h) => (h < 48 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} Tage`);
  const level = (h, warn, bad) => (h >= bad ? "bad" : h >= warn ? "warn" : "ok");
  const RANK = { ok: 0, info: 1, warn: 2, bad: 3 };

  function freshness({ now, strava = null, garmin = null, cfg = {} }) {
    const c = { ...DEFAULTS, ...(cfg || {}) };
    const messages = [];

    // Strava: genauer Zeitpunkt, sonst nur das Datum
    let s = { level: "unknown" };
    if (strava) {
      const at = parseIso(strava.snapshotAt);
      if (at) {
        const ageH = Math.max(0, (now - at) / HOUR);
        s = { exact: true, at, ageH, level: level(ageH, c.stravaWarnH, c.stravaBadH) };
        if (s.level !== "ok") messages.push({ source: "strava", level: s.level, text: `Strava-Daten sind ${ageText(ageH)} alt – der automatische Sync ist evtl. ausgefallen.`, tip: { text: "In Claude Code „Update jetzt“ schreiben." } });
      } else if (parseDay(strava.snapshotDate)) {
        const date = parseDay(strava.snapshotDate), ageDays = Math.max(0, daysBetween(date, now));
        // ab fallbackWarnDays gelb; rot erst einen Tag später – erst dann sind sicher mehr als 48 h vergangen
        const lv = ageDays >= c.fallbackWarnDays + 1 ? "bad" : ageDays >= c.fallbackWarnDays ? "warn" : "ok";
        s = { exact: false, date, ageDays, level: lv };
        if (lv !== "ok") messages.push({ source: "strava", level: lv, text: `Strava-Daten sind vom ${dm(date)} (${ageDays} Tage alt) – der automatische Sync ist evtl. ausgefallen.`, tip: { text: "In Claude Code „Update jetzt“ schreiben." } });
      }
    }

    // Garmin
    let g = { level: "unknown" };
    if (garmin) {
      const at = parseIso(garmin.updated);
      if (at) {
        const ageH = Math.max(0, (now - at) / HOUR);
        g = { at, ageH, level: level(ageH, c.garminWarnH, c.garminBadH) };
        if (g.level !== "ok") messages.push({ source: "garmin", level: g.level, text: `Garmin-Daten sind ${ageText(ageH)} alt – der automatische Sync ist evtl. ausgefallen.`, tip: { text: "Läufe unter GitHub Actions ansehen", href: c.actionsUrl } });
      }
    }

    // Uhr nicht synchronisiert: Sync frisch, aber der neueste Tageswert älter als gestern
    let watch = { show: false, daysSince: null };
    if (garmin && garmin.lastDay && parseDay(garmin.lastDay)) {
      const daysSince = Math.max(0, daysBetween(parseDay(garmin.lastDay), now));
      watch = { daysSince, show: g.level === "ok" && daysSince >= c.watchDays };
      if (watch.show) messages.push({ source: "watch", level: "info", text: `Deine Uhr hat seit ${daysSince} Tagen nicht mit Garmin Connect synchronisiert.` });
    }

    const worst = messages.reduce((w, m) => (RANK[m.level] > RANK[w] ? m.level : w), "ok");
    const footer = [
      strava ? `Strava ${s.exact ? stamp(s.at) : s.date ? dm(s.date) : "–"}` : null,
      garmin && g.at ? `Garmin ${stamp(g.at)}` : null,
    ].filter(Boolean).join(", ");
    // ändert sich mit jedem Update → „Ausblenden“ gilt nur bis zu neuen Daten
    const key = [strava && (strava.snapshotAt || strava.snapshotDate), garmin && garmin.updated, garmin && garmin.lastDay].map((x) => x || "").join("|");
    return { strava: s, garmin: g, watch, messages, worst, stamp: key, footer };
  }

  return { DEFAULTS, freshness, stamp, daysBetween };
});
