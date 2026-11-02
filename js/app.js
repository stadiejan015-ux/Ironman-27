(function () {
  "use strict";
  const D = window.TRAINING;
  const $ = (s) => document.querySelector(s);
  const DAY = 86400000;

  /* ---------- Helpers ---------- */
  const nf = (n, d = 0) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const parse = (s) => new Date(s.length === 10 ? s + "T00:00" : s);
  const fmtDate = (d, opts = { day: "2-digit", month: "2-digit", year: "numeric" }) => d.toLocaleDateString("de-DE", opts);
  const hm = (sec) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m === 60 ? `${h + 1}:00` : `${h}:${String(m).padStart(2, "0")}`; };
  const mmss = (sec) => { sec = Math.round(sec); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; };
  const hms = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60); return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
  const toSec = (str) => str.split(":").reduce((a, v) => a * 60 + Number(v), 0);
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const CATS = {
    swim: { label: "Schwimmen", color: "var(--swim)" },
    bike: { label: "Rad", color: "var(--bike)" },
    run: { label: "Laufen", color: "var(--run)" },
    strength: { label: "Kraft", color: "var(--other)" },
    other: { label: "Sonstiges", color: "var(--other)" },
  };
  const SPORT_LABEL = { Swim: "Schwimmen", Ride: "Rad", VirtualRide: "Rad (Zwift)", Run: "Laufen", WeightTraining: "Kraft", RockClimbing: "Klettern", Hike: "Wandern", Yoga: "Yoga/Mobility" };
  const cat = (sport) => sport === "Swim" ? "swim" : (sport === "Ride" || sport === "VirtualRide") ? "bike" : sport === "Run" ? "run" : sport === "WeightTraining" ? "strength" : "other";

  const acts = D.activities.map(([date, sport, name, km, sec, elev, info]) => ({
    date: parse(date), sport, name, km, sec, elev, info: info || "", cat: cat(sport),
  })).sort((a, b) => b.date - a.date);

  const snap = parse(D.snapshotDate);
  const snapEnd = addDays(snap, 1);
  const race = parse(D.race.date);
  const inRange = (from, to) => acts.filter((a) => a.date >= from && a.date < to);
  const sum = (arr, f) => arr.reduce((s, a) => s + f(a), 0);
  const ofCat = (arr, c) => arr.filter((a) => a.cat === c);

  /* ---------- Theme toggle ---------- */
  (function theme() {
    const root = document.documentElement;
    let saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) { /* ignore */ }
    if (saved) root.dataset.theme = saved;
    $("#themeToggle").addEventListener("click", () => {
      const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* ignore */ }
    });
  })();

  /* ---------- Tooltip ---------- */
  const tip = $("#tooltip");
  function showTip(html, ev) {
    tip.innerHTML = html; tip.style.opacity = 1;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.pageX + pad, y = ev.pageY - h - pad;
    if (x + w > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - w - pad;
    if (y < window.scrollY + 60) y = ev.pageY + pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.style.opacity = 0; };
  const tRow = (color, label, val) => `<div class="t-row"><span><i class="swatch" style="background:${color}"></i> ${label}</span><span>${val}</span></div>`;

  /* ---------- Hero / Countdown ---------- */
  function hero() {
    $("#raceName").textContent = D.race.name;
    $("#raceMeta").textContent = `${fmtDate(race, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${D.race.location && D.race.location !== "tbd" ? " · " + D.race.location : ""}`;
    $("#heroSub").textContent = `${nf(D.race.swimKm, 1)} km Schwimmen · ${D.race.bikeKm} km Rad · ${nf(D.race.runKm, 1)} km Laufen. Fokus aktuell: ${D.athlete.focus}.`;
    const now = new Date();
    const days = Math.max(0, Math.ceil((race - now) / DAY));
    const weeks = Math.floor(days / 7);
    const phase = currentPhase(now);
    $("#countdown").innerHTML = `
      <div><b>${days}</b><small>Tage</small></div>
      <div><b>${weeks}</b><small>Wochen</small></div>
      <div><b class="phase-name" style="font-size:18px;line-height:32px">${phase ? esc(phase.short) : "–"}</b><small>Phase</small></div>`;
    $("#snap").textContent = fmtDate(snap);
  }

  /* ---------- KPIs ---------- */
  function kpis() {
    const from = addDays(snapEnd, -28), prevFrom = addDays(snapEnd, -56);
    const cur = inRange(from, snapEnd), prev = inRange(prevFrom, from);
    $("#kpiSub").textContent = `${fmtDate(from)} – ${fmtDate(snap)}, verglichen mit den 4 Wochen davor.`;
    const delta = (a, b, unit, d = 0) => {
      const diff = a - b; if (Math.abs(diff) < 0.05) return "± 0 zur Vorperiode";
      return `${diff > 0 ? "▲ +" : "▼ −"}${nf(Math.abs(diff), d)} ${unit} zur Vorperiode`;
    };
    const triCats = ["swim", "bike", "run"];
    const triH = (arr) => sum(arr.filter((a) => triCats.includes(a.cat)), (a) => a.sec) / 3600;
    const allH = (arr) => sum(arr, (a) => a.sec) / 3600;
    const km = (arr, c) => sum(ofCat(arr, c), (a) => a.km);
    const n = (arr, c) => ofCat(arr, c).length;
    const longestRun = Math.max(...ofCat(acts, "run").map((a) => a.km));
    const tiles = [
      ["Ø Triathlon-Stunden / Woche", `${nf(triH(cur) / 4, 1)} <small>h</small>`, delta(triH(cur) / 4, triH(prev) / 4, "h", 1)],
      ["Ø Gesamt inkl. Kraft & Klettern", `${nf(allH(cur) / 4, 1)} <small>h/Wo</small>`, delta(allH(cur) / 4, allH(prev) / 4, "h", 1)],
      [`<i class="swatch" style="background:var(--swim)"></i> Schwimmen`, `${nf(km(cur, "swim"), 1)} <small>km · ${n(cur, "swim")}×</small>`, delta(km(cur, "swim"), km(prev, "swim"), "km", 1)],
      [`<i class="swatch" style="background:var(--bike)"></i> Rad`, `${nf(km(cur, "bike"))} <small>km · ${n(cur, "bike")}×</small>`, delta(km(cur, "bike"), km(prev, "bike"), "km")],
      [`<i class="swatch" style="background:var(--run)"></i> Laufen`, `${nf(km(cur, "run"))} <small>km · ${n(cur, "run")}×</small>`, delta(km(cur, "run"), km(prev, "run"), "km")],
      ["Krafteinheiten", `${n(cur, "strength")} <small>× in 4 Wo</small>`, delta(n(cur, "strength"), n(prev, "strength"), "Einheiten")],
      ["FTP", `${D.zones.ftp} <small>W · ${nf(D.zones.ftp / D.athlete.weightKg, 2)} W/kg</small>`, `bei ${D.athlete.weightKg} kg Körpergewicht`],
      ["Aktivitäts-Streak", `${D.athlete.streakWeeks} <small>Wochen</small>`, `längster Lauf seit Aug.: ${nf(longestRun, 1)} km`],
    ];
    $("#kpis").innerHTML = tiles.map(([l, v, d]) => `<div class="card kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="delta">${d}</div></div>`).join("");
  }

  /* ---------- Phasen ---------- */
  const planStart = parse("2026-09-14");
  const PHASES = [
    { name: "Grundlage 1", short: "Grundlage 1", from: null, to: 28, hours: "8–11 h", focus: ["Schwimmtechnik (3×/Woche, Drills, Wasserlage)", "Viel lockere Zone 2 auf Rad & Lauf", "2–3× Krafttraining (Beine, Rumpf)", "FTP- und Laufbasis stabilisieren"] },
    { name: "Grundlage 2", short: "Grundlage 2", from: 28, to: 20, hours: "10–13 h", focus: ["Schwimmumfang auf 8–10 km/Woche", "Sweet-Spot-Intervalle auf dem Rad", "Langer Lauf bis 20–24 km", "Kraft auf 2× reduzieren, Wartung"] },
    { name: "Aufbau 1", short: "Aufbau 1", from: 20, to: 12, hours: "12–15 h", focus: ["Schwellenarbeit in allen drei Disziplinen", "Lange Ausfahrten 4–5 h, Bergtraining", "Erste Koppeleinheiten (Rad → Lauf)", "Rennernährung testen"] },
    { name: "Aufbau 2 – rennspezifisch", short: "Aufbau 2", from: 12, to: 5, hours: "14–18 h", focus: ["Ironman-Renntempo (65–75 % FTP)", "Langer Lauf bis 30–32 km", "Freiwasserschwimmen im Neo", "Generalprobe / Mitteldistanz"] },
    { name: "Peak", short: "Peak", from: 5, to: 2, hours: "15–18 h", focus: ["Höchste Umfangswochen", "Letzte lange Koppeleinheit (5 h + 1 h)", "Material & Ernährung final"] },
    { name: "Taper", short: "Taper", from: 2, to: 0, hours: "6–9 h", focus: ["Umfang −40–60 %, Intensität kurz halten", "Schlaf, Carb-Loading, Check-in"] },
  ];
  PHASES.forEach((p) => {
    p.start = p.from == null ? planStart : addDays(race, -p.from * 7);
    p.end = p.to === 0 ? race : addDays(race, -p.to * 7);
  });
  function currentPhase(d) { return PHASES.find((p) => d >= p.start && d < p.end) || null; }

  function season() {
    const now = new Date();
    const total = race - planStart;
    const tl = $("#timeline");
    tl.innerHTML = PHASES.map((p) => {
      const w = ((p.end - p.start) / total) * 100;
      const state = now >= p.end ? "done" : now >= p.start ? "current" : "";
      return `<div class="phase ${state}" style="flex:0 0 calc(${w}% - 3px)" title="${esc(p.name)}"><b>${esc(p.short)}</b><span>${p.hours}</span></div>`;
    }).join("");
    if (now > planStart && now < race) {
      const m = document.createElement("div");
      m.className = "today-marker"; m.style.left = ((now - planStart) / total) * 100 + "%";
      tl.appendChild(m);
    }
    const cp = currentPhase(now);
    if (cp) {
      const left = Math.ceil((cp.end - now) / DAY / 7);
      $("#currentPhase").innerHTML = `<div class="card" style="box-shadow:none;background:var(--surface-2);border:0">
        <h3 style="margin-bottom:2px">${esc(cp.name)}</h3>
        <div class="muted" style="font-size:13px;margin-bottom:10px">${fmtDate(cp.start)} – ${fmtDate(addDays(cp.end, -1))} · noch ${left} Wochen · Ziel ${cp.hours}/Woche</div>
        <ul style="margin:0;padding-left:18px">${cp.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`;
    } else {
      $("#currentPhase").innerHTML = `<p class="muted">Außerhalb des Plans.</p>`;
    }
    $("#phaseList").innerHTML = PHASES.map((p) => `<li class="${p === cp ? "current" : ""}">
      <b>${esc(p.short)}</b><span class="dates">${fmtDate(p.start, { day: "2-digit", month: "short" })} – ${fmtDate(addDays(p.end, -1), { day: "2-digit", month: "short", year: "2-digit" })}</span><span class="hrs">${p.hours}</span></li>`).join("");
  }

  /* ---------- Wochenumfang (gestapelte Balken) ---------- */
  const firstWeek = monday(acts[acts.length - 1].date);
  const weeks = [];
  for (let w = firstWeek; w <= snap; w = addDays(w, 7)) {
    const list = inRange(w, addDays(w, 7));
    const h = (c) => sum(ofCat(list, c), (a) => a.sec) / 3600;
    weeks.push({ start: w, swim: h("swim"), bike: h("bike"), run: h("run"), extra: h("strength") + h("other") });
  }
  let showOther = false;

  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function niceScale(v, ticks = 4) { const step = niceStep((v || 1) / ticks); return { max: Math.ceil((v || 1) / step) * step, step }; }
  function roundedTopRect(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function volumeChart() {
    const keys = showOther ? ["swim", "bike", "run", "extra"] : ["swim", "bike", "run"];
    const colors = { swim: "var(--swim)", bike: "var(--bike)", run: "var(--run)", extra: "var(--other)" };
    const labels = { swim: "Schwimmen", bike: "Rad", run: "Laufen", extra: "Kraft & Sonstiges" };
    $("#volLegend").innerHTML = keys.map((k) => `<span><i class="swatch" style="background:${colors[k]}"></i>${labels[k]}</span>`).join("");

    const el = $("#volChart");
    const W = Math.max(300, Math.round(el.clientWidth || 1000)), H = W < 600 ? 230 : 300, m = { t: 12, r: 8, b: 30, l: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const totals = weeks.map((w) => keys.reduce((s, k) => s + w[k], 0));
    const { max, step } = niceScale(Math.max(...totals) * 1.05);
    const y = (v) => m.t + ih - (v / max) * ih;
    const band = iw / weeks.length, bw = Math.min(46, band * 0.62);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wochenstunden je Disziplin">`;
    for (let v = 0; v <= max + 1e-9; v += step) {
      const yy = y(v);
      svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${nf(v)} h</text>`;
    }
    weeks.forEach((w, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      let acc = 0;
      const segs = keys.filter((k) => w[k] > 0);
      segs.forEach((k, j) => {
        const y0 = y(acc), y1 = y(acc + w[k]);
        const top = j === segs.length - 1;
        const gap = j > 0 ? 2 : 0;
        const hgt = Math.max(0, y0 - y1 - gap);
        if (top) svg += `<path d="${roundedTopRect(x, y1, bw, hgt, 4)}" fill="${colors[k]}"/>`;
        else svg += `<rect x="${x}" y="${y1}" width="${bw}" height="${hgt}" fill="${colors[k]}"/>`;
        acc += w[k];
      });
      const lbl = fmtDate(w.start, { day: "2-digit", month: "2-digit" });
      const every = Math.ceil(44 / band);
      if ((weeks.length - 1 - i) % every === 0) svg += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${lbl}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
    });
    svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
    el.innerHTML = svg;
    el.querySelectorAll(".hit").forEach((r) => {
      const w = weeks[+r.dataset.i];
      const html = () => `<div class="t-title">Woche ab ${fmtDate(w.start)}</div>` +
        keys.map((k) => tRow(colors[k], labels[k], hm(w[k] * 3600) + " h")).join("") +
        `<div class="t-row" style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px"><span>Summe</span><span>${hm(keys.reduce((s, k) => s + w[k], 0) * 3600)} h</span></div>`;
      r.addEventListener("mousemove", (ev) => { r.setAttribute("fill", "rgba(127,127,127,.08)"); showTip(html(), ev); });
      r.addEventListener("mouseleave", () => { r.setAttribute("fill", "transparent"); hideTip(); });
    });
    // Tabelle
    $("#volTable").innerHTML = `<table><thead><tr><th>Woche ab</th><th class="num">Schwimmen</th><th class="num">Rad</th><th class="num">Laufen</th><th class="num">Kraft & Sonst.</th><th class="num">Tri gesamt</th></tr></thead><tbody>` +
      weeks.slice().reverse().map((w) => `<tr><td>${fmtDate(w.start)}</td><td class="num">${hm(w.swim * 3600)}</td><td class="num">${hm(w.bike * 3600)}</td><td class="num">${hm(w.run * 3600)}</td><td class="num">${hm(w.extra * 3600)}</td><td class="num"><b>${hm((w.swim + w.bike + w.run) * 3600)}</b></td></tr>`).join("") + `</tbody></table>`;
  }

  /* ---------- Mini-Charts ---------- */
  // Punkt-Linien-Chart, y invertiert für Pace (schneller = oben)
  function paceChart(points, { fmt, band, color, invert = true, unitLabel }) {
    if (points.length < 2) return `<p class="muted">Zu wenig Daten.</p>`;
    const W = 360, H = 150, m = { t: 10, r: 8, b: 22, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = points.map((p) => p.v).concat(band ? band : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || 5; lo -= pad; hi += pad;
    const t0 = points[0].d.getTime(), t1 = points[points.length - 1].d.getTime();
    const x = (d) => m.l + ((d.getTime() - t0) / (t1 - t0 || 1)) * iw;
    const y = (v) => invert ? m.t + ((v - lo) / (hi - lo)) * ih : m.t + ih - ((v - lo) / (hi - lo)) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unitLabel)}">`;
    for (let i = 0; i <= 3; i++) {
      const v = lo + ((hi - lo) / 3) * i;
      s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    if (band) {
      const ya = y(band[0]), yb = y(band[1]);
      s += `<rect x="${m.l}" y="${Math.min(ya, yb)}" width="${iw}" height="${Math.abs(yb - ya)}" fill="${color}" opacity=".12"/>`;
    }
    s += `<path d="${points.map((p, i) => `${i ? "L" : "M"}${x(p.d)},${y(p.v)}`).join("")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    points.forEach((p, i) => {
      s += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
      s += `<circle class="hit" data-i="${i}" cx="${x(p.d)}" cy="${y(p.v)}" r="12" fill="transparent"/>`;
    });
    s += `<text x="${m.l}" y="${H - 4}">${fmtDate(points[0].d, { day: "2-digit", month: "2-digit" })}</text><text x="${W - m.r}" y="${H - 4}" text-anchor="end">${fmtDate(points[points.length - 1].d, { day: "2-digit", month: "2-digit" })}</text></svg>`;
    return s;
  }
  function attachPointTips(container, points, color, render) {
    container.querySelectorAll(".hit").forEach((c) => {
      const p = points[+c.dataset.i];
      c.addEventListener("mousemove", (ev) => showTip(render(p), ev));
      c.addEventListener("mouseleave", hideTip);
    });
  }
  function weeklyBars(values, color, unit) {
    const W = 360, H = 150, m = { t: 10, r: 8, b: 22, l: 36 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const { max, step } = niceScale(Math.max(...values.map((v) => v.v)) * 1.05, 3);
    const band = iw / values.length, bw = band * 0.6;
    const y = (v) => m.t + ih - (v / max) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wochenumfang">`;
    for (let v = 0; v <= max + 1e-9; v += step) { s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${nf(v)}</text>`; }
    values.forEach((w, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      if (w.v > 0) s += `<path d="${roundedTopRect(x, y(w.v), bw, y(0) - y(w.v), 3)}" fill="${color}"/>`;
      s += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
    });
    s += `<text x="${m.l}" y="${H - 4}">${fmtDate(values[0].d, { day: "2-digit", month: "2-digit" })}</text><text x="${W - m.r}" y="${H - 4}" text-anchor="end">${fmtDate(values[values.length - 1].d, { day: "2-digit", month: "2-digit" })}</text>`;
    return s + `</svg>`;
  }

  /* ---------- Disziplinen ---------- */
  const runPaceZ2 = [1000 / D.zones.run[1][1], 1000 / D.zones.run[1][0]]; // s/km (schnell, langsam)
  function disciplines() {
    const swims = ofCat(acts, "swim"), bikes = ofCat(acts, "bike"), runs = ofCat(acts, "run");
    const weeksN = weeks.length;
    const stat = (l, v) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`;

    // Schwimmen
    const swimKm = sum(swims, (a) => a.km), swimSec = sum(swims, (a) => a.sec);
    const swimPts = swims.filter((a) => a.km >= 0.9).map((a) => ({ d: a.date, v: a.sec / (a.km * 10), a })).reverse();
    const bestSwim = Math.min(...swimPts.map((p) => p.v));
    const longestSwim = Math.max(...swims.map((a) => a.km));
    // Rad
    const bikeKm = sum(bikes, (a) => a.km), bikeSec = sum(bikes, (a) => a.sec), bikeElev = sum(bikes, (a) => a.elev);
    const indoor = bikes.filter((a) => a.sport === "VirtualRide").length;
    const bikeWeekly = weeks.map((w) => ({ d: w.start, v: sum(ofCat(inRange(w.start, addDays(w.start, 7)), "bike"), (a) => a.km) }));
    // Laufen
    const runKm = sum(runs, (a) => a.km), runSec = sum(runs, (a) => a.sec), runElev = sum(runs, (a) => a.elev);
    const runPts = runs.filter((a) => a.km >= 4).map((a) => ({ d: a.date, v: a.sec / a.km, a })).reverse();
    const longestRun = Math.max(...runs.map((a) => a.km));

    $("#disciplines").innerHTML = `
      <div class="card" id="dSwim">
        <h3><i class="swatch" style="background:var(--swim)"></i>Schwimmen</h3>
        <div class="stats">
          ${stat("Einheiten", swims.length)}${stat("Distanz", nf(swimKm, 1) + " km")}${stat("Zeit", hm(swimSec) + " h")}
          ${stat("Ø Pace", mmss(swimSec / (swimKm * 10)) + "/100m")}${stat("Beste Pace*", mmss(bestSwim) + "/100m")}${stat("Längste", nf(longestSwim * 1000) + " m")}
        </div>
        <div class="mini-title">Pace pro Einheit (≥ 900 m) · schneller = oben</div>
        <div class="chart" id="swimChart"></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">* nur Einheiten ab 900 m. Ø ${nf(swims.length / weeksN, 1)} Einheiten/Woche.</p>
      </div>
      <div class="card" id="dBike">
        <h3><i class="swatch" style="background:var(--bike)"></i>Rad</h3>
        <div class="stats">
          ${stat("Einheiten", bikes.length)}${stat("Distanz", nf(bikeKm) + " km")}${stat("Zeit", hm(bikeSec) + " h")}
          ${stat("Höhenmeter", nf(bikeElev) + " m")}${stat("Längste", nf(Math.max(...bikes.map((a) => a.km))) + " km")}${stat("Indoor", indoor + " / " + bikes.length)}
        </div>
        <div class="mini-title">Kilometer pro Woche</div>
        <div class="chart" id="bikeChart"></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">FTP ${D.zones.ftp} W · Ironman-Tempo ca. ${Math.round(D.zones.ftp * 0.65)}–${Math.round(D.zones.ftp * 0.75)} W (65–75 % FTP, Faustregel).</p>
      </div>
      <div class="card" id="dRun">
        <h3><i class="swatch" style="background:var(--run)"></i>Laufen</h3>
        <div class="stats">
          ${stat("Einheiten", runs.length)}${stat("Distanz", nf(runKm) + " km")}${stat("Zeit", hm(runSec) + " h")}
          ${stat("Ø Pace", mmss(runSec / runKm) + "/km")}${stat("Längster", nf(longestRun, 1) + " km")}${stat("Höhenmeter", nf(runElev) + " m")}
        </div>
        <div class="mini-title">Pace pro Lauf (≥ 4 km) · Band = Strava-Zone 2</div>
        <div class="chart" id="runChart"></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Zone 2 (Ausdauer): ${mmss(runPaceZ2[0])}–${mmss(runPaceZ2[1])} /km.</p>
      </div>`;

    const sc = $("#swimChart");
    sc.innerHTML = paceChart(swimPts, { fmt: mmss, color: "var(--swim)", unitLabel: "Schwimm-Pace pro Einheit" });
    attachPointTips(sc, swimPts, "var(--swim)", (p) => `<div class="t-title">${esc(p.a.name)}</div>${tRow("var(--swim)", fmtDate(p.d), mmss(p.v) + " /100m")}<div class="muted">${nf(p.a.km * 1000)} m · ${hm(p.a.sec)} h</div>`);

    const bc = $("#bikeChart");
    bc.innerHTML = weeklyBars(bikeWeekly, "var(--bike)", "km");
    bc.querySelectorAll(".hit").forEach((r) => {
      const w = bikeWeekly[+r.dataset.i];
      r.addEventListener("mousemove", (ev) => showTip(`<div class="t-title">Woche ab ${fmtDate(w.d)}</div>${tRow("var(--bike)", "Rad", nf(w.v) + " km")}`, ev));
      r.addEventListener("mouseleave", hideTip);
    });

    const rc = $("#runChart");
    rc.innerHTML = paceChart(runPts, { fmt: mmss, band: runPaceZ2, color: "var(--run)", unitLabel: "Lauf-Pace pro Lauf" });
    attachPointTips(rc, runPts, "var(--run)", (p) => `<div class="t-title">${esc(p.a.name)}</div>${tRow("var(--run)", fmtDate(p.d), mmss(p.v) + " /km")}<div class="muted">${nf(p.a.km, 1)} km · ${p.a.elev} hm</div>`);
  }

  /* ---------- Rennvorbereitung ---------- */
  function raceReady() {
    const rows = [
      ["swim", "Schwimmen", Math.max(...ofCat(acts, "swim").map((a) => a.km)), D.race.swimKm],
      ["bike", "Rad", Math.max(...ofCat(acts, "bike").map((a) => a.km)), D.race.bikeKm],
      ["run", "Laufen", Math.max(...ofCat(acts, "run").map((a) => a.km)), D.race.runKm],
    ];
    $("#readiness").innerHTML = rows.map(([k, l, best, goal]) => {
      const pct = Math.min(100, (best / goal) * 100);
      return `<div class="ready-row"><span>${l}</span><div class="ready-track" role="img" aria-label="${l}: ${Math.round((best / goal) * 100)} %"><div class="ready-fill" style="width:${pct}%;background:var(--${k})"></div></div><span class="num">${nf(best, 1)} / ${nf(goal, 1)} km · <b>${Math.round((best / goal) * 100)} %</b></span></div>`;
    }).join("");

    const g = D.goals;
    const parts = [
      ["swim", "Schwimmen", toSec(g.swim), "var(--swim)", `${mmss(toSec(g.swim) / (D.race.swimKm * 10))} /100m`],
      ["t1", "T1", toSec(g.t1), "var(--other)", "Wechsel"],
      ["bike", "Rad", toSec(g.bike), "var(--bike)", `${nf(D.race.bikeKm / (toSec(g.bike) / 3600), 1)} km/h`],
      ["t2", "T2", toSec(g.t2), "var(--other)", "Wechsel"],
      ["run", "Laufen", toSec(g.run), "var(--run)", `${mmss(toSec(g.run) / D.race.runKm)} /km`],
    ];
    const total = sum(parts, (p) => p[2]);
    $("#splitBar").innerHTML = parts.map((p) => `<div style="flex:${p[2]};background:${p[3]}" title="${p[1]} ${hms(p[2])}"></div>`).join("");
    $("#splitTable").innerHTML = `<table><tbody>${parts.map((p) => `<tr><td><i class="swatch" style="background:${p[3]}"></i> ${p[1]}</td><td class="num">${hms(p[2])}</td><td class="num muted">${p[4]}</td></tr>`).join("")}
      <tr><td><b>Gesamt</b></td><td class="num"><b>${hms(total)}</b></td><td></td></tr></tbody></table>`;
  }

  /* ---------- Zonen & Bestleistungen ---------- */
  function zones() {
    const z = D.zones;
    const hrNames = ["Regeneration", "Grundlage", "Tempo", "Schwelle", "Anaerob"];
    const pNames = ["Aktive Erholung", "Ausdauer", "Tempo", "Schwelle", "VO2max", "Anaerob", "Neuromuskulär"];
    const rNames = ["Aktive Erholung", "Ausdauer", "Tempo", "Schwelle", "VO2max", "Anaerob"];
    const shade = (i, n) => `color-mix(in srgb, var(--text) ${Math.round(15 + (i / (n - 1)) * 70)}%, transparent)`;
    const table = (title, rows, head) => `<div class="card"><h3>${title}</h3><table><thead><tr><th>Zone</th><th>${head}</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    const hrRows = z.hr.map(([a, b], i) => `<tr${i === 1 ? ' style="font-weight:600"' : ""}><td><span class="zone-bar" style="width:${8 + i * 6}px;background:${shade(i, 5)}"></span> Z${i + 1}</td><td>${hrNames[i]}</td><td class="num">${b == null ? "≥ " + a : a + "–" + b} bpm</td></tr>`);
    const pRows = z.power.map(([a, b], i) => `<tr${i === 1 ? ' style="font-weight:600"' : ""}><td><span class="zone-bar" style="width:${8 + i * 5}px;background:${shade(i, 7)}"></span> Z${i + 1}</td><td>${pNames[i]}</td><td class="num">${b == null ? "≥ " + a : a + "–" + b} W</td></tr>`);
    const rRows = z.run.map(([a, b], i) => {
      const slow = a ? 1000 / a : null, fast = b ? 1000 / b : null;
      const txt = !a ? `> ${mmss(fast)}` : !b ? `< ${mmss(slow)}` : `${mmss(fast)}–${mmss(slow)}`;
      return `<tr${i === 1 ? ' style="font-weight:600"' : ""}><td><span class="zone-bar" style="width:${8 + i * 6}px;background:${shade(i, 6)}"></span> Z${i + 1}</td><td>${rNames[i]}</td><td class="num">${txt} /km</td></tr>`;
    });
    $("#zones").innerHTML = table("Herzfrequenz", hrRows, "Bereich") + table(`Leistung (FTP ${z.ftp} W)`, pRows, "Bereich") + table("Lauf-Pace", rRows, "Bereich");

    const b = D.bests;
    $("#bests").innerHTML = `
      <div class="card"><h3><i class="swatch" style="background:var(--run)"></i>Lauf-Bestzeiten</h3><table><tbody>${b.run.map(([l, s, d]) => `<tr><td>${l}</td><td class="num"><b>${s >= 3600 ? hms(s) : mmss(s)}</b></td><td class="num muted">${fmtDate(parse(d))}</td></tr>`).join("")}</tbody></table></div>
      <div class="card"><h3><i class="swatch" style="background:var(--bike)"></i>Rad-Bestwerte</h3><table><tbody>${b.bike.map(([l, v, d]) => `<tr><td>${l}</td><td class="num"><b>${v}</b></td><td class="num muted">${fmtDate(parse(d))}</td></tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- Insights ---------- */
  function insights() {
    const swims = ofCat(acts, "swim").filter((a) => a.km >= 0.9);
    const paces = swims.map((a) => a.sec / (a.km * 10));
    const avgSwim = sum(swims, (a) => a.km) / swims.length;
    const longestBike = Math.max(...ofCat(acts, "bike").map((a) => a.km));
    const longestRun = Math.max(...ofCat(acts, "run").map((a) => a.km));
    const str = ofCat(acts, "strength").length;
    const last3 = inRange(addDays(snapEnd, -21), snapEnd);
    const tri3 = sum(last3.filter((a) => ["swim", "bike", "run"].includes(a.cat)), (a) => a.sec) / 3600 / 3;
    const items = [
      ["warn", "Baustelle", "Schwimmen ist der größte Hebel", `Ø ${nf(avgSwim, 1)} km pro Einheit, Pace schwankt zwischen ${mmss(Math.min(...paces))} und ${mmss(Math.max(...paces))} /100m. Für 3,8 km im Rennen: regelmäßig 3× pro Woche, Technik vor Umfang, Einheiten schrittweise Richtung 3 km.`],
      ["good", "Stärke", "Rad-Basis ist da", `Längste Fahrt seit August: ${nf(longestBike, 1)} km – bereits über Renndistanz. FTP ${D.zones.ftp} W (${nf(D.zones.ftp / D.athlete.weightKg, 2)} W/kg). Für dein Ziel „schneller am Berg“: Sweet-Spot- und Bergintervalle im Winter auf Zwift.`],
      ["good", "Im Plan", "Laufen solide", `Längster Lauf ${nf(longestRun, 1)} km, lockere Läufe meist um 5:30–6:00 /km (Zone 2 laut Strava: ${mmss(runPaceZ2[0])}–${mmss(runPaceZ2[1])} /km). Langen Lauf bis zum Frühjahr langsam auf 20–24 km steigern.`],
      ["good", "Stärke", "Krafttraining konsequent", `${str} Krafteinheiten in ${weeks.length} Wochen (Ø ${nf(str / weeks.length, 1)}/Woche). Ideal für Grundlage 1 – ab Februar auf 1–2 Erhaltungseinheiten reduzieren.`],
      [tri3 < 5 ? "warn" : "good", tri3 < 5 ? "Achtung" : "Gut", "Reise-Wochen", `In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche (Klettern, Reisen). Kein Problem in der Grundlage – danach wieder Richtung 8–11 h aufbauen.`],
      ["good", "Fokus", "Zone 2 verbessern", `Dein Strava-Fokus. Herzfrequenz-Zone 2: ${D.zones.hr[1][0]}–${D.zones.hr[1][1]} bpm, Rad-Zone 2: ${D.zones.power[1][0]}–${D.zones.power[1][1]} W. Ca. 80 % der Trainingszeit locker halten.`],
    ];
    $("#insights").innerHTML = items.map(([cls, badge, title, text]) => `<div class="card insight"><span class="badge ${cls}">${badge}</span><div><b>${title}</b><p>${text}</p></div></div>`).join("");
  }

  /* ---------- Aktivitäten ---------- */
  let filter = "all", showAll = false;
  function activities() {
    const filters = [["all", "Alle"], ["swim", "Schwimmen"], ["bike", "Rad"], ["run", "Laufen"], ["strength", "Kraft"], ["other", "Sonstiges"]];
    $("#actFilter").innerHTML = filters.map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("");
    $("#actFilter").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; showAll = false; activities(); }));
    const list = filter === "all" ? acts : acts.filter((a) => a.cat === filter);
    $("#actSub").textContent = `Alle ${acts.length} Aktivitäten seit ${fmtDate(acts[acts.length - 1].date)}.`;
    $("#actCount").textContent = `${list.length} Einträge`;
    $("#actTable").innerHTML = `<thead><tr><th>Datum</th><th>Sport</th><th>Name</th><th class="num">Distanz</th><th class="num">Zeit</th><th class="num">Hm</th><th class="num">Pace / Tempo</th></tr></thead><tbody>` +
      list.slice(0, showAll ? list.length : 25).map((a) => `<tr><td>${fmtDate(a.date, { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
        <td><i class="swatch" style="background:${CATS[a.cat].color}"></i> ${SPORT_LABEL[a.sport] || a.sport}</td>
        <td>${esc(a.name)}</td>
        <td class="num">${a.km ? (a.cat === "swim" ? nf(a.km * 1000) + " m" : nf(a.km, 1) + " km") : "–"}</td>
        <td class="num">${hm(a.sec)}</td><td class="num">${a.elev || "–"}</td><td class="num">${esc(a.info) || "–"}</td></tr>`).join("") + `</tbody>`;
    const more = $("#actMore");
    more.hidden = showAll || list.length <= 25;
    more.textContent = `Alle ${list.length} anzeigen`;
  }

  /* ---------- Init ---------- */
  $("#actMore").addEventListener("click", () => { showAll = true; activities(); });
  hero(); kpis(); insights(); season(); volumeChart(); disciplines(); raceReady(); zones(); activities();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("#volChart").hidden) volumeChart(); }, 150); });
  $("#toggleOther").addEventListener("click", (e) => { showOther = !showOther; e.currentTarget.setAttribute("aria-pressed", showOther); volumeChart(); });
  $("#toggleTable").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", on);
    $("#volTable").hidden = !on; $("#volChart").hidden = on;
    if (!on) volumeChart();
  });
})();
