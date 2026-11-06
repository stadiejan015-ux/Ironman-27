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
  const hideTip = () => { tip.style.opacity = 0; document.querySelectorAll(".chart .hit.on").forEach((h) => h.classList.remove("on")); };
  const tRow = (color, label, val) => `<div class="t-row"><span><i class="swatch" style="background:${color}"></i> ${label}</span><span>${val}</span></div>`;
  // Einheitlicher Tooltip: Titel = Datum, Zeilen mit Farbe · Bezeichnung · Wert, optional Summe und Zusatzzeile
  const tSum = (label, val) => `<div class="t-row t-sum"><span>${label}</span><span>${val}</span></div>`;
  const tipBox = (title, rows, note) => `<div class="t-title">${title}</div>${rows.join("")}${note ? `<div class="t-note">${note}</div>` : ""}`;
  const tipDay = (d) => fmtDate(d, { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });
  const dmS = (d) => fmtDate(d, { day: "2-digit", month: "2-digit" });   // „06.09.“

  /* ---------- Bausteine im Apple-Stil: Symbole, Health-Kacheln, gruppierte Listen ---------- */
  // Kleine Symbole (16 × 16, currentColor) – Kategorien: heart, sleep, activity, body, swim, bike, run, strength, other
  const ICON = {
    heart: '<path d="M8 13.6S2 10 2 5.9a3.1 3.1 0 0 1 6-1.4 3.1 3.1 0 0 1 6 1.4c0 4.1-6 7.7-6 7.7z" fill="currentColor"/>',
    sleep: '<path d="M10.6 2.1a6 6 0 1 0 3.3 8 4.9 4.9 0 0 1-3.3-8z" fill="currentColor"/>',
    activity: '<path d="M9.2 1.5 3.6 9h4.1l-1 5.5L12.4 7H8.3z" fill="currentColor"/>',
    body: '<circle cx="8" cy="8.5" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8.5 10.3 5.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    swim: '<path d="M1.5 6.2c1.6 0 1.6-1.3 3.2-1.3S6.3 6.2 8 6.2s1.6-1.3 3.2-1.3 1.6 1.3 3.3 1.3M1.5 10.8c1.6 0 1.6-1.3 3.2-1.3s1.6 1.3 3.3 1.3 1.6-1.3 3.2-1.3 1.6 1.3 3.3 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    bike: '<circle cx="3.9" cy="10.6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12.1" cy="10.6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.9 10.6 6.5 5.4h3.6l2 5.2M6.5 5.4l1.6 5.2h-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>',
    run: '<path d="M1.8 11.8h10.8a1.9 1.9 0 0 0 1.9-1.9c0-.8-.6-1.4-1.4-1.6l-3.1-.8-1.4-2.9H6.4l.6 1.9-2.4.6-1.1-2.4H1.8z" fill="currentColor"/>',
    strength: '<path d="M1.3 6.6h1.9v2.8H1.3zM12.8 6.6h1.9v2.8h-1.9zM3.6 4.4h2v7.2h-2zM10.4 4.4h2v7.2h-2zM5.6 7.2h4.8v1.6H5.6z" fill="currentColor"/>',
    other: '<circle cx="4" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="12" cy="8" r="1.6" fill="currentColor"/>',
  };
  const icon = (k, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${ICON[k] || ICON.other}</svg>`;
  const CHECK = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.4 4.8 9 9.8 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV_R = '<svg class="row-chev" width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Health-Kachel: oben Kategorie in Kategoriefarbe (rechts grau Zeit/Datum), darunter große Zahl mit kleiner grauer Einheit
  const htile = ({ cat = "other", label, time = "", value, sub = "", mini = false }) =>
    `<div class="${mini ? "mtile" : "card"} kpi c-${cat}"><div class="label">${icon(cat, 15)}<span class="ht-name">${label}</span>${time ? `<span class="ht-time">${time}</span>` : ""}</div><div class="value">${value}</div>${sub ? `<div class="delta">${sub}</div>` : ""}</div>`;
  // Zeile einer gruppierten Liste (iOS „inset grouped“): Symbol, Titel + Unterzeile, Wert rechts
  const irow = ({ lead = "", title, sub = "", val = "", cls = "" }) =>
    `<li class="ios-row ${cls}">${lead}<span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>${val !== "" ? `<span class="row-val">${val}</span>` : ""}</li>`;
  const rowIcon = (cat) => `<span class="row-ic c-${cat}">${icon(cat, 16)}</span>`;
  // „Heute“, „Gestern“ oder Datum – für die Zeitangabe rechts in Kacheln
  const dayLabel = (iso) => {
    const d = parse(iso), t = new Date();
    const diff = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
    return diff === 0 ? "Heute" : diff === 1 ? "Gestern" : dmS(d);
  };

  /* ---------- Diagramme (js/charts.js): echte Pixelbreite, neu zeichnen bei Größenänderung/Aufklappen ---------- */
  const C = window.Charts;
  // draw(width) schreibt das Diagramm in box; versteckte Diagramme (Breite 0) werden beim Aufklappen nachgeholt
  function mount(box, draw) {
    if (!box) return;
    box._draw = draw; box._w = null;
    paint(box);
    if (RO) RO.observe(box);
  }
  function paint(box, onlyChanged = false) {
    const w = Math.floor(box.clientWidth);
    if (!w || !box._draw) return;
    if (onlyChanged && w === box._w) return;
    box._w = w;
    box._draw(w);
  }
  function redrawCharts(root = document) {
    root.querySelectorAll(".chart").forEach((b) => { if (b._draw) paint(b, true); });
  }
  const RO = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => requestAnimationFrame(() => entries.forEach((e) => { if (e.target.isConnected) paint(e.target, true); })))
    : null;
  function noChart(box, text) { if (!box) return; box._draw = null; box.innerHTML = C.empty(text); }
  // Antippen (Touch/iPad) oder Hovern (Maus) zeigt den Tooltip; pick(i): Klick wählt etwas aus (z. B. Woche)
  function bindTips(box, render, pick) {
    box._tip = render; box._pick = pick || null;
    if (box._tipBound) return;
    box._tipBound = true;
    let ptr = "mouse";
    const hitOf = (ev) => (ev.target && ev.target.closest ? ev.target.closest(".hit") : null);
    const show = (h, ev) => {
      box.querySelectorAll(".hit.on").forEach((x) => x !== h && x.classList.remove("on"));
      h.classList.add("on");
      showTip(box._tip(+h.dataset.i), ev);
    };
    box.addEventListener("pointerdown", (ev) => { ptr = ev.pointerType || "mouse"; });
    box.addEventListener("pointermove", (ev) => {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      const h = hitOf(ev);
      if (h) show(h, ev); else hideTip();
    });
    box.addEventListener("pointerleave", (ev) => { if (!ev.pointerType || ev.pointerType === "mouse") hideTip(); });
    box.addEventListener("click", (ev) => {
      const h = hitOf(ev);
      if (!h) return;
      if (box._pick) { hideTip(); box._pick(+h.dataset.i, ev, ptr); return; }
      if (ptr !== "mouse") show(h, ev);
    });
  }
  // Antippen außerhalb eines Diagrammpunkts schließt den Tooltip
  document.addEventListener("pointerdown", (ev) => { if (!(ev.target && ev.target.closest && ev.target.closest(".chart .hit"))) hideTip(); }, { passive: true });
  const tickFmt = (ax, unit = "") => (v) => nf(v, C.decimals(ax.step)) + unit;

  /* ---------- Hero / Countdown ---------- */
  function hero() {
    $("#raceName").textContent = D.race.name;
    $("#raceMeta").textContent = `${fmtDate(race, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${D.race.location && D.race.location !== "tbd" ? ", " + D.race.location : ""}`;
    $("#heroSub").textContent = `${nf(D.race.swimKm, 1)} km Schwimmen, ${D.race.bikeKm} km Rad, ${nf(D.race.runKm, 1)} km Laufen. Fokus aktuell: ${FLEX.active && FCFG.focus ? FCFG.focus : D.athlete.focus}.`;
    const now = new Date();
    const days = Math.max(0, Math.ceil((race - now) / DAY));
    const weeks = Math.floor(days / 7);
    const phase = currentPhase(now);
    const totalDays = Math.round((race - commit) / DAY);
    const dayNo = Math.min(totalDays, Math.max(0, Math.floor((now - commit) / DAY) + 1));
    const pct = Math.round((dayNo / totalDays) * 100);
    $("#countdown").innerHTML = `
      <div><b>${days}</b><small>Tage</small></div>
      <div><b>${weeks}</b><small>Wochen</small></div>
      <div><b class="phase-name" style="font-size:17px;line-height:32px">${phase ? esc(phase.short) : "–"}</b><small>Phase</small></div>
      <div class="journey"><div class="journey-head"><span>Anmeldung ${fmtDate(commit, { day: "2-digit", month: "2-digit", year: "2-digit" })}</span><span><b>Tag ${dayNo}</b> von ${totalDays} (${pct} %)</span><span>Rennen</span></div>
        <div class="ready-track" role="img" aria-label="${pct} % der Vorbereitung vergangen"><div class="ready-fill" style="width:${pct}%;background:var(--text)"></div></div></div>`;
    const banner = $("#flexBanner");
    if (FLEX.active) {
      const until = fmtDate(FLEX.until, { day: "2-digit", month: "2-digit" });
      banner.hidden = false;
      banner.innerHTML = `<b>Flex-Phase bis ${until}</b><div>${esc(FLEX.label)}, danach strukturiertes Training</div>` +
        (FLEX.reentry ? `<div class="flex-reentry">Noch ${FLEX.daysLeft} ${FLEX.daysLeft === 1 ? "Tag" : "Tage"}: Wiedereinstieg vorbereiten – Ausdauer wieder auf 3–4 Einheiten pro Woche steigern, je eine längere lockere Rad- und Laufeinheit einbauen und Gym auf 2–3× reduzieren.</div>` : "");
    }
  }

  /* ---------- KPIs ---------- */
  function kpis() {
    const from = addDays(snapEnd, -28), prevFrom = addDays(snapEnd, -56);
    const cur = inRange(from, snapEnd), prev = inRange(prevFrom, from);
    $("#kpiSub").textContent = `${fmtDate(from)} – ${fmtDate(snap)}, verglichen mit den 4 Wochen davor.`;
    setSum("letzte4", [`${nf(sum(cur, (a) => a.sec) / 3600, 1)} h`, `${cur.length} Einheiten`]);
    const delta = (a, b, unit, d = 0) => {
      const diff = a - b; if (Math.abs(diff) < 0.05) return "± 0 zur Vorperiode";
      if (FLEX.active && diff < 0) return `<span class="neutral-delta">−${nf(Math.abs(diff), d)} ${unit}, Flex-Phase ohne Soll</span>`;
      return `${diff > 0 ? "▲ +" : "▼ −"}${nf(Math.abs(diff), d)} ${unit} zur Vorperiode`;
    };
    const triCats = ["swim", "bike", "run"];
    const triH = (arr) => sum(arr.filter((a) => triCats.includes(a.cat)), (a) => a.sec) / 3600;
    const allH = (arr) => sum(arr, (a) => a.sec) / 3600;
    const km = (arr, c) => sum(ofCat(arr, c), (a) => a.km);
    const n = (arr, c) => ofCat(arr, c).length;
    const longestRun = Math.max(...ofCat(acts, "run").map((a) => a.km));
    const tiles = [
      ["activity", "Triathlon", `${nf(triH(cur) / 4, 1)}<small>h</small>`, `pro Woche<br>${delta(triH(cur) / 4, triH(prev) / 4, "h", 1)}`],
      ["other", "Gesamt", `${nf(allH(cur) / 4, 1)}<small>h</small>`, `pro Woche inkl. Kraft & Klettern<br>${delta(allH(cur) / 4, allH(prev) / 4, "h", 1)}`],
      ["swim", "Schwimmen", `${nf(km(cur, "swim"), 1)}<small>km</small>`, `${n(cur, "swim")} Einheiten<br>${delta(km(cur, "swim"), km(prev, "swim"), "km", 1)}`],
      ["bike", "Rad", `${nf(km(cur, "bike"))}<small>km</small>`, `${n(cur, "bike")} Einheiten<br>${delta(km(cur, "bike"), km(prev, "bike"), "km")}`],
      ["run", "Laufen", `${nf(km(cur, "run"))}<small>km</small>`, `${n(cur, "run")} Einheiten<br>${delta(km(cur, "run"), km(prev, "run"), "km")}`],
      ["strength", "Krafteinheiten", `${n(cur, "strength")}<small>×</small>`, `in 4 Wochen<br>${delta(n(cur, "strength"), n(prev, "strength"), "Einheiten")}`],
      ["bike", "FTP", `${D.zones.ftp}<small>W</small>`, `${nf(D.zones.ftp / D.athlete.weightKg, 2)} W/kg bei ${nf(D.athlete.weightKg, 1)} kg${latestWeight ? " (Garmin)" : ""}`],
      ["activity", "Streak", `${D.athlete.streakWeeks}<small>Wochen</small>`, `seit Anmeldung ${Math.floor((snap - commit) / DAY / 7)} Wochen dabei`],
    ];
    $("#kpis").innerHTML = tiles.map(([cat, label, value, sub]) => htile({ cat, label, value, sub })).join("");
  }

  // Häkchenliste fürs Wochen-Minimum
  const minList = (wk) => `<ul class="ios-list chk">${wk.items.map((x) => irow({
    lead: `<span class="row-check${x.ok ? " ok" : ""}" aria-hidden="true">${x.ok ? CHECK : ""}</span>`,
    title: `${esc(x.label)}<span class="sr-only">${x.ok ? " – erfüllt" : " – offen"}</span>`, val: `<b>${x.have}/${x.need}</b>`, cls: x.ok ? "ok" : "",
  })).join("")}</ul>`;

  /* ---------- Phasen (js/phases.js) ---------- */
  // Montags-Raster wie Kalender und Wochenkarte; mit Flex-Zeitraum: Flex als eigene Phase, danach
  // Wiedereinstieg, Grundlage 2, Aufbau 1, Aufbau 2 bis zum Peak (Wochen: TRAINING.plan)
  const planStart = commit;
  const PH = window.Phases.buildPhases({ race: D.race.date, planStart: D.commitDate, flex: FCFG, plan: window.TRAINING.plan || {} });
  const PHASES = PH.phases;
  function currentPhase(d) { return window.Phases.currentPhase(PHASES, d); }

  // Zeitstrahl-Layout: Breite proportional zur Dauer, aber jede Phase mindestens TL_MIN px breit
  // (Peak/Taper bleiben lesbar). Ist der Platz zu knapp (Handy), wird der Zeitstrahl breiter und
  // scrollt horizontal; der Heute-Marker wird an den Phasen ausgerichtet.
  const TL_MIN = 66, TL_GAP = 3, TL_MIN_WIDTH = 720;
  // Textbreite in der echten Schrift messen (Canvas), Schätzung als Rückfall
  let measureCtx = null;
  function textWidth(el, text) {
    try {
      measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
      const cs = el && getComputedStyle(el);
      if (measureCtx && cs) { measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return measureCtx.measureText(text).width; }
    } catch (e) { /* ignore */ }
    return text.length * 7.8;
  }
  function layoutTimeline(scrollToToday) {
    const tl = $("#timeline"), wrap = tl && tl.parentElement;
    if (!tl || !wrap || !wrap.clientWidth) return;
    const els = tl.querySelectorAll(".phase");
    // Mindestbreite je Phase nach Länge des Namens (z. B. „Wiedereinstieg“ braucht mehr als „Peak“)
    const mins = PHASES.map((p, i) => Math.max(TL_MIN, Math.ceil(textWidth(els[i] && els[i].querySelector("b"), p.short) + 19)));
    const W = Math.max(wrap.clientWidth - 4, TL_MIN_WIDTH, mins.reduce((a, b) => a + b, 0) + (PHASES.length - 1) * TL_GAP);
    const free = W - (PHASES.length - 1) * TL_GAP, fixed = new Set();
    let widths = [];
    for (let k = 0; k <= PHASES.length; k++) {
      const dur = PHASES.reduce((s, p, i) => s + (fixed.has(i) ? 0 : p.end - p.start), 0);
      const rest = free - [...fixed].reduce((a, i) => a + mins[i], 0);
      widths = PHASES.map((p, i) => (fixed.has(i) ? mins[i] : (rest * (p.end - p.start)) / dur));
      const small = widths.map((w, i) => (w < mins[i] && !fixed.has(i) ? i : -1)).filter((i) => i >= 0);
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
      return `<div class="phase ${state}${p.flex ? " flex" : ""}" title="${esc(p.name)}: ${fmtDate(p.start)} – ${fmtDate(addDays(p.end, -1))}"><b>${esc(p.short)}</b><span>${p.hours}</span></div>`;
    }).join("");
    if (now > planStart && now < race) {
      const m = document.createElement("div");
      m.className = "today-marker";
      tl.appendChild(m);
    }
    layoutTimeline(true);
    const cp = currentPhase(now);
    $("#phaseWarn").hidden = !PH.warning;
    if (PH.warning) $("#phaseWarn").textContent = PH.warning.text;
    if (FLEX.active && FX) {
      const wk = FX.weekMinimum(flexActs, now, FCFG), after = currentPhase(addDays(FLEX.until, 1));
      $("#currentPhase").innerHTML = `<div class="card" style="box-shadow:none;background:var(--surface-2);border:0">
        <h3 style="margin-bottom:2px">Flex: ${esc(FLEX.label)}</h3>
        <div class="muted" style="font-size:15px;line-height:20px;margin-bottom:12px">${FLEX.from ? fmtDate(FLEX.from) + " – " : "bis "}${fmtDate(FLEX.until)}<br>noch ${FLEX.daysLeft} Tage${after ? `, danach ${esc(after.name)}` : ""}</div>
        <div class="mini-title" style="margin-top:0">Wochen-Minimum (diese Woche)</div>
        ${minList(wk)}</div>`;
    } else if (cp) {
      const left = Math.ceil((cp.end - now) / DAY / 7);
      $("#currentPhase").innerHTML = `<div class="card" style="box-shadow:none;background:var(--surface-2);border:0">
        <h3 style="margin-bottom:2px">${esc(cp.name)}</h3>
        <div class="muted" style="font-size:15px;line-height:20px;margin-bottom:12px">${fmtDate(cp.start)} – ${fmtDate(addDays(cp.end, -1))}, noch ${left} ${left === 1 ? "Woche" : "Wochen"}<br>Ziel ${cp.hours} pro Woche${cp.key === "reentry" ? ", Umfang langsam steigern" : ""}</div>
        <ul style="margin:0;padding-left:18px">${cp.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`;
    } else {
      $("#currentPhase").innerHTML = `<p class="muted">Außerhalb des Plans.</p>`;
    }
    // chronologisch; Flex ist eine eigene Phase (gestrichelt)
    $("#phaseList").innerHTML = PHASES.map((p) => {
      const st = p === cp ? "cur" : p.end <= now ? "done" : "future";
      return irow({
        lead: `<span class="row-dot ${st}" aria-hidden="true"></span>`,
        title: `${esc(p.short)}${st === "cur" ? ` <span class="badge accent">aktuell</span>` : ""}`,
        sub: `${fmtDate(p.start, { day: "2-digit", month: "short" })} – ${fmtDate(addDays(p.end, -1), { day: "2-digit", month: "short", year: "2-digit" })}`,
        val: p.hours, cls: st,
      });
    }).join("");
    const afterFlex = FLEX.active ? currentPhase(addDays(FLEX.until, 1)) : null;
    setSum("saison", FLEX.active ? [`Flex bis ${fmtDate(FLEX.until, { day: "2-digit", month: "2-digit" })}`, afterFlex ? `danach ${afterFlex.short}` : null]
      : cp ? [cp.short, `noch ${Math.ceil((cp.end - now) / DAY / 7)} Wochen`] : "");
  }

  /* ---------- Wochenumfang (gestapelte Balken) ---------- */
  const firstWeek = monday(acts[acts.length - 1].date);
  const weeks = [];
  for (let w = firstWeek; w <= snap; w = addDays(w, 7)) {
    const list = inRange(w, addDays(w, 7));
    const h = (c) => sum(ofCat(list, c), (a) => a.sec) / 3600;
    const flexWeek = inFlex(addDays(w, 3)) || inFlex(w) || inFlex(addDays(w, 6));
    weeks.push({ start: w, swim: h("swim"), bike: h("bike"), run: h("run"), strength: h("strength"), other: h("other"), extra: h("strength") + h("other"),
      flex: flexWeek, min: flexWeek && FX ? FX.weekMinimum(flexActs, w, FCFG) : null });
  }
  let showOther = FLEX.active; // im Flex-Zeitraum Kraft standardmäßig mit anzeigen

  function volumeChart() {
    const keys = showOther ? ["swim", "bike", "run", "strength", "other"] : ["swim", "bike", "run"];
    const lastW = weeks[weeks.length - 1], curMon = monday(new Date()).getTime();
    const total = (w) => keys.reduce((a, k) => a + w[k], 0);
    if (lastW) setSum("umfang", `${lastW.start.getTime() === curMon ? "Diese Woche" : `Woche ab ${dmS(lastW.start)}`} ${nf(total(lastW), 1)} h`);
    const colors = { swim: "var(--swim)", bike: "var(--bike)", run: "var(--run)", strength: "var(--strength)", other: "var(--other)" };
    const labels = { swim: "Schwimmen", bike: "Rad", run: "Laufen", strength: "Kraft", other: "Sonstiges" };
    $("#volLegend").innerHTML = C.legendItems(keys.map((k) => ({ label: labels[k], color: colors[k] })));

    const el = $("#volChart");
    const ax = C.zeroAxis(Math.max(...weeks.map(total)));
    const fIdx = weeks.map((w, i) => (w.flex ? i : -1)).filter((i) => i >= 0);
    const aria = `Wochenstunden je Disziplin, ${weeks.length} Wochen, ${lastW && lastW.start.getTime() === curMon ? "diese Woche" : "zuletzt"} ${nf(lastW ? total(lastW) : 0, 1)} h`;
    const tip = (w) => tipBox(`Woche ab ${fmtDate(w.start)}`, keys.map((k) => tRow(colors[k], labels[k], hm(w[k] * 3600) + " h")).concat(tSum("Summe", hm(total(w) * 3600) + " h"))) +
      (w.min ? `<div class="t-title t-sec">Wochen-Minimum (Flex)</div>` + w.min.items.map((it) => `<div class="t-row"><span>${it.ok ? "✓" : "○"} ${esc(it.label)}</span><span>${it.have}/${it.need}</span></div>`).join("") : "");
    mount(el, (W) => {
      const narrow = (W - 50) / weeks.length < 26;   // wenig Platz: ✓ / ○ statt „2/3“
      el.innerHTML = C.barChart({
        width: W, height: C.LARGE, aria, y: { ...ax, fmt: tickFmt(ax, " h") },
        groups: fIdx.length ? [{ from: fIdx[0], to: fIdx[fIdx.length - 1], label: "Flex" }] : [],
        bands: weeks.map((w) => ({
          label: dmS(w.start), current: w.start.getTime() === curMon, dim: w.flex,
          stacks: keys.map((k) => ({ v: w[k], color: colors[k] })),
          below: w.flex && w.min ? (w.min.ok ? "✓" : narrow ? "○" : `${w.min.items.filter((it) => it.ok).length}/3`) : null,
          belowClass: w.flex && w.min && w.min.ok ? "min-ok" : "tick",
        })),
      });
      bindTips(el, (i) => tip(weeks[i]));
    });
    // Tabelle
    $("#volTable").innerHTML = `<table><thead><tr><th>Woche ab</th><th class="num">Schwimmen</th><th class="num">Rad</th><th class="num">Laufen</th><th class="num">Kraft & Sonst.</th><th class="num">Tri gesamt</th></tr></thead><tbody>` +
      weeks.slice().reverse().map((w) => `<tr><td>${fmtDate(w.start)}</td><td class="num">${hm(w.swim * 3600)}</td><td class="num">${hm(w.bike * 3600)}</td><td class="num">${hm(w.run * 3600)}</td><td class="num">${hm(w.extra * 3600)}</td><td class="num"><b>${hm((w.swim + w.bike + w.run) * 3600)}</b></td></tr>`).join("") + `</tbody></table>`;
  }

  /* ---------- Zeitverlauf mit einer Linie (Disziplinen, Erholung, Prognose) ---------- */
  // pts aufsteigend nach Datum; o = { color, axis, fmt, val, aria, tip, band, refs, invert, height, emptyText }
  function trendLine(box, pts, o) {
    if (!box) return;
    if (pts.length < 2) { noChart(box, o.emptyText || "Zu wenig Daten."); return; }
    const last = pts[pts.length - 1];
    mount(box, (W) => {
      box.innerHTML = C.lineChart({
        width: W, height: o.height || C.SMALL, aria: o.aria, y: { ...o.axis, fmt: o.fmt, invert: !!o.invert },
        series: [{ pts, color: o.color }], band: o.band, refs: o.refs,
        latest: { d: last.d, v: last.v, label: o.val(last.v) }, hits: pts,
      });
      bindTips(box, (i) => o.tip(pts[i]));
    });
  }
  // Wochenbalken einer Sportart (Rad-km)
  function weekBars(box, values, o) {
    const curMon = monday(new Date()).getTime();
    const ax = C.zeroAxis(Math.max(...values.map((w) => w.v)));
    mount(box, (W) => {
      box.innerHTML = C.barChart({
        width: W, height: C.SMALL, aria: o.aria, y: { ...ax, fmt: tickFmt(ax) },
        bands: values.map((w) => ({ label: dmS(w.d), current: w.d.getTime() === curMon, stacks: [{ v: w.v, color: o.color }] })),
      });
      bindTips(box, (i) => o.tip(values[i]));
    });
  }

  /* ---------- Disziplinen ---------- */
  function disciplines() {
    const swims = ofCat(acts, "swim"), bikes = ofCat(acts, "bike"), runs = ofCat(acts, "run");
    const z2b = z2PaceRange();   // grobe Zone-2-Pace [schnell, langsam] aus der Zone-2-Auswertung, sonst null
    setSum("disziplinen", [`Schwimmen ${swims.length}×`, `Rad ${bikes.length}×`, `Laufen ${runs.length}×`]);
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
        <div class="mini-title">Pace pro Einheit ab 900 m, schneller ist oben</div>
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
        <p class="muted" style="font-size:12px;margin:6px 0 0">FTP ${D.zones.ftp} W, Ironman-Tempo ca. ${Math.round(D.zones.ftp * 0.65)}–${Math.round(D.zones.ftp * 0.75)} W (65–75 % FTP, Faustregel).</p>
      </div>
      <div class="card" id="dRun">
        <h3><i class="swatch" style="background:var(--run)"></i>Laufen</h3>
        <div class="stats">
          ${stat("Einheiten", runs.length)}${stat("Distanz", nf(runKm) + " km")}${stat("Zeit", hm(runSec) + " h")}
          ${stat("Ø Pace", mmss(runSec / runKm) + "/km")}${stat("Längster", nf(longestRun, 1) + " km")}${stat("Höhenmeter", nf(runElev) + " m")}
        </div>
        <div class="mini-title">Pace pro Lauf ab 4 km${z2b ? ", Band = grobe Zone-2-Pace" : ""}</div>
        <div class="chart" id="runChart"></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Zone 2: ${D.zones.hr[1][0]}–${D.zones.hr[1][1]} bpm aus deinen HF-Zonen – nach Puls, nicht nach Tempo${z2b ? `; grobe Pace laut Zone-2-Auswertung ca. ${mmss(z2b[0])}–${mmss(z2b[1])} /km (Band im Diagramm)` : ""}.</p>
      </div>`;

    if (swimPts.length) trendLine($("#swimChart"), swimPts, {
      color: "var(--swim)", axis: C.paceAxis(swimPts.map((p) => p.v)), invert: true, fmt: mmss, val: mmss,
      aria: `Schwimm-Pace pro Einheit ab 900 m, ${swimPts.length} Einheiten, zuletzt ${mmss(swimPts[swimPts.length - 1].v)} pro 100 m`,
      tip: (p) => tipBox(tipDay(p.d), [tRow("var(--swim)", "Pace", mmss(p.v) + " /100 m")], `${esc(p.a.name)}<br>${nf(p.a.km * 1000)} m in ${hm(p.a.sec)} h`),
    }); else noChart($("#swimChart"), "Noch keine Einheit ab 900 m.");
    const lastBike = bikeWeekly[bikeWeekly.length - 1];
    weekBars($("#bikeChart"), bikeWeekly, {
      color: "var(--bike)", aria: `Rad-Kilometer pro Woche, ${bikeWeekly.length} Wochen, zuletzt ${nf(lastBike ? lastBike.v : 0)} km`,
      tip: (w) => tipBox(`Woche ab ${fmtDate(w.d)}`, [tRow("var(--bike)", "Rad", nf(w.v) + " km")]),
    });
    if (runPts.length) trendLine($("#runChart"), runPts, {
      color: "var(--run)", axis: C.paceAxis(runPts.map((p) => p.v), { include: z2b || [] }), invert: true, fmt: mmss, val: mmss,
      band: z2b ? { from: z2b[0], to: z2b[1], color: "var(--run)" } : null,
      aria: `Lauf-Pace pro Lauf ab 4 km, ${runPts.length} Läufe, zuletzt ${mmss(runPts[runPts.length - 1].v)} pro km`,
      tip: (p) => tipBox(tipDay(p.d), [tRow("var(--run)", "Pace", mmss(p.v) + " /km")], `${esc(p.a.name)}<br>${nf(p.a.km, 1)} km, ${p.a.elev} hm`),
    }); else noChart($("#runChart"), "Noch kein Lauf ab 4 km.");
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
    setSum("rennen", [`Prognose ${hm(p.total.realistic)}`, `Ziel ${hm(goalTotal)}`]);
    $("#predAsOf").textContent = `Wenn heute Renntag wäre, Stand ${fmtDate(parse(p.asOf))}`;

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
      ? `<span class="badge good">✓ Sub-12${gap < -60 ? `, ${Math.floor(-gap / 60)} min Puffer` : ""}</span>`
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
          noChart(box, `Der Verlauf startet mit dem ${pts[0] ? fmtDate(pts[0].d) : "nächsten Sync"} (Prognose ${pts[0] ? hm(pts[0].v) : "–"} h). Ab dem zweiten Tag siehst du hier, wie sich die Prognose entwickelt.`);
          return;
        }
        pts.sort((a, b) => a.d - b.d);
        const sub = PRED ? PRED.subTarget : 43200, last = pts[pts.length - 1];
        const refs = Math.abs(goalTotal - sub) < 60 ? [{ v: goalTotal, label: "Ziel = Sub-12" }] : [{ v: sub, label: "Sub-12" }, { v: goalTotal, label: "Ziel" }];
        trendLine(box, pts, {
          color: "var(--text-2)", axis: C.durationAxis(pts.map((p) => p.v), { include: [goalTotal, sub] }), invert: true, fmt: hm, val: hm, refs,
          aria: `Verlauf der Gesamtprognose seit ${fmtDate(pts[0].d)}, aktuell ${hm(last.v)} h, Ziel ${hm(goalTotal)} h`,
          tip: (p) => tipBox(tipDay(p.d), [tRow("var(--text-2)", "Prognose", hms(p.v)), tRow("var(--swim)", "Schwimmen", hm(p.e.swim)), tRow("var(--bike)", "Rad", hm(p.e.bike)), tRow("var(--run)", "Laufen", hm(p.e.run))]),
        });
      })
      .catch(() => { noChart(box, "Verlauf nicht verfügbar (nur auf der veröffentlichten Seite)."); });
  }


  /* ---------- Zone-2-Entwicklung (data/z2-metrics.json, js/z2.js) ---------- */
  const ZCOL = ["20%", "36%", "52%", "68%", "84%"].map((p) => `color-mix(in srgb, var(--text) ${p}, var(--surface))`);   // Z1 hell → Z5 dunkel
  const STATUS_COL = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };
  const STATUS_TXT = { good: "grün", warn: "gelb", bad: "rot" };
  const SRC_TXT = { strap: "Brustgurt", wrist: "Uhr (optisch)", unknown: "Pulsmesser unbekannt" };
  let Z2DATA = null, HRSRC = null, zoneFilter = "all";

  function zone2() {
    const cfg = window.TRAINING.z2, Z = window.Z2;
    if (!cfg || !Z) { $("#zone2").hidden = true; return; }
    const get = (f) => fetch(`${f}?v=${window.__v || Date.now()}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    setSum("zone2", "wird geladen …");
    Promise.all([get("data/z2-metrics.json"), get("data/hr-sources.json").catch(() => null)])
      .then(([db, src]) => { Z2DATA = db; HRSRC = src; insights(); disciplines(); renderZone2(); if (FLEX.active) today(); })
      .catch(() => {
        $("#z2Tiles").innerHTML = `<p class="muted">Zone-2-Daten nicht verfügbar (nur auf der veröffentlichten Seite).</p>`;
        setSum("zone2", "nicht verfügbar");
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
    const tile = (label, value, sub, badge) => htile({ cat: /^Pace/.test(label) ? "run" : /^Watt/.test(label) ? "bike" : "heart", label, value: value.replace(/ <small>/g, "<small>"), sub: `${badge || ""}${sub}` });
    const few = (n, what) => `noch zu wenig Daten (${n} ${n === 1 ? what[0] : what[1]} in 4 Wochen, mind. ${cfg.minPoints})`;

    // Kachel 1: Pace @ HF
    const lp = lastOf(pace);
    const t1 = kP.enough
      ? tile(`Pace @ ${runMid} bpm`, `${mmss(kP.value)} <small>/km</small>`, kP.delta != null ? `${kP.delta < 0 ? "▼" : kP.delta > 0 ? "▲" : "±"} ${mmss(Math.abs(kP.delta))} ${kP.delta <= 0 ? "schneller" : "langsamer"} als die 4 Wochen davor` : `Median aus ${kP.n} Läufen`)
      : tile(`Pace @ ${runMid} bpm`, "–", `${few(kP.n, ["Lauf", "Läufe"])}${lp ? `<br>zuletzt ${mmss(lp.v)} /km am ${fmtDate(parse(lp.date), { day: "2-digit", month: "2-digit" })}` : ""}`);
    // Kachel 2: Watt @ HF (Indoor)
    const lw = lastOf(wIn);
    const t2 = kW.enough
      ? tile(`Watt @ ${rideMid} bpm (Indoor)`, `${nf(kW.value)} <small>W</small>`, kW.delta != null ? `${kW.delta > 0 ? "▲ +" : kW.delta < 0 ? "▼ −" : "± "}${nf(Math.abs(kW.delta))} W zu den 4 Wochen davor` : `Median aus ${kW.n} Fahrten`)
      : tile(`Watt @ ${rideMid} bpm (Indoor)`, "–", `${few(kW.n, ["Fahrt", "Fahrten"])}${lw ? `<br>zuletzt ${lw.v} W am ${fmtDate(parse(lw.date), { day: "2-digit", month: "2-digit" })}` : ""}`);
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
    const t4 = sh ? tile("Anteil Z1–2 (4 Wochen)", `${Math.round(sh.share * 100)} <small>%</small>`, `Z3 ${Math.round((sh3 ? sh3.share : 0) * 100)} %, Z4–5 ${Math.round((1 - sh.share - (sh3 ? sh3.share : 0)) * 100)} %<br>${hm(sh.totalSec)} h Lauf & Rad, Richtwert ~80&nbsp;%`)
      : tile("Anteil Z1–2 (4 Wochen)", "–", "keine Einheiten mit Herzfrequenz");
    $("#z2Tiles").innerHTML = t1 + t2 + t3 + t4;
    const decAvg = decRecent.length ? decRecent.reduce((a, p) => a + p.v, 0) / decRecent.length : null;
    setSum("zone2", [sh ? `Z1–2-Anteil ${Math.round(sh.share * 100)} %` : null, decAvg != null ? `Entkopplung ${decAvg < 0 ? "−" : ""}${nf(Math.abs(decAvg), 1)} %` : null].filter(Boolean).length ? [sh ? `Z1–2-Anteil ${Math.round(sh.share * 100)} %` : null, decAvg != null ? `Entkopplung ${decAvg < 0 ? "−" : ""}${nf(Math.abs(decAvg), 1)} %` : null] : "noch keine Auswertung");

    // Chart 1: Pace @ HF
    const toPts = (arr, kind) => arr.map((p) => ({ d: parse(p.date), v: p.v, rec: p.rec, kind,
      hollow: kind === "run" ? p.rec.hrSrc !== "strap" : kind === "outdoor", gap: kind === "run" && !!(p.rec.pace && p.rec.pace.gap) }));
    const roll = (arr) => Z.rollingMedian(arr, cfg.windowDays).map((p) => ({ d: parse(p.date), v: p.v }));
    const tipRec = (p, color, label, valTxt) => tipBox(tipDay(p.d), [tRow(color, label, valTxt)],
      `${esc(p.rec.name)}<br>${nf(p.rec.km, 1)} km in ${hm(p.rec.sec)} h${p.rec.pace ? `, ${Math.round(p.rec.pace.bandSec / 60)} min im Band` : p.rec.watts ? `, ${Math.round(p.rec.watts.bandSec / 60)} min im Band` : ""}<br>${SRC_TXT[p.rec.hrSrc] || SRC_TXT.unknown}${p.rec.hrSrcFrom ? ` (${p.rec.hrSrcFrom})` : ""}${p.gap ? ", steigungsbereinigt (GAP)" : ""}`);
    trendChart($("#z2Pace"), toPts(pace, "run"), pace.length >= cfg.minPoints ? [{ pts: roll(pace) }] : [], {
      invert: true, fmt: mmss, axis: (vs) => C.paceAxis(vs), color: "var(--run)", label: `Pace bei ${runMid} bpm`, unit: " pro km", minPoints: cfg.minPoints,
      tip: (p) => tipRec(p, "var(--run)", "Pace", `${mmss(p.v)} /km`),
    });
    // Chart 2: Watt @ HF
    trendChart($("#z2Watts"), toPts(wIn, "indoor").concat(toPts(wOut, "outdoor")),
      [wIn.length >= cfg.minPoints ? { pts: roll(wIn) } : null, wOut.length >= cfg.minPoints ? { pts: roll(wOut), dash: true } : null].filter(Boolean), {
        invert: false, fmt: (v) => nf(v), axis: (vs) => C.padAxis(vs), color: "var(--bike)", label: `Watt bei ${rideMid} bpm`, unit: " W", minPoints: cfg.minPoints,
        tip: (p) => tipRec(p, "var(--bike)", p.kind === "indoor" ? "Indoor" : "Outdoor", `${p.v} W`),
      });
    $("#z2OutMedian").hidden = wOut.length < cfg.minPoints;   // gestrichelte Outdoor-Linie nur mit genug Fahrten
    // Chart 3: Entkopplung
    decouplingChart($("#z2Dec"), Z.decouplingSeries(recs), cfg.decoupling.thresholds);
    // Chart 4: Zonenverteilung
    $("#z2ZoneLegend").innerHTML = C.legendItems(hrZ.map((z, i) => ({ color: ZCOL[i], label: `Z${i + 1} ${i === 0 ? "< " + hrZ[1][0] : z[1] == null ? "≥ " + z[0] : z[0] + "–" + z[1]}` })));
    zoneChart();

    // Text der Karte „Zone 2 verbessern“
    const ins = $("#z2Insight p");
    if (ins) ins.innerHTML = Z.summary(recs, asOf, cfg, hrZ).map((t) => `<span class="z2-line">${esc(t)}</span>`).join("") + `<a href="#zone2">Details</a>`;
    $("#z2Asof").textContent = `${all.length} Läufe & Fahrten seit ${fmtDate(parse(all[0].date))}, Stand ${fmtDate(parse(asOf))}${strapOnly ? ". Nur Brustgurt-Einheiten gewertet." : ""}`;
    const withHr = all.filter((r) => r.hasHr), cnt = (k) => withHr.filter((r) => r.hrSrc === k).length;
    $("#z2SrcStats").innerHTML = `<b>Pulsmesser erkannt:</b> ${cnt("strap")} × Brustgurt, ${cnt("wrist")} × Uhr, ${cnt("unknown")} × unbekannt (von ${withHr.length} Einheiten mit HF). ${HRSRC && HRSRC.updated ? `Garmin-Sensordaten Stand ${new Date(HRSRC.updated).toLocaleDateString("de-DE")}.` : "Noch keine Garmin-Sensordaten – der nächste Garmin-Lauf holt sie."}`;
  }

  // Einzelwerte als blasse Punkte, gleitender Median als Linie (Farbe der Sportart)
  function trendChart(box, pts, lines, o) {
    if (pts.length < 1) { noChart(box, "Noch keine gewerteten Einheiten."); return; }
    const last = pts.reduce((a, p) => (p.d > a.d ? p : a), pts[0]);
    const ax = o.axis(pts.map((p) => p.v));
    const note = pts.length < o.minPoints ? `<p class="chart-note">Noch zu wenig Daten für einen Trend (${pts.length} von mind. ${o.minPoints} Werten).</p>` : "";
    mount(box, (W) => {
      box.innerHTML = C.lineChart({
        width: W, height: C.LARGE, aria: `${o.label} über die Zeit, ${pts.length} Einheiten, zuletzt ${o.fmt(last.v)}${o.unit}`,
        y: { ...ax, fmt: o.fmt, invert: o.invert },
        series: lines.map((l) => ({ pts: l.pts, color: o.color, dash: l.dash, dots: false })),
        scatter: pts.map((p) => ({ d: p.d, v: p.v, color: o.color, shape: p.gap ? "diamond" : p.hollow ? "hollow" : "dot", opacity: p.hollow ? 0.8 : 0.45 })),
        latest: { d: last.d, v: last.v, label: o.fmt(last.v) }, hits: pts,
      }) + note;
      bindTips(box, (i) => o.tip(pts[i]));
    });
  }

  const DEC_BAR = "color-mix(in srgb, var(--text) 30%, var(--surface))";   // neutral, Ampel nur als Punkt
  function decouplingChart(box, list, thr) {
    if (!list.length) { noChart(box, "Noch keine ruhigen langen Einheiten (Lauf ≥ 60 min, Rad ≥ 90 min mit echten Watt, ≥ 80 % in Z1–2)."); return; }
    const items = list.slice().sort((a, b) => a.date.localeCompare(b.date)), vs = items.map((p) => p.v), last = items[items.length - 1];
    const ax = C.zeroAxis(Math.max(thr[1], ...vs), { min: Math.min(0, ...vs), clamp: [-100, 100] });
    const tip = (p) => {
      const r = p.rec, st = window.Z2.ampel(p.v, thr);
      return tipBox(tipDay(parse(p.date)), [tRow(STATUS_COL[st], "Entkopplung", `${nf(p.v, 1)} % (${STATUS_TXT[st]})`)],
        `${esc(r.name)}<br>${r.kind === "run" ? "Lauf" : "Rad"}, ${nf(r.km, 1)} km in ${hm(r.sec)} h<br>Z1–2 ${Math.round(r.decoupling.z12Share * 100)} %${r.decoupling.vi ? `, VI ${nf(r.decoupling.vi, 2)}` : ""}${r.decoupling.gap ? ", GAP" : ""}<br>${SRC_TXT[r.hrSrc] || SRC_TXT.unknown}`);
    };
    mount(box, (W) => {
      box.innerHTML = C.barChart({
        width: W, height: C.LARGE, minBands: 6, aria: `Entkopplung pro langer Einheit, ${items.length} Einheiten, zuletzt ${nf(last.v, 1)} %`,
        y: { ...ax, fmt: tickFmt(ax, " %") }, refs: [{ v: thr[0], label: `Ziel < ${thr[0]} %` }, { v: thr[1], label: `${thr[1]} %` }],
        bands: items.map((p) => ({ label: dmS(parse(p.date)), stacks: [{ v: p.v, color: DEC_BAR }], dot: STATUS_COL[window.Z2.ampel(p.v, thr)] })),
      });
      bindTips(box, (i) => tip(items[i]));
    });
  }

  function zoneChart() {
    const box = $("#z2Zones"), Z = window.Z2;
    const recs = Z2DATA.activities.filter((r) => r.kind);
    const weeksZ = Z.weeklyZones(recs, zoneFilter === "all" ? null : zoneFilter).slice(-16);
    $("#z2ZoneFilter").querySelectorAll("button").forEach((c) => c.setAttribute("aria-pressed", c.dataset.f === zoneFilter));
    if (!weeksZ.length) { noChart(box, "Keine Daten."); return; }
    const tot = weeksZ.map((w) => w.sec.reduce((a, b) => a + b, 0));
    const ax = C.zeroAxis(Math.max(...tot) / 3600), curMon = ymdLocal(monday(new Date()));
    const tip = (i) => {
      const w = weeksZ[i], total = tot[i];
      return tipBox(`Woche ab ${fmtDate(parse(w.week))}`, w.sec.map((sec, z) => tRow(ZCOL[z], `Z${z + 1}`, `${hm(sec)} h (${total ? Math.round((sec / total) * 100) : 0} %)`)).concat(tSum("Summe", `${hm(total)} h`)));
    };
    mount(box, (W) => {
      box.innerHTML = C.barChart({
        width: W, height: C.LARGE, aria: `Zeit pro Herzfrequenzzone und Woche, ${weeksZ.length} Wochen, zuletzt ${hm(tot[tot.length - 1])} h`,
        y: { ...ax, fmt: tickFmt(ax, " h") },
        bands: weeksZ.map((w) => ({ label: dmS(parse(w.week)), current: w.week === curMon, stacks: w.sec.map((sec, z) => ({ v: sec / 3600, color: ZCOL[z] })) })),
      });
      bindTips(box, tip);
    });
  }


  /* ---------- Gym-Tracker (js/gym.js) ---------- */
  const PLACE_COLORS = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)", "var(--cat6)"];
  function gymSection() {
    if (!GYM) { $("#gym").hidden = true; return; }
    const now = new Date(), todayIso = ymdLocal(now), mon = ymdLocal(monday(now));
    const wk = GYM.splitCounts(GYM_SESS, mon, todayIso);
    setSum("gym", [`${wk.total}× diese Woche`, wk.total ? ["Push", "Pull", "Legs"].filter((k) => wk[k]).map((k) => `${wk[k]} ${k}`).join(", ") || "ohne Split" : null]);
    $("#gymWeek").innerHTML = htile({
      cat: "strength", label: "Gym diese Woche", time: `seit ${dmS(monday(now))}`, value: `${wk.total}<small>×</small>`,
      sub: `<div class="ht-split">${["Push", "Pull", "Legs"].map((k) => `<span><b>${wk[k]}</b>${k}</span>`).join("")}${wk.ohne ? `<span><b>${wk.ohne}</b>ohne Split</span>` : ""}</div>${wk.Legs ? "" : `<div class="ht-note">Noch kein Leg Day diese Woche.</div>`}`,
    });

    // Orte → feste Farben in Reihenfolge des ersten Auftretens, „unbekannt“ grau
    const places = [];
    GYM_SESS.forEach((x) => { const p = x.parsed && x.parsed.entry && x.parsed.place; if (p && !places.includes(p)) places.push(p); });
    const placeColor = (p) => (p === "unbekannt" || !p ? "var(--other)" : PLACE_COLORS[places.indexOf(p) % PLACE_COLORS.length]);

    const lifts = Object.entries(GCFG.mainExercise || GYM.DEFAULTS.mainExercise);
    $("#gymLifts").innerHTML = lifts.map(([split, ex]) => {
      const h = GYM.exerciseHistory(GYM_SESS, ex, GCFG);
      const gp = GYM.goalProgress(GYM_SESS, ex, GCFG);
      if (!h.length) return `<div class="card"><h3>${esc(ex)} <span class="muted" style="font-weight:400">${split}</span></h3><p class="muted" style="margin:0;font-size:15px">Noch keine Einträge. Titel in Garmin Connect z. B. „${split} ${split === "Legs" ? "3x10x180" : split === "Pull" ? "8x90" : "6x100"} @Ort“.</p>${gp ? `<p class="muted" style="margin:6px 0 0;font-size:13px">Ziel ${nf(gp.goal)} kg (geschätztes 1RM)</p>` : ""}</div>`;
      const last = h[h.length - 1];
      const scope = (GCFG.perPlace || []).includes(ex) ? h.filter((e) => e.place === last.place) : h;
      const best = scope.reduce((m, e) => (e.e1rm > m.e1rm ? e : m), scope[0]);
      const set = (e) => `${e.sets > 1 ? e.sets + "×" : ""}${e.reps}×${nf(e.weight, e.weight % 1 ? 1 : 0)} kg`;
      const machine = (GCFG.perPlace || []).includes(ex);
      const plan = GYM.liftPlan(GYM_SESS, ex, GCFG);
      return `<div class="card lift">
        <h3>${esc(ex)} <span class="muted" style="font-weight:400">${split}</span>${last.pr ? ` <span class="badge good">PR</span>` : ""}${plan.reached ? ` <span class="badge good">Ziel erreicht</span>` : ""}</h3>
        <div class="stats">
          <div class="stat"><small>Letzter Eintrag</small><b>${set(last)}</b><small>${fmtDate(parse(last.date), { day: "2-digit", month: "2-digit" })} @${esc(last.place)}</small></div>
          <div class="stat"><small>Bester Satz${machine ? ` (${esc(last.place)})` : ""}</small><b>${set(best)}</b><small>${fmtDate(parse(best.date), { day: "2-digit", month: "2-digit" })}</small></div>
          <div class="stat"><small>1RM geschätzt${machine ? ` (${esc(last.place)})` : ""}</small><b>${nf(best.e1rm, 1)} kg</b><small>Epley</small></div>
        </div>
        ${goalBar(gp)}
        ${goalBox(plan)}
        <div class="chart" data-lift="${esc(ex)}"></div>
        ${liftLegend(h, placeColor, machine)}
      </div>`;
    }).join("");
    $("#gymLifts").querySelectorAll("[data-lift]").forEach((box) => { const gp = GYM.goalProgress(GYM_SESS, box.dataset.lift, GCFG); liftChart(box, GYM.exerciseHistory(GYM_SESS, box.dataset.lift, GCFG), placeColor, gp ? gp.goal : null); });

    // Split-Verteilung der letzten 4 Wochen
    const c4 = GYM.splitCounts(GYM_SESS, ymdLocal(addDays(now, -27)), todayIso);
    const maxN = Math.max(1, c4.Push, c4.Pull, c4.Legs, c4.ohne);
    const avgPP = (c4.Push + c4.Pull) / 2;
    const short = c4.Legs < avgPP * 0.6 && avgPP >= 2;
    $("#gymSplit").innerHTML = `<h3>Split-Verteilung der letzten 4 Wochen${short ? ` <span class="badge warn">Legs kommen zu kurz</span>` : ""}</h3>
      <div class="split-bars">${[["Push", c4.Push], ["Pull", c4.Pull], ["Legs", c4.Legs], ["ohne Split", c4.ohne]].map(([k, v]) => `<div class="split-row"><span>${k}</span><div class="ready-track"><div class="ready-fill" style="width:${(v / maxN) * 100}%;background:${k === "ohne Split" ? "var(--other)" : "var(--strength)"}"></div></div><b>${v}×</b></div>`).join("")}</div>
      <p class="muted" style="font-size:13px;margin:8px 0 0">${c4.total} Krafteinheiten seit dem ${fmtDate(addDays(now, -27), { day: "2-digit", month: "2-digit" })}${c4.ohne ? ` „ohne Split“: Titel ohne Push/Pull/Legs, z. B. „Gym Bali“.` : ""} Quelle: Garmin-Titel, sonst Strava.</p>`;
  }
  const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /* ---------- 1RM-Ziel (Gym.goalProgress) ---------- */
  function goalBar(gp) {
    if (!gp) return "";
    const where = gp.perPlace && gp.place ? ` in ${esc(gp.place)}` : "";
    if (gp.current == null) return `<div class="goal-bar"><div class="goal-label"><span>Ziel ${nf(gp.goal)} kg, noch kein Eintrag${gp.place ? ` in ${esc(gp.place)}` : ""}</span></div><div class="ready-track goal-track"></div></div>`;
    const label = `Ziel ${nf(gp.goal)} kg, aktuell ${nf(Math.round(gp.current))} kg${where} (${gp.pct} %)`;
    return `<div class="goal-bar">
      <div class="goal-label"><span>${label}</span>${gp.reached ? ` <span class="badge good">Ziel erreicht</span>` : ""}</div>
      <div class="ready-track goal-track" role="progressbar" aria-label="1RM-Ziel" aria-valuemin="0" aria-valuemax="${gp.goal}" aria-valuenow="${Math.round(gp.current)}" aria-valuetext="${label}"><div class="ready-fill" style="width:${Math.min(100, gp.pct)}%;background:${gp.reached ? "var(--good)" : "var(--strength)"}"></div></div>
    </div>`;
  }

  /* ---------- Nächstes Ziel (doppelte Progression, Gym.liftPlan) ---------- */
  const kgTxt = (w) => nf(w, w % 1 ? 1 : 0);
  const setTxt = (e, unit = true) => `${e.sets > 1 ? e.sets + "×" : ""}${e.reps}×${kgTxt(e.weight)}${unit ? " kg" : ""}`;
  const STAG_TXT = (n) => `Seit ${n} Einheiten kein Fortschritt. Optionen: Gewicht ca. 10 % runter und neu aufbauen, Wiederholungsbereich wechseln oder auf Erholung achten.`;
  // Zeile unter „Heute“ für die Hauptübung des nächsten Splits
  function targetLine(split) {
    const ex = GYM && split && (GCFG.mainExercise || GYM.DEFAULTS.mainExercise)[split];
    if (!ex) return "";
    const p = GYM.liftPlan(GYM_SESS, ex, GCFG);
    const txt = p.target ? `Ziel ${esc(ex)}: <b>${setTxt(p.target)}</b> <span class="muted">(zuletzt ${setTxt(p.last, false)})</span>`
      : p.noEntryAtPlace ? `Ziel ${esc(ex)}: <span class="muted">Noch kein Eintrag in ${esc(p.place)} – Startgewicht frei wählen.</span>`
        : `<span class="muted">Noch kein Eintrag für ${esc(ex)} – z. B. „${split} ${split === "Legs" ? "3x10x180" : split === "Pull" ? "8x90" : "6x100"} @Ort“ als Titel.</span>`;
    return `<p class="gym-target">${txt}</p>`;
  }
  // Block in der Übungskarte
  function goalBox(p) {
    const pr = p.prog, range = `${pr.reps[0]}–${pr.reps[1]} Wdh., +${kgTxt(pr.step)} kg`;
    const head = `<small>Nächstes Ziel${p.perPlace && p.place ? ` (${esc(p.place)})` : ""}</small>`;
    const body = p.target ? `<b>${setTxt(p.target)}</b><small>zuletzt ${setTxt(p.last, false)}<br>${range}</small>`
      : p.noEntryAtPlace ? `<span class="muted">Noch kein Eintrag in ${esc(p.place)} – Startgewicht frei wählen.</span><small>${range}<br>Werte anderer Orte werden nicht übernommen</small>`
        : `<span class="muted">Noch kein Eintrag.</span>`;
    return `<div class="lift-goal">${head}${body}</div>${p.stagnation ? `<p class="lift-note">${STAG_TXT(pr.stagnation)}</p>` : ""}`;
  }

  // Legende unter dem 1RM-Diagramm: Orte nur, wenn es mehrere gibt (dann farbige Punkte), PR-Ring
  function liftLegend(h, placeColor, machine) {
    const places = [...new Set(h.map((e) => e.place))];
    const items = (places.length > 1 ? places.map((p) => ({ label: p, color: placeColor(p), shape: "dot" })) : [])
      .concat(h.some((e) => e.pr) ? [{ label: "PR", color: "var(--good)", shape: "ring" }] : []);
    return items.length || machine ? C.legend(items, machine ? `<span class="muted">PR nur am selben Ort</span>` : "") : "";
  }
  function liftChart(box, hist, placeColor, goal) {
    const pts = hist.map((e) => ({ d: parse(e.date), v: e.e1rm, e })), byDate = (a, b) => a.d - b.d;
    const ax = C.padAxis(pts.map((p) => p.v), { include: goal ? [goal] : [] });   // Ziel immer im sichtbaren Bereich
    const last = pts.reduce((a, p) => (p.d >= a.d ? p : a), pts[0]);
    const places = [...new Set(pts.map((p) => p.e.place))], multi = places.length > 1;
    // Ein Ort oder ortsübergreifend verglichen: eine neutrale Linie; sonst Linie je Ort (Maschinen nicht verbinden) + farbige Punkte
    const series = !multi || pts.every((p) => p.e.compareKey === "alle")
      ? [{ pts: pts.slice().sort(byDate), color: "var(--text-2)", dots: !multi }]
      : places.map((pl) => ({ pts: pts.filter((p) => p.e.place === pl).sort(byDate), color: placeColor(pl), dots: false }));
    const aria = `Geschätztes 1RM ${box.dataset.lift || ""}, ${pts.length} ${pts.length === 1 ? "Eintrag" : "Einträge"}, aktuell ${nf(last.v)} kg${goal ? `, Ziel ${nf(goal)} kg` : ""}`;
    mount(box, (W) => {
      box.innerHTML = C.lineChart({
        width: W, height: C.SMALL, aria, y: { ...ax, fmt: tickFmt(ax) }, series,
        scatter: multi ? pts.map((p) => ({ d: p.d, v: p.v, color: placeColor(p.e.place), shape: "dot", r: 3.5 })) : [],
        marks: pts.filter((p) => p.e.pr).map((p) => ({ d: p.d, v: p.v, color: "var(--good)" })),
        refs: goal ? [{ v: goal, label: `Ziel ${nf(goal)}` }] : [],
        latest: { d: last.d, v: last.v, label: nf(last.v) }, hits: pts,
      });
      bindTips(box, (i) => { const p = pts[i]; return tipBox(`${tipDay(p.d)} @${esc(p.e.place)}`, [tRow(multi ? placeColor(p.e.place) : "var(--text-2)", setTxt(p.e), `1RM ${nf(p.v, 1)} kg`)], p.e.pr ? `<b class="t-good">PR</b>` : ""); });
    });
  }


  /* ---------- Trainingskalender (js/calendar.js) ---------- */
  const WD_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const LV_MIX = [0, 50, 74, 100];
  let calSel = null;
  const calColor = (cat, lv) => `color-mix(in srgb, ${(CATS[cat] || CATS.other).color} ${LV_MIX[lv] || 100}%, var(--surface))`;
  const itemLabel = (it) => (it.cat === "strength" ? `Kraft${it.split ? " (" + it.split + ")" : ""}` : SPORT_LABEL[it.sport] || CATS[it.cat].label);
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
      const head = `<b>${WD_LONG[d.weekday]}, ${fmtDate(parse(d.date), { day: "2-digit", month: "2-digit", year: "numeric" })}</b>${d.items.length ? `<div class="muted">${durTxt(d.totalSec)} in ${d.items.length} ${d.items.length === 1 ? "Einheit" : "Einheiten"}</div>` : ""}`;
      if (!d.items.length) return `<div class="cal-detail" role="region" aria-live="polite">${head}<p class="muted" style="margin:4px 0 0">${d.future ? "Noch keine Einheiten." : "Ruhetag."}</p></div>`;
      return `<div class="cal-detail" role="region" aria-live="polite">${head}<ul>${d.items.map((it) => {
        const lift = it.cat === "strength" && it.exercise
          ? `, ${esc(it.exercise)}${it.entry ? ` ${it.entry.sets > 1 ? it.entry.sets + "×" : ""}${it.entry.reps}×${nf(it.entry.weight, it.entry.weight % 1 ? 1 : 0)} kg${it.entry.place ? " @" + esc(it.entry.place) : ""}` : ""}` : "";
        return `<li><i class="swatch" style="background:${(CATS[it.cat] || CATS.other).color}"></i><span><b>${esc(itemLabel(it))}</b><br><span class="muted">${esc(it.name || "")}${lift}</span></span><span class="muted">${durTxt(it.sec)}</span></li>`;
      }).join("")}</ul></div>`;
    };
    const head = `<div class="cal-row cal-head" aria-hidden="true"><span></span>${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((x) => `<span>${x}</span>`).join("")}<span></span></div>`;
    const rows = cal.weeks.map((w, wi) => {
      const selDay = w.days.find((d) => d.date === calSel);
      return `<div class="cal-row${w.flex ? " flex" : ""}">
        <div class="cal-label">${fmtDate(parse(w.monday), { day: "2-digit", month: "2-digit" })}${w.flex ? ` <span class="cal-flex">Flex</span>` : ""}</div>
        ${w.days.map((d, di) => cell(d, wi, di)).join("")}
        <div class="cal-sum">${w.count ? `${nf(w.totalSec / 3600, 1)} h<span class="cal-n">${w.count}×</span>` : "–"}</div>
      </div>${selDay ? detail(selDay) : ""}`;
    }).join("");
    box.innerHTML = head + rows;
    setSum("kalender", [`Diese Woche ${nf(cal.weeks[0].totalSec / 3600, 1)} h`, `${cal.weeks[0].count} Einheiten`]);
    box.querySelectorAll(".cal-cell").forEach((b) => b.addEventListener("click", () => {
      const d = cal.weeks[+b.dataset.w].days[+b.dataset.d];
      calSel = calSel === d.date ? null : d.date;
      calendarSection();
      const again = box.querySelector(`.cal-cell[data-w="${b.dataset.w}"][data-d="${b.dataset.d}"]`);
      if (again) again.focus({ preventScroll: true });
    }));
    $("#calLegend").innerHTML = ["swim", "bike", "run", "strength", "other"].map((c) => `<span><i class="swatch" style="background:${CATS[c].color}"></i>${c === "other" ? "Sonstiges (Klettern, Wandern …)" : CATS[c].label}</span>`).join("")
      + `<span class="cal-lv"><i style="background:${calColor("other", 1)}"></i><i style="background:${calColor("other", 2)}"></i><i style="background:${calColor("other", 3)}"></i> &lt; 45, 45–90, &gt; 90 min</span><span><b>Pu</b> Push, <b>Pl</b> Pull, <b>L</b> Legs</span>`;
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
      ["good", "Im Plan", "Laufen solide", `Längster Straßenlauf ${nf(longestRun, 1)} km${trail ? `, Trail ${nf(trail.km, 1)} km mit ${nf(trail.elev)} Hm` : ""}. Lockere Läufe in Zone 2: ${D.zones.hr[1][0]}–${D.zones.hr[1][1]} bpm – nach Puls, nicht nach Tempo${paceHint() ? ` (grobe Pace laut Zone-2-Auswertung: ${paceHint()})` : ""}. Langen Lauf bis zum Frühjahr langsam auf 20–24 km steigern.`],
      FLEX.active && GYM
        ? ["good", "Schwerpunkt", "Krafttraining im Fokus", (() => {
          const now = new Date(), gym4 = GYM.splitCounts(GYM_SESS, ymdLocal(addDays(now, -27)), ymdLocal(now)).total;
          const minGym = (FCFG.minimum || {}).gym || 4;
          return `${gym4} Krafteinheiten in den letzten 4 Wochen (Ø ${nf(gym4 / 4, 1)}/Woche). Bis ${fmtDate(FLEX.until, { day: "2-digit", month: "2-digit" })} liegt der Schwerpunkt auf dem Gym – Wochen-Minimum ${minGym}× Gym. Danach neben dem Ausdauertraining auf 1–2 Erhaltungseinheiten pro Woche reduzieren.`;
        })()]
        : ["good", "Stärke", "Krafttraining konsequent", `${str} Krafteinheiten in ${weeks.length} Wochen (Ø ${nf(str / weeks.length, 1)}/Woche). Ideal für Grundlage 1 – ab Februar auf 1–2 Erhaltungseinheiten reduzieren.`],
      FLEX.active
        ? ["neutral", "Flex", FLEX.label, `Bis ${fmtDate(FLEX.until, { day: "2-digit", month: "2-digit" })} zählt das Wochen-Minimum statt eines Umfangsziels: Schwerpunkt Gym, Ausdauer zur Erhaltung. In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche.`]
        : [tri3 < 5 ? "warn" : "good", tri3 < 5 ? "Achtung" : "Gut", "Reise-Wochen", `In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche (Klettern, Reisen). Kein Problem in der Grundlage – danach wieder Richtung 8–11 h aufbauen.`],
      ["good", "Fokus", "Zone 2 verbessern", `Herzfrequenz-Zone 2: ${D.zones.hr[1][0]}–${D.zones.hr[1][1]} bpm. Die Entwicklung wird aus deinen Läufen und Fahrten berechnet …`, "z2Insight"],
    ];
    const warn = items.find((i) => i[0] === "warn");
    setSum("stand", [`${items.length} Einschätzungen`, warn ? warn[2] : null]);
    $("#insights").innerHTML = items.map(([cls, badge, title, text, id]) => `<div class="card insight"${id ? ` id="${id}"` : ""}><span class="badge ${cls}">${badge}</span><div><b>${title}</b><p>${text}</p></div></div>`).join("");
  }

  /* ---------- Aktivitäten ---------- */
  let filter = "all", showAll = false;
  const ACT_LIMIT = 10;
  function activities() {
    const filters = [["all", "Alle"], ["swim", "Schwimmen"], ["bike", "Rad"], ["run", "Laufen"], ["strength", "Kraft"], ["other", "Sonstiges"]];
    $("#actFilter").innerHTML = filters.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("");
    $("#actFilter").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; showAll = false; activities(); }));
    const list = filter === "all" ? acts : acts.filter((a) => a.cat === filter);
    $("#actSub").textContent = `Alle ${acts.length} Aktivitäten seit ${fmtDate(acts[acts.length - 1].date)}.`;
    setSum("aktivitaeten", `${acts.length} Einträge`);
    $("#actCount").textContent = list.length > ACT_LIMIT && !showAll ? `${ACT_LIMIT} von ${list.length}` : `${list.length} Einträge`;
    $("#actList").innerHTML = list.slice(0, showAll ? list.length : ACT_LIMIT).map((a) => {
      const main = a.km ? (a.cat === "swim" ? `${nf(a.km * 1000)}<small>m</small>` : `${nf(a.km, 1)}<small>km</small>`) : `${hm(a.sec)}<small>h</small>`;
      const extra = [a.km ? `${hm(a.sec)} h` : null, a.info || null, a.elev ? `${nf(a.elev)} hm` : null].filter(Boolean).join(", ");
      return irow({
        lead: rowIcon(a.cat), title: esc(a.name),
        sub: `${fmtDate(a.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${esc(SPORT_LABEL[a.sport] || a.sport)}`,
        val: `<b>${main}</b>${extra ? `<small>${esc(extra)}</small>` : ""}`,
      });
    }).join("");
    const more = $("#actMore");
    more.hidden = list.length <= ACT_LIMIT;
    more.textContent = showAll ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`;
    more.setAttribute("aria-expanded", String(showAll));
  }


  /* ---------- Datenstand: Warnung bei ausgefallenem Sync (js/freshness.js) ---------- */
  const FRESH_KEY = "ironman.freshDismiss";
  function freshBanner() {
    const el = $("#freshBanner"), FR = window.Freshness;
    if (!FR) { $("#snap").textContent = fmtDate(snap); return; }
    const GD = window.GARMIN;
    // neuester Garmin-Tag mit Schlafwert – zeigt, wann die Uhr zuletzt synchronisiert hat
    const lastSleep = GD && (GD.days || []).filter((d) => d.sleepH != null || d.sleepScore != null).map((d) => d.date).sort().pop();
    const f = FR.freshness({
      now: new Date(),
      strava: { snapshotAt: S.snapshotAt, snapshotDate: S.snapshotDate },
      garmin: GD ? { updated: GD.updated, lastDay: lastSleep || null } : null,
      cfg: window.TRAINING.freshness || {},
    });
    $("#snap").textContent = f.footer || fmtDate(snap);
    let dismissed = null;
    try { dismissed = localStorage.getItem(FRESH_KEY); } catch (e) { /* ignore */ }
    if (!f.messages.length || dismissed === f.stamp) { el.hidden = true; return; }
    const DOT = { warn: "ok", bad: "bad", info: "na" };
    const LBL = { warn: "Hinweis", bad: "Warnung", info: "Info" };
    el.className = `fresh-banner ${f.worst}`;
    el.innerHTML = `<div class="fresh-list">${f.messages.map((m) => `<p class="fresh-item">
        <span class="dot ${DOT[m.level]}" aria-hidden="true"></span><span><span class="sr-only">${LBL[m.level]}: </span><b>${esc(m.text)}</b>${m.tip
          ? ` <span class="fresh-tip">Tipp: ${m.tip.href ? `<a href="${esc(m.tip.href)}" target="_blank" rel="noopener">${esc(m.tip.text)}</a>` : esc(m.tip.text)}</span>` : ""}</span></p>`).join("")}</div>
      <button type="button" class="btn-text fresh-close" aria-label="Warnung bis zum nächsten Update ausblenden">Ausblenden</button>`;
    el.hidden = false;
    el.querySelector(".fresh-close").addEventListener("click", () => {
      try { localStorage.setItem(FRESH_KEY, f.stamp); } catch (e) { /* ignore */ }
      el.hidden = true;
    });
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
      add("Sleep Score", `${v}${today.sleepH ? ` (${nf(today.sleepH, 1)} h)` : ""}`, v >= 80 ? "good" : v >= 60 ? "ok" : "bad", v);
    }
    if (today.hrv != null || today.hrvStatus) {
      const st = today.hrvStatus;
      let score = st === "BALANCED" ? 85 : st === "UNBALANCED" ? 55 : st ? 30 : null;
      if (score == null && today.hrvWeekly) { const r = today.hrv / today.hrvWeekly; score = Math.max(0, Math.min(100, (r - 0.7) / 0.3 * 100)); }
      add("HRV", `${today.hrv ?? "–"} ms${st ? " (" + (HRV_DE[st] || st) + ")" : ""}`, score >= 70 ? "good" : score >= 45 ? "ok" : "bad", score);
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
  const PHASE_SCALE = { "Einstieg": 0.9, "Grundlage 1": 1, "Wiedereinstieg": 1, "Grundlage 2": 1.15, "Aufbau 1": 1.3, "Aufbau 2": 1.5, "Peak": 1.6, "Taper": 0.6 };
  // Wiedereinstieg nach Flex: wie Grundlage, aber kürzer, keine Intervalle, Zone 2 nach Puls, 3× Schwimmtechnik, Gym 2–3×
  const REENTRY_WEEK = [
    { sport: "strength", title: "Kraft (reduziert) & Mobility", min: 45, type: "easy", detail: "Ganzkörper mit 1–2 Sätzen weniger als im Gym-Block, danach 10 min Mobility. Gym diese Woche 2–3×." },
    { sport: "swim", title: "Schwimmen Technik", min: 40, type: "easy", detail: "Drills (Abschlag, Catch-up, Seitlage), 8 × 50 m sauber, ruhige Atmung – kein Tempo." },
    { sport: "bike", title: "Rad locker", min: 60, type: "easy", detail: "Nur Zone 2 nach Puls ({hr2}), Trittfrequenz 85–95, keine Intervalle." },
    { sport: "swim", title: "Schwimmen Technik + lockerer Lauf", min: 70, type: "easy", detail: "35 min Technik-Schwimmen, danach 30 min Lauf nur in Zone 2 nach Puls ({hr2})." },
    { sport: "strength", title: "Kraft (reduziert) oder Ruhetag", min: 40, type: "easy", detail: "Hatte die Woche schon 2–3× Gym: Ruhetag oder 20 min Mobility." },
    { sport: "bike", title: "Rad Grundlage + Technik-Schwimmen", min: 105, type: "easy", detail: "75 min Rad ruhig in Zone 2 nach Puls ({hr2}), flach bis wellig. Dazu 30 min Technik-Schwimmen." },
    { sport: "run", title: "Lauf locker", min: 45, type: "easy", detail: "Gleichmäßig in Zone 2 nach Puls ({hr2}) – lieber langsamer als zu schnell." },
  ];
  const REENTRY_ARRIVAL = { sport: "other", title: "Locker ankommen", min: 30, type: "easy", detail: "Nach dem Rückflug: 30 min ganz locker (Spaziergang, lockeres Rad oder Schwimmen), Mobility, viel trinken und früh schlafen. Kein Training nach Plan." };
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
    .replace("{z2}", `${mmss(1000 / D.zones.run[1][1])}–${mmss(1000 / D.zones.run[1][0])} /km`)
    .replace("{hr2}", `${D.zones.hr[1][0]}–${D.zones.hr[1][1]} bpm`);
  const roundMin = (m) => Math.max(20, Math.round(m / 5) * 5);
  const fmtMin = (m) => (m >= 90 ? `${hm(m * 60)} h` : `${m} min`);

  function suggestion(now, rd) {
    const phase = currentPhase(now);
    let scale = PHASE_SCALE[phase?.short] ?? 1;
    let base = WEEK[(now.getDay() + 6) % 7];
    if (phase && phase.key === "reentry") {
      // erste 2–3 Tage nach dem Rückflug nur locker, danach Umfang Woche für Woche steigern (80 %, 90 %, 100 %)
      const day = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - phase.start) / DAY);
      base = day < 3 ? REENTRY_ARRIVAL : REENTRY_WEEK[(now.getDay() + 6) % 7];
      scale = Math.min(1, 0.8 + 0.1 * Math.floor(day / 7));
    }
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
  // Grobe Zone-2-Pace aus den letzten gewerteten Läufen (Median −10 / +20 s), null solange keine Daten
  function z2PaceRange() {
    if (!Z2DATA) return null;
    const vals = Z2DATA.activities.filter((r) => r.pace).slice(-5).map((r) => r.pace.sec).sort((a, b) => a - b);
    if (!vals.length) return null;
    const med = vals[Math.floor(vals.length / 2)];
    return [med - 10, med + 20];
  }
  function paceHint() {
    const r = z2PaceRange();
    return r ? `ca. ${mmss(r[0])}–${mmss(r[1])} /km` : null;
  }

  const standLine = `<p class="muted" style="font-size:12px;margin:6px 0 0">Strava-Stand ${fmtDate(snap, { day: "2-digit", month: "2-digit" })} – neue Einheiten kommen mit dem nächsten Update (mittags und abends).</p>`;

  function flexPlan(now, rd) {
    const eq = loadEquipment();
    const sg = FX.suggestFlex({ now, acts: flexActs, equipment: eq, level: rd ? rd.level : 0, cfg: FCFG, zones: D.zones.hr, paceHint: paceHint() });
    const chips = Object.entries(FX.EQUIPMENT).map(([k, label]) => `<button class="chip check" type="button" data-eq="${k}" aria-pressed="${eq.includes(k)}">${label}</button>`).join("");
    const e = sg.endurance;
    return `
      <div class="card today-plan">
        <div class="mini-title" style="margin-top:0">Vorschlag für ${fmtDate(now, { weekday: "long", day: "numeric", month: "long" })} (Flex)</div>
        <div class="equip" role="group" aria-label="Ausstattung vor Ort">${chips}</div>
        <div class="flex-sug">
          <div><span class="mini-title" style="margin:0">Gym</span>
            <h3 style="font-size:22px;margin:2px 0"><i class="swatch" style="background:var(--strength)"></i>${esc(sg.gym.title)}</h3>
            <p class="muted" style="margin:0;font-size:15px">${esc(sg.gym.detail)}</p>${sg.gym.rest ? "" : targetLine(sg.next && sg.next.split)}</div>
          <div><span class="mini-title" style="margin:0">Ausdauer${e && e.done ? "" : ", optional"}${e && e.forMinimum ? ", fürs Wochen-Minimum" : ""}</span>
            ${e ? `<h3 style="font-size:17px;margin:2px 0"><i class="swatch" style="background:${CATS[e.type === "swim" ? "swim" : e.type === "bike" ? "bike" : "run"].color}"></i>${esc(e.title)}, ${e.minutes} min</h3>
            <p class="muted" style="margin:0;font-size:15px">${esc(e.detail)}</p>` : `<p class="muted" style="margin:2px 0 0;font-size:15px">${rd && rd.level >= 3 ? "Heute keine Ausdauer." : "Keine passende Ausstattung gewählt."}</p>`}</div>
        </div>
        ${sg.notes.length ? `<p class="muted" style="font-size:13px;line-height:18px;margin:12px 0 0">${sg.notes.map(esc).join("<br>")}</p>` : ""}
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
        <h3 style="font-size:22px;margin:4px 0 2px"><i class="swatch" style="background:${color}"></i>${esc(s.title)}</h3>
        <div class="muted" style="font-size:15px;line-height:20px;margin-bottom:12px">${s.type === "rest" ? "Ruhetag" : fmtMin(s.min)}, ${s.type === "hard" ? "intensiv" : s.type === "rest" ? "Erholung" : "locker"}${s.phase ? `, Phase ${esc(s.phase.short)}` : ""}${s.changed ? `<br><b>angepasst: ${esc(s.changed)}</b>` : ""}</div>
        <p style="margin:0">${esc(s.detail)}</p>
        ${done.length ? `<div class="mini-title">Heute schon erledigt</div><ul class="ios-list ic">${done.map((a) => irow({ lead: rowIcon(a.cat), title: esc(a.name), val: `${hm(a.sec)} h` })).join("")}</ul>` : ""}
        <div id="sinceBox"></div>
        ${standLine}
      </div>`;
    $("#today").innerHTML = `<div class="today-main">${planCard}<div class="card week-card" id="weekCard" aria-live="polite"></div></div>` + `
      <div class="card today-form">
        <div class="mini-title" style="margin-top:0">Form heute</div>
        ${rd ? `
          <div class="form-score"><b>${rd.R}</b><span class="badge ${lv.cls}">${lv.label}</span></div>
          <div class="muted" style="font-size:13px;margin:2px 0 10px">${FLEX.active ? FLEX_LEVEL_TEXT[rd.level] : lv.text}${rd.notes.length ? " Grund: " + esc(rd.notes.join(", ")) + "." : ""}</div>
          <ul class="ios-list dots">${rd.factors.map((x) => irow({ lead: `<span class="row-dot dot ${x.state}" aria-hidden="true"></span>`, title: `${x.label}<span class="sr-only"> – ${x.state === "good" ? "gut" : x.state === "ok" ? "mittel" : "schlecht"}</span>`, val: `<b>${esc(x.value)}</b>` })).join("")}</ul>
          <div class="muted" style="font-size:13px;line-height:18px;margin-top:8px">${esc(rd.source)}<br>Garmin-Daten vom ${fmtDate(rd.date, { day: "2-digit", month: "2-digit" })}${isOld ? " – <b>nicht von heute</b>" : ""}</div>`
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
  const REC_FMT = { sleepH: (v) => `${hm(v * 3600)}<small>h</small>`, sleepScore: (v) => nf(v), hrv: (v) => `${nf(v)}<small>ms</small>`, rhr: (v) => `${nf(v)}<small>bpm</small>` };
  const REC_CAT = { sleepH: "sleep", sleepScore: "sleep", hrv: "heart", rhr: "heart" };
  function renderWeek(now) {
    const box = $("#weekCard");
    if (!box) return;
    if (!WK) { box.hidden = true; return; }
    const thisMon = monday(now), maxBack = (WCFG.weeksBack || 8) - 1;
    if (wkOffset == null) wkOffset = Math.round((thisMon - WK.defaultWeekStart(now)) / (7 * DAY));
    const s = WK.weeklySummary({
      acts, gymSessions: GYM_VIEW, garminDays: gDays, garminLoads: G.loads || null, today: now, weekStart: addDays(thisMon, -7 * wkOffset),
      cfg: { weekly: WCFG, flex: FCFG, gym: GCFG, sinceLast: window.TRAINING.sinceLast || {} },
      equipment: FLEX.active ? loadEquipment() : null,
      emphasizeLoad: PHASES.some((p) => p.key === "reentry" && p.start < addDays(thisMon, -7 * wkOffset + 7) && p.end > addDays(thisMon, -7 * wkOffset)),
    });
    const dm = (iso) => fmtDate(parse(iso), { day: "2-digit", month: "2-digit" });
    const sp = s.gym.splits;
    const splitTxt = ["Push", "Pull", "Legs"].filter((k) => sp[k]).map((k) => `${sp[k]} ${k}`).concat(sp.ohne ? [`${sp.ohne} ohne Split`] : []).join(", ");
    const sport = (x) => `<span class="wk-sport"><i class="swatch" style="background:${CATS[x.cat].color}"></i>${CATS[x.cat].label} ${x.count}×, ${durTxt(x.sec)}</span>`;
    const endu = s.sports.filter((x) => x.cat !== "other"), other = s.sports.find((x) => x.cat === "other");
    const pct = s.totalDiffPct;
    const rows = [
      ["Gym", s.gym.count ? `${s.gym.count}× Gym${splitTxt ? `: ${splitTxt}` : ""}${s.gym.goals ? `<div class="wk-sub">Ziele erreicht: ${s.gym.goals.reached}/${s.gym.goals.total}</div>` : ""}${s.gym.lifts.length ? `<div class="muted wk-sub">${s.gym.lifts.map((l) => esc(l.text)).join("<br>")}</div>` : ""}` : `<span class="muted">kein Gym</span>`],
      ["Ausdauer", (endu.length ? endu.map(sport).join("") : `<span class="muted">keine</span>`) + (other ? sport(other) : "")],
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
      ${s.empty ? "" : `<div class="mtiles">${htile({ mini: true, cat: "activity", label: "Gesamt", value: `${nf(s.totalSec / 3600, 1)}<small>h</small>`, sub: s.avg4Sec ? `Ø 4 Wochen davor ${nf(s.avg4Sec / 3600, 1)}&nbsp;h (${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}&nbsp;%)` : "" })}${htile({ mini: true, cat: "other", label: "Einheiten", value: `${s.count}`, sub: s.running ? "Woche läuft noch" : "" })}</div>
        <div class="mini-title">Training</div><dl class="wk-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`}
      ${loadBlock(s)}
      ${s.recovery ? `<div class="mini-title">Erholung (Garmin, Ø der Woche)</div>
        <div class="mtiles four">${s.recovery.map((r) => htile({ mini: true, cat: REC_CAT[r.key] || "other", label: r.label, value: r.value == null ? "–" : REC_FMT[r.key](r.value),
          time: r.trend ? `<em class="wk-trend" title="${TREND[r.trend][1]}">${TREND[r.trend][0]}</em><span class="sr-only">${TREND[r.trend][1]}</span>` : "" })).join("")}</div>` : ""}
      ${s.hints.length ? `<div class="mini-title">Hinweise</div><ul class="wk-hints">${s.hints.map((h) => `<li${h.strong ? ' class="wk-hint-strong"' : ""}>${h.strong ? `<span class="badge warn">Wiedereinstieg</span> ` : ""}${esc(h.text)}</li>`).join("")}</ul>` : ""}`;
    box.querySelectorAll("[data-wk]").forEach((b) => b.addEventListener("click", () => {
      wkOffset = Math.min(maxBack, Math.max(0, wkOffset + Number(b.dataset.wk)));
      renderWeek(now);
      const again = box.querySelector(`[data-wk="${b.dataset.wk}"]`);
      if (again && !again.disabled) again.focus({ preventScroll: true });
    }));
    // Belastungsdiagramm: Tooltip je Woche, Antippen wählt die Woche
    if (s.load) loadChart(box.querySelector(".load-box"), s.load, now);
  }

  // Trainingsbelastung (Garmin) – nur echte Werte, Einheiten ohne Wert werden genannt statt geschätzt
  const LOAD_ORDER = ["strength", "other", "endurance"];   // von unten nach oben (Kraft-Violett und Ausdauer-Blau nie nebeneinander)
  const LOAD_COLORS = { strength: "var(--strength)", endurance: "var(--cat1)", other: "var(--other)" };
  const LOAD_LABEL = { strength: "Kraft", endurance: "Ausdauer", other: "Sonstiges" };
  const LOAD_STATUS = { LOW: "niedrig", OPTIMAL: "optimal", HIGH: "hoch", VERY_HIGH: "sehr hoch" };
  function loadChart(box, L, now) {
    if (!box) return;
    const weeks = L.weeks.slice().reverse(), sel = weeks.length - 1 - L.index, cur = weeks.length - 1;   // älteste links, aktuelle Woche rechts
    const ax = C.zeroAxis(Math.max(1, ...weeks.map((w) => w.total)));
    const aria = `Trainingsbelastung der letzten ${weeks.length} Wochen (Garmin): ${weeks.map((w) => `${dmS(parse(w.monday))} ${w.n ? nf(w.total) : "keine Werte"}`).join(", ")}`;
    const tip = (i) => {
      const w = weeks[i];
      return tipBox(`${dmS(parse(w.monday))} – ${dmS(addDays(parse(w.monday), 6))}`,
        w.n ? LOAD_ORDER.slice().reverse().map((k) => tRow(LOAD_COLORS[k], LOAD_LABEL[k], nf(w[k]))).concat(tSum("Summe", nf(w.total))) : [], w.n ? "" : "keine Belastungswerte");
    };
    mount(box, (W) => {
      box.innerHTML = C.barChart({
        width: W, height: C.SMALL, aria, maxBar: 26, currentBg: "var(--surface-2)", y: { ...ax, fmt: tickFmt(ax) },   // aktuelle Woche neutral
        bands: weeks.map((w, i) => ({
          label: dmS(parse(w.monday)), current: i === cur, selected: i === sel && i !== cur, topLabel: i === sel && w.n ? nf(w.total) : null,
          stacks: LOAD_ORDER.map((k) => ({ v: w[k], color: LOAD_COLORS[k] })),
        })),
      });
      // Antippen/Klicken wählt die Woche; auf dem Touchscreen danach kurz den Tooltip zeigen
      bindTips(box, tip, (i, ev, ptr) => { wkOffset = weeks.length - 1 - i; renderWeek(now); if (ptr !== "mouse") showTip(tip(i), ev); });
    });
  }
  function loadBlock(s) {
    const L = s.load;
    if (!L) return G.loads ? "" : `<div class="mini-title">Belastung (Garmin)</div><p class="muted wk-note">Belastungswerte kommen mit dem nächsten Garmin-Update.</p>`;
    const pct = L.diffPct;
    const head = L.sum == null ? `<span class="muted">Keine Belastungswerte in dieser Woche.</span>`
      : `Trainingsbelastung: <b>${nf(L.sum)}</b>${L.prevSum != null ? ` <span class="muted" style="white-space:nowrap">(Vorwoche ${nf(L.prevSum)}${pct != null ? `, ${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} %` : ""})</span>` : ""}`;
    const ac = L.acute != null ? `<p class="wk-load-line">Akut ${nf(L.acute)}, chronisch ${nf(L.chronic)}${L.ratio != null ? `, Verhältnis ${nf(L.ratio, 1)}` : ""}${L.status && LOAD_STATUS[L.status] ? `<br>Garmin: <b>${LOAD_STATUS[L.status]}</b>` : ""} <span class="muted">(Stand ${fmtDate(parse(L.statusDate), { day: "2-digit", month: "2-digit" })})</span></p>` : "";
    return `<div class="mini-title">Belastung (Garmin)</div>
      <p class="wk-load-line">${head}</p>
      <div class="chart load-box"></div>
      ${C.legend(LOAD_ORDER.slice().reverse().map((k) => ({ label: LOAD_LABEL[k], color: LOAD_COLORS[k] })))}
      ${ac}
      ${L.withoutLoad ? `<p class="muted wk-note">${L.withoutLoad} ${L.withoutLoad === 1 ? "Einheit" : "Einheiten"} ohne Belastungswert</p>` : ""}
      <p class="muted wk-note">Garmin berechnet die Belastung aus dem Puls. Krafttraining wird dabei nur schwach abgebildet.</p>`;
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
    const detail = (x) => {
      if (!x.last) return `<b>${esc(x.label)}</b>: seit der Anmeldung (${fmtDate(commit, { day: "2-digit", month: "2-digit", year: "numeric" })}) noch keine Einheit${x.minMinutes ? ` ab ${fmtMin(x.minMinutes)}` : ""}.`;
      const a = x.last;
      return `<b>${esc(x.label)}</b>: zuletzt ${fmtDate(a.date, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}: ${esc(a.title || a.name || "")}${a.sec ? `, ${a.sec >= 3600 ? hm(a.sec) + " h" : Math.round(a.sec / 60) + " min"}` : ""}${x.minMinutes ? ` <span class="muted">(zählt ab ${fmtMin(x.minMinutes)})</span>` : ""}`;
    };
    box.innerHTML = `
      <div class="mini-title">Zuletzt gemacht</div>
      <ul class="ios-list dots since-list">${items.map((x) => `<li>
        <button type="button" class="ios-row since-row ${x.state}" data-since="${x.key}" aria-expanded="${sinceSel === x.key}"
          aria-label="${esc(`${x.label}: ${x.text} – ${SINCE_STATE[x.state]}`)}">
          <span class="row-dot dot ${SINCE_DOT[x.state]}" aria-hidden="true"></span>
          <span class="row-main"><span class="row-title">${esc(x.label)}</span>${x.note ? `<span class="row-sub">${esc(x.note)}</span>` : ""}</span>
          <span class="row-val">${esc(x.text)}</span>${CHEV_R}
        </button>${sinceSel === x.key ? `<p class="since-detail" aria-live="polite">${detail(x)}</p>` : ""}</li>`).join("")}
      </ul>`;
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
    const v = (x, d = 0, unit = "") => (x == null ? "–" : `${nf(x, d)}${unit ? `<small>${unit}</small>` : ""}`);
    const when = (k) => (gLast(k) ? dayLabel(gLast(k).date) : "");
    const sleepVal = (h) => { if (h == null) return "–"; let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${H}<small>h</small> ${M}<small>min</small>`; };
    const a = (k, d = 0, unit = "") => (avg7(k) == null ? "" : `Ø 7 Tage: ${nf(avg7(k), d)}${unit}`);
    const st = gLast("trainingStatus");
    // Die vier wichtigsten als Kacheln, der Rest als gruppierte Liste
    const tiles = [
      htile({ cat: "sleep", label: "Schlaf", time: when("sleepH"), value: sleepVal(last("sleepH")), sub: last("sleepScore") != null ? `Sleep Score ${nf(last("sleepScore"))}` : a("sleepH", 1, " h") }),
      htile({ cat: "heart", label: "HRV", time: when("hrv"), value: v(last("hrv"), 0, "ms"), sub: gLast("hrvStatus") ? HRV_DE[last("hrvStatus")] || last("hrvStatus") : a("hrv", 0, " ms") }),
      htile({ cat: "heart", label: "Ruhepuls", time: when("rhr"), value: v(last("rhr"), 0, "bpm"), sub: a("rhr", 0, " bpm") }),
      htile({ cat: "activity", label: "Bereitschaft", time: when("readiness"), value: v(last("readiness")), sub: last("recoveryH") != null ? `Erholungszeit ${nf(last("recoveryH"))} h` : "" }),
    ];
    const more = [
      ["sleep", "Sleep Score", v(last("sleepScore")), a("sleepScore")],
      ["activity", "Body Battery", v(last("bbHigh"), 0, "max"), last("bbNow") != null ? `aktuell ${last("bbNow")}` : ""],
      ["heart", "Stress Ø", v(last("stressAvg")), a("stressAvg")],
      ["activity", "Trainingsstatus", st ? esc(statusDe(st.trainingStatus)) : "–", last("acuteLoad") != null ? `Belastung akut ${nf(last("acuteLoad"))}, chronisch ${nf(last("chronicLoad") || 0)}` : ""],
      ["run", "VO2max Laufen", v(last("vo2run"), 1), ""],
      ["bike", "VO2max Rad", v(last("vo2bike"), 1), ""],
      ["body", "Gewicht", v(last("weight"), 1, "kg"), last("bodyFat") != null ? `Körperfett ${nf(last("bodyFat"), 1)} %` : ""],
      ["activity", "Schritte", v(last("steps")), a("steps")],
    ].filter((r) => r[2] !== "–");
    // Titel, Name/Einheit für Tooltip und aria-label, Nachkommastellen, feste Grenzen (Sleep Score, Body Battery: 0–100)
    const charts = [
      ["sleepScore", "Sleep Score", "Sleep Score", "", 0, [0, 100]],
      ["hrv", "HRV (ms)", "HRV", " ms", 0, null],
      ["rhr", "Ruhepuls (bpm)", "Ruhepuls", " bpm", 0, null],
      ["bbHigh", "Body Battery (Tageshoch)", "Body Battery", "", 0, [0, 100]],
      ["vo2run", "VO2max Laufen", "VO2max Laufen", "", 1, null],
      ["weight", "Gewicht (kg)", "Gewicht", " kg", 1, null],
    ].map(([k, label, name, unit, dec, clamp]) => ({ k, label, name, unit, fmt: (x) => nf(x, dec), clamp, pts: gDays.slice(-60).filter((d) => d[k] != null).map((d) => ({ d: parse(d.date), v: d[k], raw: d })) }))
      .filter((c) => c.pts.length >= 2);
    el.innerHTML = `<div class="grid g4">${tiles.join("")}</div>` +
      (more.length ? `<div class="card list-card" style="margin-top:16px"><ul class="ios-list ic">${more.map(([cat, label, value, sub]) => irow({ lead: rowIcon(cat), title: label, sub, val: `<b>${value}</b>` })).join("")}</ul></div>` : "") +
      (charts.length ? `<div class="rec-more"><button type="button" class="btn-text rec-toggle" aria-expanded="true" aria-controls="erholungVerlauf-body">Verläufe ausblenden</button></div>
        <div class="sec-body" id="erholungVerlauf-body"><div class="grid g3" style="margin-top:12px">${charts.map((c, i) => `<div class="card"><h3>${c.label}</h3><div class="chart" id="gchart${i}"></div></div>`).join("")}</div></div>` : "");
    REC_CHARTS = charts;
    if (charts.length) {
      const btn = el.querySelector(".rec-toggle");
      UNITS.erholungVerlauf = { btn, body: $("#erholungVerlauf-body"), sum: null, host: null, label: (open) => { btn.textContent = open ? "Verläufe ausblenden" : "Verläufe anzeigen"; } };
      btn.addEventListener("click", () => toggleUnit("erholungVerlauf"));
      applyUnit("erholungVerlauf", LOPEN.erholungVerlauf !== false, false, false);
      drawRecoveryCharts();   // eingeklappt: wird beim Aufklappen in echter Breite gezeichnet
    }
    $("#recoverySub").textContent = `Garmin-Daten, zuletzt aktualisiert ${G.updated ? new Date(G.updated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " Uhr" : "–"}. Verläufe: letzte 60 Tage.`;
  }

  let REC_CHARTS = [];
  function drawRecoveryCharts() {
    REC_CHARTS.forEach((c, i) => {
      const ax = C.padAxis(c.pts.map((p) => p.v), { clamp: c.clamp }), last = c.pts[c.pts.length - 1];
      trendLine($(`#gchart${i}`), c.pts, {
        color: "var(--text-2)", axis: ax, fmt: tickFmt(ax), val: c.fmt,
        aria: `${c.name} letzte 60 Tage, aktuell ${c.fmt(last.v)}${c.unit}`,
        tip: (p) => tipBox(tipDay(p.d), [tRow("var(--text-2)", c.name, c.fmt(p.v) + c.unit)]),
      });
    });
  }

  /* ---------- Einklappbare Abschnitte (js/layout.js) ---------- */
  const LAY = window.Layout, LCFG = window.TRAINING.layout || {}, LAY_KEY = "ironman.layout";
  const LAY_PHASE = LAY ? LAY.phaseOf(FLEX.active) : "normal";
  const UNITS = {};   // id → { btn, body, sum, host, label }
  let LOPEN = {}, laySaved = null;
  const CHEV = `<svg class="sec-chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  // Beim Aufklappen: Diagramme im Abschnitt mit echter Breite zeichnen (redrawCharts), dazu Sonderfälle
  const REDRAW = {
    saison: () => layoutTimeline(true),
  };
  const redrawUnit = (id, body) => { redrawCharts(body); if (REDRAW[id]) REDRAW[id](); };
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const loadLayout = () => { try { return JSON.parse(localStorage.getItem(LAY_KEY) || "null"); } catch (e) { return null; } };
  const saveLayout = (v) => { try { if (v) localStorage.setItem(LAY_KEY, JSON.stringify(v)); else localStorage.removeItem(LAY_KEY); } catch (e) { /* ignore */ } };
  function layoutState() {
    const ids = Object.keys(UNITS).concat(["erholungVerlauf"]);
    if (!LAY) return Object.fromEntries(ids.map((id) => [id, true]));
    const r = LAY.resolve({ ids, cfg: LCFG, phase: LAY_PHASE, saved: loadLayout() });
    if (r.reset) saveLayout(null);   // Wahl aus der vorigen Phase verwerfen
    laySaved = r.saved;
    return r.open;
  }
  // Kurzfassung neben der Überschrift; mehrere Angaben als Liste → mit Abstand statt „·“
  function setSum(id, text) {
    const u = UNITS[id];
    if (!u || !u.sum) return;
    const parts = (Array.isArray(text) ? text : [text]).filter(Boolean);
    u.sum.innerHTML = parts.map((t) => `<span>${esc(t)}</span>`).join("");
    u.sum.hidden = LOPEN[id] !== false || !parts.length;
  }
  function setupSections() {
    document.querySelectorAll("section[data-collapse]").forEach((sec) => {
      const h2 = sec.querySelector(":scope > h2");
      if (!h2 || !sec.id) return;
      const id = sec.id, body = document.createElement("div");
      body.className = "sec-body"; body.id = `${id}-body`;
      [...sec.children].filter((c) => c !== h2).forEach((c) => body.appendChild(c));
      const head = document.createElement("div");
      head.className = "sec-head";
      head.innerHTML = `<h2><button type="button" class="sec-toggle" aria-expanded="true" aria-controls="${body.id}"><span class="sec-title">${h2.innerHTML}</span>${CHEV}</button></h2><span class="sec-sum" id="${id}-sum" hidden></span>`;
      h2.replaceWith(head);
      sec.appendChild(body);
      const btn = head.querySelector(".sec-toggle");
      UNITS[id] = { btn, body, sum: head.querySelector(".sec-sum"), host: sec };
      btn.addEventListener("click", () => toggleUnit(id));
    });
  }
  // Auf-/Zuklappen; animate: kurze Höhen-Animation (nicht bei „Bewegung reduzieren“), redraw: Diagramme neu zeichnen
  function applyUnit(id, open, animate = true, redraw = true) {
    const u = UNITS[id];
    if (!u) return;
    LOPEN[id] = open;
    u.btn.setAttribute("aria-expanded", String(open));
    if (u.host) u.host.classList.toggle("is-collapsed", !open);
    if (u.sum) { u.sum.hidden = open || !u.sum.textContent; if (open) u.btn.removeAttribute("aria-describedby"); else u.btn.setAttribute("aria-describedby", u.sum.id); }
    if (u.label) u.label(open);
    const body = u.body, tok = (body._tok = {});
    const done = (fn) => { const f = () => { body.removeEventListener("transitionend", f); if (body._tok === tok) fn(); }; body.addEventListener("transitionend", f); setTimeout(f, 450); };
    if (!animate || reduceMotion()) {
      body.hidden = !open; body.style.height = ""; body.classList.remove("animating");
      if (open && redraw) redrawUnit(id, body);
      return;
    }
    if (open) {
      body.hidden = false;
      if (redraw) redrawUnit(id, body);   // jetzt sichtbar → richtige Breite
      const h = body.scrollHeight;
      body.classList.add("animating"); body.style.height = "0px";
      void body.offsetHeight;
      body.style.height = `${h}px`;
      done(() => { body.style.height = ""; body.classList.remove("animating"); });
    } else {
      body.style.height = `${body.scrollHeight}px`; body.classList.add("animating");
      void body.offsetHeight;
      body.style.height = "0px";
      done(() => { body.hidden = true; body.style.height = ""; body.classList.remove("animating"); });
    }
  }
  function toggleUnit(id) {
    const open = LOPEN[id] === false;
    applyUnit(id, open, true, true);
    if (LAY) { laySaved = LAY.remember(laySaved, LAY_PHASE, id, open); saveLayout(laySaved); }
  }
  // Navigation / Anker: eingeklappten Abschnitt sofort öffnen (nur für diesen Besuch, nicht gespeichert)
  function revealSection(id, scroll) {
    if (!id) return;
    if (UNITS[id] && LOPEN[id] === false) applyUnit(id, true, false, true);
    if (scroll) { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: "start" }); }
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
  setupSections();
  LOPEN = layoutState();
  Object.keys(UNITS).forEach((id) => applyUnit(id, LOPEN[id] !== false, false, false));
  today(); recovery(); gymSection(); calendarSection();
  freshBanner();
  hero(); kpis(); insights(); season(); volumeChart(); disciplines(); raceReady(); predictionHistory(); zone2(); activities();
  document.querySelectorAll('.nav a[href^="#"]').forEach((a) => a.addEventListener("click", () => revealSection(a.getAttribute("href").slice(1), false)));
  window.addEventListener("hashchange", () => revealSection(decodeURIComponent(location.hash.slice(1)), true));
  if (location.hash) requestAnimationFrame(() => revealSection(decodeURIComponent(location.hash.slice(1)), true));
  $("#resetView").addEventListener("click", (e) => {
    e.preventDefault();
    saveLayout(null);
    LOPEN = layoutState();
    Object.keys(UNITS).forEach((id) => applyUnit(id, LOPEN[id] !== false, false, true));
  });
  // Größenänderung (Drehen, Fenster): Diagramme mit neuer Breite zeichnen (zusätzlich zum ResizeObserver)
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { hideTip(); redrawCharts(); layoutTimeline(false); }, 150); });
  $("#z2ZoneFilter").querySelectorAll("button").forEach((c) => c.addEventListener("click", () => { zoneFilter = c.dataset.f; if (Z2DATA) zoneChart(); }));
  $("#toggleOther").setAttribute("aria-pressed", showOther);
  $("#toggleOther").addEventListener("click", (e) => { showOther = !showOther; e.currentTarget.setAttribute("aria-pressed", showOther); volumeChart(); });
  $("#toggleTable").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", on);
    $("#volTable").hidden = !on; $("#volChart").hidden = on;
    if (!on) volumeChart();
  });
})();
