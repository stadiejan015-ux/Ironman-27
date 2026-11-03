/*
 * Rennprognose „Wenn heute Renntag wäre“.
 * -----------------------------------------
 * predictRace(data, config) ist eine reine Funktion (kein DOM, kein Date.now()):
 *   data   = { strava: window.STRAVA, garmin: window.GARMIN, asOf: "YYYY-MM-DD" }
 *   config = window.TRAINING.prediction (siehe js/data.js)
 * Läuft im Browser (window.predictRace) und in Node (require("./js/prediction.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const G = 9.81;
  const DAY = 86400000;
  const RUN_LABELS = { "5k": "5 km", "10k": "10 km" };
  const RUN_KM = { "5k": 5, "10k": 10 };
  const RUN_NAME = { "5k": "5-km", "10k": "10-km" };

  /* ---------- Helfer ---------- */
  const toSec = (v) => (typeof v === "number" ? v : String(v).split(":").reduce((a, x) => a * 60 + Number(x), 0));
  const nf = (n, d = 0) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const mmss = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const hms = (s) => { s = Math.round(s); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const utc = (iso) => Date.parse(String(iso).slice(0, 10) + "T00:00:00Z");
  const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
  const isoMinusDays = (iso, n) => new Date(utc(iso) - n * DAY).toISOString().slice(0, 10);
  const deDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d}.${m}.${y}`; };
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /* ---------- Eingaben aus den Rohdaten ---------- */
  function extractInputs(data, cfg) {
    const strava = data.strava || {}, garmin = data.garmin || {}, fb = cfg.fallback || {};
    const asOf = String(data.asOf || strava.snapshotDate || "").slice(0, 10);
    const warnings = [];
    const acts = (strava.activities || []).map(([date, sport, name, km, sec]) => ({ date, sport, name, km, sec }));

    let ftp = strava.zones && strava.zones.ftp, ftpSource = "Strava";
    if (!ftp) { ftp = fb.ftp; ftpSource = "Fallback"; warnings.push("FTP fehlt in den Strava-Daten – Fallback aus der Konfiguration."); }

    let weightKg = null, weightSource = null;
    const gw = (garmin.days || []).filter((d) => d.weight != null).sort((a, b) => a.date.localeCompare(b.date)).pop();
    if (gw) { weightKg = gw.weight; weightSource = `Garmin, ${deDate(gw.date)}`; }
    else if (strava.athlete && strava.athlete.weightKg) { weightKg = strava.athlete.weightKg; weightSource = "Strava-Profil"; }
    else { weightKg = fb.weightKg; weightSource = "Fallback"; warnings.push("Körpergewicht fehlt – Fallback aus der Konfiguration."); }

    const runBests = {};
    for (const key of Object.keys(RUN_LABELS)) {
      const hit = ((strava.bests && strava.bests.run) || []).find((r) => r[0] === RUN_LABELS[key]);
      if (hit) runBests[key] = { sec: hit[1], date: hit[2], source: "Strava" };
      else if (fb["run" + key]) { runBests[key] = { sec: fb["run" + key], date: null, source: "Fallback" }; warnings.push(`${RUN_LABELS[key]}-Bestzeit fehlt – Fallback.`); }
    }

    return {
      asOf, ftp, ftpSource, weightKg, weightSource, runBests, warnings,
      fallbackSwimPace: fb.swimPace100 || 140,
      swims: acts.filter((a) => a.sport === "Swim" && a.km > 0 && a.sec > 0),
      runs: acts.filter((a) => a.sport === "Run" || a.sport === "TrailRun"),
    };
  }

  /* ---------- Schwimmen ---------- */
  function predictSwim(inp, c) {
    const meters = c.distanceKm * 1000;
    const distFactor = c.openWaterFactor;
    const raceTime = (pace100) => (pace100 + c.wetsuitBonus) * (meters / 100) * distFactor;
    const tests = (c.cssTests || []).filter((t) => t && t.t400 && t.t200).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const common = [`Neo ${c.wetsuitBonus < 0 ? "−" + Math.abs(c.wetsuitBonus) : "+" + c.wetsuitBonus} s/100 m`, `Freiwasser & Navigation +${nf((distFactor - 1) * 100)} % Strecke (${nf(meters * distFactor)} m)`];

    if (tests.length) {
      const t = tests[tests.length - 1];
      const t400 = toSec(t.t400), t200 = toSec(t.t200);
      const css = (t400 - t200) / 2;
      const age = t.date ? daysBetween(t.date, inp.asOf) : null;
      const [offOpt, offCons] = c.cssOffsetRange;
      return {
        method: "css",
        realistic: raceTime(css + c.cssOffset), optimistic: raceTime(css + offOpt), conservative: raceTime(css + offCons),
        pace100: css + c.cssOffset + c.wetsuitBonus,
        confidence: age != null && age <= 42 ? "hoch" : "mittel",
        inputs: [
          `CSS-Test${t.date ? ` vom ${deDate(t.date)}` : ""}: 400 m ${mmss(t400)}, 200 m ${mmss(t200)} → CSS (${mmss(t400)} − ${mmss(t200)}) / 2 = ${mmss(css)} /100 m`,
          `Renn-Pace = CSS + ${c.cssOffset} s (Spanne +${offOpt} bis +${offCons} s)`,
          ...common,
        ],
      };
    }

    const minKm = c.fallbackMinMeters / 1000;
    const since = isoMinusDays(inp.asOf, c.fallbackWeeks * 7);
    let pool = inp.swims.filter((s) => s.km >= minKm && s.date.slice(0, 10) >= since);
    let span = `letzte ${c.fallbackWeeks} Wochen`;
    if (!pool.length) { pool = inp.swims.filter((s) => s.km >= minKm); span = "alle Einheiten (keine in den letzten Wochen)"; }
    const paces = pool.map((s) => s.sec / (s.km * 10)).sort((a, b) => a - b);
    const med = paces.length ? quantile(paces, 0.5) : inp.fallbackSwimPace;
    const fast = paces.length > 1 ? quantile(paces, 0.25) : med;
    const slow = paces.length > 1 ? quantile(paces, 0.75) : med;
    return {
      method: "median",
      realistic: raceTime(med), optimistic: raceTime(fast), conservative: raceTime(slow),
      pace100: med + c.wetsuitBonus,
      confidence: "niedrig",
      inputs: [
        paces.length
          ? `Kein CSS-Test – Median-Pace aus ${paces.length} Einheiten ≥ ${nf(c.fallbackMinMeters)} m (${span}): ${mmss(med)} /100 m`
          : `Keine Schwimmeinheiten ≥ ${nf(c.fallbackMinMeters)} m – Fallback ${mmss(med)} /100 m`,
        paces.length > 1 ? `Spanne aus 25.–75. Perzentil: ${mmss(fast)} bis ${mmss(slow)} /100 m` : "Keine Spanne (zu wenige Einheiten)",
        ...common,
        "Tipp: CSS-Test (400 m + 200 m) in js/data.js eintragen für eine genauere Prognose",
      ],
    };
  }

  /* ---------- Rad: Physikmodell ---------- */
  // Löst P·η = (Crr·m·g·cosθ + m·g·sinθ)·v + 0,5·ρ·CdA·v³ per Bisektion nach v (m/s).
  function solveSpeed(power, grade, p) {
    const theta = Math.atan(grade);
    const lin = p.crr * p.mass * G * Math.cos(theta) + p.mass * G * Math.sin(theta);
    const cub = 0.5 * p.rho * p.cda;
    const target = power * p.eta;
    const f = (v) => lin * v + cub * v * v * v - target;
    let lo = 0.01, hi = 40;
    if (f(hi) < 0) return hi;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function bikeTime(ftp, intensity, cda, mass, c) {
    const p = { crr: c.crr, rho: c.rho, eta: c.eta, cda, mass };
    const P = ftp * intensity;
    const climbKm = Math.min(c.elevationM / c.climbGrade / 1000, c.distanceKm / 2);
    const flatKm = c.distanceKm - 2 * climbKm;
    const vMax = c.maxDescentKmh / 3.6;
    const segs = [
      { name: "bergauf", km: climbKm, grade: c.climbGrade, power: P * c.climbPowerFactor },
      { name: "bergab", km: climbKm, grade: -c.climbGrade, power: P * c.descentPowerFactor },
      { name: "flach", km: flatKm, grade: 0, power: P },
    ].map((s) => {
      let v = solveSpeed(s.power, s.grade, p);
      if (s.grade < 0 && v > vMax) v = vMax;
      return { ...s, kmh: v * 3.6, sec: (s.km * 1000) / v };
    });
    const sec = segs.reduce((a, s) => a + s.sec, 0) * c.overheadFactor;
    return { sec, power: P, segs, kmh: c.distanceKm / (sec / 3600) };
  }

  function predictBike(inp, c) {
    const mass = inp.weightKg + c.bikeMassKg;
    const real = bikeTime(inp.ftp, c.intensity, c.cda, mass, c);
    const opt = bikeTime(inp.ftp, c.intensityRange[0], c.cdaRange[0], mass, c);
    const cons = bikeTime(inp.ftp, c.intensityRange[1], c.cdaRange[1], mass, c);
    const seg = (n) => real.segs.find((s) => s.name === n);
    return {
      realistic: real.sec, optimistic: opt.sec, conservative: cons.sec,
      kmh: real.kmh, powerW: real.power, segments: real.segs,
      confidence: inp.ftpSource === "Fallback" ? "niedrig" : "mittel",
      note: c.note,
      inputs: [
        `FTP ${inp.ftp} W × ${nf(c.intensity, 2)} = ${nf(real.power)} W (Spanne IF ${nf(c.intensityRange[1], 2)}–${nf(c.intensityRange[0], 2)})`,
        `CdA ${nf(c.cda, 2)} (Spanne ${nf(c.cdaRange[0], 2)}–${nf(c.cdaRange[1], 2)}) · Crr ${nf(c.crr, 4)} · ρ ${nf(c.rho, 2)} · η ${nf(c.eta, 2)}`,
        `Systemmasse ${nf(inp.weightKg, 1)} kg (${inp.weightSource}) + ${c.bikeMassKg} kg = ${nf(mass, 1)} kg`,
        `${nf(c.elevationM)} Hm: ${nf(seg("bergauf").km, 0)} km bergauf (${nf(c.climbGrade * 100, 1)} %, ${nf(seg("bergauf").power)} W → ${nf(seg("bergauf").kmh, 1)} km/h)`,
        `${nf(seg("bergab").km, 0)} km bergab (${nf(seg("bergab").power)} W → ${nf(seg("bergab").kmh, 1)} km/h, max. ${c.maxDescentKmh} km/h) · ${nf(seg("flach").km, 0)} km flach (${nf(seg("flach").power)} W → ${nf(seg("flach").kmh, 1)} km/h)`,
        `+${nf((c.overheadFactor - 1) * 100)} % Zeit für Kurven & Verpflegung`,
      ],
    };
  }

  /* ---------- Laufen ---------- */
  const riegel = (t1, d1, d2, exp) => t1 * Math.pow(d2 / d1, exp);

  function predictRun(inp, c) {
    const since = isoMinusDays(inp.asOf, c.longRunWeeks * 7);
    const recent = inp.runs.filter((r) => r.date.slice(0, 10) >= since);
    const longest = recent.reduce((m, r) => (r.km > (m ? m.km : 0) ? r : m), null);
    const longestKm = longest ? longest.km : 0;
    const penalties = (c.longRunPenalties || []).slice().sort((a, b) => a[0] - b[0]);
    const hit = penalties.find(([km]) => longestKm < km);
    const penalty = hit ? hit[1] : 0;

    const ref = inp.runBests[c.reference] || inp.runBests["10k"] || inp.runBests["5k"];
    const refKey = inp.runBests[c.reference] ? c.reference : inp.runBests["10k"] ? "10k" : "5k";
    const optKey = inp.runBests[c.optimisticReference] ? c.optimisticReference : refKey;
    const optRef = inp.runBests[optKey];
    const base = riegel(ref.sec, RUN_KM[refKey], c.distanceKm, c.riegelExponent);
    const baseOpt = riegel(optRef.sec, RUN_KM[optKey], c.distanceKm, c.riegelExponent);
    const [fOpt, fCons] = c.ironmanFactorRange;
    const k = 1 + penalty;
    const realistic = base * c.ironmanFactor * k;
    const refAge = ref.date ? daysBetween(ref.date, inp.asOf) : 999;
    let confidence = "mittel";
    if (refAge > 180 || longestKm < 15 || ref.source === "Fallback") confidence = "niedrig";
    else if (refAge <= 90 && longestKm >= 30) confidence = "hoch";

    return {
      realistic, optimistic: baseOpt * fOpt * k, conservative: base * fCons * k,
      paceKm: realistic / c.distanceKm,
      confidence, longestKm, penalty,
      inputs: [
        `Riegel: ${RUN_NAME[refKey]}-Bestzeit ${mmss(ref.sec)}${ref.date ? ` (${deDate(ref.date)})` : ""} × (42,195 / ${RUN_KM[refKey]})^${nf(c.riegelExponent, 2)} = ${hms(base)} Marathon`,
        `Optimistisch aus ${RUN_NAME[optKey]}-Bestzeit ${mmss(optRef.sec)} → ${hms(baseOpt)}`,
        `Ironman-Faktor × ${nf(c.ironmanFactor, 2)} (Spanne ${nf(fOpt, 2)}–${nf(fCons, 2)}) für den Marathon nach dem Rad`,
        longest
          ? `Längster Lauf der letzten ${c.longRunWeeks} Wochen: ${nf(longestKm, 1)} km (${deDate(longest.date)}) → ${penalty ? `+${nf(penalty * 100)} %` : "kein Aufschlag"}`
          : `Kein Lauf in den letzten ${c.longRunWeeks} Wochen → +${nf(penalty * 100)} %`,
        c.ignoreNote,
      ].filter(Boolean),
    };
  }

  /* ---------- Gesamt ---------- */
  function predictRace(data, config) {
    const cfg = config || {};
    const inp = extractInputs(data || {}, cfg);
    const swim = predictSwim(inp, cfg.swim);
    const bike = predictBike(inp, cfg.bike);
    const run = predictRun(inp, cfg.run);
    const t = cfg.transitions || { t1Min: 6, t2Min: 4 };
    const fixed = (min) => ({ realistic: min * 60, optimistic: min * 60, conservative: min * 60, confidence: "hoch", inputs: [`${min} min aus der Konfiguration`] });
    const t1 = fixed(t.t1Min), t2 = fixed(t.t2Min);
    const legs = [swim, t1, bike, t2, run];
    const total = {};
    for (const k of ["realistic", "optimistic", "conservative"]) total[k] = legs.reduce((a, l) => a + l[k], 0);
    const sub = toSec(cfg.subTarget || "12:00:00");
    return {
      asOf: inp.asOf,
      inputs: { ftp: inp.ftp, ftpSource: inp.ftpSource, weightKg: inp.weightKg, weightSource: inp.weightSource, runBests: inp.runBests },
      swim, t1, bike, t2, run, total,
      subTarget: sub, subGap: total.realistic - sub,
      warnings: inp.warnings,
    };
  }

  return { predictRace, solveSpeed, riegel, bikeTime, quantile };
});
