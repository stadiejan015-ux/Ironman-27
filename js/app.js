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

  // Flex-Modus (js/flex.js): bei active=false oder nach "until" verhält sich alles wie bisher
  const FX = window.Flex, FCFG = window.TRAINING.flex || {};
  // Zwift-Fahrten im Flex-Zeitraum zählen nirgends (flex.ignoreVirtualRides): Liste, Woche, Minimum, Kalender, Zone 2, Belastung
  const ignored = (a) => !!(FX && FX.isIgnored && FX.isIgnored(a, FCFG));
  const actsAll = D.activities.map(([date, sport, name, km, sec, elev, info, desc]) => ({
    date: parse(date), sport, name, km, sec, elev, info: info || "", desc: desc || "", cat: cat(sport),
  })).sort((a, b) => b.date - a.date);
  const acts = actsAll.filter((a) => !ignored(a));
  const ignoredCount = actsAll.length - acts.length;

  const snap = parse(D.snapshotDate);
  const snapEnd = addDays(snap, 1);
  const commit = parse(D.commitDate);
  const race = parse(D.race.date);
  const inRange = (from, to) => acts.filter((a) => a.date >= from && a.date < to);
  const FLEX = FX ? FX.flexState(FCFG, new Date()) : { active: false };
  const inFlex = (d) => !!(FX && FX.flexState(FCFG, d).active);
  // Krafteinheiten: Garmin-Titel (Gym-Tracker) vor Strava-Namen, ±10 min zusammengeführt
  // Körpergewicht für Übungen mit Körpergewicht (Klimmzüge): neuerer Wert aus Garmin-Waage und gym.bodyWeight, sonst Strava-Profil
  const GYM = window.Gym, GCFG0 = window.TRAINING.gym || {};
  const BODY = GYM ? GYM.currentBodyKg((window.GARMIN && window.GARMIN.days) || [], GCFG0.bodyWeight, S.athlete && S.athlete.weightKg) : null;
  const BODY_KG = BODY ? BODY.kg : null;
  const GCFG = { ...GCFG0, bodyKg: BODY_KG };
  const isBodyweight = (ex) => (GCFG.bodyweight || []).includes(ex);
  const GYM_SESS = GYM ? GYM.gymSessions((window.GARMIN && window.GARMIN.activities) || [], acts.filter((a) => a.cat === "strength"), GCFG, acts.filter((a) => a.cat !== "strength")) : [];
  // Für den Flex-Modus: Ausdauer aus Strava, Kraft aus den zusammengeführten Einheiten
  const flexActs = GYM && FX ? FX.mergeActs(acts, GYM_SESS) : acts;
  // Für Anzeigen: Strava-Name, wenn der Garmin-Titel nur „Krafttraining“ ist (Kalender, Wochenkarte)
  const GYM_VIEW = GYM_SESS.map((x) => ({ ...x, name: x.alt || x.name }));
  // Name in Listen: bei Krafteinheiten der Garmin-Titel (wie im Gym-Tracker), sonst der Strava-Name
  const actName = (a) => (a.cat === "strength" && GYM ? GYM.displayName(a, GYM_SESS, GCFG) : a.name);
  const sum = (arr, f) => arr.reduce((s, a) => s + f(a), 0);
  const ofCat = (arr, c) => arr.filter((a) => a.cat === c);

  /* ---------- Erscheinungsbild (Einstellungen-Blatt): Automatisch / Hell / Dunkel ---------- */
  (function theme() {
    const root = document.documentElement;
    let saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) { /* ignore */ }
    const apply = (t) => {
      if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
      document.querySelectorAll("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === (t === "light" || t === "dark" ? t : "auto"))));
    };
    apply(saved);
    document.querySelectorAll("[data-theme-choice]").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.themeChoice;
      apply(t);
      try { if (t === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", t); } catch (e) { /* ignore */ }
    }));
  })();

  /* ---------- Blätter (Sheets) von unten: „Fertig“, Tippen daneben, Esc oder nach unten wischen schließt ---------- */
  const reduceMotionNow = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function openSheet(id, opener) {
    const bd = document.getElementById(id);
    if (!bd || !bd.hidden) return;
    bd._opener = opener || document.activeElement;   // je Blatt (Blätter können übereinander liegen)
    bd.hidden = false;
    document.documentElement.classList.add("sheet-open");
    void bd.offsetHeight;   // Startzustand rendern, dann animieren
    bd.classList.add("open");
    const first = bd.querySelector(".sheet-done");
    if (first) first.focus({ preventScroll: true });
  }
  function closeSheet(bd) {
    if (!bd || bd.hidden) return;
    const sheet = bd.querySelector(".sheet"), scrim = bd.querySelector(".sheet-scrim");
    bd.classList.remove("open", "dragging");
    sheet.style.transform = "";   // gleitet von der aktuellen Position (auch mitten im Wischen) nach unten
    if (scrim) scrim.style.opacity = "";
    if (!document.querySelector(".sheet-backdrop.open")) document.documentElement.classList.remove("sheet-open");
    const done = () => { if (!bd.classList.contains("open")) bd.hidden = true; };
    setTimeout(done, reduceMotionNow() ? 220 : 260);   // Schließen: 240 ms (bzw. 200 ms Ausblenden)
    const op = bd._opener, back = op && (op.isConnected ? op : op.id && document.getElementById(op.id));
    if (back && back.focus) back.focus({ preventScroll: true });
  }
  // Schließen durch den Nutzer; ein Blatt kann das abfangen (Detailansicht: über den Browser-Verlauf)
  const requestClose = (bd) => (bd._onUserClose ? bd._onUserClose() : closeSheet(bd));
  function setupSheet(bd) {
    if (!bd || bd._sheet) return;
    bd._sheet = true;
    const sheet = bd.querySelector(".sheet");
    const scrim = document.createElement("div");   // Abdunklung als eigene Fläche (nur opacity)
    scrim.className = "sheet-scrim"; scrim.setAttribute("aria-hidden", "true");
    bd.prepend(scrim);
    bd.addEventListener("click", (e) => { if (e.target === bd || e.target === scrim) requestClose(bd); });
    bd.querySelectorAll(".sheet-done").forEach((b) => b.addEventListener("click", () => requestClose(bd)));
    bd.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); requestClose(bd); return; }
      if (e.key !== "Tab") return;   // Fokus im Blatt halten
      const f = [...sheet.querySelectorAll("button, a[href], input, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    // Nach unten wischen am Griff oder an der Kopfzeile: das Blatt folgt 1:1 dem Finger, die Abdunklung im selben Maß.
    // Loslassen: weit genug gezogen ODER schnell nach unten geschnippt → schließen, sonst zurück.
    let y0 = null, pid = null, dy = 0, h = 1, track = [];
    sheet.querySelectorAll(".sheet-grabber, .sheet-head").forEach((el) => el.addEventListener("pointerdown", (e) => {
      if (y0 != null || e.target.closest("button")) return;   // zweiter Finger: ignorieren, sonst springt das Blatt
      y0 = e.clientY; pid = e.pointerId; dy = 0; h = Math.max(1, sheet.offsetHeight);
      track = [{ y: 0, t: performance.now() }];
      sheet.classList.add("dragging"); bd.classList.add("dragging");
      try { sheet.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }));
    sheet.addEventListener("pointermove", (e) => {
      if (y0 == null || e.pointerId !== pid) return;
      const raw = e.clientY - y0;
      dy = raw >= 0 ? raw : -Math.min(16, Math.sqrt(-raw) * 1.5);   // nach oben: zunehmender Widerstand statt harter Stopp
      sheet.style.transform = `translateY(${dy}px)`;
      scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / h));
      const now = performance.now();
      track.push({ y: dy, t: now });
      while (track.length > 2 && now - track[0].t > 100) track.shift();   // Tempo der letzten ~100 ms
    });
    const end = (e) => {
      if (y0 == null || (e && e.pointerId !== pid)) return;
      const a = track[0], b = track[track.length - 1];
      const v = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;   // px/ms beim Loslassen
      y0 = null; pid = null;
      sheet.classList.remove("dragging"); bd.classList.remove("dragging");
      if (dy > Math.min(140, h * 0.4) || (dy > 8 && v > 0.3)) { requestClose(bd); return; }
      sheet.style.transform = ""; scrim.style.opacity = "";   // zurückfedern
    };
    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  }

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
    // eigene Symbole statt überall dem Blitz: Schritte (Fußspuren), Body Battery (Batterie), Trainingsstatus/Belastung (Trendpfeil)
    steps: '<path d="M5.1 1.3c1.4 0 2.2 1.7 2.2 3.6 0 1.8-.7 3.2-2 3.2S3.3 6.8 3.3 5c0-2 .5-3.7 1.8-3.7zM3.6 9.1h3.1c.1 1.5-.4 2.8-1.6 2.8S3.4 10.7 3.6 9.1zM10.9 4.3c1.3 0 1.8 1.7 1.8 3.7 0 1.8-.7 3-2 3s-2-1.4-2-3.2c0-1.9.8-3.5 2.2-3.5zM9.3 12.1h3.1c.2 1.6-.3 2.8-1.5 2.8s-1.7-1.2-1.6-2.8z" fill="currentColor"/>',
    battery: '<rect x="1.4" y="4.4" width="11.6" height="7.2" rx="2.1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="3.2" y="6.2" width="5.6" height="3.6" rx=".8" fill="currentColor"/><path d="M14.4 6.7v2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    trend: '<path d="M1.8 12.2 6.1 7.9l2.7 2.7 4.7-4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 5.3h4v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const icon = (k, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${ICON[k] || ICON.other}</svg>`;
  const CHECK = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.4 4.8 9 9.8 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV_R = '<svg class="row-chev" width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Health-Kachel: oben Kategorie in Kategoriefarbe (rechts grau Zeit/Datum), darunter große Zahl mit kleiner grauer Einheit
  // href: die ganze Kachel ist ein Link (z. B. zur Detailansicht), mit Chevron rechts oben
  const htile = ({ cat = "other", label, time = "", value, sub = "", mini = false, href = "" }) => {
    const tag = href ? "a" : "div";
    return `<${tag} class="${mini ? "mtile" : "card"} kpi c-${cat}${href ? " tile-link" : ""}"${href ? ` href="${href}"` : ""}><div class="label">${icon(cat, 15)}<span class="ht-name">${label}</span>${time ? `<span class="ht-time">${time}</span>` : ""}${href ? CHEV_R : ""}</div><div class="value">${value}</div>${sub ? `<div class="delta">${sub}</div>` : ""}${href ? `<span class="sr-only">, Verlauf und Details öffnen</span>` : ""}</${tag}>`;
  };
  // Zeile einer gruppierten Liste (iOS „inset grouped“): Symbol, Titel + Unterzeile, Wert rechts
  const irow = ({ lead = "", title, sub = "", val = "", cls = "" }) =>
    `<li class="ios-row ${cls}">${lead}<span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>${val !== "" ? `<span class="row-val">${val}</span>` : ""}</li>`;
  const rowIcon = (cat, key) => `<span class="row-ic c-${cat}">${icon(key || cat, 16)}</span>`;   // key: eigenes Symbol (Schritte …)
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
  function noChart(box, text) { if (!box) return; box._draw = null; if (box._head) { box._head.remove(); box._head = null; } box.innerHTML = C.empty(text); }
  /* Health-Kopf über jedem Diagramm: Kernwert groß (SF Pro Rounded), darunter klein der Zeitraum.
     Antippen (iPad) oder Hovern (Maus) auf einen Punkt/Balken: dünne senkrechte Linie, der Wert erscheint oben im Kopf;
     antippen daneben stellt zurück. pick(i): Klick wählt etwas aus (z. B. die Woche im Belastungsdiagramm). */
  const hv = (num, unit) => `${num}${unit ? `<small>${unit}</small>` : ""}`;          // Kernwert mit kleiner Einheit
  const range = (a, b) => `${dmS(a)} – ${dmS(b)}`;
  const mean = (arr) => arr.reduce((x, y) => x + y, 0) / (arr.length || 1);
  const selRows = (rows) => `<div class="ch-rows">${rows.map(([c, label, val]) => `<span><i class="lg lg-dot" style="--c:${c}" aria-hidden="true"></i>${label ? `<span class="sr-only">${label} </span>` : ""}${val}</span>`).join("")}</div>`;
  const headHtml = (d) => `<div class="ch-main"><div class="ch-label">${d.label || "&nbsp;"}</div><div class="ch-value">${d.value}</div><div class="ch-period">${d.period || "&nbsp;"}</div></div>${d.detail ? `<div class="ch-detail">${d.detail}</div>` : ""}`;
  function setHead(box, d, sel) {
    let h = box._head;
    if (!h || !h.isConnected) { h = document.createElement("div"); h.className = "ch-head"; h.setAttribute("aria-live", "polite"); box.before(h); box._head = h; }
    h.classList.toggle("is-sel", !!sel);
    h.innerHTML = headHtml(d);
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function cursorAt(box, hit) {
    const svg = box.querySelector("svg.cv");
    if (!svg) return;
    svg.querySelectorAll(".cursor, .sel-dot").forEach((e) => e.remove());
    svg.querySelectorAll(".hit.on").forEach((e) => e.classList.remove("on"));
    if (!hit) return;
    hit.classList.add("on");
    const circ = hit.tagName.toLowerCase() === "circle";
    const x = circ ? +hit.getAttribute("cx") : +hit.getAttribute("x") + +hit.getAttribute("width") / 2, xx = String(Math.round(x) + 0.5);
    const first = svg.querySelector(".hit");
    const ln = document.createElementNS(SVGNS, "line");
    [["class", "cursor"], ["x1", xx], ["x2", xx], ["y1", String(+svg.dataset.pt - 8)], ["y2", svg.dataset.pb]].forEach(([k, v]) => ln.setAttribute(k, v));
    svg.insertBefore(ln, first);
    if (circ) {
      const c = document.createElementNS(SVGNS, "circle");
      [["class", "sel-dot"], ["cx", hit.getAttribute("cx")], ["cy", hit.getAttribute("cy")], ["r", "5"]].forEach(([k, v]) => c.setAttribute(k, v));
      svg.insertBefore(c, first);
    }
  }
  let selBox = null;
  function resetSel(box) {
    if (!box) return;
    cursorAt(box, null);
    if (box._summary && box._selI != null) setHead(box, box._summary, false);
    box._selI = null;
    if (selBox === box) selBox = null;
  }
  function bindSel(box, { summary, select, pick }) {
    box._summary = summary; box._select = select; box._pick = pick || null; box._selI = null;
    setHead(box, summary, false);
    if (box._selBound) return;
    box._selBound = true;
    let ptr = "mouse";
    const hitOf = (ev) => (ev.target && ev.target.closest ? ev.target.closest(".hit") : null);
    const choose = (h) => {
      if (selBox && selBox !== box) resetSel(selBox);
      box._selI = +h.dataset.i; selBox = box;
      cursorAt(box, h);
      setHead(box, box._select(box._selI), true);
    };
    box.addEventListener("pointerdown", (ev) => { ptr = ev.pointerType || "mouse"; });
    box.addEventListener("pointermove", (ev) => {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      const h = hitOf(ev);
      if (h) { if (+h.dataset.i !== box._selI) choose(h); } else if (box._selI != null) resetSel(box);
    });
    box.addEventListener("pointerleave", (ev) => { if (!ev.pointerType || ev.pointerType === "mouse") resetSel(box); });
    box.addEventListener("click", (ev) => {
      const h = hitOf(ev);
      if (!h) return;
      if (box._pick) { box._pick(+h.dataset.i, ev, ptr); return; }
      if (ptr !== "mouse" && +h.dataset.i === box._selI) resetSel(box); else choose(h);
    });
  }
  // Antippen außerhalb eines Diagrammpunkts stellt den Kopf zurück (und schließt das Tooltip der Prognose-Balken)
  document.addEventListener("pointerdown", (ev) => {
    if (ev.target && ev.target.closest && ev.target.closest(".chart .hit")) return;
    hideTip();
    if (selBox) resetSel(selBox);
  }, { passive: true });
  const tickFmt = (ax, unit = "") => (v) => nf(v, C.decimals(ax.step)) + unit;

  // Diagramm in der Detailansicht: Antippen oder Ziehen zeigt den Tageswert oben, Loslassen setzt zurück (wie Health)
  function bindScrub(box, { summary, select }) {
    box._summary = summary; box._select = select; box._selI = null;
    setHead(box, summary, false);
    if (box._scrub) return;
    box._scrub = true;
    let down = false;
    const nearest = (x) => {
      let best = null, bd = Infinity;
      box.querySelectorAll(".hit").forEach((h) => { const r = h.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x); if (d < bd) { bd = d; best = h; } });
      return best;
    };
    const show = (ev) => {
      const h = nearest(ev.clientX);
      if (!h || +h.dataset.i === box._selI) return;
      box._selI = +h.dataset.i;
      cursorAt(box, h);
      setHead(box, box._select(box._selI), true);
    };
    const reset = () => { if (box._selI == null) return; box._selI = null; cursorAt(box, null); setHead(box, box._summary, false); };
    box.addEventListener("pointerdown", (ev) => { down = true; show(ev); });
    box.addEventListener("pointermove", (ev) => { if (down || ev.pointerType === "mouse") show(ev); });
    box.addEventListener("pointerup", (ev) => { down = false; if (ev.pointerType !== "mouse") reset(); });
    box.addEventListener("pointercancel", () => { down = false; reset(); });
    box.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") reset(); });
  }

  /* ---------- Hero / Countdown ---------- */
  // Kopf von „Heute“ (Datumszeile, großer Titel, schlanke Infozeile) und Renn-Karte in „Rennvorbereitung“
  function hero() {
    const now = new Date();
    const days = Math.max(0, Math.ceil((race - now) / DAY));
    const weeks = Math.floor(days / 7);
    const cp = currentPhase(now);
    const totalDays = Math.round((race - commit) / DAY);
    const dayNo = Math.min(totalDays, Math.max(0, Math.floor((now - commit) / DAY) + 1));
    const pct = Math.round((dayNo / totalDays) * 100);
    $("#todayDate").textContent = fmtDate(now, { weekday: "long", day: "numeric", month: "short" });
    const city = D.race.name.replace(/^Ironman\s+/i, "").replace(/\s*\d{4}$/, "");
    $("#todayLine").textContent = [`Noch ${days} ${days === 1 ? "Tag" : "Tage"} bis ${city}`,
      FLEX.active ? `Flex bis ${fmtDate(FLEX.until, { day: "numeric", month: "long" })}` : cp ? `Phase ${cp.short}` : ""].filter(Boolean).join(" · ");
    const note = $("#todayNote");
    note.hidden = !(FLEX.active && FLEX.reentry);
    if (!note.hidden) note.textContent = `Noch ${FLEX.daysLeft} ${FLEX.daysLeft === 1 ? "Tag" : "Tage"} Flex: Wiedereinstieg vorbereiten. Ausdauer wieder auf 3–4 Einheiten pro Woche steigern, je eine längere lockere Rad- und Laufeinheit einbauen und Gym auf 2–3× reduzieren.`;
    const loc = D.race.location && D.race.location !== "tbd" ? D.race.location : "";
    $("#raceCard").innerHTML = `
      <h3 class="race-title">${esc(D.race.name)}</h3>
      <p class="race-meta">${fmtDate(race, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${loc ? `<br>${esc(loc)}` : ""}</p>
      <div class="mtiles race-tiles">
        ${htile({ mini: true, cat: "activity", label: "Countdown", value: `${days}<small>Tage</small>`, sub: `${weeks} Wochen` })}
        ${htile({ mini: true, cat: "swim", label: "Schwimmen", value: `${nf(D.race.swimKm, 1)}<small>km</small>` })}
        ${htile({ mini: true, cat: "bike", label: "Rad", value: `${nf(D.race.bikeKm)}<small>km</small>` })}
        ${htile({ mini: true, cat: "run", label: "Laufen", value: `${nf(D.race.runKm, 1)}<small>km</small>` })}
      </div>
      <div class="journey">
        <div class="journey-head"><span>Anmeldung ${fmtDate(commit, { day: "2-digit", month: "2-digit", year: "2-digit" })}</span><span><b>Tag ${dayNo}</b> von ${totalDays} (${pct}&nbsp;%)</span><span>Rennen</span></div>
        <div class="ready-track" role="img" aria-label="${pct} % der Vorbereitung vergangen"><div class="ready-fill" style="width:${pct}%;background:var(--accent)"></div></div>
      </div>
      <p class="race-focus">Fokus aktuell: ${esc(FLEX.active && FCFG.focus ? FCFG.focus : D.athlete.focus)}</p>`;
  }

  /* ---------- KPIs ---------- */
  function kpis() {
    const from = addDays(snapEnd, -28), prevFrom = addDays(snapEnd, -56);
    const cur = inRange(from, snapEnd), prev = inRange(prevFrom, from);
    $("#kpiSub").textContent = `${fmtDate(from)} – ${fmtDate(snap)}, verglichen mit den 4 Wochen davor.`;
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
    // chronologisch; im Tab die aktuelle und die nächsten zwei, alle in der eigenen Ansicht (#plan-phasen)
    const from = Math.max(0, Math.min(PHASES.length - 3, PHASES.findIndex((p) => p.end > now)));
    $("#phaseList").innerHTML = phaseRows(PHASES.slice(from, from + 3), cp, now) + (PHASES.length > 3 ? moreRow("plan-phasen", PHASES.length) : "");
  }
  function phaseRows(list, cp, now) {
    return list.map((p) => {
      const st = p === cp ? "cur" : p.end <= now ? "done" : "future";
      return irow({
        lead: `<span class="row-dot ${st}" aria-hidden="true"></span>`,
        title: `${esc(p.short)}${st === "cur" ? ` <span class="badge accent">aktuell</span>` : ""}`,
        sub: `${fmtDate(p.start, { day: "2-digit", month: "short" })} – ${fmtDate(addDays(p.end, -1), { day: "2-digit", month: "short", year: "2-digit" })}`,
        val: p.hours, cls: st,
      });
    }).join("");
  }
  const renderAllPhases = (body) => { const now = new Date(); body.innerHTML = `<div class="card list-card"><ul class="ios-list dots phase-rows">${phaseRows(PHASES, currentPhase(now), now)}</ul></div>`; };

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
    const colors = { swim: "var(--swim)", bike: "var(--bike)", run: "var(--run)", strength: "var(--strength)", other: "var(--other)" };
    const labels = { swim: "Schwimmen", bike: "Rad", run: "Laufen", strength: "Kraft", other: "Sonstiges" };
    $("#volLegend").innerHTML = C.legendItems(keys.map((k) => ({ label: labels[k], color: colors[k] })));

    const el = $("#volChart");
    const ax = C.zeroAxis(Math.max(...weeks.map(total)));
    const fIdx = weeks.map((w, i) => (w.flex ? i : -1)).filter((i) => i >= 0);
    const aria = `Wochenstunden je Disziplin, ${weeks.length} Wochen, ${lastW && lastW.start.getTime() === curMon ? "diese Woche" : "zuletzt"} ${nf(lastW ? total(lastW) : 0, 1)} h`;
    const summary = { label: "Ø pro Woche", value: hv(nf(mean(weeks.map(total)), 1), "h"), period: range(weeks[0].start, addDays(lastW.start, 6)) };
    const select = (i) => {
      const w = weeks[i];
      return { label: w.flex ? "Woche, Flex" : "Woche", value: hv(hm(total(w) * 3600), "h"), period: range(w.start, addDays(w.start, 6)),
        detail: selRows(keys.filter((k) => w[k] > 0).map((k) => [colors[k], labels[k], `${hm(w[k] * 3600)} h`])) + (w.min ? `<div>Minimum ${w.min.items.filter((it) => it.ok).length}/${w.min.items.length}</div>` : "") };
    };
    mount(el, (W) => {
      const narrow = (W - 50) / weeks.length < 26;   // wenig Platz: ✓ / ○ statt „1/2“
      el.innerHTML = C.barChart({
        width: W, height: C.LARGE, aria, y: { ...ax, fmt: tickFmt(ax, " h") },
        groups: fIdx.length ? [{ from: fIdx[0], to: fIdx[fIdx.length - 1], label: "Flex" }] : [],
        bands: weeks.map((w) => ({
          label: dmS(w.start), current: w.start.getTime() === curMon, dim: w.flex,
          stacks: keys.map((k) => ({ v: w[k], color: colors[k] })),
          below: w.flex && w.min ? (w.min.ok ? "✓" : narrow ? "○" : `${w.min.items.filter((it) => it.ok).length}/${w.min.items.length}`) : null,
          belowClass: w.flex && w.min && w.min.ok ? "min-ok" : "tick",
        })),
      });
      bindSel(el, { summary, select });
    });
    // Tabelle
    $("#volTable").innerHTML = `<table><thead><tr><th>Woche ab</th><th class="num">Schwimmen</th><th class="num">Rad</th><th class="num">Laufen</th><th class="num">Kraft & Sonst.</th><th class="num">Tri gesamt</th></tr></thead><tbody>` +
      weeks.slice().reverse().map((w) => `<tr><td>${fmtDate(w.start)}</td><td class="num">${hm(w.swim * 3600)}</td><td class="num">${hm(w.bike * 3600)}</td><td class="num">${hm(w.run * 3600)}</td><td class="num">${hm(w.extra * 3600)}</td><td class="num"><b>${hm((w.swim + w.bike + w.run) * 3600)}</b></td></tr>`).join("") + `</tbody></table>`;
  }

  /* ---------- Zeitverlauf mit einer Linie (Disziplinen, Erholung, Prognose) ---------- */
  // pts aufsteigend nach Datum; o = { color, axis, fmt, val, aria, summary, select(p), band, refs, invert, height, emptyText }
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
      bindSel(box, { summary: o.summary, select: (i) => o.select(pts[i]) });
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
      bindSel(box, { summary: o.summary, select: (i) => o.select(values[i]) });
    });
  }

  /* ---------- Disziplinen ---------- */
  function disciplines() {
    const swims = ofCat(acts, "swim"), bikes = ofCat(acts, "bike"), runs = ofCat(acts, "run");
    const z2b = z2PaceRange();   // grobe Zone-2-Pace [schnell, langsam] aus der Zone-2-Auswertung, sonst null
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
      summary: { label: "Ø Pace", value: hv(mmss(mean(swimPts.map((p) => p.v))), "/100 m"), period: range(swimPts[0].d, swimPts[swimPts.length - 1].d) },
      select: (p) => ({ label: "Pace", value: hv(mmss(p.v), "/100 m"), period: tipDay(p.d), detail: `${esc(p.a.name)}<br>${nf(p.a.km * 1000)} m in ${hm(p.a.sec)} h` }),
    }); else noChart($("#swimChart"), "Noch keine Einheit ab 900 m.");
    const lastBike = bikeWeekly[bikeWeekly.length - 1];
    weekBars($("#bikeChart"), bikeWeekly, {
      color: "var(--bike)", aria: `Rad-Kilometer pro Woche, ${bikeWeekly.length} Wochen, zuletzt ${nf(lastBike ? lastBike.v : 0)} km`,
      summary: { label: "Ø pro Woche", value: hv(nf(mean(bikeWeekly.map((w) => w.v))), "km"), period: range(bikeWeekly[0].d, addDays(bikeWeekly[bikeWeekly.length - 1].d, 6)) },
      select: (w) => ({ label: "Woche", value: hv(nf(w.v), "km"), period: range(w.d, addDays(w.d, 6)) }),
    });
    if (runPts.length) trendLine($("#runChart"), runPts, {
      color: "var(--run)", axis: C.paceAxis(runPts.map((p) => p.v), { include: z2b || [] }), invert: true, fmt: mmss, val: mmss,
      band: z2b ? { from: z2b[0], to: z2b[1], color: "var(--run)" } : null,
      aria: `Lauf-Pace pro Lauf ab 4 km, ${runPts.length} Läufe, zuletzt ${mmss(runPts[runPts.length - 1].v)} pro km`,
      summary: { label: "Ø Pace", value: hv(mmss(mean(runPts.map((p) => p.v))), "/km"), period: range(runPts[0].d, runPts[runPts.length - 1].d) },
      select: (p) => ({ label: "Pace", value: hv(mmss(p.v), "/km"), period: tipDay(p.d), detail: `${esc(p.a.name)}<br>${nf(p.a.km, 1)} km, ${p.a.elev} hm` }),
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
      return `<div class="ready-row"><span>${l}</span><div class="ready-track" role="img" aria-label="${l}: ${Math.round((best / goal) * 100)} %"><div class="ready-fill" style="width:${pct}%;background:var(--${k})"></div></div><span class="num">${nf(best, 1)} / ${nf(goal, 1)} km <b>(${Math.round((best / goal) * 100)}&nbsp;%)</b></span></div>`;
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
    $("#predNotes").innerHTML = notes.map((n) => `<div>${n}</div>`).join("");
    $("#predNotes").hidden = !notes.length;
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
          summary: { label: "Aktuell", value: hv(hm(last.v), "h"), period: `Ziel ${hm(goalTotal)} h, seit ${dmS(pts[0].d)}` },
          select: (p) => ({ label: "Prognose", value: hv(hms(p.v), "h"), period: tipDay(p.d), detail: selRows([["var(--swim)", "Schwimmen", `Schwimmen ${hm(p.e.swim)}`], ["var(--bike)", "Rad", `Rad ${hm(p.e.bike)}`], ["var(--run)", "Laufen", `Laufen ${hm(p.e.run)}`]]) }),
        });
      })
      .catch(() => { noChart(box, "Verlauf nicht verfügbar (nur auf der veröffentlichten Seite)."); });
  }


  /* ---------- Zone-2-Entwicklung (data/z2-metrics.json, js/z2.js) ---------- */
  const ZCOL = ["20%", "36%", "52%", "68%", "84%"].map((p) => `color-mix(in srgb, var(--text) ${p}, var(--surface))`);   // Z1 hell → Z5 dunkel
  const STATUS_COL = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };
  const STATUS_TXT = { good: "grün", warn: "gelb", bad: "rot" };
  const SRC_TXT = { strap: "Brustgurt", wrist: "Uhr (optisch)", unknown: "Pulsmesser unbekannt" };
  let Z2DATA = null, HRSRC = null;

  function zone2() {
    const cfg = window.TRAINING.z2, Z = window.Z2;
    if (!cfg || !Z) { $("#zone2").hidden = true; return; }
    const get = (f) => fetch(`${f}?v=${window.__v || Date.now()}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    Promise.all([get("data/z2-metrics.json"), get("data/hr-sources.json").catch(() => null)])
      .then(([db, src]) => { Z2DATA = db; HRSRC = src; renderZone2(); insights(); disciplines(); if (FLEX.active) today(); z2Detail(); })
      .catch(() => {
        Z2FAIL = true; z2Detail(); insights();
        $("#z2Tiles").innerHTML = `<p class="muted">Zone-2-Daten nicht verfügbar (nur auf der veröffentlichten Seite).</p>`;
      });
  }

  // Offene Zone-2-Detailansicht neu zeichnen, sobald die Daten da sind (z. B. Direktlink #erholung-z2pace)
  const z2Detail = () => { const m = md.key && MX.byKey[md.key]; if (m && /^z2/.test(m.source || "")) renderMetric(); };
  function renderZone2() {
    const cfg = window.TRAINING.z2, Z = window.Z2, hrZ = D.zones.hr;
    const all = Z2DATA.activities.filter((r) => r.kind && !ignored(r));   // ohne Zwift im Flex-Zeitraum
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
    // Kacheln öffnen die Detailansicht (#erholung-z2pace …); die Diagramme leben dort
    const TILE_KEY = { Pace: "z2pace", Watt: "z2watts", Entkopplung: "z2dec", Anteil: "z2zones" };
    const tile = (label, value, sub, badge) => { const m = MX && MX.byKey[TILE_KEY[label.split(" ")[0]]];
      return htile({ cat: m ? m.cat : "heart", label, value: value.replace(/ <small>/g, "<small>"), sub: `${badge || ""}${sub}`, href: m ? `#${metricHash(m)}` : "" }); };
    const few = (n, what) => `noch zu wenig Daten (${n} ${n === 1 ? what[0] : what[1]} in 4 Wochen, mind. ${cfg.minPoints})`;

    // Kachel 1: Pace @ HF
    const lp = lastOf(pace);
    const t1 = kP.enough
      ? tile(`Pace bei ${runMid} bpm`, `${mmss(kP.value)} <small>/km</small>`, kP.delta != null ? `${kP.delta < 0 ? "▼" : kP.delta > 0 ? "▲" : "±"} ${mmss(Math.abs(kP.delta))} ${kP.delta <= 0 ? "schneller" : "langsamer"} als die 4 Wochen davor` : `Median aus ${kP.n} Läufen`)
      : tile(`Pace bei ${runMid} bpm`, "–", `${few(kP.n, ["Lauf", "Läufe"])}${lp ? `<br>zuletzt ${mmss(lp.v)} /km am ${fmtDate(parse(lp.date), { day: "2-digit", month: "2-digit" })}` : ""}`);
    // Kachel 2: Watt @ HF (Indoor)
    const lw = lastOf(wIn);
    const t2 = kW.enough
      ? tile(`Watt bei ${rideMid} bpm`, `${nf(kW.value)} <small>W</small>`, kW.delta != null ? `${kW.delta > 0 ? "▲ +" : kW.delta < 0 ? "▼ −" : "± "}${nf(Math.abs(kW.delta))} W zu den 4 Wochen davor` : `Median aus ${kW.n} Fahrten`)
      : tile(`Watt bei ${rideMid} bpm`, "–", `${few(kW.n, ["Fahrt", "Fahrten"])}${lw ? `<br>zuletzt ${lw.v} W am ${fmtDate(parse(lw.date), { day: "2-digit", month: "2-digit" })}` : ""}`);
    // Kachel 3: Ø Entkopplung lange Läufe
    const since = parse(asOf).getTime() - cfg.longRunWindowDays * DAY;
    const decRecent = decRuns.filter((p) => parse(p.date).getTime() > since);
    let t3;
    if (decRecent.length) {
      const avg = decRecent.reduce((a, p) => a + p.v, 0) / decRecent.length, st = Z.ampel(avg, cfg.decoupling.thresholds);
      t3 = tile("Entkopplung", `${nf(avg, 1)} <small>%</small>`, `${decRecent.length} Lauf${decRecent.length > 1 ? "e" : ""} ≥ 60 min, letzte 8 Wochen`, `<span class="badge ${st}" style="margin-right:6px">${st === "good" ? "✓ unter 5 %" : st === "warn" ? "5–10 %" : "über 10 %"}</span>`);
    } else t3 = tile("Entkopplung", "–", "noch keine ruhigen Läufe ≥ 60 min in den letzten 8 Wochen");
    // Kachel 4: Anteil Z1–2
    const sh = Z.zoneShare(all, asOf, cfg.windowDays, [0, 1]), sh3 = Z.zoneShare(all, asOf, cfg.windowDays, [2]);
    const t4 = sh ? tile("Anteil Z1–2", `${Math.round(sh.share * 100)} <small>%</small>`, `Z3 ${Math.round((sh3 ? sh3.share : 0) * 100)} %, Z4–5 ${Math.round((1 - sh.share - (sh3 ? sh3.share : 0)) * 100)} %<br>${hm(sh.totalSec)} h Lauf & Rad in 4 Wochen, Richtwert ~80&nbsp;%`)
      : tile("Anteil Z1–2", "–", "keine Einheiten mit Herzfrequenz");
    $("#z2Tiles").innerHTML = t1 + t2 + t3 + t4;

    $("#z2Asof").textContent = `${all.length} Läufe & Fahrten seit ${fmtDate(parse(all[0].date))}, Stand ${fmtDate(parse(asOf))}${strapOnly ? ". Nur Brustgurt-Einheiten gewertet." : ""}. Tippe auf eine Kachel für Verlauf und Details.`;
    const withHr = all.filter((r) => r.hasHr), cnt = (k) => withHr.filter((r) => r.hrSrc === k).length;
    const srcTxt = `Pulsmesser erkannt: ${cnt("strap")} × Brustgurt, ${cnt("wrist")} × Uhr, ${cnt("unknown")} × unbekannt (von ${withHr.length} Einheiten mit Puls). ${HRSRC && HRSRC.updated ? `Garmin-Sensordaten Stand ${new Date(HRSRC.updated).toLocaleDateString("de-DE")}.` : "Noch keine Garmin-Sensordaten, der nächste Garmin-Lauf holt sie."}`;
    // für die Detailansichten und das Highlight „Zone 2“ unter „Wo du gerade stehst“
    Z2S = { recs, all, runMid, rideMid, runBand, rideBand, srcTxt, share: sh ? sh.share : null, summary: Z.summary(recs, asOf, cfg, hrZ) };
  }
  // Tooltip-Zeilen einer Zone-2-Einheit (Name, Strecke, Zeit im Band, Pulsmesser)
  const recNote = (p) => `${esc(p.rec.name)}<br>${nf(p.rec.km, 1)} km in ${hm(p.rec.sec)} h${p.rec.pace ? `, ${Math.round(p.rec.pace.bandSec / 60)} min im Band` : p.rec.watts ? `, ${Math.round(p.rec.watts.bandSec / 60)} min im Band` : ""}<br>${SRC_TXT[p.rec.hrSrc] || SRC_TXT.unknown}${p.rec.hrSrcFrom ? ` (${p.rec.hrSrcFrom})` : ""}${p.gap ? ", steigungsbereinigt (GAP)" : ""}`;

  const DEC_BAR = "color-mix(in srgb, var(--text) 30%, var(--surface))";   // neutral, Ampel nur als Punkt

  /* ---------- Hilfetexte hinter ⓘ: kleiner Knopf neben der Überschrift, öffnet ein kurzes Blatt ---------- */
  const INFO_ICON = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="6.2" r="1.15" fill="currentColor"/><path d="M10 9.1v5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const infoBtn = (key, title) => `<button type="button" class="info-btn" data-info="${key}" aria-label="Info: ${esc(title)}" aria-haspopup="dialog">${INFO_ICON}</button>`;
  // Texte für Karten, die per JS gezeichnet werden; Abschnitts-Untertitel holt setupHelp() direkt aus der Seite
  const HELP = {
    gymSplit: { title: "Split-Verteilung", html: () => "Gezählt werden die Krafteinheiten der letzten 4 Wochen nach Split. „Ohne Split“: Titel ohne Push, Pull oder Legs, z. B. „Gym Bali“. Quelle: der Titel in Garmin Connect, sonst der Name in Strava." },
    load: { title: "Belastung (Garmin)", html: () => "Garmin berechnet die Trainingsbelastung jeder Einheit aus dem Puls. Krafttraining wird dabei nur schwach abgebildet. Akut = letzte 7 Tage, chronisch = 28 Tage; liegt akut deutlich über chronisch, steigt das Überlastungsrisiko." },
  };
  function setupHelp() {
    // Untertitel von Abschnitten (auch solche, die das JS später füllt) wandern hinter ein ⓘ neben der Überschrift
    document.querySelectorAll("main .section-sub").forEach((sub, i) => {
      const sec = sub.closest("section");
      const h2 = sec && sec.querySelector("h2");
      if (!h2 || sub.dataset.helpReady) return;
      sub.dataset.helpReady = "1";
      if (!sub.id) sub.id = `help-${sec.id || i}`;
      sub.hidden = true;
      if (sub.closest(".card") || sub.dataset.title) return;   // Karten-Hilfen haben ihren eigenen Platz (.info-slot)
      const title = (h2.querySelector(".sec-title") || h2).textContent.trim();
      HELP[sub.id] = { title, el: sub };
      const head = h2.closest(".sec-head");
      if (head) h2.insertAdjacentHTML("afterend", infoBtn(sub.id, title));
      else h2.insertAdjacentHTML("beforeend", ` ${infoBtn(sub.id, title)}`);
    });
    // Hilfen in Karten: <span class="info-slot" data-info-src="ID"> neben der Kartenüberschrift
    document.querySelectorAll(".info-slot[data-info-src]").forEach((slot) => {
      const src = document.getElementById(slot.dataset.infoSrc);
      if (!src) return;
      src.hidden = true;
      HELP[src.id] = { title: src.dataset.title || "Info", el: src };
      slot.outerHTML = infoBtn(src.id, HELP[src.id].title);
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("button[data-info]") : null;   // ⓘ-Knöpfe und Highlights
    const h = b && HELP[b.dataset.info];
    if (!h) return;
    e.preventDefault(); e.stopPropagation();
    $("#infoTitle").textContent = h.title;
    const html = h.el ? h.el.innerHTML : h.html();
    $("#infoBody").innerHTML = /<(p|div|ul)\b/.test(html) ? html : `<p>${html}</p>`;
    openSheet("infoSheet", b);
  });

  /* ---------- Gym-Tracker (js/gym.js) ---------- */
  const PLACE_COLORS = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)", "var(--cat6)"];
  // Orte → feste Farben in Reihenfolge des ersten Auftretens, „unbekannt“ grau
  const GYM_PLACES = [];
  GYM_SESS.forEach((x) => { const p = x.parsed && x.parsed.entry && x.parsed.place; if (p && !GYM_PLACES.includes(p)) GYM_PLACES.push(p); });
  const placeColor = (p) => (p === "unbekannt" || !p ? "var(--other)" : PLACE_COLORS[GYM_PLACES.indexOf(p) % PLACE_COLORS.length]);
  function gymSection() {
    if (!GYM) { $("#gym").hidden = true; return; }
    const now = new Date(), todayIso = ymdLocal(now), mon = ymdLocal(monday(now));
    const wk = GYM.splitCounts(GYM_SESS, mon, todayIso);
    $("#gymWeek").innerHTML = htile({
      cat: "strength", label: "Gym diese Woche", time: `seit ${dmS(monday(now))}`, value: `${wk.total}<small>×</small>`,
      sub: `<div class="ht-split">${["Push", "Pull", "Legs"].map((k) => `<span><b>${wk[k]}</b>${k}</span>`).join("")}${wk.ohne ? `<span><b>${wk.ohne}</b>ohne Split</span>` : ""}</div>${wk.Legs ? "" : `<div class="ht-note">Noch kein Leg Day diese Woche.</div>`}`,
    });

    const lifts = Object.entries(GCFG.mainExercise || GYM.DEFAULTS.mainExercise);
    $("#gymLifts").innerHTML = lifts.map(([split, ex]) => {
      const h = GYM.exerciseHistory(GYM_SESS, ex, GCFG);
      const gp = GYM.goalProgress(GYM_SESS, ex, GCFG);
      const lm = MX ? MX.register(MX.liftMetric(ex, gp ? gp.goal : null, isBodyweight(ex) ? BODY_KG : null)) : null;   // Detailansicht #training-1rm-…
      if (!h.length) return `<div class="card lift c-strength"><div class="lift-head"><span class="lift-name">${icon("strength", 15)}${esc(ex)} <span class="lift-split">${split}</span></span></div><p class="muted" style="margin:0;font-size:15px">Noch keine Einträge. Titel in Garmin Connect z. B. „${split} ${split === "Legs" ? "3x10x180" : split === "Pull" ? "5x20" : "6x100"} @Ort“.</p>${gp ? `<p class="muted" style="margin:6px 0 0;font-size:13px">Ziel ${nf(gp.goal)} kg ${isBodyweight(ex) ? "Zusatzgewicht für eine Wiederholung" : "(geschätztes 1RM)"}</p>` : ""}</div>`;
      const last = h[h.length - 1];
      const machine = (GCFG.perPlace || []).includes(ex);
      const scope = machine ? h.filter((e) => e.place === last.place) : h;
      const best = scope.reduce((m, e) => (e.e1rm > m.e1rm ? e : m), scope[0]);
      const plan = GYM.liftPlan(GYM_SESS, ex, GCFG), pr = plan.prog;
      const tag = lm ? "a" : "div", at = machine ? ` (${esc(last.place)})` : "";
      const dmy = (e) => fmtDate(parse(e.date), { day: "2-digit", month: "2-digit" });
      // oben einmal der große 1RM-Wert, daneben ein kleiner Ring zum Block-Ziel und das Ziel
      const goal = gp ? `<div class="lift-goalring">${C.rings({ size: 48, stroke: 6, gap: 0,
        items: [{ frac: gp.current != null ? gp.current / gp.goal : 0, color: gp.reached ? "var(--good)" : "var(--strength)" }],
        aria: gp.current == null ? `Ziel ${nf(gp.goal)} kg, noch kein Eintrag${gp.place ? ` in ${gp.place}` : ""}` : `${gp.pct} % vom Ziel ${nf(gp.goal)} kg` })}
        <div><b>${gp.current == null ? "–" : `${gp.pct}&nbsp;%`}</b><span>Ziel ${nf(gp.goal)}&nbsp;kg</span></div></div>` : "";
      const next = plan.target ? { val: setTxt(plan.target), sub: `zuletzt ${setTxt(plan.last, false)} · ${pr.reps[0]}–${pr.reps[1]} Wdh., +${kgTxt(pr.step)} kg` }
        : plan.noEntryAtPlace ? { val: "–", sub: `Noch kein Eintrag in ${esc(plan.place)} – Startgewicht frei wählen` } : { val: "–", sub: "" };
      return `<${tag} class="card lift c-strength${lm ? " tile-link" : ""}"${lm ? ` href="#${metricHash(lm)}"` : ""}>
        <div class="lift-head"><span class="lift-name">${icon("strength", 15)}${esc(ex)} <span class="lift-split">${split}</span></span>${last.pr ? `<span class="badge good">PR</span>` : ""}${plan.reached ? `<span class="badge good">Wdh.-Ziel ✓</span>` : ""}${lm ? CHEV_R : ""}</div>
        <div class="lift-top">
          <div class="lift-main"><div class="lift-label">${isBodyweight(ex) ? "1RM Zusatzgewicht" : "1RM geschätzt"}${at}</div><div class="lift-val">${nf(best.e1rm, 1)}<small>kg</small></div></div>
          ${goal}
        </div>
        <div class="lift-spark" data-spark="${scope.map((e) => e.e1rm.toFixed(1)).join(" ")}"></div>
        <ul class="ios-list lift-rows">
          ${irow({ title: "Letzter Eintrag", sub: `${dmy(last)} ${placeTxt(last.place)}`, val: `<b>${setTxt(last)}</b>` })}
          ${irow({ title: `Bester Satz${at}`, sub: dmy(best), val: `<b>${setTxt(best)}</b>` })}
          ${irow({ title: `Nächstes Ziel${plan.perPlace && plan.place ? ` (${esc(plan.place)})` : ""}`, sub: next.sub, val: `<b>${next.val}</b>` })}
        </ul>
        ${plan.stagnation ? `<p class="lift-note">${STAG_TXT(pr.stagnation)}</p>` : ""}
        ${lm ? `<span class="sr-only">, 1RM-Verlauf und alle Einträge öffnen</span>` : ""}
      </${tag}>`;
    }).join("");
    // Mini-Linie des 1RM-Verlaufs (bei Maschinen nur am selben Ort) in voller Kartenbreite, gezeichnet sobald die Breite bekannt ist
    $("#gymLifts").querySelectorAll("[data-spark]").forEach((box) => {
      const vals = box.dataset.spark.split(" ").map(Number);
      if (vals.length < 2) { box.remove(); return; }
      mount(box, (W) => { box.innerHTML = C.sparkline(vals, { w: W, h: 36, color: "var(--strength)" }); });
    });

    // Split-Verteilung der letzten 4 Wochen
    const c4 = GYM.splitCounts(GYM_SESS, ymdLocal(addDays(now, -27)), todayIso);
    const maxN = Math.max(1, c4.Push, c4.Pull, c4.Legs, c4.ohne);
    const avgPP = (c4.Push + c4.Pull) / 2;
    const short = c4.Legs < avgPP * 0.6 && avgPP >= 2;
    $("#gymSplit").innerHTML = `<h3>Split-Verteilung der letzten 4 Wochen ${infoBtn("gymSplit", "Split-Verteilung")}${short ? ` <span class="badge warn">Legs kommen zu kurz</span>` : ""}</h3>
      <div class="split-bars">${[["Push", c4.Push], ["Pull", c4.Pull], ["Legs", c4.Legs], ["ohne Split", c4.ohne]].map(([k, v]) => `<div class="split-row"><span>${k}</span><div class="ready-track"><div class="ready-fill" style="width:${(v / maxN) * 100}%;background:${k === "ohne Split" ? "var(--other)" : "var(--strength)"}"></div></div><b>${v}×</b></div>`).join("")}</div>
      <p class="muted" style="font-size:13px;margin:8px 0 0">${c4.total} Krafteinheiten seit dem ${fmtDate(addDays(now, -27), { day: "2-digit", month: "2-digit" })}</p>`;
  }
  const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
        : `<span class="muted">Noch kein Eintrag für ${esc(ex)} – z. B. „${split} ${split === "Legs" ? "3x10x180" : split === "Pull" ? "5x20" : "6x100"} @Ort“ als Titel.</span>`;
    return `<p class="gym-target">${txt}</p>`;
  }
  // Legende unter dem 1RM-Diagramm (Detailansicht): Orte nur, wenn es mehrere gibt (dann farbige Punkte), PR-Ring
  function liftLegend(h, placeColor, machine) {
    const places = [...new Set(h.map((e) => e.place))];
    const items = (places.length > 1 ? places.map((p) => ({ label: p, color: placeColor(p), shape: "dot" })) : [])
      .concat(h.some((e) => e.pr) ? [{ label: "PR", color: "var(--good)", shape: "ring" }] : []);
    return items.length || machine ? C.legend(items, machine ? `<span class="muted">PR nur am selben Ort</span>` : "") : "";
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
  /* ---------- Wo du gerade stehst: Highlights wie in Apple Health ---------- */
  // Oben Symbol und Titel in der Sportfarbe, ein kurzer Satz und eine Kennzahl; der ausführliche Text steht im Blatt (wie ⓘ)
  function insights() {
    const swims = ofCat(acts, "swim").filter((a) => a.km >= 0.9);
    const paces = swims.map((a) => a.sec / (a.km * 10));
    const avgSwim = swims.length ? sum(swims, (a) => a.km) / swims.length : null;
    const longestBike = Math.max(0, ...ofCat(acts, "bike").map((a) => a.km));
    const longestRun = Math.max(0, ...acts.filter((a) => a.sport === "Run").map((a) => a.km));
    const trail = acts.filter((a) => a.sport === "TrailRun").sort((a, b) => b.km - a.km)[0];
    const firstSwim = ofCat(acts, "swim").reduce((m, a) => (a.date < m ? a.date : m), snapEnd);
    const passes = ofCat(acts, "bike").filter((a) => a.elev >= 1000).length;
    const str = ofCat(acts, "strength").length;
    const last3 = inRange(addDays(snapEnd, -21), snapEnd);
    const tri3 = sum(last3.filter((a) => ["swim", "bike", "run"].includes(a.cat)), (a) => a.sec) / 3600 / 3;
    const dm = (d) => fmtDate(d, { day: "2-digit", month: "2-digit" });
    const z2 = D.zones.hr[1];
    const items = [
      { key: "swim", cat: "swim", title: "Schwimmen", text: "Der größte Hebel bis zum Rennen: regelmäßig ins Wasser.",
        value: avgSwim != null ? nf(avgSwim, 1) : "–", unit: "km", cap: "Ø pro Einheit",
        detail: `Erste Schwimmeinheit erst am ${dm(firstSwim)}${swims.length ? ` – seitdem Ø ${nf(avgSwim, 1)} km pro Einheit, Pace schwankt zwischen ${mmss(Math.min(...paces))} und ${mmss(Math.max(...paces))} /100m` : ""}. Für 3,8 km im Rennen: regelmäßig 3× pro Woche, Technik vor Umfang, Einheiten schrittweise Richtung 3 km.` },
      { key: "bike", cat: "bike", title: "Rad", text: longestBike >= 180 ? "Die Basis ist da: längste Fahrt schon über Renndistanz." : "Lange Fahrten Schritt für Schritt Richtung 180 km.",
        value: nf(longestBike, 1), unit: "km", cap: "längste Fahrt",
        detail: `Längste Fahrt seit der Anmeldung: ${nf(longestBike, 1)} km${longestBike >= 180 ? " – bereits über Renndistanz" : ""}, dazu ${passes} Ausfahrten mit über 1.000 Hm. FTP ${D.zones.ftp} W (${nf(D.zones.ftp / D.athlete.weightKg, 2)} W/kg). Für dein Ziel „schneller am Berg“: Sweet-Spot- und Bergintervalle im Winter auf Zwift.` },
      { key: "run", cat: "run", title: "Laufen", text: "Solide. Den langen Lauf bis zum Frühjahr langsam steigern.",
        value: nf(longestRun, 1), unit: "km", cap: "längster Straßenlauf",
        detail: `Längster Straßenlauf ${nf(longestRun, 1)} km${trail ? `, Trail ${nf(trail.km, 1)} km mit ${nf(trail.elev)} Hm` : ""}. Lockere Läufe in Zone 2: ${z2[0]}–${z2[1]} bpm – nach Puls, nicht nach Tempo${paceHint() ? ` (grobe Pace laut Zone-2-Auswertung: ${paceHint()})` : ""}. Langen Lauf bis zum Frühjahr langsam auf 20–24 km steigern.` },
      FLEX.active && GYM ? (() => {
        const now = new Date(), gym4 = GYM.splitCounts(GYM_SESS, ymdLocal(addDays(now, -27)), ymdLocal(now)).total;
        const minGym = (FCFG.minimum || {}).gym || 4;
        return { key: "strength", cat: "strength", title: "Kraft", text: `Schwerpunkt bis ${dm(FLEX.until)}, mindestens ${minGym}× Gym pro Woche.`,
          value: nf(gym4 / 4, 1), unit: "× pro Woche", cap: "Ø letzte 4 Wochen",
          detail: `${gym4} Krafteinheiten in den letzten 4 Wochen (Ø ${nf(gym4 / 4, 1)}/Woche). Bis ${dm(FLEX.until)} liegt der Schwerpunkt auf dem Gym – Wochen-Minimum ${minGym}× Gym. Danach neben dem Ausdauertraining auf 1–2 Erhaltungseinheiten pro Woche reduzieren.` };
      })() : { key: "strength", cat: "strength", title: "Kraft", text: "Konsequent dabei. Ab Februar auf Erhaltung reduzieren.",
        value: nf(str / weeks.length, 1), unit: "× pro Woche", cap: `Ø seit ${weeks.length} Wochen`,
        detail: `${str} Krafteinheiten in ${weeks.length} Wochen (Ø ${nf(str / weeks.length, 1)}/Woche). Ideal für Grundlage 1 – ab Februar auf 1–2 Erhaltungseinheiten reduzieren.` },
      FLEX.active
        ? { key: "volume", cat: "other", icon: "activity", title: FLEX.label, text: `Bis ${dm(FLEX.until)} zählt das Wochen-Minimum statt eines Umfangsziels.`,
          value: nf(tri3, 1), unit: "h pro Woche", cap: "Swim/Bike/Run, letzte 3 Wochen",
          detail: `Bis ${dm(FLEX.until)} zählt das Wochen-Minimum statt eines Umfangsziels: Schwerpunkt Gym, Ausdauer zur Erhaltung. In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche.` }
        : { key: "volume", cat: "other", icon: "activity", title: "Umfang", text: tri3 < 5 ? "Zuletzt wenig Ausdauer. Danach wieder Richtung 8–11 h aufbauen." : "Der Ausdauerumfang passt zur Grundlage.",
          value: nf(tri3, 1), unit: "h pro Woche", cap: "Swim/Bike/Run, letzte 3 Wochen",
          detail: `In den letzten 3 Wochen Ø ${nf(tri3, 1)} h Swim/Bike/Run pro Woche. ${tri3 < 5 ? "Kein Problem in der Grundlage – danach wieder Richtung 8–11 h aufbauen." : "Weiter so, Richtwert in der Grundlage 8–11 h."}` },
      (() => {
        const sh = Z2S && Z2S.share != null ? Math.round(Z2S.share * 100) : null;
        const text = Z2FAIL ? "Noch keine Zone-2-Auswertung verfügbar." : !Z2S ? "Wird aus deinen Läufen und Fahrten berechnet …"
          : sh == null ? "Noch keine Einheiten mit Herzfrequenz." : sh >= 75 ? "Der Großteil deiner Lauf- und Radzeit ist locker." : "Mehr ruhige Einheiten in Zone 2, Richtwert ~80 %.";
        return { key: "z2", cat: "heart", title: "Zone 2", text, value: sh == null ? "–" : String(sh), unit: "%", cap: "Anteil Z1–2, 4 Wochen",
          detail: `<p>Herzfrequenz-Zone 2: ${z2[0]}–${z2[1]} bpm. Der Anteil zählt die Zeit in Zone 1–2 aller Läufe und Fahrten der letzten 4 Wochen; Richtwert ~80 %.</p>${Z2S && Z2S.summary ? Z2S.summary.map((t) => `<p>${esc(t)}</p>`).join("") : ""}<p class="muted">Alle Werte und Verläufe: Abschnitt „Zone 2“ im Tab Erholung.</p>` };
      })(),
    ];
    items.forEach((it) => { HELP[`hl-${it.key}`] = { title: it.title, html: () => it.detail }; });
    $("#insights").innerHTML = items.map((it) => `<button type="button" class="card hl c-${it.cat}" data-info="hl-${it.key}" aria-haspopup="dialog">
      <span class="hl-head">${icon(it.icon || it.cat, 15)}<span class="hl-title">${esc(it.title)}</span>${CHEV_R}</span>
      <span class="hl-text">${it.text}</span>
      <span class="hl-fig"><span class="hl-val">${it.value}${it.value !== "–" ? `<small>${it.unit}</small>` : ""}</span><span class="hl-cap">${it.cap}</span></span>
    </button>`).join("");
  }

  /* ---------- Aktivitäten ---------- */
  // Im Tab nur die letzten Einträge, dazu „Alle anzeigen ›“ → eigene Ansicht von rechts mit Filter (#training-aktivitaeten)
  let filter = "all";
  const ACT_LIMIT = 5;
  const ACT_FILTERS = [["all", "Alle"], ["swim", "Schwimmen"], ["bike", "Rad"], ["run", "Laufen"], ["strength", "Kraft"], ["other", "Sonstiges"]];
  function actRow(a) {
    const main = a.km ? (a.cat === "swim" ? `${nf(a.km * 1000)}<small>m</small>` : `${nf(a.km, 1)}<small>km</small>`) : `${hm(a.sec)}<small>h</small>`;
    const extra = [a.km ? `${hm(a.sec)} h` : null, a.info || null, a.elev ? `${nf(a.elev)} hm` : null].filter(Boolean).join(", ");
    return irow({
      lead: rowIcon(a.cat), title: esc(actName(a)),
      sub: `${fmtDate(a.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${esc(SPORT_LABEL[a.sport] || a.sport)}`,
      val: `<b>${main}</b>${extra ? `<small>${esc(extra)}</small>` : ""}`,
    });
  }
  // Zeile „Alle anzeigen ›“ am Ende einer gekürzten Liste
  const moreRow = (href, count) => `<li><a class="ios-row more-row" href="#${href}"><span class="row-main"><span class="row-title">Alle anzeigen</span></span>${count != null ? `<span class="row-val">${count}</span>` : ""}${CHEV_R}</a></li>`;
  function activities() {
    $("#actSub").textContent = `Alle ${acts.length} Aktivitäten seit ${fmtDate(acts[acts.length - 1].date)}.${ignoredCount ? ` ${ignoredCount} Zwift-${ignoredCount === 1 ? "Fahrt" : "Fahrten"} im Flex-Zeitraum ${ignoredCount === 1 ? "zählt" : "zählen"} nicht (anderer Fahrer).` : ""}`;
    $("#actList").innerHTML = acts.slice(0, ACT_LIMIT).map(actRow).join("") + (acts.length > ACT_LIMIT ? moreRow("training-aktivitaeten", acts.length) : "");
  }
  function renderAllActivities(body) {
    const list = filter === "all" ? acts : acts.filter((a) => a.cat === filter);
    body.innerHTML = `<div class="segmented seg-wide push-filter" role="group" aria-label="Sportart filtern">${ACT_FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("")}</div>
      <p class="push-count">${list.length} ${list.length === 1 ? "Eintrag" : "Einträge"}</p>
      <div class="card list-card"><ul class="ios-list ic act-list">${list.map(actRow).join("")}</ul></div>`;
    body.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
      filter = b.dataset.f; renderAllActivities(body);
      const again = body.querySelector(`[data-f="${filter}"]`); if (again) again.focus({ preventScroll: true });
    }));
  }

  /* ---------- Datenstand: Warnung bei ausgefallenem Sync (js/freshness.js) ---------- */
  const FRESH_KEY = "ironman.freshDismiss";
  let FRESH = null;   // Datenstand (js/freshness.js) fürs Einstellungen-Blatt „Über die Daten“
  function freshBanner() {
    const el = $("#freshBanner"), FR = window.Freshness;
    if (!FR) return;
    const GD = window.GARMIN;
    // neuester Garmin-Tag mit Schlafwert – zeigt, wann die Uhr zuletzt synchronisiert hat
    const lastSleep = GD && (GD.days || []).filter((d) => d.sleepH != null || d.sleepScore != null).map((d) => d.date).sort().pop();
    const f = FR.freshness({
      now: new Date(),
      strava: { snapshotAt: S.snapshotAt, snapshotDate: S.snapshotDate },
      garmin: GD ? { updated: GD.updated, lastDay: lastSleep || null } : null,
      cfg: window.TRAINING.freshness || {},
    });
    FRESH = f;
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
  const G_LOADS = G.loads ? G.loads.filter((l) => !ignored({ date: l.start, sport: l.type, name: l.name || "" })) : null;
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


  // Wochen-Minimum als drei konzentrische Ringe (außen Gym, Mitte Ausdauer, innen Schwimmen), daneben die Werte in Ringfarbe
  // Aufziehen nur in der ersten Sekunde nach dem Laden; wird „Heute“ währenddessen neu gezeichnet
  // (z. B. wenn die Zone-2-Daten eintreffen), läuft die Animation an derselben Stelle weiter.
  const RING_MS = 800;
  let ringsT0 = null;
  function ringsBlock(wk) {
    const by = Object.fromEntries(wk.items.map((x) => [x.key, x]));
    const R = [["gym", "Gym", "strength"], ["endurance", "Ausdauer", "run"], ["swim", "Schwimmen", "swim"]].filter(([k]) => by[k]);
    if (ringsT0 == null) ringsT0 = performance.now();
    const elapsed = performance.now() - ringsT0;
    const svg = C.rings({
      size: 200, stroke: 16, gap: 4, animate: elapsed < RING_MS, animDelay: elapsed,
      items: R.map(([k, , cat]) => ({ frac: by[k].need ? by[k].have / by[k].need : 1, color: `var(--${cat})` })),
      aria: `Wochen-Minimum: ${R.map(([k, l]) => `${l} ${by[k].have} von ${by[k].need}`).join(", ")}`,
    });
    const rest = FX.minimumRest(wk);
    return `<div class="rings-head"><h3>Wochen-Minimum</h3><span class="ht-time">${wk.ok ? "erfüllt ✓" : `Woche ab ${dmS(wk.weekStart)}`}</span></div>
      <div class="rings-body">${svg}
        <div class="ring-legend">${R.map(([k, l, cat]) => `<div class="c-${cat}"><span class="rl-name">${l}</span><span class="rl-val"><b>${by[k].have}</b>/${by[k].need}</span></div>`).join("")}</div>
      </div>
      ${rest ? `<p class="ring-note">Fehlt noch: ${esc(rest)}</p>` : ""}`;
  }
  // „Heute dran“: kompakte Zeilen (Titel, Wert, eine Zeile); Antippen klappt die Details auf
  let todayOpen = null;
  const PIN = '<path d="M8 14.5s-4.6-4.3-4.6-7.9a4.6 4.6 0 0 1 9.2 0c0 3.6-4.6 7.9-4.6 7.9z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="6.6" r="1.7" fill="currentColor"/>';
  function dueRows(rows) {
    return rows.map((r) => `<li>
        <button type="button" class="ios-row due-row" data-open="${r.key}" aria-expanded="${todayOpen === r.key}" aria-controls="due-${r.key}">
          ${rowIcon(r.cat)}
          <span class="row-main"><span class="row-cat c-${r.cat}">${r.label}</span><span class="row-title">${r.value}</span>${r.line ? `<span class="row-sub">${r.line}</span>` : ""}</span>${CHEV_R}
        </button>
        <div class="due-detail" id="due-${r.key}"${todayOpen === r.key ? "" : " hidden"}>${r.detail}</div></li>`).join("");
  }
  // Ausstattung in fester Reihenfolge (Gym zuerst), Bezeichnungen aus js/flex.js
  const EQ_ORDER = ["gym", "pool", "treadmill", "runOutside", "bike", "heat"];
  const EQ_LABEL = () => {
    const all = FX ? FX.EQUIPMENT : {};
    return Object.fromEntries(EQ_ORDER.filter((k) => all[k]).map((k) => [k, all[k]]).concat(Object.entries(all).filter(([k]) => !EQ_ORDER.includes(k))));
  };
  function equipRow(eq) {
    const names = Object.entries(EQ_LABEL()).filter(([k]) => eq.includes(k)).map(([, l]) => l);
    return `<li><button type="button" class="ios-row" id="equipBtn" aria-haspopup="dialog" aria-controls="equipSheet">
        <span class="row-ic c-other"><svg class="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${PIN}</svg></span>
        <span class="row-main"><span class="row-title">Vor Ort: <span class="muted">${esc(names.join(", ") || "nichts gewählt")}</span></span></span>${CHEV_R}
      </button></li>`;
  }
  // Blatt „Vor Ort“: Schalter je Ausstattung (mindestens eine bleibt an)
  function renderEquipList() {
    const eq = loadEquipment();
    $("#equipList").innerHTML = Object.entries(EQ_LABEL()).map(([k, label]) => `<li class="ios-row eq-row" data-eq-row="${k}">
        <span class="row-main"><span class="row-title" id="eqlbl-${k}">${esc(label)}</span></span>
        <button type="button" class="switch" role="switch" aria-checked="${eq.includes(k)}" aria-labelledby="eqlbl-${k}" data-eq="${k}"><span class="knob"></span></button></li>`).join("");
  }

  function today() {
    const now = new Date();
    const rd = readiness();
    const lv = rd ? LEVELS[rd.level] : null;
    const isOld = rd && (now - rd.date) / DAY > 1.5;
    let main;
    if (FLEX.active && FX) {
      const eq = loadEquipment();
      const sg = FX.suggestFlex({ now, acts: flexActs, equipment: eq, level: rd ? rd.level : 0, cfg: FCFG, zones: D.zones.hr, paceHint: paceHint() });
      const e = sg.endurance, ecat = e ? (e.type === "swim" ? "swim" : e.type === "bike" ? "bike" : "run") : "run";
      const g = sg.gym;
      const rows = [
        { key: "gym", cat: "strength", label: "Gym", value: esc(g.title),
          line: g.rest ? "Regeneration" : g.done ? "heute erledigt" : g.skip ? "kein Gym vor Ort" : "nächster Split",
          detail: `<p>${esc(g.detail)}</p>${g.rest ? "" : targetLine(sg.next && sg.next.split)}` },
        { key: "endu", cat: ecat, label: "Ausdauer",
          value: e ? `${esc(e.title)} · ${e.minutes} min` : rd && rd.level >= 3 ? "Heute keine Ausdauer" : "Keine passende Ausstattung",
          line: e ? (e.done ? "erledigt" : e.forMinimum ? "fürs Wochen-Minimum" : "optional") : "",
          detail: `${e ? `<p>${esc(e.detail)}</p>` : `<p>${rd && rd.level >= 3 ? "Heute regenerieren." : "Unter „Vor Ort“ auswählen, was du heute nutzen kannst."}</p>`}${sg.notes.length ? `<p class="due-note">${sg.notes.map(esc).join("<br>")}</p>` : ""}` },
      ];
      main = `<div class="card today-main-card">${ringsBlock(sg.week)}
        <div class="mini-title">Heute dran</div>
        <ul class="ios-list ic due-list">${dueRows(rows)}${equipRow(eq)}</ul></div>`;
    } else {
      const s = suggestion(now, rd), cp = currentPhase(now);
      const left = cp ? Math.ceil((cp.end - now) / DAY / 7) : 0;
      const rows = [
        { key: "session", cat: CATS[s.sport] ? s.sport : "other", label: s.type === "rest" ? "Ruhetag" : CATS[s.sport] ? CATS[s.sport].label : "Training",
          value: s.type === "rest" ? esc(s.title) : `${esc(s.title)} · ${fmtMin(s.min)}`,
          line: `${s.type === "hard" ? "intensiv" : s.type === "rest" ? "Erholung" : "locker"}${s.changed ? ", angepasst" : ""}`,
          detail: `<p>${esc(s.detail)}</p>${s.changed ? `<p class="due-note">Angepasst: ${esc(s.changed)}</p>` : ""}` },
      ];
      if (cp) rows.push({ key: "phase", cat: "activity", label: "Phase", value: esc(cp.short), line: `noch ${left} ${left === 1 ? "Woche" : "Wochen"}`,
        detail: `<p>Ziel ${esc(cp.hours)} pro Woche.</p>${cp.focus && cp.focus.length ? `<ul class="due-focus">${cp.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}` });
      main = `<div class="card today-main-card"><div class="mini-title" style="margin-top:0">Heute dran</div><ul class="ios-list ic due-list">${dueRows(rows)}</ul></div>`;
    }
    // Erledigtes steht schon in „Heute dran“ und „Zuletzt gemacht“ – keine eigene Liste mehr (kein Wert doppelt)
    const sinceCard = `<div class="card today-since"><div id="sinceBox"></div></div>`;
    // Form heute: eine Zeile „Bereitschaft 88 · Bereit ›“; die Einzelwerte stehen im Erholung-Tab
    const formSub = rd ? [isOld ? `Garmin-Daten vom ${fmtDate(rd.date, { day: "2-digit", month: "2-digit" })}, nicht von heute` : "", rd.notes.length ? `Grund: ${rd.notes.join(", ")}` : ""].filter(Boolean).join(" · ") : "";
    const formCard = rd
      ? `<div class="card list-card today-form"><ul class="ios-list ic"><li><a class="ios-row" href="#erholung-readiness">${rowIcon("activity")}
          <span class="row-main"><span class="row-title">Bereitschaft</span>${formSub ? `<span class="row-sub">${esc(formSub)}</span>` : ""}</span>
          <span class="row-val"><b>${rd.R}</b></span><span class="badge ${lv.cls}">${lv.label}</span>${CHEV_R}</a></li></ul></div>`
      : `<div class="card today-form"><p class="muted" style="margin:0">Noch keine Garmin-Daten. Sobald Garmin verbunden ist, passt sich der Vorschlag täglich an Schlaf, HRV, Body Battery &amp; Co. an.</p></div>`;
    $("#today").innerHTML = `<div class="today-col">${main}${sinceCard}</div><div class="today-col"><a class="card week-card tile-link" id="weekCard" href="#heute-woche"></a>${formCard}</div>`;
    // Details auf-/zuklappen (ohne neu zu zeichnen)
    $("#today").querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
      const key = b.dataset.open, open = todayOpen !== key;
      $("#today").querySelectorAll("[data-open]").forEach((x) => { x.setAttribute("aria-expanded", "false"); const d = $(`#due-${x.dataset.open}`); if (d) d.hidden = true; });
      todayOpen = open ? key : null;
      b.setAttribute("aria-expanded", String(open));
      const d = $(`#due-${key}`); if (d) d.hidden = !open;
    }));
    const eqBtn = $("#equipBtn");
    if (eqBtn) eqBtn.addEventListener("click", (e) => { renderEquipList(); openSheet("equipSheet", e.currentTarget); });
    renderSince(now);
    renderWeekCompact(now);
    if (wks.open) renderWeek(now);
  }

  /* ---------- Wochenzusammenfassung (js/weekly.js) – feste Regeln, keine KI ---------- */
  const WK = window.Weekly, WCFG = window.TRAINING.weekly || {};
  let wkOffset = null;   // 0 = laufende Woche, 1 = Vorwoche …
  const TREND = { up: ["↑", "höher als in der Vorwoche"], down: ["↓", "niedriger als in der Vorwoche"], flat: ["→", "etwa wie in der Vorwoche"] };
  const REC_FMT = { sleepH: (v) => `${hm(v * 3600)}<small>h</small>`, sleepScore: (v) => nf(v), hrv: (v) => `${nf(v)}<small>ms</small>`, rhr: (v) => `${nf(v)}<small>bpm</small>` };
  const REC_CAT = { sleepH: "sleep", sleepScore: "sleep", hrv: "heart", rhr: "heart" };
  // Wochenrückblick für die Woche ab weekStart (js/weekly.js)
  const weekSummary = (now, weekStart) => WK.weeklySummary({
    acts, gymSessions: GYM_VIEW, garminDays: gDays, garminLoads: G_LOADS, today: now, weekStart,
    cfg: { weekly: WCFG, flex: FCFG, gym: GCFG, sinceLast: window.TRAINING.sinceLast || {} },
    equipment: FLEX.active ? loadEquipment() : null,
    emphasizeLoad: PHASES.some((p) => p.key === "reentry" && p.start < addDays(weekStart, 7) && p.end > weekStart),
  });
  const wkDm = (iso) => fmtDate(parse(iso), { day: "2-digit", month: "2-digit" });
  // Heute: kompakte Karte – Highlight-Zeile und 3 große Werte; Antippen öffnet die ganze Woche (#heute-woche)
  function renderWeekCompact(now) {
    const box = $("#weekCard");
    if (!box) return;
    if (!WK) { box.hidden = true; return; }
    const start = WK.defaultWeekStart(now), s = weekSummary(now, start);
    const sameAsRings = ymdLocal(start) === ymdLocal(monday(now));   // die Ringe zeigen die laufende Woche
    const hl = s.highlight && !(sameAsRings && s.highlight.type === "minimum") ? s.highlight : null;   // Minimum zeigen schon die Ringe
    const L = s.load;
    const stats = [
      ["Stunden", s.empty ? "–" : `${nf(s.totalSec / 3600, 1)}<small>h</small>`],
      ["Einheiten", `${s.count}`],
      ["Belastung", L && L.sum != null ? nf(L.sum) : "–"],
    ];
    box.innerHTML = `<div class="wk-cap"><span class="wk-cap-title">Woche</span><span class="wk-cap-range">${wkDm(s.monday)} – ${wkDm(s.sunday)}${s.running ? " · läuft noch" : ""}</span>${CHEV_R}</div>
      ${hl ? `<p class="wk-hl"><span aria-hidden="true">★</span><span>${esc(hl.short || hl.text)}</span></p>` : ""}
      <div class="wk-stats">${stats.map(([l, v]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}</div>
      <span class="sr-only">, ganze Woche öffnen</span>`;
  }
  // Blatt „Woche“: der komplette Rückblick mit Blättern zwischen den Wochen
  function renderWeek(now) {
    const box = $("#weekBody");
    if (!box || !WK) return;
    const thisMon = monday(now), maxBack = (WCFG.weeksBack || 8) - 1;
    if (wkOffset == null) wkOffset = Math.round((thisMon - WK.defaultWeekStart(now)) / (7 * DAY));
    const s = weekSummary(now, addDays(thisMon, -7 * wkOffset));
    const dm = wkDm;
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
    const wk = (w) => ({ label: "Trainingsbelastung", value: w && w.n ? nf(w.total) : "–", period: w ? range(parse(w.monday), addDays(parse(w.monday), 6)) : "",
      detail: w && w.n ? selRows(LOAD_ORDER.slice().reverse().filter((k) => w[k] > 0).map((k) => [LOAD_COLORS[k], "", `${LOAD_LABEL[k]} ${nf(w[k])}`])) : "keine Belastungswerte" });
    const pct = L.diffPct;
    const summary = { ...wk(weeks[sel]), value: L.sum == null ? "–" : nf(L.sum),
      period: `${weeks[sel] ? range(parse(weeks[sel].monday), addDays(parse(weeks[sel].monday), 6)) : ""}${L.prevSum != null ? `, Vorwoche ${nf(L.prevSum)}${pct != null ? ` (${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}&nbsp;%)` : ""}` : ""}` };
    mount(box, (W) => {
      box.innerHTML = C.barChart({
        width: W, height: C.SMALL, aria, maxBar: 26, currentBg: "var(--surface-2)", y: { ...ax, fmt: tickFmt(ax) },   // aktuelle Woche neutral
        bands: weeks.map((w, i) => ({
          label: dmS(parse(w.monday)), current: i === cur, selected: i === sel && i !== cur, topLabel: i === sel && w.n ? nf(w.total) : null,
          stacks: LOAD_ORDER.map((k) => ({ v: w[k], color: LOAD_COLORS[k] })),
        })),
      });
      // Hovern zeigt die Woche oben im Kopf; Antippen/Klicken wählt die Woche für die ganze Karte
      bindSel(box, { summary, select: (i) => wk(weeks[i]), pick: (i) => { wkOffset = weeks.length - 1 - i; renderWeek(now); } });
    });
  }
  // Zeile zur Detailansicht Trainingsbelastung (Wochensummen, akut/chronisch)
  const loadLink = () => (MX && MX.byKey.belastung ? `<ul class="ios-list ic wk-link"><li><a class="ios-row" href="#${metricHash(MX.byKey.belastung)}">${rowIcon("activity", "trend")}<span class="row-main"><span class="row-title">Trainingsbelastung</span><span class="row-sub">Alle Wochen und akut/chronisch</span></span>${CHEV_R}</a></li></ul>` : "");
  function loadBlock(s) {
    const L = s.load;
    if (!L) return G.loads ? "" : `<div class="mini-title">Belastung (Garmin) ${infoBtn("load", "Belastung")}</div><p class="muted wk-note">Belastungswerte kommen mit dem nächsten Garmin-Update.</p>`;
    const pct = L.diffPct;
    const head = L.sum == null ? `<span class="muted">Keine Belastungswerte in dieser Woche.</span>`
      : `Trainingsbelastung: <b>${nf(L.sum)}</b>${L.prevSum != null ? ` <span class="muted" style="white-space:nowrap">(Vorwoche ${nf(L.prevSum)}${pct != null ? `, ${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} %` : ""})</span>` : ""}`;
    const ac = L.acute != null ? `<p class="wk-load-line">Akut ${nf(L.acute)}, chronisch ${nf(L.chronic)}${L.ratio != null ? `, Verhältnis ${nf(L.ratio, 1)}` : ""}${L.status && LOAD_STATUS[L.status] ? `<br>Garmin: <b>${LOAD_STATUS[L.status]}</b>` : ""} <span class="muted">(Stand ${fmtDate(parse(L.statusDate), { day: "2-digit", month: "2-digit" })})</span></p>` : "";
    return `<div class="mini-title">Belastung (Garmin) ${infoBtn("load", "Belastung")}</div>
      <div class="chart load-box"></div>
      ${C.legend(LOAD_ORDER.slice().reverse().map((k) => ({ label: LOAD_LABEL[k], color: LOAD_COLORS[k] })))}
      ${ac}
      ${L.withoutLoad ? `<p class="muted wk-note">${L.withoutLoad} ${L.withoutLoad === 1 ? "Einheit" : "Einheiten"} ohne Belastungswert</p>` : ""}
      ${loadLink()}`;
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

  /* ---------- Detailansichten (js/metrics.js): großer Wert, Diagramm, Zeitraum, Statistik – wie in Apple Health ---------- */
  const MX = window.Metrics;
  const CAT_COLOR = { heart: "var(--heart)", sleep: "var(--sleep)", activity: "var(--bike)", body: "var(--body)", run: "var(--run)", bike: "var(--bike)", swim: "var(--swim)", strength: "var(--strength)", other: "var(--other)" };
  const metricHash = (m) => `${m.tab}-${m.key}`;
  const metricOfHash = (id) => (MX && id ? MX.REGISTRY.find((m) => metricHash(m) === id) || null : null);
  const dShort = (iso) => fmtDate(parse(iso), { day: "numeric", month: "short" });
  const dWeek = (iso) => fmtDate(parse(iso), { weekday: "short", day: "numeric", month: "short" });
  const wLabel = (w) => (w.from === w.to ? dShort(w.from) : `${dShort(w.from)} – ${dShort(w.to)}`);
  const md = { key: null, period: null, pushed: false, opener: null, zf: "all" };
  let Z2S = null, Z2FAIL = false;   // Zone-2-Auswertung für die Detailansichten (setzt renderZone2)
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const PER = { day: ["Tag", "Tage"], week: ["Woche", "Wochen"], run: ["Lauf", "Läufe"], ride: ["Fahrt", "Fahrten"], session: ["Einheit", "Einheiten"], entry: ["Eintrag", "Einträge"] };
  const perTxt = (m, n) => `${n} ${(PER[m.per] || PER.day)[n === 1 ? 0 : 1]}`;
  const when = (m, iso) => (m.per === "week" ? `Woche ab ${dShort(iso)}` : dWeek(iso));
  const placeTxt = (p) => (!p || p === "unbekannt" ? "Ort unbekannt" : `@${esc(p)}`);
  const metricSeries = (m) => MX.series(gDays, m.field);
  const metricName = (m) => (Z2S && m.source === "z2pace" ? `Pace bei ${Z2S.runMid} bpm` : Z2S && m.source === "z2watts" ? `Watt bei ${Z2S.rideMid} bpm` : m.name);
  // Mini-Linie der letzten 7 Tage für die großen Kacheln (ohne Achsen)
  const spark7 = (m) => C.sparkline(MX.daily(metricSeries(m), MX.windowOf("7", ymdLocal(new Date()))).map((p) => p.v), { color: CAT_COLOR[m.cat] || "var(--text-2)" });
  // Garmin-Belastung je Woche seit Beginn der Belastungsdaten: abgeschlossene Wochen (Statistik) und die laufende Woche
  function loadWeekPts() {
    if (!WK || !G_LOADS || !G.loadsSince) return { done: [], cur: null };
    const now = new Date(), thisMon = monday(now), n = Math.round((thisMon - monday(parse(G.loadsSince))) / (7 * DAY)) + 1;
    const all = WK.loadWeeks({ garminLoads: G_LOADS, acts, gymSessions: GYM_VIEW, today: now, weeks: Math.max(1, n) }).reverse()
      .filter((w) => w.monday >= G.loadsSince).map((w) => ({ date: w.monday, v: w.total, w }));   // erste Woche nur, wenn sie ganz erfasst ist
    const cur = ymdLocal(thisMon);
    return { done: all.filter((p) => p.date < cur), cur: all.find((p) => p.date === cur) || null };
  }
  // Punkte einer Kennzahl [{ date, v, … }] aufsteigend; null = Zone-2-Daten noch nicht da
  function metricPoints(m) {
    const Z = window.Z2;
    if (/^z2/.test(m.source || "") && !Z2S) return null;
    switch (m.source) {
      case "z2pace": return Z.paceSeries(Z2S.recs).sort(byDate);
      case "z2watts": return Z.wattSeries(Z2S.recs, true).sort(byDate);
      case "z2dec": return Z.decouplingSeries(Z2S.recs).sort(byDate);
      case "z2zones": return Z.weeklyZones(Z2S.all, md.zf === "all" ? null : md.zf).map((w) => {
        const tot = w.sec.reduce((a, b) => a + b, 0), z12 = w.sec[0] + w.sec[1];
        return { date: w.week, v: tot ? (z12 / tot) * 100 : null, z12, tot, sec: w.sec };
      }).filter((p) => p.tot > 0);
      case "lift": return GYM ? GYM.exerciseHistory(GYM_SESS, m.exercise, GCFG).map((e) => ({ date: e.date, v: e.e1rm, e })).sort(byDate) : [];
      case "weekload": return loadWeekPts().done;
      default: return metricSeries(m);
    }
  }
  // Zusatz zum „Über diese Werte“-Text aus den aktuellen Daten (Pulsband, erkannte Pulsmesser, Zonengrenzen)
  function aboutExtra(m) {
    if (!Z2S) return "";
    if (m.source === "z2pace") return ` Pulsband: ${Z2S.runBand[0]}–${Z2S.runBand[1]} bpm. ${Z2S.srcTxt}`;
    if (m.source === "z2watts") return ` Pulsband: ${Z2S.rideBand[0]}–${Z2S.rideBand[1]} bpm.`;
    if (m.source === "z2zones") return ` Zonen: ${D.zones.hr.map((z, i) => `Z${i + 1} ${i === 0 ? "unter " + D.zones.hr[1][0] : z[1] == null ? "ab " + z[0] : z[0] + "–" + z[1]}`).join(", ")} bpm.`;
    return "";
  }
  const hmVal = (h) => { let H = Math.floor(h), Mi = Math.round((h - H) * 60); if (Mi === 60) { H++; Mi = 0; } return `${H}<small>h</small> ${Mi}<small>min</small>`; };
  const mVal = (m, v) => (v == null ? "–" : m.fmt === "hm" ? hmVal(v) : m.fmt === "pace" ? hv(mmss(v), m.unit) : hv(nf(v, m.decimals || 0), m.unit));
  const mTxt = (m, v) => (v == null ? "–" : m.fmt === "hm" ? `${hm(v * 3600)} h` : m.fmt === "pace" ? `${mmss(v)} ${m.unit}` : `${nf(v, m.decimals || 0)}${m.unit ? " " + m.unit : ""}`);
  // Veränderung mit Pfeil; Pace: kleiner = schneller = oben im Diagramm (↑)
  function diffTxt(m, ch) {
    if (!ch) return "–";
    const eps = m.fmt === "hm" ? 1 / 120 : 0.5 / 10 ** (m.decimals || 0), d = Math.abs(ch.diff) < eps ? 0 : ch.diff, abs = mTxt(m, Math.abs(d));
    if (!d) return `→ ±${abs}`;
    if (m.invert) return `${d < 0 ? "↑" : "↓"} ${abs} ${d < 0 ? "schneller" : "langsamer"}`;
    return `${d > 0 ? "↑ +" : "↓ −"}${abs}`;
  }
  const bandOf = (m) => { const d = gDays[gDays.length - 1] || {}; return m.band && Number.isFinite(d[m.band[0]]) && Number.isFinite(d[m.band[1]]) ? { from: d[m.band[0]], to: d[m.band[1]], color: CAT_COLOR[m.cat] } : null; };
  const zoneFilterHtml = () => `<div class="segmented md-filter" role="group" aria-label="Sportart">${[["all", "Alle"], ["run", "Laufen"], ["ride", "Rad"]].map(([k, l]) => `<button type="button" data-zf="${k}" aria-pressed="${md.zf === k}">${l}</button>`).join("")}</div>`;

  function renderMetric() {
    const m = MX.byKey[md.key];
    if (!m) return;
    $("#mdTitle").innerHTML = `<span class="md-ic c-${m.cat}">${icon(m.icon || m.cat, 20)}</span><span class="md-name c-${m.cat}">${esc(metricName(m))}</span>`;
    const body = $("#mdBody"), about = `<p class="md-about"><b>Über diese Werte</b><br>${esc(m.about + aboutExtra(m))}</p>`;
    const pts = metricPoints(m);
    if (pts == null) {   // Zone-2-Daten kommen per fetch: Platzhalter statt leerer Fläche
      body.innerHTML = (Z2FAIL ? C.empty("Zone-2-Daten nicht verfügbar (nur auf der veröffentlichten Seite).")
        : `<div class="sk-wrap" aria-hidden="true"><div class="sk sk-num sk-w50"></div><div class="sk sk-line sk-w30"></div><div class="sk sk-chart"></div></div><p class="sr-only">Wird geladen …</p>`) + about;
      return;
    }
    const today = ymdLocal(new Date()), periods = MX.availablePeriods(pts, today, m.periods || null);
    if (!periods.includes(md.period)) md.period = MX.defaultPeriod(m, periods);
    const filter = m.chart === "zones" ? zoneFilterHtml() : "";
    if (!md.period) { body.innerHTML = filter + C.empty("Noch keine Daten.") + about; bindDetail(body); return; }
    const w = MX.windowOf(md.period, today, pts[0].date), inW = MX.inWindow(pts, w);
    const c = { m, pts, w, inW, st: MX.stats(inW), value: MX.summarizeMetric(m, inW), ch: MX.change(pts, w, m, md.period), pw: MX.previousWindow(w) };
    body.innerHTML = `
      <div class="segmented seg-wide md-periods" role="group" aria-label="Zeitraum">${MX.PERIODS.filter((p) => periods.includes(p.key)).map((p) => `<button type="button" data-period="${p.key}" aria-pressed="${p.key === md.period}">${p.label}</button>`).join("")}</div>
      ${filter}<div class="chart md-chart" id="mdChart"></div>${legendHtml(c)}${statsHtml(c)}${extraHtml(c)}${about}`;
    bindDetail(body);
    drawMetricChart(c);
  }
  function bindDetail(body) {
    const again = (sel) => { const b = $(`#mdBody ${sel}`); if (b) b.focus({ preventScroll: true }); };
    body.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { md.period = b.dataset.period; renderMetric(); again(`[data-period="${md.period}"]`); }));
    body.querySelectorAll("[data-zf]").forEach((b) => b.addEventListener("click", () => { md.zf = b.dataset.zf; renderMetric(); again(`[data-zf="${md.zf}"]`); }));
  }
  // Zone-2-Punkte im Zeitraum (Outdoor-Fahrten hohl) und gleitende Mediane; einmal je Darstellung berechnet
  function scatterData(c) {
    if (c._sd) return c._sd;
    const { m, pts, w, inW } = c, Z = window.Z2, cfg = window.TRAINING.z2, pace = m.fmt === "pace", inWin = (p) => p.date >= w.from && p.date <= w.to;
    const outAll = m.source === "z2watts" ? Z.wattSeries(Z2S.recs, false).sort(byDate) : [];   // Outdoor: nicht in der Statistik
    const toP = (p, outdoor) => ({ d: parse(p.date), v: p.v, date: p.date, rec: p.rec, outdoor, gap: pace && !!(p.rec.pace && p.rec.pace.gap), hollow: pace ? p.rec.hrSrc !== "strap" : outdoor });
    const roll = (arr) => (arr.length >= cfg.minPoints ? Z.rollingMedian(arr, cfg.windowDays).filter(inWin).map((p) => ({ d: parse(p.date), v: p.v })) : []);
    c._sd = { pace, toP, sp: inW.map((p) => toP(p, false)).concat(outAll.filter(inWin).map((p) => toP(p, true))).sort((a, b) => a.d - b.d), med: roll(pts), medOut: roll(outAll) };
    return c._sd;
  }
  function legendHtml(c) {
    const { m, inW } = c, color = CAT_COLOR[m.cat];
    switch (m.chart) {
      case "scatter": {   // nur, was im Diagramm zu sehen ist
        const { sp, med, medOut } = scatterData(c), has = (f) => sp.some(f);
        if (m.source === "z2pace") {
          return C.legend([
            has((p) => !p.gap && !p.hollow) && { label: "Brustgurt", color, shape: "dot", opacity: 0.45 },
            has((p) => !p.gap && p.hollow) && { label: "Uhr / unbekannt", color, shape: "hollow" },
            has((p) => p.gap) && { label: "GAP (hügelig)", color, shape: "diamond", opacity: 0.45 },
            med.length > 1 && { label: "Median 4 Wochen", color, shape: "line" },
          ].filter(Boolean), `<span class="muted">schneller = oben</span>`);
        }
        return C.legend([
          has((p) => !p.outdoor) && { label: "Indoor (Zwift)", color, shape: "dot", opacity: 0.45 },
          has((p) => p.outdoor) && { label: "Outdoor", color, shape: "hollow" },
          med.length > 1 && { label: "Median Indoor", color, shape: "line" },
          medOut.length > 1 && { label: "Median Outdoor", color, shape: "dash" },
        ].filter(Boolean));
      }
      case "dec": return C.legend([{ label: "unter 5 %", color: "var(--good)", shape: "dot" }, { label: "5–10 %", color: "var(--warn)", shape: "dot" }, { label: "über 10 %", color: "var(--bad)", shape: "dot" }]);
      case "zones": return C.legend(D.zones.hr.map((z, i) => ({ color: ZCOL[i], label: `Z${i + 1}` })));
      case "lift": return liftLegend(inW.map((p) => p.e), placeColor, (GCFG.perPlace || []).includes(m.exercise));
      case "weekload": return C.legend(LOAD_ORDER.slice().reverse().map((k) => ({ label: LOAD_LABEL[k], color: LOAD_COLORS[k] })));
      default:
        if (m.field2) return C.legend([{ label: m.name1, color, shape: "line" }, { label: m.name2, color: "var(--text-2)", shape: "dash" }]);
        return bandOf(m) ? C.legend([{ label: "Normalbereich laut Garmin", color, opacity: 0.3 }]) : "";
    }
  }
  // Gruppierte Statistik: Durchschnitt/Median, Minimum, Maximum, Veränderung, letzter Wert (1RM: Bestwert, letzter Eintrag, Ziel)
  function statsHtml(c) {
    const { m, inW, st, value, ch, pw } = c, b = (x) => `<b>${x}</b>`;
    const chRow = irow({ title: "Veränderung", sub: ch ? `zum Vorzeitraum ${wLabel(pw)}` : md.period === "all" ? "bei „Alle“ kein Vorzeitraum" : "keine Daten im Vorzeitraum", val: b(diffTxt(m, ch)) });
    let rows;
    if (m.chart === "lift") {
      const es = inW.map((p) => p.e), best = es.reduce((a, e) => (e.e1rm > a.e1rm ? e : a), es[0]), last = es[es.length - 1];
      const gp = GYM.goalProgress(GYM_SESS, m.exercise, GCFG);
      rows = [
        irow({ title: "Bestes 1RM", sub: `${dWeek(best.date)} · ${setTxt(best)} ${placeTxt(best.place)}`, val: b(mVal(m, best.e1rm)) }),
        irow({ title: "Letzter Eintrag", sub: `${dWeek(last.date)} · ${setTxt(last)} ${placeTxt(last.place)}`, val: b(mVal(m, last.e1rm)) }),
        gp ? irow({ title: "Ziel", sub: gp.current == null ? "noch kein Eintrag" : gp.reached ? "erreicht" : `${gp.pct} % erreicht${gp.perPlace && gp.place ? ` in ${esc(gp.place)}` : ""}`, val: b(hv(nf(gp.goal), "kg")) }) : "",
        chRow,
      ];
    } else {
      let first = ["Durchschnitt", st.avg], sub = `${perTxt(m, st.n)}${m.per ? "" : " mit Daten"}`;
      if (m.summary === "median") first = ["Median", st.median];
      if (m.aggregate) {
        const tot = inW.reduce((a, p) => a + p.tot, 0), z = (i) => inW.reduce((a, p) => a + i.reduce((s, k) => s + p.sec[k], 0), 0);
        first = [m.summaryLabel, value];
        sub = `${hm(tot)} h in ${perTxt(m, st.n)} · Z3 ${Math.round((z([2]) / tot) * 100)} %, Z4–5 ${Math.round((z([3, 4]) / tot) * 100)} %`;
      }
      if (m.chart === "weekload") sub = `${perTxt(m, st.n)}, nur abgeschlossene`;
      const [lo, hi] = m.invert ? ["Schnellste", "Langsamste"] : ["Minimum", "Maximum"];
      rows = [
        irow({ title: first[0], sub, val: b(mVal(m, first[1])) }),
        irow({ title: lo, sub: when(m, st.minAt), val: b(mVal(m, st.min)) }),
        irow({ title: hi, sub: when(m, st.maxAt), val: b(mVal(m, st.max)) }),
        chRow,
        irow({ title: m.chart === "weekload" ? "Letzte Woche" : m.per === "week" ? "Neueste Woche" : "Letzter Wert", sub: when(m, st.lastDate), val: b(mVal(m, st.last)) }),
      ];
      const cur = m.chart === "weekload" ? loadWeekPts().cur : null;
      if (cur) rows.push(irow({ title: "Diese Woche", sub: "läuft noch", val: b(cur.w.n ? mVal(m, cur.v) : "–") }));
    }
    return `<div class="card list-card md-stats"><ul class="ios-list">${rows.join("")}</ul></div>`;
  }
  // Unter der Statistik: 1RM → alle Einträge (neueste zuerst); Belastung → akut/chronisch
  function extraHtml(c) {
    const { m, pts } = c;
    if (m.chart === "lift") {
      return `<h3 class="md-sub">Alle Einträge <span class="md-count">${pts.length}</span></h3>
        <div class="card list-card md-entries"><ul class="ios-list">${pts.slice().reverse().map((p) => irow({
          title: `${dWeek(p.date)}${p.e.pr ? ` <span class="badge good">PR</span>` : ""}`, sub: `${setTxt(p.e)} ${placeTxt(p.e.place)}`, val: `<b>${mVal(m, p.v)}</b>` })).join("")}</ul></div>`;
    }
    if (m.chart === "weekload") {
      return `<h3 class="md-sub">Akut und chronisch</h3><div class="chart md-chart" id="mdChart2"></div>
        ${C.legend([{ label: "akut (7 Tage)", color: CAT_COLOR[m.cat], shape: "line" }, { label: "chronisch (28 Tage)", color: "var(--text-2)", shape: "dash" }])}`;
    }
    return "";
  }
  // Diagramm erst beim Öffnen zeichnen (dann ist die echte Breite bekannt)
  function drawMetricChart(c) {
    const { m, w, value } = c;
    const summary = { label: m.summaryLabel || MX.SUMMARY_LABEL[m.summary], value: mVal(m, value), period: wLabel(w) };
    const o = { color: CAT_COLOR[m.cat] || "var(--text-2)", refs: m.refs || [], summary, aria: `${metricName(m)}, ${wLabel(w)}: ${summary.label} ${mTxt(m, value)}` };
    (DRAW[m.chart] || DRAW.line)($("#mdChart"), c, o);
  }
  const xr = (w) => [parse(w.from), parse(w.to)];   // x-Achse über den ganzen Zeitraum
  const DRAW = {
    // Tageswerte als Balken (Schlaf, Schritte), fehlende Tage leer
    bar(box, { m, pts, w }, o) {
      const dl = MX.daily(pts, w), ax = MX.axis(m, dl.map((p) => p.v).concat(o.refs.map((r) => r.v)));
      mount(box, (W) => {
        box.innerHTML = C.barChart({ width: W, height: C.LARGE, aria: o.aria, refs: o.refs, maxBar: 14, y: { ...ax, fmt: tickFmt(ax, m.fmt === "hm" ? " h" : "") },
          bands: dl.map((p) => ({ label: dmS(parse(p.date)), stacks: p.v == null ? [] : [{ v: p.v, color: o.color }] })) });
        bindScrub(box, { summary: o.summary, select: (i) => ({ label: dl[i].v == null ? "Keine Daten" : m.name, value: dl[i].v == null ? "–" : mVal(m, dl[i].v), period: dWeek(dl[i].date) }) });
      });
    },
    // Tageswerte als Linie, optional zweite Reihe (gestrichelt), Normalbereich und Ziel-/Schwellenlinien
    line(box, { m, w, inW: raw }, o) {
      const band = bandOf(m), inW = raw.map((p) => ({ d: parse(p.date), v: p.v, date: p.date }));
      const sec = m.field2 ? MX.inWindow(MX.series(gDays, m.field2), w).map((p) => ({ d: parse(p.date), v: p.v })) : [];
      const ax = MX.axis(m, inW.map((p) => p.v).concat(sec.map((p) => p.v), o.refs.map((r) => r.v), band ? [band.from, band.to] : []));
      const v2 = new Map(sec.map((p) => [+p.d, p.v])), last = inW[inW.length - 1];
      mount(box, (W) => {
        box.innerHTML = C.lineChart({ width: W, height: C.LARGE, aria: o.aria, band, refs: o.refs, y: { ...ax, fmt: tickFmt(ax) }, xRange: xr(w),
          series: [{ pts: inW, color: o.color }].concat(sec.length ? [{ pts: sec, color: "var(--text-2)", dash: true, dots: false }] : []),
          latest: last ? { d: last.d, v: last.v, label: nf(last.v, m.decimals || 0) } : null, hits: inW });
        bindScrub(box, { summary: o.summary, select: (i) => {
          const p = inW[i], b = v2.get(+p.d);
          return { label: m.field2 ? `${m.name1}${b != null ? `, ${m.name2} ${nf(b)}` : ""}` : m.name, value: mVal(m, p.v), period: dWeek(p.date) };
        } });
      });
    },
    // Zone 2: Einzelwerte als blasse Punkte, gleitender Median (4 Wochen) als Linie; Pace mit schneller = oben
    scatter(box, c, o) {
      const { m, w, inW } = c, { pace, toP, sp, med, medOut } = scatterData(c), fmt = pace ? mmss : (v) => nf(v);
      const ax = pace ? C.paceAxis(sp.map((p) => p.v)) : C.padAxis(sp.map((p) => p.v));
      const last = inW.length ? toP(inW[inW.length - 1], false) : null;
      mount(box, (W) => {
        box.innerHTML = C.lineChart({ width: W, height: C.LARGE, aria: o.aria, y: { ...ax, fmt: pace ? mmss : tickFmt(ax), invert: !!m.invert }, xRange: xr(w),
          series: [{ pts: med, color: o.color, dots: false }, { pts: medOut, color: o.color, dash: true, dots: false }].filter((s) => s.pts.length > 1),
          scatter: sp.map((p) => ({ d: p.d, v: p.v, color: o.color, shape: p.gap ? "diamond" : p.hollow ? "hollow" : "dot", opacity: p.hollow ? 0.8 : 0.45 })),
          latest: last ? { d: last.d, v: last.v, label: fmt(last.v) } : null, hits: sp });
        bindScrub(box, { summary: o.summary, select: (i) => { const p = sp[i]; return { label: pace ? (p.gap ? "Pace (GAP)" : "Pace") : p.outdoor ? "Outdoor" : "Indoor", value: mVal(m, p.v), period: dWeek(p.date), detail: recNote(p) }; } });
      });
    },
    // Entkopplung je langer Einheit: neutrale Balken, Ampel als Punkt, Schwellen als Linien
    dec(box, { m, inW }, o) {
      const Z = window.Z2, thr = window.TRAINING.z2.decoupling.thresholds, vs = inW.map((p) => p.v);
      const ax = C.zeroAxis(Math.max(thr[1], ...vs), { min: Math.min(0, ...vs), clamp: [-100, 100] });
      mount(box, (W) => {
        box.innerHTML = C.barChart({ width: W, height: C.LARGE, minBands: 6, maxBar: 14, aria: o.aria, y: { ...ax, fmt: tickFmt(ax, " %") },
          refs: [{ v: thr[0], label: `Ziel < ${thr[0]} %` }, { v: thr[1], label: `${thr[1]} %` }],
          bands: inW.map((p) => ({ label: dmS(parse(p.date)), stacks: [{ v: p.v, color: DEC_BAR }], dot: STATUS_COL[Z.ampel(p.v, thr)] })) });
        bindScrub(box, { summary: o.summary, select: (i) => {
          const p = inW[i], r = p.rec, st = Z.ampel(p.v, thr);
          return { label: `Entkopplung, ${STATUS_TXT[st]}`, value: mVal(m, p.v), period: dWeek(p.date),
            detail: `${esc(r.name)}<br>${r.kind === "run" ? "Lauf" : "Rad"}, ${nf(r.km, 1)} km in ${hm(r.sec)} h<br>Z1–2 ${Math.round(r.decoupling.z12Share * 100)} %${r.decoupling.vi ? `, VI ${nf(r.decoupling.vi, 2)}` : ""}${r.decoupling.gap ? ", GAP" : ""}` };
        } });
      });
    },
    // Zeit pro HF-Zone und Woche (gestapelt, Z1 hell → Z5 dunkel), laufende Woche hervorgehoben
    zones(box, { m, inW }, o) {
      const curMon = ymdLocal(monday(new Date())), ax = C.zeroAxis(Math.max(...inW.map((p) => p.tot / 3600)));
      mount(box, (W) => {
        box.innerHTML = C.barChart({ width: W, height: C.LARGE, maxBar: 22, aria: o.aria, y: { ...ax, fmt: tickFmt(ax, " h") },
          bands: inW.map((p) => ({ label: dmS(parse(p.date)), current: p.date === curMon, stacks: p.sec.map((sec, z) => ({ v: sec / 3600, color: ZCOL[z] })) })) });
        bindScrub(box, { summary: o.summary, select: (i) => {
          const p = inW[i];
          return { label: `Anteil Z1–2, ${hm(p.tot)} h`, value: mVal(m, p.v), period: `${range(parse(p.date), addDays(parse(p.date), 6))}${p.date === curMon ? ", läuft noch" : ""}`,
            detail: selRows(p.sec.map((sec, z) => [ZCOL[z], "", `Z${z + 1} ${hm(sec)}`]).filter((r, z) => p.sec[z] >= 30)) };
        } });
      });
    },
    // 1RM-Verlauf: neutrale Linie (bei mehreren Orten farbige Punkte), PR als Ring, Ziel als gestrichelte Linie
    lift(box, { m, w, inW }, o) {
      const goal = o.refs[0] ? o.refs[0].v : null, ps = inW.map((p) => ({ d: parse(p.date), v: p.v, date: p.date, e: p.e }));
      const ax = C.padAxis(ps.map((p) => p.v), { include: goal ? [goal] : [] });   // Ziel immer sichtbar
      const places = [...new Set(ps.map((p) => p.e.place))], multi = places.length > 1, last = ps[ps.length - 1];
      // Maschinen je Ort nicht verbinden: dann eine Linie je Ort
      const series = !multi || ps.every((p) => p.e.compareKey === "alle") ? [{ pts: ps, color: "var(--text-2)", dots: !multi }]
        : places.map((pl) => ({ pts: ps.filter((p) => p.e.place === pl), color: placeColor(pl), dots: false }));
      mount(box, (W) => {
        box.innerHTML = C.lineChart({ width: W, height: C.LARGE, aria: o.aria, y: { ...ax, fmt: tickFmt(ax) }, xRange: xr(w), series, refs: o.refs,
          scatter: multi ? ps.map((p) => ({ d: p.d, v: p.v, color: placeColor(p.e.place), shape: "dot", r: 3.5 })) : [],
          marks: ps.filter((p) => p.e.pr).map((p) => ({ d: p.d, v: p.v, color: "var(--good)" })),
          latest: { d: last.d, v: last.v, label: nf(last.v) }, hits: ps });
        bindScrub(box, { summary: o.summary, select: (i) => { const p = ps[i]; return { label: p.e.pr ? "1RM, PR" : "1RM", value: mVal(m, p.v), period: `${dWeek(p.date)} ${placeTxt(p.e.place)}`, detail: setTxt(p.e) }; } });
      });
    },
    // Wochensummen der Garmin-Belastung (gestapelt nach Kraft/Sonstiges/Ausdauer), dazu akut/chronisch als Linien
    weekload(box, { m, w, inW }, o) {
      const cur = loadWeekPts().cur, show = inW.concat(cur ? [cur] : []), ax = C.zeroAxis(Math.max(1, ...show.map((p) => p.v)));
      mount(box, (W) => {
        box.innerHTML = C.barChart({ width: W, height: C.LARGE, maxBar: 22, aria: o.aria, y: { ...ax, fmt: tickFmt(ax) },
          bands: show.map((p) => ({ label: dmS(parse(p.date)), current: p === cur, stacks: LOAD_ORDER.map((k) => ({ v: p.w[k], color: LOAD_COLORS[k] })) })) });
        bindScrub(box, { summary: o.summary, select: (i) => {
          const p = show[i];
          return { label: p === cur ? "Diese Woche, läuft noch" : "Trainingsbelastung", value: p.w.n ? nf(p.v) : "–", period: range(parse(p.date), addDays(parse(p.date), 6)),
            detail: p.w.n ? selRows(LOAD_ORDER.slice().reverse().filter((k) => p.w[k] > 0).map((k) => [LOAD_COLORS[k], "", `${LOAD_LABEL[k]} ${nf(p.w[k])}`])) : "keine Belastungswerte" };
        } });
      });
      const box2 = $("#mdChart2");
      const ac = MX.inWindow(MX.series(gDays, "acuteLoad"), w).map((p) => ({ d: parse(p.date), v: p.v, date: p.date }));
      const chr = MX.inWindow(MX.series(gDays, "chronicLoad"), w), chrOf = new Map(chr.map((p) => [p.date, p.v]));
      if (!ac.length) { noChart(box2, "Keine akuten Belastungswerte im Zeitraum."); return; }
      const crs = chr.map((p) => ({ d: parse(p.date), v: p.v })), lastA = ac[ac.length - 1], lastC = chrOf.get(lastA.date);
      const ax2 = C.zeroAxis(Math.max(...ac.map((p) => p.v), ...crs.map((p) => p.v)));
      const sum2 = { label: "Akut / chronisch", value: `${nf(lastA.v)}<small> / ${lastC != null ? nf(lastC) : "–"}</small>`, period: `Stand ${dWeek(lastA.date)}` };
      mount(box2, (W) => {
        box2.innerHTML = C.lineChart({ width: W, height: C.SMALL, aria: `Akute und chronische Belastung, ${wLabel(w)}: zuletzt akut ${nf(lastA.v)}${lastC != null ? `, chronisch ${nf(lastC)}` : ""}`,
          y: { ...ax2, fmt: tickFmt(ax2) }, xRange: xr(w), series: [{ pts: ac, color: o.color }, { pts: crs, color: "var(--text-2)", dash: true, dots: false }],
          latest: { d: lastA.d, v: lastA.v, label: nf(lastA.v) }, hits: ac });
        bindScrub(box2, { summary: sum2, select: (i) => { const p = ac[i], b = chrOf.get(p.date); return { label: `akut${b != null ? `, chronisch ${nf(b)}` : ""}`, value: nf(p.v), period: dWeek(p.date) }; } });
      });
    },
  };
  function openMetric(key) {
    const bd = $("#metricSheet");
    if (md.key !== key) { md.key = key; md.period = null; md.zf = "all"; }
    if (bd.hidden) openSheet("metricSheet", md.opener || document.activeElement);
    renderMetric();
  }
  /* ---------- Eigene Ansicht von rechts (wie ein iOS-Push) für lange Listen: „Alle anzeigen ›“ ---------- */
  // Die Tab-Leiste bleibt sichtbar; der Tab dahinter rückt ein Stück nach links (Parallaxe). Zurück: „‹ Training“,
  // Wischen vom linken Rand (folgt dem Finger 1:1, Schnippen reicht), Esc oder das Zurück des Browsers.
  const PUSH = {
    "training-aktivitaeten": { tab: "training", back: "Training", title: "Aktivitäten", render: (b) => renderAllActivities(b) },
    "plan-phasen": { tab: "plan", back: "Plan", title: "Alle Phasen", render: (b) => renderAllPhases(b) },
  };
  const pv = { id: null, pushed: false, opener: null };
  const pushEl = $("#pushView"), pushScroll = $("#pushScroll"), mainEl = $("main");
  const PARALLAX = 24;   // % um die der Tab dahinter nach links rückt
  function updatePushBar() {
    if (!pv.id || !NV) return;
    const h1 = $("#pushTitle"), bar = pushEl.querySelector(".push-bar"), r = h1.getBoundingClientRect();
    const p = NV.titleProgress(r.top, r.height, bar.offsetHeight);
    pushEl.querySelector(".push-bar-bg").style.opacity = p ? String(Math.round(p * 100) / 100) : "";
    pushEl.classList.toggle("compact", p > 0.85);
  }
  pushScroll.addEventListener("scroll", () => requestAnimationFrame(updatePushBar), { passive: true });
  function openPush(id) {
    const P = PUSH[id];
    pv.id = id;
    $("#pushBackLabel").textContent = P.back;
    $("#pushBack").setAttribute("aria-label", `Zurück zu ${P.back}`);
    $("#pushTitle").textContent = P.title; $("#pushBarTitle").textContent = P.title;
    P.render($("#pushBody"));
    pushEl.hidden = false; pushScroll.scrollTop = 0;
    document.documentElement.classList.add("push-open");
    mainEl.setAttribute("inert", "");
    void pushEl.offsetWidth;   // Startzustand zeichnen, dann hereinschieben
    pushEl.classList.add("open");
    updatePushBar();
    $("#pushBack").focus({ preventScroll: true });
  }
  function closePush() {
    if (!pv.id) return;
    const opener = pv.opener;
    pv.id = null; pv.pushed = false; pv.opener = null;
    pushEl.classList.remove("open", "dragging"); mainEl.classList.remove("dragging");
    pushEl.style.transform = ""; mainEl.style.transform = "";
    document.documentElement.classList.remove("push-open");
    mainEl.removeAttribute("inert");
    setTimeout(() => { if (!pv.id) pushEl.hidden = true; }, reduceMotion() ? 220 : 420);
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  }
  // Zurück: per Link geöffnet → im Verlauf zurück; per Direktlink → Hash des Tabs setzen
  function pushBack() {
    if (!pv.id) return;
    if (pv.pushed) { history.back(); return; }
    history.replaceState(null, "", `#${PUSH[pv.id].tab}`);
    route();
  }
  $("#pushBack").addEventListener("click", pushBack);
  // Esc: auch wenn der Fokus nach dem Wischen auf der Seite liegt; ein offenes Blatt darüber schließt zuerst
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || !pv.id || document.querySelector(".sheet-backdrop.open")) return;
    e.preventDefault(); pushBack();
  });
  // Wischen vom linken Rand (schmale Leiste .push-edge, damit Listen und Filter normal scrollen)
  (function edgeSwipe() {
    const edge = pushEl.querySelector(".push-edge");
    let x0 = null, pid = null, dx = 0, track = [];
    edge.addEventListener("pointerdown", (e) => {
      if (x0 != null || !pv.id) return;
      x0 = e.clientX; pid = e.pointerId; dx = 0; track = [{ x: 0, t: performance.now() }];
      pushEl.classList.add("dragging"); mainEl.classList.add("dragging");
      try { edge.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    edge.addEventListener("pointermove", (e) => {
      if (x0 == null || e.pointerId !== pid) return;
      dx = Math.max(0, e.clientX - x0);
      pushEl.style.transform = `translateX(${dx}px)`;
      if (!reduceMotion()) mainEl.style.transform = `translateX(${(-PARALLAX * (1 - Math.min(1, dx / window.innerWidth))).toFixed(2)}%)`;
      const now = performance.now();
      track.push({ x: dx, t: now });
      while (track.length > 2 && now - track[0].t > 100) track.shift();
    });
    const end = (e) => {
      if (x0 == null || (e && e.pointerId !== pid)) return;
      const a = track[0], b = track[track.length - 1], v = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
      x0 = null; pid = null;
      pushEl.classList.remove("dragging"); mainEl.classList.remove("dragging");
      if (dx > window.innerWidth * 0.35 || (dx > 10 && v > 0.3)) { pushBack(); return; }
      pushEl.style.transform = ""; mainEl.style.transform = "";   // zurückfedern
    };
    edge.addEventListener("pointerup", end);
    edge.addEventListener("pointercancel", end);
  })();

  const wks = { open: false, pushed: false, opener: null };
  function openWeek() {
    wkOffset = null;   // immer mit der Standardwoche beginnen
    renderWeek(new Date());
    wks.open = true;
    openSheet("weekSheet", wks.opener || document.activeElement);
  }
  function closeWeek() {
    wks.open = false; wks.pushed = false; wks.opener = null;
    closeSheet($("#weekSheet"));
  }
  function closeMetric() {
    md.key = null; md.pushed = false; md.opener = null;
    closeSheet($("#metricSheet"));
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
    // Die vier wichtigsten als Kacheln (mit Mini-Linie der letzten 7 Tage), der Rest als gruppierte Liste; alles öffnet die Detailansicht
    const mtile = (key, label, value, sub, time) => {
      const m = MX.byKey[key];
      return `<a class="card kpi tile-link c-${m.cat}" href="#${metricHash(m)}">
        <div class="label">${icon(m.icon || m.cat, 15)}<span class="ht-name">${label}</span>${time ? `<span class="ht-time">${time}</span>` : ""}${CHEV_R}</div>
        <div class="ht-bottom"><div class="ht-main"><div class="value">${value}</div>${sub ? `<div class="delta">${sub}</div>` : ""}</div>${spark7(m)}</div>
        <span class="sr-only">, Verlauf und Details öffnen</span></a>`;
    };
    const tiles = [
      mtile("sleep", "Schlaf", sleepVal(last("sleepH")), last("sleepScore") != null ? `Sleep Score ${nf(last("sleepScore"))}` : a("sleepH", 1, " h"), when("sleepH")),
      mtile("hrv", "HRV", v(last("hrv"), 0, "ms"), gLast("hrvStatus") ? HRV_DE[last("hrvStatus")] || last("hrvStatus") : a("hrv", 0, " ms"), when("hrv")),
      mtile("rhr", "Ruhepuls", v(last("rhr"), 0, "bpm"), a("rhr", 0, " bpm"), when("rhr")),
      mtile("readiness", "Bereitschaft", v(last("readiness")), last("recoveryH") != null ? `Erholungszeit ${nf(last("recoveryH"))} h` : "", when("readiness")),
    ];
    const more = [
      ["sleepScore", "Sleep Score", v(last("sleepScore")), a("sleepScore")],
      ["bodyBattery", "Body Battery", v(last("bbHigh"), 0, "max"), last("bbNow") != null ? `aktuell ${last("bbNow")}` : ""],
      ["stress", "Stress Ø", v(last("stressAvg")), a("stressAvg")],
      ["load", "Trainingsstatus", st ? esc(statusDe(st.trainingStatus)) : "–", last("acuteLoad") != null ? `Belastung akut ${nf(last("acuteLoad"))}, chronisch ${nf(last("chronicLoad") || 0)}` : ""],
      ["vo2run", "VO2max Laufen", v(last("vo2run"), 1), ""],
      ["vo2bike", "VO2max Rad", v(last("vo2bike"), 1), ""],
      ["weight", "Gewicht", v(last("weight"), 1, "kg"), last("bodyFat") != null ? `Körperfett ${nf(last("bodyFat"), 1)} %` : ""],
      ["steps", "Schritte", v(last("steps")), a("steps")],
    ].filter((r) => r[2] !== "–");
    el.innerHTML = `<div class="grid g4 rec-tiles">${tiles.join("")}</div>` +
      (more.length ? `<div class="card list-card" style="margin-top:16px"><ul class="ios-list ic">${more.map(([key, label, value, sub]) => { const m = MX.byKey[key];
        return `<li><a class="ios-row" href="#${metricHash(m)}">${rowIcon(m.cat, m.icon)}<span class="row-main"><span class="row-title">${label}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span><span class="row-val"><b>${value}</b></span>${CHEV_R}</a></li>`; }).join("")}</ul></div>` : "");
    $("#recoverySub").textContent = `Garmin-Daten, zuletzt aktualisiert ${G.updated ? new Date(G.updated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " Uhr" : "–"}. Tippe auf einen Wert für Verlauf und Details.`;
  }

  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  try { localStorage.removeItem("ironman.layout"); } catch (e) { /* alte Einklapp-Wahl aufräumen */ }

  /* ---------- Init ---------- */
  setupHelp();
  today(); recovery(); gymSection(); calendarSection();
  freshBanner();
  hero(); kpis(); insights(); season(); volumeChart(); disciplines(); raceReady(); predictionHistory(); zone2(); activities();
  /* ---------- Tabs: #heute, #training, #erholung, #plan; alte Anker (#zone2 …) öffnen den passenden Tab ---------- */
  const TABS = ["heute", "training", "erholung", "plan"];
  const tabScroll = {};   // jede Tab merkt sich ihre Scroll-Position
  let curTab = null;
  function tabOf(id) {
    if (!id || TABS.includes(id)) return id || "heute";
    const el = document.getElementById(id), panel = el && el.closest(".tab-panel");
    return panel ? panel.dataset.tab : "heute";
  }
  function showTab(tab) {
    if (tab === curTab) return false;
    const prev = curTab;
    if (curTab) tabScroll[curTab] = window.scrollY;
    curTab = tab;
    document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.dataset.tab !== tab; });
    document.querySelectorAll(".tabbar .tab").forEach((t) => t.setAttribute("aria-selected", String(t.getAttribute("href") === `#${tab}`)));
    hideTip(); if (selBox) resetSel(selBox);
    const panel = $(`#tab-${tab}`);
    redrawCharts(panel);   // Diagramme in echter Breite (waren versteckt)
    if (tab === "plan") layoutTimeline(true);
    // kurzes Einblenden beim Wechsel (nicht beim Start, nicht bei „Bewegung reduzieren“)
    if (prev && panel.animate && !reduceMotion()) panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    const h1 = panel.querySelector("h1");
    if (navTitle) navTitle.textContent = h1 ? h1.textContent.trim() : "";
    queueNavbar();
    if (prev) queueMicrotask(() => countVisible(panel));   // nach dem Wiederherstellen der Scroll-Position, vor dem Zeichnen
    return true;
  }

  /* ---------- Obere Leiste wie in iOS: großer Titel → kleiner Titel (js/native.js) ---------- */
  // Verschwindet der große Titel beim Scrollen unter der Leiste, wird ihr Hintergrund im selben Maß sichtbar;
  // ist er fast ganz darunter, blendet der kleine Titel ein (Werte direkt am Element, nicht über CSS-Variablen)
  const NV = window.Native;
  const navbar = $("#navbar"), navBg = navbar && navbar.querySelector(".navbar-bg"), navTitle = $("#navbarTitle");
  let navRaf = 0, navCompact = null;
  function updateNavbar() {
    navRaf = 0;
    const h1 = curTab && document.querySelector(`#tab-${curTab} h1`);
    if (!navbar || !NV || !h1) return;
    const r = h1.getBoundingClientRect(), p = NV.titleProgress(r.top, r.height, navbar.offsetHeight);
    navBg.style.opacity = p ? String(Math.round(p * 100) / 100) : "";
    const compact = p > 0.85;
    if (compact !== navCompact) { navCompact = compact; navbar.classList.toggle("compact", compact); }
  }
  function queueNavbar() { if (!navRaf) navRaf = requestAnimationFrame(updateNavbar); }
  window.addEventListener("scroll", queueNavbar, { passive: true });
  window.addEventListener("resize", queueNavbar);
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    // Detailansicht, z. B. #erholung-hrv: passenden Tab zeigen und das Blatt öffnen
    if (PUSH[id]) {   // eigene Ansicht von rechts (z. B. #training-aktivitaeten)
      if (md.key) closeMetric();
      if (wks.open) closeWeek();
      if (showTab(PUSH[id].tab)) window.scrollTo(0, tabScroll[curTab] || 0);
      if (pv.id !== id) { if (pv.id) closePush(); else mdScrollY = window.scrollY; openPush(id); }
      return;
    }
    const metric = metricOfHash(id);
    if (metric) {
      if (showTab(metric.tab)) window.scrollTo(0, tabScroll[curTab] || 0);
      if (!md.key && !wks.open) mdScrollY = window.scrollY;   // Position merken, um sie nach dem Schließen wiederherzustellen
      openMetric(metric.key);
      return;
    }
    if (id === "heute-woche") {   // Wochenblatt; „Zurück“ aus einer Detailansicht darüber schließt nur diese
      if (md.key) closeMetric();
      if (showTab("heute")) window.scrollTo(0, tabScroll[curTab] || 0);
      if (!wks.open) { mdScrollY = window.scrollY; openWeek(); }
      return;
    }
    const fromMetric = !!md.key || wks.open || !!pv.id;   // „Zurück“ aus Blatt oder Ansicht: schließen, Scroll-Position behalten
    if (md.key) closeMetric();
    if (wks.open) closeWeek();
    if (pv.id) closePush();
    const changed = showTab(tabOf(id));
    if (id && !TABS.includes(id) && document.getElementById(id)) {
      requestAnimationFrame(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: "start" }); });
    } else if (fromMetric && !changed) {
      window.scrollTo(0, mdScrollY);   // der Browser springt sonst zum Abschnitt #erholung
    } else {
      window.scrollTo(0, changed ? tabScroll[curTab] || 0 : 0);
    }
  }
  let mdScrollY = 0;
  // Detailansicht oder Wochenblatt per Link geöffnet → „Fertig“ geht im Verlauf zurück; per Direktlink → Hash ersetzen
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const h = decodeURIComponent(a.getAttribute("href").slice(1));
    if (metricOfHash(h)) { md.pushed = true; md.opener = a; }
    else if (h === "heute-woche") { wks.pushed = true; wks.opener = a; }
    else if (PUSH[h]) { pv.pushed = true; pv.opener = a; }
  });
  const wSheet = $("#weekSheet");
  setupSheet(wSheet);
  wSheet._onUserClose = () => {
    if (wks.pushed) { history.back(); return; }
    history.replaceState(null, "", "#heute");
    route();
  };
  setupSheet($("#infoSheet"));
  const mSheet = $("#metricSheet");
  setupSheet(mSheet);
  mSheet._onUserClose = () => {
    if (md.pushed) { history.back(); return; }
    const m = MX.byKey[md.key];
    history.replaceState(null, "", `#${m ? m.tab : "heute"}`);
    route();
  };
  window.addEventListener("hashchange", route);
  // Erneutes Tippen auf den aktiven Tab scrollt weich nach ganz oben – auch wenn gerade ein Abschnitt im Link steht (#gym)
  document.querySelectorAll(".tabbar .tab").forEach((t) => t.addEventListener("click", (e) => {
    if (t.getAttribute("href") !== `#${curTab}` || md.key || wks.open) return;
    e.preventDefault();
    if (pv.id) { history.replaceState(null, "", `#${curTab}`); route(); return; }   // wie iOS: zurück zur Übersicht des Tabs
    if (location.hash !== `#${curTab}`) history.replaceState(null, "", `#${curTab}`);
    window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  }));

  /* ---------- Zahlen zählen beim ersten Anzeigen kurz hoch (Ringe, große Kachelwerte; js/native.js) ---------- */
  // Einmal pro Kachel und Sitzung, wenn sie zum ersten Mal sichtbar ist; gleiche Dauer und Kurve wie die Ringe.
  // Die Zahl steht dabei in fester Breite rechtsbündig, damit die Einheit daneben nicht wandert. Wird die Kachel
  // währenddessen neu gezeichnet (z. B. wenn Zone 2 nachlädt), läuft das Zählen auf der neuen an derselben Stelle weiter.
  const COUNT_MS = RING_MS, counted = new Map();   // Schlüssel (Tab + Kachel) → Startzeit
  const countKey = (el) => {
    const panel = el.closest(".tab-panel"), tile = el.closest(".kpi, .ring-legend > div, .lift, .hl"), label = tile && tile.querySelector(".label, .rl-name, .lift-name, .hl-title");
    return panel && label ? `${panel.id}|${label.textContent.trim()}` : null;
  };
  function runCount(el, t0) {
    if (/:/.test(el.textContent)) return;   // Uhrzeiten und Pace nicht
    const items = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { const p = NV.parseNumber(n.data); if (p && p.value) items.push({ n, p }); }
    items.forEach((it) => {
      const m = /^(\s*)(\S+)(\s*)$/.exec(it.n.data), span = document.createElement("span");
      span.textContent = m[2];
      it.n.replaceWith(...[m[1], span, m[3]].filter((x) => x !== ""));
      const w = span.getBoundingClientRect().width;
      Object.assign(span.style, { display: "inline-block", width: `${Math.ceil(w)}px`, textAlign: "right" });
      it.span = span; it.final = m[2];
    });
    if (!items.length) return;
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - t0) / COUNT_MS));   // Uhrzeit statt Bild-Zeitstempel: nie rückwärts
      items.forEach((it) => { it.span.textContent = t < 1 ? NV.countText(it.p, t) : it.final; });
      if (t < 1) requestAnimationFrame(step); else items.forEach((it) => it.span.removeAttribute("style"));
    };
    items.forEach((it) => { it.span.textContent = NV.countText(it.p, Math.max(0, (performance.now() - t0) / COUNT_MS)); });
    requestAnimationFrame(step);
  }
  const COUNT_SEL = ".tab-panel .kpi .value, .tab-panel .rl-val b, .tab-panel .lift-val, .tab-panel .hl-val";
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; };
  const startCount = (el, k) => { const t0 = performance.now(); counted.set(k, t0); runCount(el, t0); };
  // Erst sichtbar werdende Zahlen (weiter unten): kurz bevor sie ins Bild kommen, damit nie der Endwert aufblitzt
  const countIO = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const k = countKey(e.target);
    if (k && !counted.has(k) && !reduceMotion()) startCount(e.target, k);
  }), { rootMargin: "0px 0px 20% 0px" }) : null;
  // Läuft vor dem nächsten Zeichnen: sichtbare Zahlen beginnen sofort bei 0, die übrigen warten aufs Sichtbarwerden
  function armCounts() {
    if (!countIO || !NV || reduceMotion()) return;
    document.querySelectorAll(COUNT_SEL).forEach((el) => {
      if (el._counted) return;
      el._counted = true;
      const k = countKey(el);
      if (!k || el.closest("[aria-live]")) return;
      if (counted.has(k)) { if (performance.now() - counted.get(k) < COUNT_MS) runCount(el, counted.get(k)); return; }   // neu gezeichnet: weiterzählen
      if (!el.closest(".tab-panel[hidden]") && inView(el)) startCount(el, k); else countIO.observe(el);
    });
  }
  // Tab-Wechsel: Zahlen, die jetzt im Bild sind, beginnen vor dem ersten Zeichnen
  function countVisible(panel) {
    if (!countIO || !NV || reduceMotion()) return;
    panel.querySelectorAll(COUNT_SEL).forEach((el) => {
      const k = countKey(el);
      if (!el._counted || !k || counted.has(k) || el.closest("[aria-live]") || !inView(el)) return;
      countIO.unobserve(el);
      startCount(el, k);
    });
  }
  // Direkt nach jedem Neuzeichnen (Mikrotask, also vor dem nächsten Bild) – so blitzt nie kurz der Endwert auf
  if (typeof MutationObserver === "function") new MutationObserver(armCounts).observe($("main"), { childList: true, subtree: true });
  route();
  armCounts();   // nach dem Routing: dann ist der richtige Tab sichtbar (Direktlink z. B. #erholung)

  // Vor Ort (Blatt mit Schaltern): Änderung gilt sofort für den Vorschlag
  setupSheet($("#equipSheet"));
  $("#equipList").addEventListener("click", (e) => {
    const row = e.target.closest("[data-eq-row]");
    if (!row) return;
    const k = row.dataset.eqRow, cur = loadEquipment();
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : cur.concat(k);
    if (!next.length) return;   // mindestens eine Ausstattung bleibt an
    saveEquipment(next);
    renderEquipList();
    today();
    const sw = $(`#equipList [data-eq="${k}"]`); if (sw) sw.focus({ preventScroll: true });
  });

  // Einstellungen (Zahnrad neben „Heute“)
  const settings = $("#settingsSheet");
  setupSheet(settings);
  // Über die Daten: Stand von Strava und Garmin in Gerätezeit (js/freshness.js)
  function renderAbout() {
    const FR = window.Freshness, f = FRESH;
    const st = (x) => (x && x.at && FR ? FR.stamp(x.at) : null);
    const rows = [
      ["Strava", st(f && f.strava) || fmtDate(snap, { day: "2-digit", month: "2-digit" }), f && f.strava && f.strava.level !== "ok" ? "älter als erwartet" : ""],
      ["Garmin", st(f && f.garmin) || "–", f && f.garmin && f.garmin.level !== "ok" && f.garmin.level !== "unknown" ? "älter als erwartet" : ""],
    ];
    $("#aboutStand").innerHTML = rows.map(([title, val, sub]) => irow({ title, sub, val: `<b>${esc(val)}</b>` })).join("");
  }
  $("#settingsBtn").addEventListener("click", (e) => { renderAbout(); openSheet("settingsSheet", e.currentTarget); });
  // Größenänderung (Drehen, Fenster): Diagramme mit neuer Breite zeichnen (zusätzlich zum ResizeObserver)
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { hideTip(); redrawCharts(); layoutTimeline(false); }, 150); });
  $("#toggleOther").setAttribute("aria-pressed", showOther);
  $("#toggleOther").addEventListener("click", (e) => { showOther = !showOther; e.currentTarget.setAttribute("aria-pressed", showOther); volumeChart(); });
  $("#toggleTable").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", on);
    $("#volTable").hidden = !on; $("#volChart").hidden = on;
    if (!on) volumeChart();
  });
})();
