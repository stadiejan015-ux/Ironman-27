/*
 * Web-App (PWA): Service Worker, Offline-Hinweis, Aktualisieren ohne Browser-Leiste, externe Links.
 * - Service Worker (sw.js, Scope = Ordner der Seite, z. B. /Ironman-27/): neue Version übernimmt sofort,
 *   die Seite lädt dann einmal neu.
 * - Offline: dezentes Badge oben mit dem Datenstand (Zeitstempel aus js/freshness.js).
 * - Aktualisieren-Knopf im Header (im Home-Bildschirm-Modus fehlt Safaris Neu-laden-Knopf) und automatisches
 *   Neuladen, wenn die App nach mehr als 15 min wieder in den Vordergrund kommt.
 * - Runterziehen zum Aktualisieren mit kleinem iOS-Spinner, nur im Home-Bildschirm-Modus auf Touch-Geräten
 *   (im Browser macht Safari das selbst).
 * - Externe Links öffnen in einem neuen Tab, damit die App nicht verlassen wird.
 */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const STALE_MS = 15 * 60 * 1000;

  /* ---------- Service Worker ---------- */
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;   // erste Installation: kein Neuladen nötig
      reloading = true;
      location.reload();
    });
    const register = () => navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => { /* z. B. file:// */ });
    if (document.readyState === "complete") register(); else window.addEventListener("load", register);
  }

  /* ---------- Offline-Badge ---------- */
  function dataStamp() {
    const F = window.Freshness, S = window.STRAVA || {}, G = window.GARMIN;
    if (!F) return S.snapshotDate || "";
    const f = F.freshness({ now: new Date(), strava: { snapshotAt: S.snapshotAt, snapshotDate: S.snapshotDate }, garmin: G ? { updated: G.updated } : null, cfg: (window.TRAINING || {}).freshness || {} });
    return f.footer;
  }
  function updateOnline() {
    const el = $("#offlineBadge");
    if (!el) return;
    const off = navigator.onLine === false;
    el.hidden = !off;
    if (off) el.textContent = `Offline · Daten: ${dataStamp() || "letzter Stand"}`;
  }
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();

  /* ---------- Aktualisieren ---------- */
  const btn = $("#refreshBtn");
  if (btn) btn.addEventListener("click", () => {
    btn.classList.add("spin");
    location.reload();
  });
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > STALE_MS && navigator.onLine !== false) location.reload();
    else if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    }
  });

  /* ---------- Runterziehen zum Aktualisieren (js/native.js) ---------- */
  // Ziehen am oberen Rand zeigt nach und nach die Speichen des Spinners; über die Schwelle gezogen und losgelassen,
  // dreht er sich und die Seite lädt neu (wie der Aktualisieren-Knopf). Das Scrollen wird nie blockiert (nur passive
  // Listener): Auf iOS zählt das eigene Nachfedern der Seite (negatives scrollY), sonst der Fingerweg mit Gummiband.
  const N = window.Native;
  const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  if (N && coarse && N.isStandalone(navigator, (q) => window.matchMedia(q))) setupPull();
  function setupPull() {
    const TH = 64;   // Zug in px bis zum Auslösen
    const reduce = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = document.createElement("div");
    el.className = "ptr"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<svg viewBox="0 0 28 28">${Array.from({ length: 8 }, (_, i) => `<line x1="14" y1="3.5" x2="14" y2="8.5" transform="rotate(${i * 45} 14 14)" opacity="${(0.3 + (0.7 * (i + 1)) / 8).toFixed(2)}"/>`).join("")}</svg>`;
    const status = document.createElement("p");
    status.className = "sr-only"; status.setAttribute("role", "status");
    document.body.append(el, status);
    const lines = [...el.querySelectorAll("line")];
    let y0 = null, armed = false, busy = false;
    const blocked = (t) => document.documentElement.classList.contains("sheet-open")
      || !!(t && t.closest && t.closest(".sheet-backdrop, .timeline-scroll, .table-scroll, .md-chart"));
    const show = (d) => {
      const st = N.pullState(d, TH);
      armed = st.armed;
      el.classList.remove("settle");
      el.style.opacity = String(Math.round(st.progress * 100) / 100);
      el.style.transform = `translateY(${Math.round(Math.min(d, TH * 1.5) * 0.4)}px)`;
      const n = Math.ceil(st.progress * 8);
      lines.forEach((l, i) => { l.style.visibility = i < n ? "" : "hidden"; });
    };
    const reset = () => { armed = false; el.classList.add("settle"); el.style.opacity = "0"; el.style.transform = ""; };
    window.addEventListener("touchstart", (e) => {
      y0 = null;
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) return;
      y0 = e.touches[0].clientY; armed = false;
    }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (y0 == null || busy) return;
      if (e.touches.length !== 1) { y0 = null; reset(); return; }   // zweiter Finger: abbrechen
      show(Math.max(-window.scrollY, N.rubberBand(e.touches[0].clientY - y0, window.innerHeight)));
    }, { passive: true });
    window.addEventListener("touchend", () => {
      if (y0 == null || busy) return;
      y0 = null;
      if (!armed) { reset(); return; }
      busy = true;
      el.classList.add("refreshing"); el.style.opacity = "1";
      lines.forEach((l) => { l.style.visibility = ""; });
      status.textContent = "Wird aktualisiert …";
      setTimeout(() => location.reload(), reduce() ? 0 : 400);
    }, { passive: true });
    window.addEventListener("touchcancel", () => { y0 = null; if (!busy) reset(); }, { passive: true });
  }

  /* ---------- Externe Links in neuem Tab ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    let url;
    try { url = new URL(a.getAttribute("href"), location.href); } catch (err) { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    a.target = "_blank";
    a.rel = "noopener";
  });

  /* ---------- Statusleisten-Farbe beim manuellen Hell/Dunkel-Wechsel ---------- */
  // Farbe kommt aus --bg in css/style.css (keine Farben im JS); ohne manuelle Wahl gelten die Werte aus index.html
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const original = metas.map((m) => m.getAttribute("content"));
  const applyTheme = () => {
    const t = document.documentElement.dataset.theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    metas.forEach((m, i) => m.setAttribute("content", (t === "light" || t === "dark") && bg ? bg : original[i]));
  };
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  applyTheme();
})();
