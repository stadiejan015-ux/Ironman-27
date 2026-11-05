/*
 * Web-App (PWA): Service Worker, Offline-Hinweis, Aktualisieren ohne Browser-Leiste, externe Links.
 * - Service Worker (sw.js, Scope = Ordner der Seite, z. B. /Ironman-27/): neue Version übernimmt sofort,
 *   die Seite lädt dann einmal neu.
 * - Offline: dezentes Badge oben mit dem Datenstand (Zeitstempel aus js/freshness.js).
 * - Aktualisieren-Knopf im Header (im Home-Bildschirm-Modus fehlt Safaris Neu-laden-Knopf) und automatisches
 *   Neuladen, wenn die App nach mehr als 15 min wieder in den Vordergrund kommt.
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
