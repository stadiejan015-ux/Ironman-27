/*
 * Verhalten wie in einer iOS-App – reine Funktionen (kein DOM), getestet in tests/native.test.js.
 * -------------------------------------------------------------------------------------------
 *   titleProgress(titleTop, titleHeight, barBottom) → 0…1: wie weit der große Titel unter der oberen Leiste
 *                                     verschwunden ist (0 = ganz sichtbar, 1 = ganz darunter)
 *   rubberBand(distance, dimension)  → gedämpfter Zug wie in iOS: je weiter gezogen, desto zäher
 *   pullState(distance, threshold)   → { progress 0…1, armed } fürs Runterziehen zum Aktualisieren
 *   parseNumber(text)                → { value, decimals, grouping, minus } | null für deutsche Zahlen
 *                                     („4.950“, „73,9“, „−0,4“); Uhrzeiten, Pace usw. → null
 *   formatNumber(value, decimals, grouping, minus) → wieder deutscher Text im selben Format
 *   easeOut(t)                       → kräftiges ease-out (entspricht etwa --ease-out in css/style.css)
 *   countText(parsed, t)             → Text beim Hochzählen zum Zeitpunkt t (0…1), bei t = 1 der Zielwert
 *   isStandalone(nav, matchMedia)    → läuft die Seite als App vom Home-Bildschirm?
 * Läuft im Browser (window.Native) und in Node (require("./js/native.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Native = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // Großer Titel: Fortschritt, sobald seine Oberkante die Unterkante der Leiste erreicht, bis er ganz darunter liegt
  function titleProgress(titleTop, titleHeight, barBottom) {
    if (!(titleHeight > 0)) return 0;
    return clamp01((barBottom - titleTop) / titleHeight);
  }

  // iOS-Gummiband: (1 − 1 / (x · c / d + 1)) · d mit c = 0,55
  function rubberBand(distance, dimension) {
    if (!(distance > 0) || !(dimension > 0)) return 0;
    return (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;
  }

  function pullState(distance, threshold) {
    const d = distance > 0 ? distance : 0;
    return { progress: threshold > 0 ? clamp01(d / threshold) : 0, armed: threshold > 0 && d >= threshold };
  }

  // Deutsche Zahl: Tausenderpunkt optional, Komma als Dezimalzeichen, Minus als „-“ oder „−“
  const NUM = /^([-−]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;
  function parseNumber(text) {
    const m = NUM.exec(String(text == null ? "" : text).trim());
    if (!m) return null;
    const int = m[2].replace(/\./g, ""), dec = m[3] || "";
    const value = Number(`${int}${dec ? "." + dec : ""}`) * (m[1] ? -1 : 1);
    return Number.isFinite(value) ? { value, decimals: dec.length, grouping: m[2].includes("."), minus: m[1] || "-" } : null;
  }

  function formatNumber(value, decimals = 0, grouping = false, minus = "-") {
    const abs = Math.abs(value);
    let [int, dec] = abs.toFixed(decimals).split(".");
    if (grouping) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const neg = value < 0 && Number(abs.toFixed(decimals)) !== 0;
    return `${neg ? minus : ""}${int}${dec ? "," + dec : ""}`;
  }

  const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 5);

  function countText(parsed, t) {
    if (!parsed) return "";
    const p = clamp01(t);
    const v = p >= 1 ? parsed.value : parsed.value * easeOut(p);
    return formatNumber(v, parsed.decimals, parsed.grouping, parsed.minus);
  }

  function isStandalone(nav, matchMedia) {
    if (nav && nav.standalone === true) return true;
    try { return !!(matchMedia && matchMedia("(display-mode: standalone)").matches); } catch (e) { return false; }
  }

  return { titleProgress, rubberBand, pullState, parseNumber, formatNumber, easeOut, countText, isStandalone };
});
