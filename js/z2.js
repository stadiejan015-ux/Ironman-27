/*
 * Zone-2-Entwicklung – reine Funktionen (kein DOM, kein Date.now()).
 * --------------------------------------------------------------------
 * Pro Aktivität:  analyzeActivity(meta, streams, cfg, hrZones) → Kennzahlen
 *   meta    = { id, date, sport, name, km, sec, elev, trainer }
 *   streams = { time, heart_rate, velocity_smooth, watts, grade_smooth, altitude, moving } (Strava-Streams)
 *   cfg     = window.TRAINING.z2,  hrZones = window.TRAINING.zones.hr
 * Auswertung:     paceSeries / wattSeries / kpi / rollingMedian / weeklyZones / summary
 * kindOf(sport) → "run" | "ride" | null: die eine Liste, welche Strava-Sportart als Lauf bzw. Rad zählt
 *                 (gilt für die ganze Seite, js/app.js nutzt sie für die Kategorien)
 * Läuft im Browser (window.Z2) und in Node (require("./js/z2.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Z2 = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY = 86400000;
  const RUN = ["Run", "TrailRun", "VirtualRun"];
  const RIDE = ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"];
  const r1 = (x) => Math.round(x * 10) / 10;
  const pctDe = (x) => `${Math.round(x * 100)} %`;
  const mmss = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  /* ---------- Grundbausteine ---------- */
  // Untergrenzen der Zonen, z. B. [0, 130, 153, 176, 201]
  const zoneMins = (hrZones) => hrZones.map((z) => z[0]);
  function zoneIndex(hr, mins) {
    let z = 0;
    for (let i = 1; i < mins.length; i++) if (hr >= mins[i]) z = i;
    return z;
  }

  function weightedMedian(items) { // items: [{v, w}]
    const a = items.filter((x) => x.w > 0 && Number.isFinite(x.v)).sort((x, y) => x.v - y.v);
    const total = a.reduce((s, x) => s + x.w, 0);
    if (!total) return null;
    let acc = 0;
    for (const x of a) { acc += x.w; if (acc >= total / 2) return x.v; }
    return a[a.length - 1].v;
  }
  function median(values) {
    const a = values.filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const wMean = (arr, key) => {
    let s = 0, w = 0;
    for (const x of arr) if (Number.isFinite(x[key]) && x.dt > 0) { s += x[key] * x.dt; w += x.dt; }
    return w ? s / w : null;
  };
  const dur = (arr) => arr.reduce((s, x) => s + x.dt, 0);

  // Steigungsbereinigte Pace (GAP): Energiekosten des Laufens nach Minetti et al. (2002),
  // C(i) = 155,4i⁵ − 30,4i⁴ − 43,3i³ + 46,3i² + 19,5i + 3,6 (J/kg/m), i = Steigung als Anteil.
  // GAP-Geschwindigkeit = v · C(i) / C(0) – bergauf schneller, bergab langsamer als gemessen.
  function gapFactor(gradePct) {
    if (!Number.isFinite(gradePct)) return 1;
    const i = Math.max(-0.45, Math.min(0.45, gradePct / 100));
    return (155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6) / 3.6;
  }

  /* ---------- Stream vorbereiten ---------- */
  // Stillstand entfernen, Bewegungszeit aufbauen, HF/Tempo/Watt mit gleitendem Mittel glätten,
  // Aufwärmen abtrennen. Gibt { all, main } zurück (all inkl. Aufwärmen).
  function prepare(streams, cfg) {
    const t = streams.time || [];
    const hr = streams.heart_rate || [], v = streams.velocity_smooth || [], w = streams.watts || [];
    const g = streams.grade_smooth || [], alt = streams.altitude || [], mv = streams.moving || [];
    const gap = cfg.maxGapSec || 10;
    const s = [];
    let mt = 0;
    for (let i = 0; i < t.length; i++) {
      const dt = i ? Math.min(Math.max(t[i] - t[i - 1], 0), gap) : 0;
      if (mv.length && mv[i] === false) continue;
      mt += dt;
      s.push({ mt, dt, hr: hr[i], v: v[i], w: w[i], g: g[i], alt: alt[i], gap: Number.isFinite(v[i]) ? v[i] * gapFactor(g[i]) : undefined });
    }
    // Zeitbasiertes gleitendes Mittel (rückwärts, Fenster smoothSec) – je Kanal, zeitgewichtet
    const win = cfg.smoothSec || 60;
    for (const key of ["hr", "v", "w", "gap"]) {
      let lo = 0, sum = 0, wsum = 0;
      for (let i = 0; i < s.length; i++) {
        const x = s[i];
        if (Number.isFinite(x[key])) { sum += x[key] * (x.dt || 1); wsum += x.dt || 1; }
        while (s[lo].mt <= x.mt - win) {
          const y = s[lo];
          if (Number.isFinite(y[key])) { sum -= y[key] * (y.dt || 1); wsum -= y.dt || 1; }
          lo++;
        }
        x[key + "S"] = wsum > 0 ? sum / wsum : null;
      }
    }
    const main = s.filter((x) => x.mt >= (cfg.warmupSec || 0));
    return { all: s, main, movingSec: mt };
  }

  /* ---------- Kennzahlen ---------- */
  function zoneTimes(samples, hrZones) {
    const mins = zoneMins(hrZones), out = hrZones.map(() => 0);
    for (const x of samples) if (Number.isFinite(x.hrS) && x.dt > 0) out[zoneIndex(x.hrS, mins)] += x.dt;
    return out.map(Math.round);
  }

  function highShare(main, hrZones) { // Anteil ≥ Z4
    const z4 = hrZones[3][0], total = dur(main);
    if (!total) return 0;
    return main.filter((x) => Number.isFinite(x.hrS) && x.hrS >= z4).reduce((s, x) => s + x.dt, 0) / total;
  }

  // Median eines Kanals im HF-Band auf flachen Abschnitten
  function atHr(main, c, valueOf) {
    const [lo, hi] = c.hrBand, [gmin, gmax] = c.gradeRange;
    const sel = main.filter((x) => Number.isFinite(x.hrS) && x.hrS >= lo && x.hrS <= hi
      && (!Number.isFinite(x.g) || (x.g >= gmin && x.g <= gmax)));
    const items = sel.map((x) => ({ v: valueOf(x), w: x.dt })).filter((x) => x.v != null && Number.isFinite(x.v));
    const bandSec = items.reduce((s, x) => s + x.w, 0);
    return { bandSec, value: bandSec >= c.minBandSec ? weightedMedian(items) : null };
  }

  function normalizedPower(main) {
    // 30-s-Mittel der Rohwatt, ^4 gemittelt, 4. Wurzel
    const pts = main.filter((x) => Number.isFinite(x.w));
    if (!pts.length) return null;
    let lo = 0, sum = 0, wsum = 0, acc = 0, accW = 0;
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i]; sum += x.w * (x.dt || 1); wsum += x.dt || 1;
      while (pts[lo].mt <= x.mt - 30) { sum -= pts[lo].w * (pts[lo].dt || 1); wsum -= pts[lo].dt || 1; lo++; }
      const avg = sum / wsum;
      acc += Math.pow(avg, 4) * (x.dt || 1); accW += x.dt || 1;
    }
    return Math.pow(acc / accW, 0.25);
  }

  function decoupling(main, kind, c, hrZones, speedKey) {
    const z3 = hrZones[2][0];
    const total = dur(main);
    const z12 = total ? main.filter((x) => Number.isFinite(x.hrS) && x.hrS < z3).reduce((s, x) => s + x.dt, 0) / total : 0;
    const key = kind === "ride" ? "wS" : speedKey || "vS";
    const mid = main.length ? (main[0].mt + main[main.length - 1].mt) / 2 : 0;
    const h1 = main.filter((x) => x.mt < mid), h2 = main.filter((x) => x.mt >= mid);
    const ef1 = wMean(h1, key) / wMean(h1, "hrS"), ef2 = wMean(h2, key) / wMean(h2, "hrS");
    let vi = null;
    if (kind === "ride") { const np = normalizedPower(main), avg = wMean(main, "w"); vi = np && avg ? np / avg : null; }
    return { pct: ((ef1 - ef2) / ef1) * 100, ef1, ef2, z12Share: z12, vi, durSec: total };
  }

  const kindOf = (sport) => (RUN.includes(sport) ? "run" : RIDE.includes(sport) ? "ride" : null);
  const isTreadmill = (meta, streams) => meta.trainer === true || meta.sport === "VirtualRun"
    || /laufband|treadmill/i.test(meta.name || "")
    || (!(streams.altitude || []).length && !(streams.grade_smooth || []).length);

  /* ---------- Gesamtauswertung einer Aktivität ---------- */
  function analyzeActivity(meta, streams, cfg, hrZones) {
    const kind = kindOf(meta.sport);
    const rec = {
      id: String(meta.id), date: String(meta.date).slice(0, 16), sport: meta.sport, name: meta.name,
      km: r1(meta.km || 0), sec: Math.round(meta.sec || 0), elev: Math.round(meta.elev || 0),
      kind, indoor: meta.sport === "VirtualRide" || meta.sport === "VirtualRun" || meta.trainer === true,
      hasHr: (streams.heart_rate || []).length > 0, deviceWatts: (streams.watts || []).length > 0 && kind === "ride",
      zoneSec: null, pace: null, watts: null, decoupling: null, status: {},
    };
    const txt = `${meta.name || ""} ${meta.description || ""}`;
    if (/#(brust)?gurt\b|#hrm\b/i.test(txt)) rec.hrTag = "strap";
    else if (/#uhr\b/i.test(txt)) rec.hrTag = "wrist";
    if (!kind) { rec.status.all = "keine Lauf- oder Radeinheit"; return rec; }
    if (!rec.hasHr) { rec.status.all = "keine Herzfrequenz"; return rec; }

    const p = prepare(streams, cfg);
    rec.zoneSec = zoneTimes(cfg.zonesIncludeWarmup === false ? p.main : p.all, hrZones);
    const hi = highShare(p.main, hrZones);
    rec.highShare = Math.round(hi * 1000) / 1000;
    const med = median(p.main.map((x) => x.hrS));
    rec.hrMed = med != null ? Math.round(med) : null;

    if (kind === "run") {
      const c = cfg.run;
      const epk = rec.km ? rec.elev / rec.km : 0;
      const g = c.gap || {};
      const useGap = epk > c.maxElevPerKm && g.enabled && epk <= g.maxElevPerKm;
      let why = null;
      if (meta.sport === "TrailRun") why = "TrailRun";
      else if (isTreadmill(meta, streams)) why = "Laufband";
      else if (epk > c.maxElevPerKm && !useGap) why = `zu hügelig (${String(r1(epk)).replace(".", ",")} Hm/km)`;
      else if (hi > c.maxHighShare) why = `intensiv/Intervalle (${pctDe(hi)} ≥ Z4)`;
      if (why) rec.status.pace = why;
      else {
        const sp = useGap ? "gapS" : "vS";
        const r = atHr(p.main, useGap ? { ...c, gradeRange: g.gradeRange } : c, (x) => (x[sp] > c.minSpeed ? 1000 / x[sp] : null));
        if (r.value != null) { rec.pace = { sec: Math.round(r.value), bandSec: Math.round(r.bandSec), ...(useGap ? { gap: true } : {}) }; rec.status.pace = useGap ? "ok (GAP)" : "ok"; }
        else rec.status.pace = `nur ${Math.round(r.bandSec / 60)} min im Band`;
      }
      const d = cfg.decoupling;
      if (why) rec.status.decoupling = why;
      else if (p.movingSec < d.runMinSec) rec.status.decoupling = `zu kurz (< ${d.runMinSec / 60} min)`;
      else {
        const r = decoupling(p.main, "run", d, hrZones, useGap ? "gapS" : "vS");
        if (r.z12Share < d.minZ12Share) rec.status.decoupling = `nicht ruhig (Z1–2 nur ${pctDe(r.z12Share)})`;
        else { rec.decoupling = { pct: r1(r.pct), z12Share: Math.round(r.z12Share * 100) / 100, durSec: Math.round(r.durSec), ...(useGap ? { gap: true } : {}) }; rec.status.decoupling = useGap ? "ok (GAP)" : "ok"; }
      }
    } else {
      const c = cfg.ride, d = cfg.decoupling;
      let why = null;
      if (!rec.deviceWatts) why = "keine echten Watt (geschätzt)";
      else if (hi > c.maxHighShare) why = `intensiv/Intervalle (${pctDe(hi)} ≥ Z4)`;
      if (why) rec.status.watts = why;
      else {
        const r = atHr(p.main, c, (x) => x.wS);
        if (r.value != null) { rec.watts = { w: Math.round(r.value), bandSec: Math.round(r.bandSec) }; rec.status.watts = "ok"; }
        else rec.status.watts = `nur ${Math.round(r.bandSec / 60)} min im Band`;
      }
      if (!rec.deviceWatts) rec.status.decoupling = "keine echten Watt (geschätzt)";
      else if (p.movingSec < d.rideMinSec) rec.status.decoupling = `zu kurz (< ${d.rideMinSec / 60} min)`;
      else {
        const r = decoupling(p.main, "ride", d, hrZones);
        if (r.z12Share < d.minZ12Share) rec.status.decoupling = `nicht ruhig (Z1–2 nur ${pctDe(r.z12Share)})`;
        else if (r.vi != null && r.vi > d.maxVi) rec.status.decoupling = `ungleichmäßig (VI ${r.vi.toFixed(2).replace(".", ",")})`;
        else { rec.decoupling = { pct: r1(r.pct), z12Share: Math.round(r.z12Share * 100) / 100, vi: r.vi ? Math.round(r.vi * 100) / 100 : null, durSec: Math.round(r.durSec) }; rec.status.decoupling = "ok"; }
      }
    }
    return rec;
  }

  /* ---------- Auswertung über die Zeit ---------- */
  const utc = (iso) => Date.parse(String(iso).slice(0, 10) + "T00:00:00Z");
  const paceSeries = (recs) => recs.filter((r) => r.pace).map((r) => ({ date: r.date.slice(0, 10), v: r.pace.sec, rec: r }));
  const wattSeries = (recs, indoor) => recs.filter((r) => r.watts && (indoor == null || r.indoor === indoor)).map((r) => ({ date: r.date.slice(0, 10), v: r.watts.w, rec: r }));
  const decouplingSeries = (recs, kind) => recs.filter((r) => r.decoupling && (!kind || r.kind === kind)).map((r) => ({ date: r.date.slice(0, 10), v: r.decoupling.pct, rec: r }));

  function rollingMedian(points, days) {
    const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((p) => {
      const end = utc(p.date), start = end - days * DAY;
      return { date: p.date, v: median(sorted.filter((q) => utc(q.date) > start && utc(q.date) <= end).map((q) => q.v)) };
    });
  }

  // Median der letzten windowDays vs. der windowDays davor (bezogen auf asOf)
  function kpi(points, asOf, windowDays, minPoints) {
    const end = utc(asOf), mid = end - windowDays * DAY, start = mid - windowDays * DAY;
    const cur = points.filter((p) => utc(p.date) > mid && utc(p.date) <= end).map((p) => p.v);
    const prev = points.filter((p) => utc(p.date) > start && utc(p.date) <= mid).map((p) => p.v);
    const enough = cur.length >= minPoints;
    const m = enough ? median(cur) : null, pm = prev.length >= minPoints ? median(prev) : null;
    return { value: m, prev: pm, delta: m != null && pm != null ? m - pm : null, n: cur.length, nPrev: prev.length, enough };
  }

  const ampel = (pct, thresholds) => (pct < thresholds[0] ? "good" : pct <= thresholds[1] ? "warn" : "bad");

  function mondayIso(iso) {
    const d = new Date(utc(iso)); const wd = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - wd * DAY).toISOString().slice(0, 10);
  }
  function weeklyZones(recs, kind) {
    const by = {};
    for (const r of recs) {
      if (!r.zoneSec || (kind && r.kind !== kind)) continue;
      const wk = mondayIso(r.date);
      by[wk] = by[wk] || r.zoneSec.map(() => 0);
      r.zoneSec.forEach((s, i) => { by[wk][i] += s; });
    }
    return Object.keys(by).sort().map((week) => ({ week, sec: by[week] }));
  }
  function zoneShare(recs, asOf, days, idxs) {
    const end = utc(asOf), start = end - days * DAY;
    let tot = 0, part = 0;
    for (const r of recs) {
      if (!r.zoneSec) continue;
      const d = utc(r.date); if (d <= start || d > end) continue;
      r.zoneSec.forEach((s, i) => { tot += s; if (idxs.includes(i)) part += s; });
    }
    return tot ? { share: part / tot, totalSec: tot } : null;
  }

  // Text für die Karte „Zone 2 verbessern“
  function summary(recs, asOf, cfg, hrZones) {
    const band = cfg.run.hrBand, mid = Math.round((band[0] + band[1]) / 2);
    const pts = paceSeries(recs);
    const parts = [];
    const end = utc(asOf), span = 56 * DAY;
    const recent = pts.filter((p) => utc(p.date) > end - span);
    if (recent.length < cfg.minPoints) parts.push(`Pace @ ${mid} bpm: noch zu wenig Daten (${recent.length} gewertete Läufe in 8 Wochen)`);
    else {
      const sorted = recent.slice().sort((a, b) => a.date.localeCompare(b.date));
      const half = Math.ceil(sorted.length / 2);
      const a = median(sorted.slice(0, half).map((p) => p.v)), b = median(sorted.slice(-half).map((p) => p.v));
      const weeks = Math.max(1, Math.round((utc(sorted[sorted.length - 1].date) - utc(sorted[0].date)) / (7 * DAY)));
      parts.push(`Pace @ ${mid} bpm: ${mmss(a)} → ${mmss(b)} /km in ${weeks} Wochen`);
    }
    const easy = recs.filter((r) => r.kind === "run" && r.hrMed && utc(r.date) > end - span
      && (/^ok/.test(r.status.pace || "") || /^nur /.test(r.status.pace || "")));
    const easyMed = median(easy.map((r) => r.hrMed));
    if (easy.length >= 2 && easyMed > band[1]) parts.push(`Lockere Läufe liegen im Median bei ${Math.round(easyMed)} bpm – über dem Band ${band[0]}–${band[1]}. Langsamer laufen bringt mehr Zone-2-Zeit und mehr Messwerte`);
    const share = zoneShare(recs, asOf, cfg.windowDays, [0, 1]);
    if (share) parts.push(`Z1–2-Anteil (4 Wochen): ${pctDe(share.share)}`);
    const dec = decouplingSeries(recs, "run").filter((p) => utc(p.date) > end - cfg.longRunWindowDays * DAY);
    if (dec.length) parts.push(`Ø Entkopplung lange Läufe: ${String(r1(dec.reduce((s, p) => s + p.v, 0) / dec.length)).replace(".", ",")} %`);
    return parts;
  }

  return {
    RUN, RIDE, gapFactor, zoneIndex, zoneMins, weightedMedian, median, prepare, zoneTimes, highShare, atHr, normalizedPower,
    decoupling, kindOf, analyzeActivity, paceSeries, wattSeries, decouplingSeries, rollingMedian, kpi, ampel,
    mondayIso, weeklyZones, zoneShare, summary,
  };
});
