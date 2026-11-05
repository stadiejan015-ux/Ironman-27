(function () {
  "use strict";
  const S = window.STRAVA || {};
  const D = Object.assign({}, S, window.TRAINING, {
    athlete: Object.assign({}, window.TRAINING.athlete, S.athlete),
    zones: Object.assign({}, S.zones, window.TRAINING.zones), // eigene HF-Zonen haben Vorrang
  });
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
    strength: { label: "Kraft", color: "var(--strength)" },
    other: { label: "Sonstiges", color: "var(--other)" },
  };
  const SPORT_LABEL = { Swim: "Schwimmen", Ride: "Rad", VirtualRide: "Rad (Zwift)", Run: "Laufen", WeightTraining: "Kraft", RockClimbing: "Klettern", Hike: "Wandern", Yoga: "Yoga/Mobility", TrailRun: "Trailrun", Tennis: "Tennis", Workout: "Workout" };
  const cat = (sport) => sport === "Swim" ? "swim" : (sport === "Ride" || sport === "VirtualRide") ? "bike" : (sport === "Run" || sport === "TrailRun") ? "run" : sport === "WeightTraining" ? "strength" : "other";

  const acts = D.activities.map(([date, sport, name, km, sec, elev, info, desc]) => ({
    date: parse(date), sport, name, km, sec, elev, info: info || "", desc: desc || "", cat: cat(sport),
  })).sort((a, b) => b.date - a.date);

  const snap = parse(D.snapshotDate);
  const snapEnd = addDays(snap, 1);
  const commit = parse(D.commitDate);
  const race = parse(D.race.date);
  const inRange = (from, to) => acts.filter((a) => a.date >= from && a.date < to);
  // Flex-Modus (js/flex.js): bei active=false oder nach "until" verhält sich alles wie bisher
  const FX = window.Flex, FCFG = window.TRAINING.flex || {};
  const FLEX = FX ? FX.flexState(FCFG, new Date()) : { active: false };
  const inFlex = (d) => !!(FX && FX.flexState(FCFG, d).active);
  // Krafteinheiten: Garmin-Titel (Gym-Tracker) vor Strava-Namen, ±10 min zusammengeführt
  const GYM = window.Gym, GCFG = window.TRAINING.gym || {};
  const GYM_SESS = GYM ? GYM.gymSessions((window.GARMIN && window.GARMIN.activities) || [], acts.filter((a) => a.cat === "strength"), GCFG, acts.filter((a) => a.cat !== "strength")) : [];
  // Für den Flex-Modus: Ausdauer aus Strava, Kraft aus den zusammengeführten Einheiten
  const flexActs = GYM && FX ? FX.mergeActs(acts, GYM_SESS) : acts;
  // Für Anzeigen: Strava-Name, wenn der Garmin-Titel nur „Krafttraining“ ist (Kalender, Wochenkarte)
  const GYM_VIEW = GYM_SESS.map((x) => ({ ...x, name: x.alt || x.name }));
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
    $("#heroSub").textContent = `${nf(D.race.swimKm, 1)} km Schwimmen · ${D.race.bikeKm} km Rad · ${nf(D.race.runKm, 1)} km Laufen. Fokus aktuell: ${FLEX.active && FCFG.focus ? FCFG.focus : D.athlete.focus}.`;
    const now = new Date();
    const days = Math.max(0, Math.ceil((race - now) / DAY));
    const weeks = Math.floor(days / 7);
    const phase = FLEX.active ? { short: "Flex" } : currentPhase(now);
    const totalDays = Math.round((race - commit) / DAY);
    const dayNo = Math.min(totalDays, Math.max(0, Math.floor((now - commit) / DAY) + 1));
    const pct = Math.round((dayNo / totalDays) * 100);
    $("#countdown").innerHTML = `
      <div><b>${days}</b><small>Tage</small></div>
      <div><b>${weeks}</b><small>Wochen</small></div>
      <div><b class="phase-name" style="font-size:18px;line-height:32px">${phase ? esc(phase.short) : "–"}</b><small>Phase</small></div>
      <div class="journey"><div class="journey-head"><span>Anmeldung ${fmtDate(commit, { day: "2-digit", month: "2-digit", year: "2-digit" })}</span><span><b>Tag ${dayNo}</b> von ${totalDays} · ${pct} %</span><span>Rennen</span></div>
        <div class="ready-track" role="img" aria-label="${pct} % der Vorbereitung vergangen"><div class="ready-fill" style="width:${pct}%;background:var(--text)"></div></div></div>`;
    $("#snap").textContent = fmtDate(snap);
    const banner = $("#flexBanner");
    if (FLEX.active) {
      const until = fmtDate(FLEX.until, { day: "2-digit", month: "2-digit" });
      banner.hidden = false;
      banner.innerHTML = `<b>Flex-Phase bis ${until}</b> · ${esc(FLEX.label)} · danach strukturiertes Training` +
        (FLEX.reentry ? `<div class="flex-reentry">Noch ${FLEX.daysLeft} ${FLEX.daysLeft === 1 ? "Tag" : "Tage"}: Wiedereinstieg vorbereiten – Ausdauer wieder auf 3–4 Einheiten pro Woche steigern, je eine längere lockere Rad- und Laufeinheit einbauen und Gym auf 2–3× reduzieren.</div>` : "");
    }
  }

  /* ---------- KPIs ---------- */
  function kpis() {
    const from = addDays(snapEnd, -28), prevFrom = addDays(snapEnd, -56);
    const cur = inRange(from, snapEnd), prev = inRange(prevFrom, from);
    $("#kpiSub").textContent = `${fmtDate(from)} – ${fmtDate(snap)}, verglichen mit den 4 Wochen davor.`;
    const delta = (a, b, unit, d = 0) => {
      const diff = a - b; if (Math.abs(diff) < 0.05) return "± 0 zur Vorperiode";
      if (FLEX.active && diff < 0) return `<span class="neutral-delta">−${nf(Math.abs(diff), d)} ${unit} · Flex-Phase, kein Soll</span>`;
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
      ["FTP", `${D.zones.ftp} <small>W · ${nf(D.zones.ftp / D.athlete.weightKg, 2)} W/kg</small>`, `bei ${nf(D.athlete.weightKg, 1)} kg Körpergewicht${latestWeight ? " (Garmin)" : ""}`],
      ["Aktivitäts-Streak", `${D.athlete.streakWeeks} <small>Wochen</small>`, `seit Anmeldung ${Math.floor((snap - commit) / DAY / 7)} Wochen dabei`],
    ];
    $("#kpis").innerHTML = tiles.map(([l, v, d]) => `<div class="card kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="delta">${d}</div></div>`).join("");
  }

  // Häkchenliste fürs Wochen-Minimum
  const minList = (wk) => `<ul class="min-list">${wk.items.map((x) => `<li class="${x.ok ? "ok" : ""}"><span class="tick" aria-hidden="true">${x.ok ? "✓" : "○"}</span><span>${esc(x.label)}</span><b>${x.have}/${x.need}</b><span class="sr-only">${x.ok ? "erfüllt" : "offen"}</span></li>`).join("")}</ul>`;

  /* ---------- Phasen ---------- */
  const planStart = commit;
  const PHASES = [
    { name: "Einstieg & Sommer", short: "Einstieg", from: null, to: 42, hours: "6–10 h", focus: ["Anmeldung Ironman Frankfurt ✔", "Lange Ausfahrten & Alpenpässe", "Krafttraining etablieren", "Laufbasis aufbauen"] },
    { name: "Grundlage 1", short: "Grundlage 1", from: 42, to: 28, hours: "8–11 h", focus: ["Schwimmtechnik (3×/Woche, Drills, Wasserlage)", "Viel lockere Zone 2 auf Rad & Lauf", "2–3× Krafttraining (Beine, Rumpf)", "FTP- und Laufbasis stabilisieren"] },
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

  // Zeitstrahl-Layout: Breite proportional zur Dauer, aber jede Phase mindestens TL_MIN px breit
  // (Peak/Taper bleiben lesbar). Ist der Platz zu knapp (Handy), wird der Zeitstrahl breiter und
  // scrollt horizontal; Heute-Marker und Flex-Spanne werden an den Phasen ausgerichtet.
  const TL_MIN = 66, TL_GAP = 3, TL_MIN_WIDTH = 720;
  function layoutTimeline(scrollToToday) {
    const tl = $("#timeline"), wrap = tl && tl.parentElement;
    if (!tl || !wrap || !wrap.clientWidth) return;
    const els = tl.querySelectorAll(".phase");
    const W = Math.max(wrap.clientWidth - 4, TL_MIN_WIDTH);
    const free = W - (PHASES.length - 1) * TL_GAP, fixed = new Set();
    let widths = [];
    for (let k = 0; k <= PHASES.length; k++) {
      const dur = PHASES.reduce((s, p, i) => s + (fixed.has(i) ? 0 : p.end - p.start), 0);
      const rest = free - fixed.size * TL_MIN;
      widths = PHASES.map((p, i) => (fixed.has(i) ? TL_MIN : (rest * (p.end - p.start)) / dur));
      const small = widths.map((w, i) => (w < TL_MIN && !fixed.has(i) ? i : -1)).filter((i) => i >= 0);
      if (!small.length) break;
      small.forEach((i) => fixed.add(i));
    }
    const lefts = [];
    widths.reduce((x, w, i) => { lefts[i] = x; els[i].style.flex = `0 0 ${w}px`; return x + w + TL_GAP; }, 0);
    tl.style.width = W + "px";
    const xOf = (d) => {
      const i = Math.max(0, PHASES.findIndex((p) => d < p.end));
      const p = PHASES[i];
      return lefts[i] + Math.min(1, Math.max(0, (d - p.start) / (p.end - p.start))) * widths[i];
    };
    const span = tl.querySelector(".flex-span");
    if (span) {
      const fs = FCFG.from ? parse(FCFG.from) : new Date(), fe = addDays(parse(FCFG.until), 1);
      span.style.left = xOf(fs) + "px";
      span.style.width = Math.max(4, xOf(fe) - xOf(fs)) + "px";
    }
    const m = tl.querySelector(".today-marker");
    if (m) m.style.left = xOf(new Date()) + "px";
    if (scrollToToday && m && W > wrap.clientWidth) wrap.scrollLeft = Math.max(0, xOf(new Date()) - wrap.clientWidth * 0.35);
  }

  function season() {
    const now = new Date();
    const total = race - planStart;
    const tl = $("#timeline");
    tl.innerHTML = PHASES.map((p) => {
      const state = now >= p.end ? "done" : now >= p.start ? "current" : "";
      return `<div class="phase ${state}" title="${esc(p.name)}"><b>${esc(p.short)}</b><span>${p.hours}</span></div>`;
    }).join("");
    if (FX && FCFG.active && FCFG.until) {
      const fs = FCFG.from ? parse(FCFG.from) : now;
      const span = document.createElement("div");
      span.className = "flex-span"; span.title = `${FCFG.label || "Flex"}: ${fmtDate(fs)} – ${fmtDate(parse(FCFG.until))}`;
      span.innerHTML = "<span>Flex</span>";
      tl.appendChild(span);
    }
    if (now > planStart && now < race) {
      const m = document.createElement("div");
      m.className = "today-marker";
      tl.appendChild(m);
    }
    layoutTimeline(true);
    const cp = currentPhase(now);
    if (FLEX.active) {
      const wk = FX.weekMinimum(flexActs, now, FCFG), after = currentPhase(addDays(FLEX.until, 1));
      $("#currentPhase").innerHTML = `<div class="card" style="box-shadow:none;background:var(--surface-2);border:0">
        <h3 style="margin-bottom:2px">Flex · ${esc(FLEX.label)}</h3>
        <div class="muted" style="font-size:13px;margin-bottom:10px">${FLEX.from ? fmtDate(FLEX.from) + " – " : "bis "}${fmtDate(FLEX.until)} · noch ${FLEX.daysLeft} Tage${after ? ` · danach ${esc(after.name)}` : ""}</div>
        <div class="mini-title" style="margin-top:0">Wochen-Minimum (diese Woche)</div>
        ${minList(wk)}</div>`;
    } else if (cp) {
      const left = Math.ceil((cp.end - now) / DAY / 7);
      $("#currentPhase").innerHTML = `<div class="card" style="box-shadow:none;background:var(--surface-2);border:0">
        <h3 style="margin-bottom:2px">${esc(cp.name)}</h3>
        <div class="muted" style="font-size:13px;margin-bottom:10px">${fmtDate(cp.start)} – ${fmtDate(addDays(cp.end, -1))} · noch ${left} Wochen · Ziel ${cp.hours}/Woche</div>
        <ul style="margin:0;padding-left:18px">${cp.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`;
    } else {
      $("#currentPhase").innerHTML = `<p class="muted">Außerhalb des Plans.</p>`;
    }
    // chronologisch nach Startdatum – Flex landet so zwischen Grundlage 1 und Grundlage 2
    const rows = PHASES.map((p) => ({ start: p.start, html: `<li class="${p === cp && !FLEX.active ? "current" : ""}">
      <b>${esc(p.short)}</b><span class="dates">${fmtDate(p.start, { day: "2-digit", month: "short" })} – ${fmtDate(addDays(p.end, -1), { day: "2-digit", month: "short", year: "2-digit" })}</span><span class="hrs">${p.hours}</span></li>` }));
    if (FLEX.active) rows.push({ start: FLEX.from || now, html: `<li class="current flex-li"><b>Flex</b><span class="dates">${FLEX.from ? fmtDate(FLEX.from, { day: "2-digit", month: "short" }) + " – " : "bis "}${fmtDate(FLEX.until, { day: "2-digit", month: "short", year: "2-digit" })}</span><span class="hrs">Minimum</span></li>` });
    $("#phaseList").innerHTML = rows.sort((a, b) => a.start - b.start).map((r) => r.html).join("");
  }

  /* ---------- Wochenumfang (gestapelte Balken) ---------- */
  const firstWeek = monday(acts[acts.length - 1].date);
  const weeks = [];
  for (let w = firstWeek; w <= snap; w = addDays(w, 7)) {
    const list = inRange(w, addDays(w, 7));
    const h = (c) => sum(ofCat(list, c), (a) => a.sec) / 3600;
    const flexWeek = inFlex(addDays(w, 3)) || inFlex(w) || inFlex(addDays(w, 6));
    weeks.push({ start: w, swim: h("swim"), bike: h("bike"), run: h("run"), extra: h("strength") + h("other"),
      flex: flexWeek, min: flexWeek && FX ? FX.weekMinimum(flexActs, w, FCFG) : null });
  }
  let showOther = FLEX.active; // im Flex-Zeitraum Kraft standardmäßig mit anzeigen

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
    const anyFlex = weeks.some((w) => w.flex);
    const W = Math.max(300, Math.round(el.clientWidth || 1000)), H = (W < 600 ? 230 : 300) + (anyFlex ? 16 : 0), m = { t: anyFlex ? 22 : 12, r: 8, b: anyFlex ? 46 : 30, l: 34 };
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
    const fIdx = weeks.map((w, i) => (w.flex ? i : -1)).filter((i) => i >= 0);
    if (fIdx.length) {
      const x0 = m.l + band * fIdx[0], x1 = m.l + band * (fIdx[fIdx.length - 1] + 1);
      svg += `<rect x="${x0}" y="${m.t - 16}" width="${x1 - x0}" height="${ih + 16}" fill="var(--surface-2)" rx="6"/><text x="${x0 + 6}" y="${m.t - 4}">Flex</text>`;
    }
    weeks.forEach((w, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      let acc = 0;
      const segs = keys.filter((k) => w[k] > 0);
      if (w.flex) svg += `<g opacity=".45">`;
      segs.forEach((k, j) => {
        const y0 = y(acc), y1 = y(acc + w[k]);
        const top = j === segs.length - 1;
        const gap = j > 0 ? 2 : 0;
        const hgt = Math.max(0, y0 - y1 - gap);
        if (top) svg += `<path d="${roundedTopRect(x, y1, bw, hgt, 4)}" fill="${colors[k]}"/>`;
        else svg += `<rect x="${x}" y="${y1}" width="${bw}" height="${hgt}" fill="${colors[k]}"/>`;
        acc += w[k];
      });
      if (w.flex) {
        svg += `</g>`;
        svg += w.min.ok ? `<text x="${x + bw / 2}" y="${H - 28}" text-anchor="middle" class="min-ok">✓</text>` : `<text x="${x + bw / 2}" y="${H - 28}" text-anchor="middle">${w.min.items.filter((it) => it.ok).length}/3</text>`;
      }
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
        `<div class="t-row" style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px"><span>Summe</span><span>${hm(keys.reduce((s, k) => s + w[k], 0) * 3600)} h</span></div>` +
        (w.min ? `<div class="t-title" style="margin-top:6px">Wochen-Minimum (Flex)</div>` + w.min.items.map((it) => `<div class="t-row"><span>${it.ok ? "✓" : "○"} ${esc(it.label)}</span><span>${it.have}/${it.need}</span></div>`).join("") : "");
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
      if (points.length <= 30 || i === points.length - 1) s += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
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
    const runPts = runs.filter((a) => a.km >= 4 && a.sport === "Run").map((a) => ({ d: a.date, v: a.sec / a.km, a })).reverse();
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

    predictionCard();
  }

  /* ---------- Ziel vs. Prognose ---------- */
  const fmtDelta = (d) => { const a = Math.abs(Math.round(d)); return (d > 0 ? "+" : d < 0 ? "−" : "±") + (a >= 3600 ? hms(a) : mmss(a)); };
  const CONF = { hoch: "good", mittel: "neutral", niedrig: "warn" };
  let PRED = null;

  function predictionCard() {
    const card = $("#predCard");
    if (typeof window.predictRace !== "function" || !window.TRAINING.prediction) { card.hidden = true; return; }
    const p = PRED = window.predictRace({ strava: S, garmin: window.GARMIN, asOf: S.snapshotDate }, window.TRAINING.prediction);
    const g = D.goals, swimM = D.race.swimKm * 1000, bikeKm = D.race.bikeKm, runKm = window.TRAINING.prediction.run.distanceKm;
    const legs = [
      { key: "swim", label: "Schwimmen", color: "var(--swim)", goal: toSec(g.swim), pred: p.swim, unit: (t) => `${mmss(t / (swimM / 100))} /100 m` },
      { key: "t1", label: "T1", color: "var(--other)", goal: toSec(g.t1), pred: p.t1, unit: () => "Wechsel" },
      { key: "bike", label: "Rad", color: "var(--bike)", goal: toSec(g.bike), pred: p.bike, unit: (t) => `${nf(bikeKm / (t / 3600), 1)} km/h` },
      { key: "t2", label: "T2", color: "var(--other)", goal: toSec(g.t2), pred: p.t2, unit: () => "Wechsel" },
      { key: "run", label: "Laufen", color: "var(--run)", goal: toSec(g.run), pred: p.run, unit: (t) => `${mmss(t / runKm)} /km` },
    ];
    const goalTotal = sum(legs, (l) => l.goal);
    $("#predAsOf").textContent = `Wenn heute Renntag wäre · Stand ${fmtDate(parse(p.asOf))}`;

    // Zwei gestapelte Balken auf derselben Zeitskala
    const max = Math.max(goalTotal, p.total.conservative, p.subTarget) * 1.03;
    const pct = (t) => (t / max) * 100;
    const bar = (label, total, key, range) => `
      <div class="pbar-row">
        <div class="pbar-label">${label}<b>${hm(total)}</b></div>
        <div class="pbar-track">
          <div class="pbar" style="width:${pct(total)}%">${legs.map((l) => { const t = key === "goal" ? l.goal : l.pred.realistic; return `<div class="pseg" data-k="${l.key}" data-t="${t}" style="flex:${t};background:${l.color}"></div>`; }).join("")}</div>
          ${range ? `<div class="prange" style="left:${pct(range[0])}%;width:${pct(range[1] - range[0])}%" title="Spanne ${hm(range[0])}–${hm(range[1])}"></div>` : ""}
        </div>
      </div>`;
    const ticks = [];
    for (let h = 0; h * 3600 <= max; h += 2) if (Math.abs(h * 3600 - p.subTarget) > 1800) ticks.push(`<span style="left:${pct(h * 3600)}%">${h} h</span>`);
    $("#predBars").innerHTML = `
      <div class="pbars">
        ${bar("Ziel", goalTotal, "goal")}
        ${bar("Prognose", p.total.realistic, "pred", [p.total.optimistic, p.total.conservative])}
        <div class="pbar-axis"><div class="pbar-label"></div><div class="pbar-ticks">${ticks.join("")}<span class="sub-mark" style="left:${pct(p.subTarget)}%">Sub-12</span></div></div>
        <div class="sub-line" style="--x:${pct(p.subTarget)}"></div>
      </div>
      <div class="legend" style="margin:6px 0 4px">${legs.filter((l) => l.key !== "t2").map((l) => `<span><i class="swatch" style="background:${l.color}"></i>${l.key === "t1" ? "Wechsel" : l.label}</span>`).join("")}<span><i class="swatch" style="background:var(--text-3);height:3px;border-radius:2px"></i>Spanne der Prognose</span></div>`;
    $("#predBars").querySelectorAll(".pseg").forEach((el) => {
      const l = legs.find((x) => x.key === el.dataset.k);
      el.addEventListener("mousemove", (ev) => showTip(`${tRow(l.color, l.label, hms(+el.dataset.t))}`, ev));
      el.addEventListener("mouseleave", hideTip);
    });

    // Tabelle Disziplin · Ziel · Prognose · Δ
    const deltaCell = (pred, goal) => `<td class="num delta ${pred <= goal ? "good" : "warn"}" data-label="Δ">${fmtDelta(pred - goal)}</td>`;
    const rows = legs.map((l) => {
      const r = l.pred, isT = l.key === "t1" || l.key === "t2";
      const main = `<tr class="${isT ? "t-row-small" : ""}">
        <td><span class="disc"><i class="swatch" style="background:${l.color}"></i>${l.label}</span>${isT ? "" : `<span class="badge ${CONF[r.confidence]}">Vertrauen ${r.confidence}</span>`}</td>
        <td class="num" data-label="Ziel">${hms(l.goal)}${isT ? "" : `<div class="sub">${l.unit(l.goal)}</div>`}</td>
        <td class="num" data-label="Prognose"><b>${hms(r.realistic)}</b>${isT ? "" : `<div class="sub">${l.unit(r.realistic)}</div><div class="sub">Spanne ${hm(r.optimistic)}–${hm(r.conservative)}</div>`}</td>
        ${deltaCell(r.realistic, l.goal)}
      </tr>`;
      const calc = isT ? "" : `<tr class="calc-row"><td colspan="4"><details><summary>Wie berechnet?</summary><ul>${r.inputs.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></details></td></tr>`;
      return main + calc;
    }).join("");
    const gap = p.subGap;
    const subChip = gap <= 0
      ? `<span class="badge good">✓ Sub-12${gap < -60 ? ` · ${Math.floor(-gap / 60)} min Puffer` : ""}</span>`
      : `<span class="badge warn">noch ${Math.ceil(gap / 60)} min bis Sub-12</span>`;
    $("#predTable").innerHTML = `<thead><tr><th>Disziplin</th><th class="num">Ziel</th><th class="num">Prognose</th><th class="num">Δ</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td><b>Gesamt</b> ${subChip}</td>
        <td class="num" data-label="Ziel"><b>${hms(goalTotal)}</b>${goalTotal <= p.subTarget ? `<div class="sub">Ziel ist Sub-12</div>` : ""}</td>
        <td class="num" data-label="Prognose"><b>${hms(p.total.realistic)}</b><div class="sub">Spanne ${hm(p.total.optimistic)}–${hm(p.total.conservative)}</div></td>
        ${deltaCell(p.total.realistic, goalTotal)}
      </tr></tfoot>`;
    const notes = [];
    if (p.bike.note) notes.push(`⚠️ ${esc(p.bike.note)}`);
    p.warnings.forEach((w) => notes.push(`⚠️ ${esc(w)}`));
    notes.push("Δ: grün = Prognose schneller als oder gleich dem Ziel, orange = langsamer. Spanne = optimistisch bis konservativ. Parameter anpassbar in <code>js/data.js</code> unter <code>prediction</code>.");
    $("#predNotes").innerHTML = notes.map((n) => `<div>${n}</div>`).join("");
  }

  /* ---------- Prognose-Verlauf (data/prediction-history.json) ---------- */
  function predictionHistory() {
    const box = $("#predHistory");
    const goalTotal = ["swim", "t1", "bike", "t2", "run"].reduce((a, k) => a + toSec(D.goals[k]), 0);
    fetch(`data/prediction-history.json?v=${window.__v || Date.now()}`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((hist) => {
        const pts = (Array.isArray(hist) ? hist : hist.entries || []).filter((e) => e.total).map((e) => ({ d: parse(e.date), v: e.total, e }));
        if (pts.length < 2) {
          box.innerHTML = `<p class="muted" style="margin:0">Der Verlauf startet mit dem ${pts[0] ? fmtDate(pts[0].d) : "nächsten Sync"} (Prognose ${pts[0] ? hm(pts[0].v) : "–"} h). Ab dem zweiten Tag siehst du hier, wie sich die Prognose entwickelt.</p>`;
          return;
        }
        box.innerHTML = historyChart(pts, goalTotal, PRED ? PRED.subTarget : 43200);
        attachPointTips(box, pts, "var(--recovery)", (p) => `<div class="t-title">${fmtDate(p.d)}</div>${tRow("var(--recovery)", "Prognose", hms(p.v))}<div class="muted">Schwimmen ${hm(p.e.swim)} · Rad ${hm(p.e.bike)} · Laufen ${hm(p.e.run)}</div>`);
      })
      .catch(() => { box.innerHTML = `<p class="muted" style="margin:0">Verlauf nicht verfügbar (nur auf der veröffentlichten Seite).</p>`; });
  }

  function historyChart(points, goal, sub) {
    const W = 360, H = 170, m = { t: 12, r: 8, b: 22, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = points.map((p) => p.v).concat([goal, sub]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.15 || 600; lo -= pad; hi += pad;
    const t0 = points[0].d.getTime(), t1 = points[points.length - 1].d.getTime();
    const x = (d) => m.l + ((d.getTime() - t0) / (t1 - t0 || 1)) * iw;
    const y = (v) => m.t + ((v - lo) / (hi - lo)) * ih; // schneller = oben
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der Gesamtprognose">`;
    for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) / 3) * i; s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${hm(v)}</text>`; }
    [[sub, "Sub-12"], [goal, "Ziel"]].forEach(([v, label]) => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--text-3)" stroke-dasharray="4 3"/><text x="${W - m.r}" y="${y(v) - 4}" text-anchor="end">${label}</text>`; });
    s += `<path d="${points.map((p, i) => `${i ? "L" : "M"}${x(p.d)},${y(p.v)}`).join("")}" fill="none" stroke="var(--recovery)" stroke-width="2" stroke-linejoin="round"/>`;
    points.forEach((p, i) => {
      if (points.length <= 30 || i === points.length - 1) s += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4" fill="var(--recovery)" stroke="var(--surface)" stroke-width="2"/>`;
      s += `<circle class="hit" data-i="${i}" cx="${x(p.d)}" cy="${y(p.v)}" r="12" fill="transparent"/>`;
    });
    s += `<text x="${m.l}" y="${H - 4}">${fmtDate(points[0].d, { day: "2-digit", month: "2-digit" })}</text><text x="${W - m.r}" y="${H - 4}" text-anchor="end">${fmtDate(points[points.length - 1].d, { day: "2-digit", month: "2-digit" })}</text></svg>`;
    return s;
  }


  /* ---------- Zone-2-Entwicklung (data/z2-metrics.json, js/z2.js) ---------- */
  const ZCOL = ["28%", "46%", "64%", "82%", "100%"].map((p) => `color-mix(in srgb, var(--recovery) ${p}, var(--surface))`);
  const STATUS_COL = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };
  const STATUS_TXT = { good: "grün", warn: "gelb", bad: "rot" };
  const SRC_TXT = { strap: "Brustgurt", wrist: "Uhr (optisch)", unknown: "Pulsmesser unbekannt" };
  let Z2DATA = null, HRSRC = null, zoneFilter = "all";

  function zone2() {
    const cfg = window.TRAINING.z2, Z = window.Z2;
    if (!cfg || !Z) { $("#zone2").hidden = true; return; }
    const get = (f) => fetch(`${f}?v=${window.__v || Date.now()}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    Promise.all([get("data/z2-metrics.json"), get("data/hr-sources.json").catch(() => null)])
      .then(([db, src]) => { Z2DATA = db; HRSRC = src; renderZone2(); if (FLEX.active) today(); })
      .catch(() => {
        $("#z2Tiles").innerHTML = `<p class="muted">Zone-2-Daten nicht verfügbar (nur auf der veröffentlichten Seite).</p>`;
        const ins = $("#z2Insight p"); if (ins) ins.textContent = "Noch keine Zone-2-Auswertung verfügbar.";
      });
  }

  function renderZone2() {
    const cfg = window.TRAINING.z2, Z = window.Z2, hrZ = D.zones.hr;
    const all = Z2DATA.activities.filter((r) => r.kind);
    // Pulsmesser je Einheit: #gurt/#uhr-Markierung vor Garmin-Sensorliste (Start ±3 min)
    const srcs = (HRSRC && HRSRC.activities) || [];
    const mins = (iso) => Date.parse(String(iso).slice(0, 16) + ":00Z") / 60000;
    for (const r of all) {
      if (r.hrTag) { r.hrSrc = r.hrTag; r.hrSrcFrom = "Markierung"; continue; }
      const t = mins(r.date);
      // Kandidaten ±3 min; parallele Garmin-Aufzeichnung (z. B. Uhr neben Zwift) hat Vorrang vor „unbekannt“
      const cand = srcs.filter((x) => Math.abs(mins(x.start) - t) <= 3 && (r.kind === "run") === /run/.test(x.type));
      const m = cand.find((x) => x.source !== "unknown") || cand[0];
      r.hrSrc = m ? m.source : "unknown"; r.hrSrcFrom = m ? "Garmin" : null;
    }
    const strapOnly = (cfg.hrSource || {}).mode === "strapOnly";
    const recs = strapOnly ? all.filter((r) => r.hrSrc === "strap") : all;
    const lastDate = all.reduce((m, r) => (r.date > m ? r.date : m), "").slice(0, 10);
    const asOf = [S.snapshotDate, lastDate].sort().pop();
    const runBand = cfg.run.hrBand, rideBand = cfg.ride.hrBand;
    const runMid = Math.round((runBand[0] + runBand[1]) / 2), rideMid = Math.round((rideBand[0] + rideBand[1]) / 2);
    const pace = Z.paceSeries(recs), wIn = Z.wattSeries(recs, true), wOut = Z.wattSeries(recs, false);
    const decRuns = Z.decouplingSeries(recs, "run");
    const kP = Z.kpi(pace, asOf, cfg.windowDays, cfg.minPoints), kW = Z.kpi(wIn, asOf, cfg.windowDays, cfg.minPoints);
    const lastOf = (pts) => pts.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
    const tile = (label, value, sub, badge) => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${badge || ""}${sub}</div></div>`;
    const few = (n, what) => `noch zu wenig Daten (${n} ${n === 1 ? what[0] : what[1]} in 4 Wochen, mind. ${cfg.minPoints})`;

    // Kachel 1: Pace @ HF
    const lp = lastOf(pace);
    const t1 = kP.enough
      ? tile(`Pace @ ${runMid} bpm`, `${mmss(kP.value)} <small>/km</small>`, kP.delta != null ? `${kP.delta < 0 ? "▼" : kP.delta > 0 ? "▲" : "±"} ${mmss(Math.abs(kP.delta))} ${kP.delta <= 0 ? "schneller" : "langsamer"} als die 4 Wochen davor` : `Median aus ${kP.n} Läufen`)
      : tile(`Pace @ ${runMid} bpm`, "–", `${few(kP.n, ["Lauf", "Läufe"])}${lp ? ` · zuletzt ${mmss(lp.v)} /km am ${fmtDate(parse(lp.date), { day: "2-digit", month: "2-digit" })}` : ""}`);
    // Kachel 2: Watt @ HF (Indoor)
    const lw = lastOf(wIn);
    const t2 = kW.enough
      ? tile(`Watt @ ${rideMid} bpm (Indoor)`, `${nf(kW.value)} <small>W</small>`, kW.delta != null ? `${kW.delta > 0 ? "▲ +" : kW.delta < 0 ? "▼ −" : "± "}${nf(Math.abs(kW.delta))} W zu den 4 Wochen davor` : `Median aus ${kW.n} Fahrten`)
      : tile(`Watt @ ${rideMid} bpm (Indoor)`, "–", `${few(kW.n, ["Fahrt", "Fahrten"])}${lw ? ` · zuletzt ${lw.v} W am ${fmtDate(parse(lw.date), { day: "2-digit", month: "2-digit" })}` : ""}`);
    // Kachel 3: Ø Entkopplung lange Läufe
    const since = parse(asOf).getTime() - cfg.longRunWindowDays * DAY;
    const decRecent = decRuns.filter((p) => parse(p.date).getTime() > since);
    let t3;
    if (decRecent.length) {
      const avg = decRecent.reduce((a, p) => a + p.v, 0) / decRecent.length, st = Z.ampel(avg, cfg.decoupling.thresholds);
      t3 = tile("Ø Entkopplung lange Läufe", `${nf(avg, 1)} <small>%</small>`, `${decRecent.length} Lauf${decRecent.length > 1 ? "e" : ""} ≥ 60 min, letzte 8 Wochen`, `<span class="badge ${st}" style="margin-right:6px">${st === "good" ? "✓ unter 5 %" : st === "warn" ? "5–10 %" : "über 10 %"}</span>`);
    } else t3 = tile("Ø Entkopplung lange Läufe", "–", "noch keine ruhigen Läufe ≥ 60 min in den letzten 8 Wochen");
    // Kachel 4: Anteil Z1–2
    const sh = Z.zoneShare(all, asOf, cfg.windowDays, [0, 1]), sh3 = Z.zoneShare(all, asOf, cfg.windowDays, [2]);
    const t4 = sh ? tile("Anteil Z1–2 (4 Wochen)", `${Math.round(sh.share * 100)} <small>%</small>`, `Z3: ${Math.round((sh3 ? sh3.share : 0) * 100)} % · Z4–5: ${Math.round((1 - sh.share - (sh3 ? sh3.share : 0)) * 100)} % · ${hm(sh.totalSec)} h Lauf & Rad · Richtwert ~80 %`)
      : tile("Anteil Z1–2 (4 Wochen)", "–", "keine Einheiten mit Herzfrequenz");
    $("#z2Tiles").innerHTML = t1 + t2 + t3 + t4;

    // Chart 1: Pace @ HF
    const toPts = (arr, kind) => arr.map((p) => ({ d: parse(p.date), v: p.v, rec: p.rec, kind,
      hollow: kind === "run" ? p.rec.hrSrc !== "strap" : kind === "outdoor", gap: kind === "run" && !!(p.rec.pace && p.rec.pace.gap) }));
    const roll = (arr) => Z.rollingMedian(arr, cfg.windowDays).map((p) => ({ d: parse(p.date), v: p.v }));
    const tipRec = (p, valTxt) => `<div class="t-title">${esc(p.rec.name)}</div>${tRow("var(--recovery)", fmtDate(p.d, { weekday: "short", day: "2-digit", month: "2-digit" }), valTxt)}<div class="muted">${nf(p.rec.km, 1)} km · ${hm(p.rec.sec)} h${p.rec.pace ? ` · ${Math.round(p.rec.pace.bandSec / 60)} min im Band` : p.rec.watts ? ` · ${Math.round(p.rec.watts.bandSec / 60)} min im Band` : ""}</div><div class="muted">${SRC_TXT[p.rec.hrSrc] || SRC_TXT.unknown}${p.rec.hrSrcFrom ? ` (${p.rec.hrSrcFrom})` : ""}${p.gap ? " · steigungsbereinigt (GAP)" : ""}</div>`;
    trendChart($("#z2Pace"), toPts(pace, "run"), pace.length >= cfg.minPoints ? [{ pts: roll(pace) }] : [], {
      invert: true, fmt: mmss, label: `Pace @ ${runMid} bpm`, minPoints: cfg.minPoints,
      tip: (p) => tipRec(p, `${mmss(p.v)} /km`),
    });
    // Chart 2: Watt @ HF
    trendChart($("#z2Watts"), toPts(wIn, "indoor").concat(toPts(wOut, "outdoor")),
      [wIn.length >= cfg.minPoints ? { pts: roll(wIn) } : null, wOut.length >= cfg.minPoints ? { pts: roll(wOut), dash: true } : null].filter(Boolean), {
        invert: false, fmt: (v) => nf(v), label: `Watt @ ${rideMid} bpm`, minPoints: cfg.minPoints,
        tip: (p) => tipRec(p, `${p.v} W · ${p.kind === "indoor" ? "Indoor" : "Outdoor"}`),
      });
    // Chart 3: Entkopplung
    decouplingChart($("#z2Dec"), Z.decouplingSeries(recs), cfg.decoupling.thresholds);
    // Chart 4: Zonenverteilung
    $("#z2ZoneLegend").innerHTML = hrZ.map((z, i) => `<span><i class="swatch" style="background:${ZCOL[i]}"></i>Z${i + 1} ${i === 0 ? "< " + hrZ[1][0] : z[1] == null ? "≥ " + z[0] : z[0] + "–" + z[1]}</span>`).join("");
    zoneChart();

    // Text der Karte „Zone 2 verbessern“
    const ins = $("#z2Insight p");
    if (ins) ins.innerHTML = Z.summary(recs, asOf, cfg, hrZ).map(esc).join(" · ") + ` · <a href="#zone2">Details</a>`;
    $("#z2Asof").textContent = `${all.length} Läufe & Fahrten seit ${fmtDate(parse(all[0].date))} · Stand ${fmtDate(parse(asOf))}${strapOnly ? " · nur Brustgurt-Einheiten gewertet" : ""}`;
    const withHr = all.filter((r) => r.hasHr), cnt = (k) => withHr.filter((r) => r.hrSrc === k).length;
    $("#z2SrcStats").innerHTML = `<b>Pulsmesser erkannt:</b> ${cnt("strap")} × Brustgurt, ${cnt("wrist")} × Uhr, ${cnt("unknown")} × unbekannt (von ${withHr.length} Einheiten mit HF). ${HRSRC && HRSRC.updated ? `Garmin-Sensordaten Stand ${new Date(HRSRC.updated).toLocaleDateString("de-DE")}.` : "Noch keine Garmin-Sensordaten – der nächste Garmin-Lauf holt sie."}`;
  }

  // Einzelwerte als blasse Punkte, gleitender Median als Linie
  function trendChart(box, pts, lines, o) {
    if (pts.length < 1) { box.innerHTML = `<p class="muted" style="margin:0">Noch keine gewerteten Einheiten.</p>`; return; }
    const W = Math.max(300, Math.round(box.clientWidth || 520)), H = W < 500 ? 190 : 210, m = { t: 12, r: 10, b: 24, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = pts.map((p) => p.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.2 || Math.max(5, hi * 0.03); lo -= pad; hi += pad;
    let t0 = Math.min(...pts.map((p) => p.d.getTime())), t1 = Math.max(...pts.map((p) => p.d.getTime()));
    if (t1 - t0 < 14 * DAY) { t0 -= 7 * DAY; t1 += 7 * DAY; }
    const x = (d) => m.l + ((d.getTime() - t0) / (t1 - t0)) * iw;
    const y = (v) => (o.invert ? m.t + ((v - lo) / (hi - lo)) * ih : m.t + ih - ((v - lo) / (hi - lo)) * ih);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)} über die Zeit">`;
    for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) / 3) * i; s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${o.fmt(v)}</text>`; }
    lines.forEach((l) => { const ps = l.pts.filter((p) => p.v != null); if (ps.length > 1) s += `<path d="${ps.map((p, i) => `${i ? "L" : "M"}${x(p.d)},${y(p.v)}`).join("")}" fill="none" stroke="var(--recovery)" stroke-width="2" ${l.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round"/>`; });
    pts.forEach((p, i) => {
      const cx = x(p.d), cy = y(p.v);
      const look = p.hollow ? `fill="var(--surface)" stroke="var(--recovery)" stroke-width="2" opacity=".75"` : `fill="var(--recovery)" opacity=".45"`;
      s += p.gap ? `<path d="M${cx},${cy - 6.5}L${cx + 6.5},${cy}L${cx},${cy + 6.5}L${cx - 6.5},${cy}Z" ${look}/>` : `<circle cx="${cx}" cy="${cy}" r="${p.hollow ? 4.5 : 5}" ${look}/>`;
      s += `<circle class="hit" data-i="${i}" cx="${x(p.d)}" cy="${y(p.v)}" r="13" fill="transparent"/>`;
    });
    s += `<text x="${m.l}" y="${H - 6}">${fmtDate(new Date(t0), { day: "2-digit", month: "2-digit" })}</text><text x="${W - m.r}" y="${H - 6}" text-anchor="end">${fmtDate(new Date(t1), { day: "2-digit", month: "2-digit" })}</text></svg>`;
    const note = pts.length < o.minPoints ? `<p class="muted" style="font-size:12px;margin:4px 0 0">Noch zu wenig Daten für einen Trend (${pts.length} von mind. ${o.minPoints} Werten).</p>` : "";
    box.innerHTML = s + note;
    attachPointTips(box, pts, "var(--recovery)", o.tip);
  }

  function decouplingChart(box, list, thr) {
    if (!list.length) { box.innerHTML = `<p class="muted" style="margin:0">Noch keine ruhigen langen Einheiten (Lauf ≥ 60 min, Rad ≥ 90 min mit echten Watt, ≥ 80 % in Z1–2).</p>`; return; }
    const items = list.slice().sort((a, b) => a.date.localeCompare(b.date));
    const W = Math.max(300, Math.round(box.clientWidth || 520)), H = W < 500 ? 190 : 210, m = { t: 14, r: 10, b: 26, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const lo = Math.min(0, ...items.map((p) => p.v)) - 1, hi = Math.max(thr[1] + 2, ...items.map((p) => p.v)) + 1;
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const band = iw / Math.max(items.length, 6), bw = Math.min(36, band * 0.6);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entkopplung pro langer Einheit">`;
    [0, thr[0], thr[1]].forEach((v) => { s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v} %</text>`; });
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(thr[0])}" y2="${y(thr[0])}" stroke="var(--text-2)" stroke-dasharray="5 4"/>`;
    items.forEach((p, i) => {
      const st = window.Z2.ampel(p.v, thr), cx = m.l + band * i + band / 2;
      const top = Math.min(y(p.v), y(0)), h = Math.max(2, Math.abs(y(p.v) - y(0)));
      s += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="3" fill="${STATUS_COL[st]}"/>`;
      s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${fmtDate(parse(p.date), { day: "2-digit", month: "2-digit" })}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${cx - band / 2}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
    });
    box.innerHTML = s + "</svg>";
    box.querySelectorAll(".hit").forEach((el) => {
      const p = items[+el.dataset.i], r = p.rec, st = window.Z2.ampel(p.v, thr);
      const html = `<div class="t-title">${esc(r.name)}</div>${tRow(STATUS_COL[st], fmtDate(parse(p.date), { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" }), `${nf(p.v, 1)} % (${STATUS_TXT[st]})`)}<div class="muted">${r.kind === "run" ? "Lauf" : "Rad"} · ${hm(r.sec)} h · ${nf(r.km, 1)} km · Z1–2 ${Math.round(r.decoupling.z12Share * 100)} %${r.decoupling.vi ? ` · VI ${nf(r.decoupling.vi, 2)}` : ""}${r.decoupling.gap ? " · GAP" : ""}</div><div class="muted">${SRC_TXT[r.hrSrc] || SRC_TXT.unknown}</div>`;
      const show = (ev) => showTip(html, ev);
      el.addEventListener("mousemove", show); el.addEventListener("click", show); el.addEventListener("mouseleave", hideTip);
    });
  }

  function zoneChart() {
    const box = $("#z2Zones"), Z = window.Z2;
    const recs = Z2DATA.activities.filter((r) => r.kind);
    const weeksZ = Z.weeklyZones(recs, zoneFilter === "all" ? null : zoneFilter).slice(-16);
    $("#z2ZoneFilter").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.f === zoneFilter));
    if (!weeksZ.length) { box.innerHTML = `<p class="muted">Keine Daten.</p>`; return; }
    const W = Math.max(300, Math.round(box.clientWidth || 900)), H = W < 600 ? 220 : 260, m = { t: 12, r: 8, b: 28, l: 36 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const tot = weeksZ.map((w) => w.sec.reduce((a, b) => a + b, 0) / 3600);
    const { max, step } = niceScale(Math.max(...tot) * 1.05);
    const y = (v) => m.t + ih - (v / max) * ih;
    const band = iw / weeksZ.length, bw = Math.min(40, band * 0.62);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Zeit pro Herzfrequenzzone und Woche">`;
    for (let v = 0; v <= max + 1e-9; v += step) s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${nf(v)} h</text>`;
    weeksZ.forEach((w, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      let acc = 0;
      const segs = w.sec.map((sec, z) => ({ z, h: sec / 3600 })).filter((g) => g.h > 0);
      segs.forEach((g, j) => {
        const y0 = y(acc), y1 = y(acc + g.h), gap = j > 0 ? 2 : 0, hgt = Math.max(0, y0 - y1 - gap);
        s += j === segs.length - 1 ? `<path d="${roundedTopRect(x, y1, bw, hgt, 4)}" fill="${ZCOL[g.z]}"/>` : `<rect x="${x}" y="${y1}" width="${bw}" height="${hgt}" fill="${ZCOL[g.z]}"/>`;
        acc += g.h;
      });
      const every = Math.ceil(44 / band);
      if ((weeksZ.length - 1 - i) % every === 0) s += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${fmtDate(parse(w.week), { day: "2-digit", month: "2-digit" })}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
    });
    box.innerHTML = s + "</svg>";
    box.querySelectorAll(".hit").forEach((el) => {
      const w = weeksZ[+el.dataset.i], total = w.sec.reduce((a, b) => a + b, 0);
      const html = `<div class="t-title">Woche ab ${fmtDate(parse(w.week))}</div>` + w.sec.map((sec, z) => tRow(ZCOL[z], `Z${z + 1}`, `${hm(sec)} h · ${total ? Math.round((sec / total) * 100) : 0} %`)).join("") + `<div class="t-row" style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px"><span>Summe</span><span>${hm(total)} h</span></div>`;
      const show = (ev) => { el.setAttribute("fill", "rgba(127,127,127,.08)"); showTip(html, ev); };
      el.addEventListener("mousemove", show); el.addEventListener("click", show);
      el.addEventListener("mouseleave", () => { el.setAttribute("fill", "transparent"); hideTip(); });
    });
  }


  /* ---------- Gym-Tracker (js/gym.js) ---------- */
  const PLACE_COLORS = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)", "var(--cat6)"];
  function gymSection() {
    if (!GYM) { $("#gym").hidden = true; return; }
    const now = new Date(), todayIso = ymdLocal(now), mon = ymdLocal(monday(now));
    const wk = GYM.splitCounts(GYM_SESS, mon, todayIso);
    const tile = (label, value, sub) => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${sub || "&nbsp;"}</div></div>`;
    $("#gymWeek").innerHTML = ["Push", "Pull", "Legs"].map((k) => tile(`${k} diese Woche`, wk[k], k === "Legs" && !wk.Legs ? "noch kein Leg Day" : "")).join("")
      + tile("Gym gesamt diese Woche", `${wk.total} <small>×</small>`, wk.ohne ? `davon ${wk.ohne} ohne erkannten Split` : `seit Montag, ${fmtDate(monday(now), { day: "2-digit", month: "2-digit" })}`);

    // Orte → feste Farben in Reihenfolge des ersten Auftretens, „unbekannt“ grau
    const places = [];
    GYM_SESS.forEach((x) => { const p = x.parsed && x.parsed.entry && x.parsed.place; if (p && !places.includes(p)) places.push(p); });
    const placeColor = (p) => (p === "unbekannt" || !p ? "var(--other)" : PLACE_COLORS[places.indexOf(p) % PLACE_COLORS.length]);

    const lifts = Object.entries(GCFG.mainExercise || GYM.DEFAULTS.mainExercise);
    $("#gymLifts").innerHTML = lifts.map(([split, ex]) => {
      const h = GYM.exerciseHistory(GYM_SESS, ex, GCFG);
      if (!h.length) return `<div class="card"><h3>${esc(ex)} <span class="muted" style="font-weight:400">· ${split}</span></h3><p class="muted" style="margin:0;font-size:14px">Noch keine Einträge. Titel in Garmin Connect z. B. „${split} ${split === "Legs" ? "3x10x180" : split === "Pull" ? "8x90" : "6x100"} @Ort“.</p></div>`;
      const last = h[h.length - 1];
      const scope = (GCFG.perPlace || []).includes(ex) ? h.filter((e) => e.place === last.place) : h;
      const best = scope.reduce((m, e) => (e.e1rm > m.e1rm ? e : m), scope[0]);
      const set = (e) => `${e.sets > 1 ? e.sets + "×" : ""}${e.reps}×${nf(e.weight, e.weight % 1 ? 1 : 0)} kg`;
      const machine = (GCFG.perPlace || []).includes(ex);
      return `<div class="card lift">
        <h3>${esc(ex)} <span class="muted" style="font-weight:400">· ${split}</span>${last.pr ? ` <span class="badge good">PR</span>` : ""}</h3>
        <div class="stats">
          <div class="stat"><small>Letzter Eintrag</small><b>${set(last)}</b><small>${fmtDate(parse(last.date), { day: "2-digit", month: "2-digit" })} · ${esc(last.place)}</small></div>
          <div class="stat"><small>Bester Satz${machine ? ` (${esc(last.place)})` : ""}</small><b>${set(best)}</b><small>${fmtDate(parse(best.date), { day: "2-digit", month: "2-digit" })}</small></div>
          <div class="stat"><small>1RM geschätzt${machine ? ` (${esc(last.place)})` : ""}</small><b>${nf(best.e1rm, 1)} kg</b><small>Epley</small></div>
        </div>
        <div class="chart" data-lift="${esc(ex)}"></div>
        <div class="legend" style="margin-top:4px">${[...new Set(h.map((e) => e.place))].map((p) => `<span><i class="swatch" style="background:${placeColor(p)};border-radius:50%"></i>${esc(p)}</span>`).join("")}${machine ? `<span class="muted">PR nur am selben Ort</span>` : ""}</div>
      </div>`;
    }).join("");
    $("#gymLifts").querySelectorAll("[data-lift]").forEach((box) => liftChart(box, GYM.exerciseHistory(GYM_SESS, box.dataset.lift, GCFG), placeColor));

    // Split-Verteilung der letzten 4 Wochen
    const c4 = GYM.splitCounts(GYM_SESS, ymdLocal(addDays(now, -27)), todayIso);
    const maxN = Math.max(1, c4.Push, c4.Pull, c4.Legs, c4.ohne);
    const avgPP = (c4.Push + c4.Pull) / 2;
    const short = c4.Legs < avgPP * 0.6 && avgPP >= 2;
    $("#gymSplit").innerHTML = `<h3>Split-Verteilung · letzte 4 Wochen${short ? ` <span class="badge warn">Legs kommen zu kurz</span>` : ""}</h3>
      <div class="split-bars">${[["Push", c4.Push], ["Pull", c4.Pull], ["Legs", c4.Legs], ["ohne Split", c4.ohne]].map(([k, v]) => `<div class="split-row"><span>${k}</span><div class="ready-track"><div class="ready-fill" style="width:${(v / maxN) * 100}%;background:${k === "ohne Split" ? "var(--other)" : "var(--recovery)"}"></div></div><b>${v}×</b></div>`).join("")}</div>
      <p class="muted" style="font-size:13px;margin:8px 0 0">${c4.total} Krafteinheiten seit dem ${fmtDate(addDays(now, -27), { day: "2-digit", month: "2-digit" })}${c4.ohne ? ` „ohne Split“: Titel ohne Push/Pull/Legs, z. B. „Gym Bali“.` : ""} Quelle: Garmin-Titel, sonst Strava.</p>`;
  }
  const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function liftChart(box, hist, placeColor) {
    const W = Math.max(280, Math.round(box.clientWidth || 340)), H = 150, m = { t: 10, r: 8, b: 22, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const pts = hist.map((e) => ({ d: parse(e.date), v: e.e1rm, e }));
    let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
    const pad = (hi - lo) * 0.2 || Math.max(2, hi * 0.03); lo -= pad; hi += pad;
    let t0 = pts[0].d.getTime(), t1 = pts[pts.length - 1].d.getTime();
    if (t1 - t0 < 14 * DAY) { t0 -= 7 * DAY; t1 += 7 * DAY; }
    const x = (d) => m.l + ((d.getTime() - t0) / (t1 - t0)) * iw, y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Geschätztes 1RM über die Zeit">`;
    for (let i = 0; i <= 2; i++) { const v = lo + ((hi - lo) / 2) * i; s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${nf(v)}</text>`; }
    const path = (ps) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.d)},${y(p.v)}`).join("");
    if (pts.length && pts.every((p) => p.e.compareKey === "alle")) {
      // Ortsübergreifend verglichen (z. B. Bankdrücken): eine durchgehende Linie in neutraler Farbe
      const ps = pts.slice().sort((a, b) => a.d - b.d);
      if (ps.length > 1) s += `<path d="${path(ps)}" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linejoin="round"/>`;
    } else {
      // Linie je Ort (Maschinen nicht ortsübergreifend verbinden)
      [...new Set(pts.map((p) => p.e.place))].forEach((pl) => {
        const ps = pts.filter((p) => p.e.place === pl);
        if (ps.length > 1) s += `<path d="${path(ps)}" fill="none" stroke="${placeColor(pl)}" stroke-width="2" opacity=".7"/>`;
      });
    }
    pts.forEach((p, i) => {
      s += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="${p.e.pr ? 6 : 4.5}" fill="${placeColor(p.e.place)}" stroke="var(--surface)" stroke-width="2"/>`;
      if (p.e.pr) s += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="9" fill="none" stroke="var(--good)" stroke-width="2"/>`;
      s += `<circle class="hit" data-i="${i}" cx="${x(p.d)}" cy="${y(p.v)}" r="13" fill="transparent"/>`;
    });
    s += `<text x="${m.l}" y="${H - 4}">${fmtDate(new Date(t0), { day: "2-digit", month: "2-digit" })}</text><text x="${W - m.r}" y="${H - 4}" text-anchor="end">${fmtDate(new Date(t1), { day: "2-digit", month: "2-digit" })}</text></svg>`;
    box.innerHTML = s;
    attachPointTips(box, pts, "var(--recovery)", (p) => `<div class="t-title">${fmtDate(p.d, { weekday: "short", day: "2-digit", month: "2-digit" })} · ${esc(p.e.place)}</div>${tRow(placeColor(p.e.place), `${p.e.sets > 1 ? p.e.sets + "×" : ""}${p.e.reps}×${nf(p.e.weight, p.e.weight % 1 ? 1 : 0)} kg`, `1RM ${nf(p.v, 1)} kg`)}${p.e.pr ? `<div style="color:var(--good);font-weight:600">PR</div>` : ""}`);
  }


  /* ---------- Trainingskalender (js/calendar.js) ---------- */
  const WD_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const LV_MIX = [0, 50, 74, 100];
  let calSel = null;
  const calColor = (cat, lv) => `color-mix(in srgb, ${(CATS[cat] || CATS.other).color} ${LV_MIX[lv] || 100}%, var(--surface))`;
  const itemLabel = (it) => (it.cat === "strength" ? `Kraft${it.split ? " · " + it.split : ""}` : SPORT_LABEL[it.sport] || CATS[it.cat].label);
  const durTxt = (sec) => (sec >= 3600 ? `${hm(sec)} h` : `${Math.round(sec / 60)} min`);

  function calendarSection() {
    const box = $("#calendar");
    if (!window.Calendar) { $("#kalender").hidden = true; return; }
    const cal = window.Calendar.buildCalendar({
      acts, today: new Date(), weeks: 10, isFlex: FX ? inFlex : null,
      gymSessions: GYM_VIEW,
    });
    const cell = (d, wi, di) => {
      const label = `${WD_LONG[d.weekday]}, ${fmtDate(parse(d.date), { day: "2-digit", month: "2-digit" })}${d.isToday ? " (heute)" : ""}: `
        + (d.items.length ? d.items.map((it) => `${itemLabel(it)}, ${durTxt(it.sec)}`).join("; ") : d.future ? "noch offen" : "Ruhetag");
      const perCat = {};
      d.items.forEach((it) => { perCat[it.cat] = (perCat[it.cat] || 0) + it.sec; });
      const stripes = d.cats.map((c) => `<i style="flex:${Math.max(perCat[c], 1)};background:${calColor(c, d.level)}"></i>`).join("");
      const cls = ["cal-cell", d.items.length ? "has" : "rest", d.isToday ? "today" : "", d.future ? "future" : "", calSel === d.date ? "sel" : ""].join(" ");
      return `<button type="button" class="${cls}" data-w="${wi}" data-d="${di}" aria-label="${esc(label)}" aria-pressed="${calSel === d.date}">
        ${stripes ? `<span class="cal-stripes">${stripes}</span>` : ""}${d.split ? `<b class="cal-split">${d.split}</b>` : ""}${d.more ? `<b class="cal-more" title="weitere Sportarten">+</b>` : ""}</button>`;
    };
    const detail = (d) => {
      const head = `<b>${WD_LONG[d.weekday]}, ${fmtDate(parse(d.date), { day: "2-digit", month: "2-digit", year: "numeric" })}</b>${d.items.length ? ` · ${durTxt(d.totalSec)} · ${d.items.length} ${d.items.length === 1 ? "Einheit" : "Einheiten"}` : ""}`;
      if (!d.items.length) return `<div class="cal-detail" role="region" aria-live="polite">${head}<p class="muted" style="margin:4px 0 0">${d.future ? "Noch keine Einheiten." : "Ruhetag."}</p></div>`;
      return `<div class="cal-detail" role="region" aria-live="polite">${head}<ul>${d.items.map((it) => {
        const lift = it.cat === "strength" && it.exercise
          ? ` · ${esc(it.exercise)}${it.entry ? ` ${it.entry.sets > 1 ? it.entry.sets + "×" : ""}${it.entry.reps}×${nf(it.entry.weight, it.entry.weight % 1 ? 1 : 0)} kg${it.entry.place ? " @" + esc(it.entry.place) : ""}` : ""}` : "";
        return `<li><i class="swatch" style="background:${(CATS[it.cat] || CATS.other).color}"></i><span><b>${esc(itemLabel(it))}</b> · ${esc(it.name || "")}${lift}</span><span class="muted">${durTxt(it.sec)}</span></li>`;
      }).join("")}</ul></div>`;
    };
    const head = `<div class="cal-row cal-head" aria-hidden="true"><span></span>${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((x) => `<span>${x}</span>`).join("")}<span></span></div>`;
    const rows = cal.weeks.map((w, wi) => {
      const selDay = w.days.find((d) => d.date === calSel);
      return `<div class="cal-row${w.flex ? " flex" : ""}">
        <div class="cal-label">${fmtDate(parse(w.monday), { day: "2-digit", month: "2-digit" })}${w.flex ? ` <span class="cal-flex">Flex</span>` : ""}</div>
        ${w.days.map((d, di) => cell(d, wi, di)).join("")}
        <div class="cal-sum">${w.count ? `${nf(w.totalSec / 3600, 1)} h · ${w.count}×` : "–"}</div>
      </div>${selDay ? detail(selDay) : ""}`;
    }).join("");
    box.innerHTML = head + rows;
    box.querySelectorAll(".cal-cell").forEach((b) => b.addEventListener("click", () => {
      const d = cal.weeks[+b.dataset.w].days[+b.dataset.d];
      calSel = calSel === d.date ? null : d.date;
      calendarSection();
      const again = box.querySelector(`.cal-cell[data-w="${b.dataset.w}"][data-d="${b.dataset.d}"]`);
      if (again) again.focus({ preventScroll: true });
    }));
    $("#calLegend").innerHTML = ["swim", "bike", "run", "strength", "other"].map((c) => `<span><i class="swatch" style="background:${CATS[c].color}"></i>${c === "other" ? "Sonstiges (Klettern, Wandern …)" : CATS[c].label}</span>`).join("")
      + `<span class="cal-lv"><i style="background:${calColor("other", 1)}"></i><i style="background:${calColor("other", 2)}"></i><i style="background:${calColor("other", 3)}"></i> &lt; 45 · 45–90 · &gt; 90 min</span><span><b>Pu</b> Push · <b>Pl</b> Pull · <b>L</b> Legs</span>`;
  }

  /* ---------- Insights ---------- */
  function insights() {
    const swims = ofCat(acts, "swim").filter((a) => a.km >= 0.9);
    const paces = swims.map((a) => a.sec / (a.km * 10));
    const avgSwim = sum(swims, (a) => a.km) / swims.length;
    const longestBike = Math.max(...ofCat(acts, "bike").map((a) => a.km));
    const longestRun = Math.max(...acts.filter((a) => a.sport === "Run").map((a) => a.km));
    const trail = acts.filter((a) => a.sport === "TrailRun").sort((a, b) => b.km - a.km)[0];
    const firstSwim = ofCat(acts, "swim").reduce((m, a) => (a.date < m ? a.date : m), snapEnd);
    const passes = ofCat(acts, "bike").filter((a) => a.elev >= 1000).length;
    const str = ofCat(acts, "strength").length;
    const last3 = inRange(addDays(snapEnd, -21), snapEnd);
    const tri3 = sum(last3.filter((a) => ["swim", "bike", "run"].includes(a.cat)), (a) => a.sec) / 3600 / 3;
    const items = [
      ["warn", "Baustelle", "Schwimmen ist der größte Hebel", `Erste Schwimmeinheit erst am ${fmtDate(firstSwim, { day: "2-digit", month: "2-digit" })} – seitdem Ø ${nf(avgSwim, 1)} km pro Einheit, Pace schwankt zwischen ${mmss(Math.min(...paces))} und ${mmss(Math.max(...paces))} /100m. Für 3,8 km im Rennen: regelmäßig 3× pro Woche, Technik vor Umfang, Einheiten schrittweise Richtung 3 km.`],
      ["good", "Stärke", "Rad-Basis ist da", `Längste Fahrt seit der Anmeldung: ${nf(longestBike, 1)} km – bereits über Renndistanz, dazu ${passes} Ausfahrten mit über 1.000 Hm. FTP ${D.zones.ftp} W (${nf(D.zones.ftp / D.athlete.weightKg, 2)} W/kg). Für dein Ziel „schneller am Berg“: Sweet-Spot- und Bergintervalle im Winter auf Zwift.`],
      ["good", "Im Plan", "Laufen solide", `Längster Straßenlauf ${nf(longestRun, 1)} km${trail ? `, Trail ${nf(trail.km, 1)} km mit ${nf(trail.elev)} Hm` : ""}. Lockere Läufe meist um 5:30–6:00 /km (Zone 2 laut Strava: ${mmss(runPaceZ2[0])}–${mmss(runPaceZ2[1])} /km). Langen Lauf bis zum Frühjahr langsam auf 20–24 km steigern.`],
      ["good", "Stärke", "Krafttraining konsequent", `${str} Krafteinheiten in ${weeks.length} Wochen (Ø ${nf(str / weeks.length, 1)}/Woche). Ideal für Grundlage 1 – ab Februar auf 1–2 Erhaltungseinheiten reduzieren.`],
      FLEX.active
        ? ["neutral", "Flex", FLEX.label, `Bis ${fmtDate(FLEX.until, { day: "2-digit", month: "2-digit" })} zählt das Wochen-Minimum statt eines Umfangsziels: Schwerpunkt Gym, Ausdauer zur Erhaltung. In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche.`]
        : [tri3 < 5 ? "warn" : "good", tri3 < 5 ? "Achtung" : "Gut", "Reise-Wochen", `In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche (Klettern, Reisen). Kein Problem in der Grundlage – danach wieder Richtung 8–11 h aufbauen.`],
      ["good", "Fokus", "Zone 2 verbessern", `Herzfrequenz-Zone 2: ${D.zones.hr[1][0]}–${D.zones.hr[1][1]} bpm. Die Entwicklung wird aus deinen Läufen und Fahrten berechnet …`, "z2Insight"],
    ];
    $("#insights").innerHTML = items.map(([cls, badge, title, text, id]) => `<div class="card insight"${id ? ` id="${id}"` : ""}><span class="badge ${cls}">${badge}</span><div><b>${title}</b><p>${text}</p></div></div>`).join("");
  }

  /* ---------- Aktivitäten ---------- */
  let filter = "all", showAll = false;
  const ACT_LIMIT = 10;
  function activities() {
    const filters = [["all", "Alle"], ["swim", "Schwimmen"], ["bike", "Rad"], ["run", "Laufen"], ["strength", "Kraft"], ["other", "Sonstiges"]];
    $("#actFilter").innerHTML = filters.map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("");
    $("#actFilter").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; showAll = false; activities(); }));
    const list = filter === "all" ? acts : acts.filter((a) => a.cat === filter);
    $("#actSub").textContent = `Alle ${acts.length} Aktivitäten seit ${fmtDate(acts[acts.length - 1].date)}.`;
    $("#actCount").textContent = list.length > ACT_LIMIT && !showAll ? `${ACT_LIMIT} von ${list.length}` : `${list.length} Einträge`;
    $("#actTable").innerHTML = `<thead><tr><th>Datum</th><th>Sport</th><th>Name</th><th class="num">Distanz</th><th class="num">Zeit</th><th class="num">Hm</th><th class="num">Pace / Tempo</th></tr></thead><tbody>` +
      list.slice(0, showAll ? list.length : ACT_LIMIT).map((a) => `<tr><td>${fmtDate(a.date, { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
        <td><i class="swatch" style="background:${CATS[a.cat].color}"></i> ${SPORT_LABEL[a.sport] || a.sport}</td>
        <td>${esc(a.name)}</td>
        <td class="num">${a.km ? (a.cat === "swim" ? nf(a.km * 1000) + " m" : nf(a.km, 1) + " km") : "–"}</td>
        <td class="num">${hm(a.sec)}</td><td class="num">${a.elev || "–"}</td><td class="num">${esc(a.info) || "–"}</td></tr>`).join("") + `</tbody>`;
    const more = $("#actMore");
    more.hidden = list.length <= ACT_LIMIT;
    more.textContent = showAll ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`;
    more.setAttribute("aria-expanded", String(showAll));
  }


  /* ---------- Garmin: Erholung & Form ---------- */
  const G = window.GARMIN || { days: [] };
  const gDays = (G.days || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const gLast = (key) => { for (let i = gDays.length - 1; i >= 0; i--) if (gDays[i][key] != null) return gDays[i]; return null; };
  const gAvg = (key, n, skipLast = false) => {
    const vals = gDays.slice(skipLast ? -n - 1 : -n, skipLast ? -1 : undefined).map((d) => d[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const latestWeight = gLast("weight");
  if (latestWeight) D.athlete.weightKg = latestWeight.weight;

  const STATUS_DE = { PRODUCTIVE: "Produktiv", MAINTAINING: "Erhaltend", RECOVERY: "Erholung", UNPRODUCTIVE: "Unproduktiv", DETRAINING: "Leistungsabbau", OVERREACHING: "Überlastung", PEAKING: "Höchstform", STRAINED: "Strapaziert", NO_STATUS: "Kein Status" };
  const statusDe = (s) => { if (!s) return null; const k = String(s).replace(/_\d+$/, ""); return STATUS_DE[k] || k; };
  const HRV_DE = { BALANCED: "Ausgeglichen", UNBALANCED: "Unausgeglichen", LOW: "Niedrig", POOR: "Schlecht" };

  function readiness() {
    const today = gDays[gDays.length - 1];
    if (!today) return null;
    const f = [];
    const add = (label, value, state, score) => f.push({ label, value, state, score });
    if (today.sleepScore != null) {
      const v = today.sleepScore;
      add("Sleep Score", `${v}${today.sleepH ? ` · ${nf(today.sleepH, 1)} h` : ""}`, v >= 80 ? "good" : v >= 60 ? "ok" : "bad", v);
    }
    if (today.hrv != null || today.hrvStatus) {
      const st = today.hrvStatus;
      let score = st === "BALANCED" ? 85 : st === "UNBALANCED" ? 55 : st ? 30 : null;
      if (score == null && today.hrvWeekly) { const r = today.hrv / today.hrvWeekly; score = Math.max(0, Math.min(100, (r - 0.7) / 0.3 * 100)); }
      add("HRV", `${today.hrv ?? "–"} ms${st ? " · " + (HRV_DE[st] || st) : ""}`, score >= 70 ? "good" : score >= 45 ? "ok" : "bad", score);
    }
    const bb = today.bbHigh ?? today.bbNow;
    if (bb != null) add("Body Battery", `${bb}${today.bbNow != null && today.bbHigh != null ? ` (jetzt ${today.bbNow})` : ""}`, bb >= 70 ? "good" : bb >= 40 ? "ok" : "bad", bb);
    if (today.rhr != null) {
      const base = gAvg("rhr", 7, true);
      const diff = base != null ? today.rhr - base : 0;
      add("Ruhepuls", `${today.rhr} bpm${base != null ? ` (Ø ${nf(base)})` : ""}`, diff <= 2 ? "good" : diff <= 5 ? "ok" : "bad", diff <= 2 ? 90 : diff <= 5 ? 60 : 30);
    }
    const prev = gDays[gDays.length - 2];
    const stress = today.stressAvg ?? prev?.stressAvg;
    if (stress != null) add("Stress Ø", `${stress}`, stress <= 30 ? "good" : stress <= 50 ? "ok" : "bad", 100 - stress);
    const scores = f.map((x) => x.score).filter((v) => v != null);
    let R = today.readiness ?? (scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);
    if (R == null) return null;
    let level = R >= 70 ? 0 : R >= 50 ? 1 : R >= 33 ? 2 : 3;
    const notes = [];
    if (today.sleepScore != null && today.sleepScore < 50 && level < 2) { level = 2; notes.push("sehr schlechter Schlaf"); }
    const ratio = today.loadRatio ?? gLast("loadRatio")?.loadRatio;
    if (ratio != null && ratio > 1.5 && level < 3) { level++; notes.push(`Belastung stark gestiegen (Verhältnis ${nf(ratio, 2)})`); }
    return { R, level, factors: f, notes, source: today.readiness != null ? "Garmin Trainingsbereitschaft" : "aus Schlaf, HRV, Body Battery, Ruhepuls & Stress berechnet", date: parse(today.date) };
  }

  /* ---------- Tagesvorschlag ---------- */
  const PHASE_SCALE = { "Einstieg": 0.9, "Grundlage 1": 1, "Grundlage 2": 1.15, "Aufbau 1": 1.3, "Aufbau 2": 1.5, "Peak": 1.6, "Taper": 0.6 };
  // Wochenvorlage (Mo–So). hard = intensive Einheit, easy = locker, rest = Ruhetag
  const WEEK = [
    { sport: "strength", title: "Kraft & Mobility", min: 50, type: "easy", detail: "Beine & Rumpf, danach 15 min Dehnen. Kein Ausdauertraining." },
    { sport: "bike", title: "Rad-Intervalle", min: 75, type: "hard", detail: "15 min einfahren, 3 × 12 min Sweet Spot (88–93 % FTP ≈ {ss} W), 5 min Pause, ausfahren." },
    { sport: "swim", title: "Schwimmen Technik + lockerer Lauf", min: 85, type: "easy", detail: "45 min Schwimmen: Drills (Abschlag, Catch-up), 8 × 50 m sauber. Danach 40 min Lauf in Zone 2 ({z2})." },
    { sport: "bike", title: "Rad Grundlage", min: 90, type: "easy", detail: "Ruhig in Zone 2 ({p2} W), Trittfrequenz 85–95. Optional 30 min Kraft." },
    { sport: "swim", title: "Schwimmen Ausdauer", min: 50, type: "hard", detail: "Einschwimmen 300 m, 6 × 200 m zügig (20 s Pause), 200 m locker." },
    { sport: "bike", title: "Lange Ausfahrt", min: 150, type: "easy", detail: "Zone 2 ({p2} W), gern hügelig – Ziel „schneller am Berg“: Anstiege gleichmäßig in Zone 3. Verpflegung üben." },
    { sport: "run", title: "Langer Lauf", min: 75, type: "easy", detail: "Gleichmäßig in Zone 2 ({z2}), letzte 10 min etwas zügiger." },
  ];
  const fillDetail = (t) => t
    .replace("{ss}", `${Math.round(D.zones.ftp * 0.88)}–${Math.round(D.zones.ftp * 0.93)}`)
    .replace("{p2}", `${D.zones.power[1][0]}–${D.zones.power[1][1]}`)
    .replace("{z2}", `${mmss(1000 / D.zones.run[1][1])}–${mmss(1000 / D.zones.run[1][0])} /km`);
  const roundMin = (m) => Math.max(20, Math.round(m / 5) * 5);
  const fmtMin = (m) => (m >= 90 ? `${hm(m * 60)} h` : `${m} min`);

  function suggestion(now, rd) {
    const phase = currentPhase(now);
    const scale = PHASE_SCALE[phase?.short] ?? 1;
    const base = WEEK[(now.getDay() + 6) % 7];
    let s = { ...base, min: roundMin(base.min * (base.sport === "strength" ? 1 : scale)), detail: fillDetail(base.detail), changed: null };
    const level = rd ? rd.level : 0;
    if (level === 1 && s.type === "hard") {
      s = { ...s, title: s.title.replace("Intervalle", "locker").replace("Ausdauer", "locker"), type: "easy", min: roundMin(s.min * 0.8),
        detail: s.sport === "swim" ? "Lockeres Schwimmen mit Technikfokus, keine harten Serien." : `Gleiche Sportart, aber nur Zone 2 (${D.zones.power[1][0]}–${D.zones.power[1][1]} W) statt Intervallen.`,
        changed: "Intensität raus, etwas kürzer" };
    } else if (level === 1) {
      s = { ...s, min: roundMin(s.min * 0.85), changed: "etwas kürzer" };
    } else if (level === 2) {
      s = { sport: s.sport === "run" ? "bike" : s.sport === "strength" ? "other" : s.sport, title: s.sport === "swim" ? "Lockeres Techniktraining" : s.sport === "strength" ? "Mobility statt Kraft" : "Lockere Regenerationseinheit",
        min: s.sport === "strength" ? 25 : 40, type: "easy",
        detail: s.sport === "swim" ? "30–40 min ruhig, nur Technik und Wasserlage." : s.sport === "strength" ? "20–25 min Dehnen, Faszienrolle, ruhige Atmung." : `40 min ganz locker in Zone 1 (unter ${D.zones.hr[1][0]} bpm), lieber Rad als Laufen.`,
        changed: "deutlich entschärft" };
    } else if (level === 3) {
      s = { sport: "other", title: "Ruhetag", min: 20, type: "rest", detail: "Kein Training. Spaziergang, 20 min Mobility, früh schlafen, viel trinken.", changed: "Erholung hat Vorrang" };
    }
    s.phase = phase;
    return s;
  }

  const LEVELS = [
    { label: "Bereit", cls: "good", text: "Plan wie vorgesehen." },
    { label: "Moderat", cls: "warn", text: "Intensität reduzieren." },
    { label: "Eingeschränkt", cls: "warn", text: "Nur locker trainieren." },
    { label: "Erholung", cls: "bad", text: "Heute regenerieren." },
  ];
  // Im Flex-Zeitraum gibt es keinen Plan – Texte passend zum Tagesvorschlag
  const FLEX_LEVEL_TEXT = ["Bereit fürs Training.", "Training ok – Ausdauer kürzer und locker.", "Nur leicht trainieren: Technik statt Limit.", "Heute regenerieren."];

  /* ---------- Flex: Ausstattung & Tagesvorschlag ---------- */
  const EQ_KEY = "ironman.flexEquipment";
  function loadEquipment() {
    try { const v = JSON.parse(localStorage.getItem(EQ_KEY) || "null"); if (Array.isArray(v) && v.length) return v; } catch (e) { /* ignore */ }
    return (FCFG.defaultEquipment || ["gym", "treadmill", "runOutside"]).slice();
  }
  function saveEquipment(list) { try { localStorage.setItem(EQ_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }
  // Grobe Pace aus den letzten gewerteten Zone-2-Läufen (data/z2-metrics.json), falls geladen
  function paceHint() {
    if (!Z2DATA) return null;
    const vals = Z2DATA.activities.filter((r) => r.pace).slice(-5).map((r) => r.pace.sec).sort((a, b) => a - b);
    if (!vals.length) return null;
    const med = vals[Math.floor(vals.length / 2)];
    return `ca. ${mmss(med - 10)}–${mmss(med + 20)} /km`;
  }

  const standLine = `<p class="muted" style="font-size:12px;margin:6px 0 0">Strava-Stand ${fmtDate(snap, { day: "2-digit", month: "2-digit" })} – neue Einheiten kommen mit dem nächsten Update (mittags und abends).</p>`;

  function flexPlan(now, rd) {
    const eq = loadEquipment();
    const sg = FX.suggestFlex({ now, acts: flexActs, equipment: eq, level: rd ? rd.level : 0, cfg: FCFG, zones: D.zones.hr, paceHint: paceHint() });
    const chips = Object.entries(FX.EQUIPMENT).map(([k, label]) => `<button class="chip" type="button" data-eq="${k}" aria-pressed="${eq.includes(k)}">${label}</button>`).join("");
    const e = sg.endurance;
    return `
      <div class="card today-plan">
        <div class="mini-title" style="margin-top:0">Vorschlag für ${fmtDate(now, { weekday: "long", day: "numeric", month: "long" })} · Flex</div>
        <div class="equip" role="group" aria-label="Ausstattung vor Ort">${chips}</div>
        <div class="flex-sug">
          <div><span class="mini-title" style="margin:0">Gym</span>
            <h3 style="font-size:20px;margin:2px 0"><i class="swatch" style="background:var(--strength)"></i>${esc(sg.gym.title)}</h3>
            <p class="muted" style="margin:0;font-size:14px">${esc(sg.gym.detail)}</p></div>
          <div><span class="mini-title" style="margin:0">Ausdauer${e && e.done ? "" : " · optional"}${e && e.forMinimum ? " · fürs Wochen-Minimum" : ""}</span>
            ${e ? `<h3 style="font-size:17px;margin:2px 0"><i class="swatch" style="background:${CATS[e.type === "swim" ? "swim" : e.type === "bike" ? "bike" : "run"].color}"></i>${esc(e.title)} · ${e.minutes} min</h3>
            <p class="muted" style="margin:0;font-size:14px">${esc(e.detail)}</p>` : `<p class="muted" style="margin:2px 0 0;font-size:14px">${rd && rd.level >= 3 ? "Heute keine Ausdauer." : "Keine passende Ausstattung gewählt."}</p>`}</div>
        </div>
        ${sg.notes.length ? `<p class="muted" style="font-size:13px;margin:10px 0 0">${sg.notes.map(esc).join(" · ")}</p>` : ""}
        <div class="mini-title">Wochen-Minimum</div>
        ${minList(sg.week)}
        <div id="sinceBox"></div>
        ${standLine}
      </div>`;
  }

  function today() {
    const now = new Date();
    const rd = readiness();
    const s = suggestion(now, rd);
    const done = acts.filter((a) => a.date.toDateString() === now.toDateString());
    const color = CATS[s.sport]?.color || "var(--other)";
    const lv = rd ? LEVELS[rd.level] : null;
    const isOld = rd && (now - rd.date) / DAY > 1.5;
    const planHtml = FLEX.active ? flexPlan(now, rd) : null;
    const sub = document.querySelector("#heute .section-sub");
    if (sub && FLEX.active) sub.textContent = "Flex-Phase: nächster Gym-Split und optionale lockere Ausdauer – passend zu dem, was du vor Ort hast.";
    const planCard = planHtml || `
      <div class="card today-plan">
        <div class="mini-title" style="margin-top:0">Vorschlag für ${fmtDate(now, { weekday: "long", day: "numeric", month: "long" })}</div>
        <h3 style="font-size:20px;margin:4px 0 2px"><i class="swatch" style="background:${color}"></i>${esc(s.title)}</h3>
        <div class="muted" style="font-size:14px;margin-bottom:10px">${s.type === "rest" ? "Ruhetag" : fmtMin(s.min)} · ${s.type === "hard" ? "intensiv" : s.type === "rest" ? "Erholung" : "locker"}${s.phase ? ` · Phase ${esc(s.phase.short)}` : ""}${s.changed ? ` · <b>angepasst: ${esc(s.changed)}</b>` : ""}</div>
        <p style="margin:0">${esc(s.detail)}</p>
        ${done.length ? `<div class="mini-title">Heute schon erledigt</div><ul class="done-list">${done.map((a) => `<li><i class="swatch" style="background:${CATS[a.cat].color}"></i>${esc(a.name)} · ${hm(a.sec)} h</li>`).join("")}</ul>` : ""}
        <div id="sinceBox"></div>
        ${standLine}
      </div>`;
    $("#today").innerHTML = `<div class="today-main">${planCard}<div class="card week-card" id="weekCard" aria-live="polite"></div></div>` + `
      <div class="card today-form">
        <div class="mini-title" style="margin-top:0">Form heute</div>
        ${rd ? `
          <div class="form-score"><b>${rd.R}</b><span class="badge ${lv.cls}">${lv.label}</span></div>
          <div class="muted" style="font-size:13px;margin:2px 0 10px">${FLEX.active ? FLEX_LEVEL_TEXT[rd.level] : lv.text}${rd.notes.length ? " Grund: " + esc(rd.notes.join(", ")) + "." : ""}</div>
          <ul class="factor-list">${rd.factors.map((x) => `<li><span class="dot ${x.state}" aria-hidden="true"></span><span>${x.label}</span><b>${esc(x.value)}</b><span class="sr-only">${x.state === "good" ? "gut" : x.state === "ok" ? "mittel" : "schlecht"}</span></li>`).join("")}</ul>
          <div class="muted" style="font-size:12px;margin-top:8px">${esc(rd.source)} · Garmin-Daten vom ${fmtDate(rd.date, { day: "2-digit", month: "2-digit" })}${isOld ? " – <b>nicht von heute</b>" : ""}</div>`
        : `<p class="muted" style="margin:0">Noch keine Garmin-Daten. Sobald Garmin verbunden ist, passt sich der Vorschlag täglich an Schlaf, HRV, Body Battery &amp; Co. an.</p>`}
      </div>`;
    $("#today").querySelectorAll("[data-eq]").forEach((b) => b.addEventListener("click", () => {
      const cur = loadEquipment(), k = b.dataset.eq;
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : cur.concat(k);
      saveEquipment(next.length ? next : cur); today();
    }));
    renderSince(now);
    renderWeek(now);
  }

  /* ---------- Wochenzusammenfassung (js/weekly.js) – feste Regeln, keine KI ---------- */
  const WK = window.Weekly, WCFG = window.TRAINING.weekly || {};
  let wkOffset = null;   // 0 = laufende Woche, 1 = Vorwoche …
  const TREND = { up: ["↑", "höher als in der Vorwoche"], down: ["↓", "niedriger als in der Vorwoche"], flat: ["→", "etwa wie in der Vorwoche"] };
  const REC_FMT = { sleepH: (v) => `${hm(v * 3600)} h`, sleepScore: (v) => nf(v), hrv: (v) => `${nf(v)} ms`, rhr: (v) => `${nf(v)} bpm` };
  function renderWeek(now) {
    const box = $("#weekCard");
    if (!box) return;
    if (!WK) { box.hidden = true; return; }
    const thisMon = monday(now), maxBack = (WCFG.weeksBack || 8) - 1;
    if (wkOffset == null) wkOffset = Math.round((thisMon - WK.defaultWeekStart(now)) / (7 * DAY));
    const s = WK.weeklySummary({
      acts, gymSessions: GYM_VIEW, garminDays: gDays, today: now, weekStart: addDays(thisMon, -7 * wkOffset),
      cfg: { weekly: WCFG, flex: FCFG, gym: GCFG, sinceLast: window.TRAINING.sinceLast || {} },
      equipment: FLEX.active ? loadEquipment() : null,
    });
    const dm = (iso) => fmtDate(parse(iso), { day: "2-digit", month: "2-digit" });
    const sp = s.gym.splits;
    const splitTxt = ["Push", "Pull", "Legs"].filter((k) => sp[k]).map((k) => `${sp[k]} ${k}`).concat(sp.ohne ? [`${sp.ohne} ohne Split`] : []).join(", ");
    const sport = (x) => `<span class="wk-sport"><i class="swatch" style="background:${CATS[x.cat].color}"></i>${CATS[x.cat].label} ${x.count}× · ${durTxt(x.sec)}</span>`;
    const endu = s.sports.filter((x) => x.cat !== "other"), other = s.sports.find((x) => x.cat === "other");
    const pct = s.totalDiffPct;
    const rows = [
      ["Gym", s.gym.count ? `${s.gym.count}× Gym${splitTxt ? ` · ${splitTxt}` : ""}${s.gym.lifts.length ? `<div class="muted wk-sub">${s.gym.lifts.map((l) => esc(l.text)).join(" · ")}</div>` : ""}` : `<span class="muted">kein Gym</span>`],
      ["Ausdauer", (endu.length ? endu.map(sport).join("") : `<span class="muted">keine</span>`) + (other ? sport(other) : "")],
      ["Gesamt", `${nf(s.totalSec / 3600, 1)} h · ${s.count} ${s.count === 1 ? "Einheit" : "Einheiten"}${s.avg4Sec ? ` <span class="muted">· Ø der 4 Wochen davor ${nf(s.avg4Sec / 3600, 1)} h (${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} %)</span>` : ""}`],
    ];
    if (s.minimum) rows.push(["Minimum", s.minimum.ok ? `<span class="wk-ok">✓ erfüllt</span>` : `${s.running ? "fehlt noch" : "gefehlt"}: ${s.minimum.missing.map(esc).join(", ")}`]);
    box.innerHTML = `
      <div class="week-head">
        <div class="mini-title" style="margin:0">Woche</div>
        <div class="week-nav">
          <button type="button" class="chip" data-wk="1" aria-label="Ältere Woche"${wkOffset >= maxBack ? " disabled" : ""}>←</button>
          <span class="week-range">${dm(s.monday)} – ${dm(s.sunday)}</span>
          <button type="button" class="chip" data-wk="-1" aria-label="Neuere Woche"${wkOffset <= 0 ? " disabled" : ""}>→</button>
        </div>
      </div>
      ${s.running ? `<div class="wk-running"><span class="badge neutral">läuft noch</span></div>` : ""}
      ${s.highlight ? `<p class="wk-hl"><span aria-hidden="true">★</span><span>${esc(s.highlight.text)}</span></p>` : `<p class="muted" style="margin:10px 0 0">Keine Einheiten in dieser Woche.</p>`}
      ${s.empty ? "" : `<div class="mini-title">Training</div><dl class="wk-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`}
      ${s.recovery ? `<div class="mini-title">Erholung · Garmin, Ø der Woche</div>
        <div class="wk-rec">${s.recovery.map((r) => `<div><span>${r.label}</span><b>${r.value == null ? "–" : REC_FMT[r.key](r.value)}</b>${r.trend ? ` <em class="wk-trend" title="${TREND[r.trend][1]}">${TREND[r.trend][0]}</em><span class="sr-only">${TREND[r.trend][1]}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${s.hints.length ? `<div class="mini-title">Hinweise</div><ul class="wk-hints">${s.hints.map((h) => `<li>${esc(h.text)}</li>`).join("")}</ul>` : ""}`;
    box.querySelectorAll("[data-wk]").forEach((b) => b.addEventListener("click", () => {
      wkOffset = Math.min(maxBack, Math.max(0, wkOffset + Number(b.dataset.wk)));
      renderWeek(now);
      const again = box.querySelector(`[data-wk="${b.dataset.wk}"]`);
      if (again && !again.disabled) again.focus({ preventScroll: true });
    }));
  }

  /* ---------- Zuletzt gemacht (Flex.sinceLast) ---------- */
  let sinceSel = null;
  const SINCE_DOT = { good: "good", warn: "ok", bad: "bad", na: "na", info: "na" };
  const SINCE_STATE = { good: "im grünen Bereich", warn: "bald wieder dran", bad: "lange her", na: "nicht verfügbar", info: "nur Info im Flex-Zeitraum" };
  function renderSince(now) {
    const box = $("#sinceBox");
    if (!box || !FX || !FX.sinceLast) return;
    const items = FX.sinceLast({
      now, acts: flexActs, cfg: window.TRAINING.sinceLast || {}, splitCfg: FCFG,
      flexActive: FLEX.active, equipment: FLEX.active ? loadEquipment() : null,
    });
    const sel = items.find((x) => x.key === sinceSel);
    const detail = (x) => {
      if (!x.last) return `<b>${esc(x.label)}</b> · seit der Anmeldung (${fmtDate(commit, { day: "2-digit", month: "2-digit", year: "numeric" })}) noch keine Einheit${x.minMinutes ? ` ab ${fmtMin(x.minMinutes)}` : ""}.`;
      const a = x.last;
      return `<b>${esc(x.label)}</b> · zuletzt ${fmtDate(a.date, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}: ${esc(a.title || a.name || "")}${a.sec ? ` · ${a.sec >= 3600 ? hm(a.sec) + " h" : Math.round(a.sec / 60) + " min"}` : ""}${x.minMinutes ? ` <span class="muted">(zählt ab ${fmtMin(x.minMinutes)})</span>` : ""}`;
    };
    box.innerHTML = `
      <div class="mini-title">Zuletzt gemacht</div>
      <div class="since-grid">${items.map((x) => `
        <button type="button" class="since-tile ${x.state}" data-since="${x.key}" aria-expanded="${sinceSel === x.key}"
          aria-label="${esc(`${x.label}: ${x.text} – ${SINCE_STATE[x.state]}`)}">
          <span class="since-label"><span class="dot ${SINCE_DOT[x.state]}" aria-hidden="true"></span>${esc(x.label)}</span>
          <b>${esc(x.text)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ""}
        </button>`).join("")}
      </div>
      ${sel ? `<p class="since-detail" aria-live="polite">${detail(sel)}</p>` : ""}`;
    box.querySelectorAll("[data-since]").forEach((b) => b.addEventListener("click", () => {
      sinceSel = sinceSel === b.dataset.since ? null : b.dataset.since;
      renderSince(now);
      const again = box.querySelector(`[data-since="${b.dataset.since}"]`);
      if (again) again.focus({ preventScroll: true });
    }));
  }

  function recovery() {
    const el = $("#recovery");
    if (!gDays.length) { $("#recoverySection").hidden = true; return; }
    const last = (k) => gLast(k)?.[k];
    const avg7 = (k) => gAvg(k, 7);
    const tile = (label, value, sub) => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${sub || "&nbsp;"}</div></div>`;
    const v = (x, d = 0, unit = "") => (x == null ? "–" : `${nf(x, d)}${unit ? ` <small>${unit}</small>` : ""}`);
    const a = (k, d = 0, unit = "") => (avg7(k) == null ? "" : `Ø 7 Tage: ${nf(avg7(k), d)}${unit}`);
    const st = gLast("trainingStatus");
    const tiles = [
      tile("Sleep Score", v(last("sleepScore")), a("sleepScore")),
      tile("Schlafdauer", v(last("sleepH"), 1, "h"), a("sleepH", 1, " h")),
      tile("HRV (Nacht)", v(last("hrv"), 0, "ms"), gLast("hrvStatus") ? `Status: ${HRV_DE[last("hrvStatus")] || last("hrvStatus")}` : a("hrv", 0, " ms")),
      tile("Ruhepuls", v(last("rhr"), 0, "bpm"), a("rhr", 0, " bpm")),
      tile("Body Battery", v(last("bbHigh"), 0, "max"), last("bbNow") != null ? `aktuell ${last("bbNow")}` : ""),
      tile("Stress Ø", v(last("stressAvg")), a("stressAvg")),
      tile("Trainingsbereitschaft", v(last("readiness")), last("recoveryH") != null ? `Erholungszeit ${nf(last("recoveryH"))} h` : ""),
      tile("Trainingsstatus", st ? esc(statusDe(st.trainingStatus)) : "–", last("acuteLoad") != null ? `Belastung akut ${nf(last("acuteLoad"))} / chronisch ${nf(last("chronicLoad") || 0)}` : ""),
      tile("VO2max Laufen", v(last("vo2run"), 1), ""),
      tile("VO2max Rad", v(last("vo2bike"), 1), ""),
      tile("Gewicht", v(last("weight"), 1, "kg"), last("bodyFat") != null ? `Körperfett ${nf(last("bodyFat"), 1)} %` : ""),
      tile("Schritte", v(last("steps")), a("steps")),
    ];
    const charts = [
      ["sleepScore", "Sleep Score", (x) => nf(x)],
      ["hrv", "HRV (ms)", (x) => nf(x)],
      ["rhr", "Ruhepuls (bpm)", (x) => nf(x)],
      ["bbHigh", "Body Battery (Tageshoch)", (x) => nf(x)],
      ["vo2run", "VO2max Laufen", (x) => nf(x, 1)],
      ["weight", "Gewicht (kg)", (x) => nf(x, 1)],
    ].map(([k, label, fmt]) => ({ k, label, fmt, pts: gDays.slice(-60).filter((d) => d[k] != null).map((d) => ({ d: parse(d.date), v: d[k], raw: d })) }))
      .filter((c) => c.pts.length >= 2);
    el.innerHTML = `<div class="grid g4">${tiles.join("")}</div>` +
      (charts.length ? `<div class="grid g3" style="margin-top:12px">${charts.map((c, i) => `<div class="card"><h3>${c.label}</h3><div class="chart" id="gchart${i}"></div></div>`).join("")}</div>` : "");
    charts.forEach((c, i) => {
      const box = $(`#gchart${i}`);
      box.innerHTML = paceChart(c.pts, { fmt: c.fmt, color: "var(--recovery)", invert: false, unitLabel: c.label });
      attachPointTips(box, c.pts, "var(--recovery)", (p) => `<div class="t-title">${fmtDate(p.d, { weekday: "short", day: "2-digit", month: "2-digit" })}</div>${tRow("var(--recovery)", c.label, c.fmt(p.v))}`);
    });
    $("#recoverySub").textContent = `Garmin-Daten, zuletzt aktualisiert ${G.updated ? new Date(G.updated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " Uhr" : "–"}. Verläufe: letzte 60 Tage.`;
  }

  /* ---------- Init ---------- */
  $("#actMore").addEventListener("click", () => {
    showAll = !showAll; activities();
    if (!showAll) $("#aktivitaeten").scrollIntoView({ block: "start" });   // beim Zuklappen nicht im Leeren landen
  });
  // Im Flex-Zeitraum steht „Gym“ direkt nach „Heute“ (auch in der Navigation)
  if (FLEX.active) {
    $("#heute").after($("#gym"));
    $("#gym").after($("#kalender"));
    const link = document.querySelector('.nav a[href="#gym"]'), heuteLink = document.querySelector('.nav a[href="#heute"]');
    const calLink = document.querySelector('.nav a[href="#kalender"]');
    if (link && heuteLink) heuteLink.after(link);
    if (calLink && link) link.after(calLink);
  }
  today(); recovery(); gymSection(); calendarSection();
  hero(); kpis(); insights(); season(); volumeChart(); disciplines(); raceReady(); predictionHistory(); zone2(); activities();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("#volChart").hidden) volumeChart(); if (Z2DATA) renderZone2(); layoutTimeline(false); }, 150); });
  $("#z2ZoneFilter").querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { zoneFilter = c.dataset.f; if (Z2DATA) zoneChart(); }));
  $("#toggleOther").setAttribute("aria-pressed", showOther);
  $("#toggleOther").addEventListener("click", (e) => { showOther = !showOther; e.currentTarget.setAttribute("aria-pressed", showOther); volumeChart(); });
  $("#toggleTable").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", on);
    $("#volTable").hidden = !on; $("#volChart").hidden = on;
    if (!on) volumeChart();
  });
})();
