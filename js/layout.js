/*
 * Einklappbare Abschnitte – reine Funktionen (kein DOM, kein localStorage).
 * -------------------------------------------------------------------------
 *   phaseOf(flexActive)                   → "flex" | "normal"
 *   defaultsFor(cfg, phase, ids)          → { id: offen? } nach den Standardwerten der Phase
 *   resolve({ ids, cfg, phase, saved })   → { open: { id: offen? }, saved, reset }
 *       saved = gespeicherte Wahl { phase, open: { id: bool } }. Sie hat Vorrang vor dem Standard –
 *       gehört sie zu einer anderen Phase (z. B. Flex ist vorbei), wird sie verworfen (reset: true).
 *   remember(saved, phase, id, isOpen)    → neue gespeicherte Wahl
 * cfg = TRAINING.layout = { flex: { collapsed: [...] }, normal: { collapsed: [...] } }
 * Läuft im Browser (window.Layout) und in Node (require("./js/layout.js")).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Layout = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    flex: { collapsed: ["zone2", "disziplinen", "rennen", "erholungVerlauf"] },
    normal: { collapsed: ["erholungVerlauf"] },
  };

  const phaseOf = (flexActive) => (flexActive ? "flex" : "normal");

  function defaultsFor(cfg, phase, ids) {
    const c = { ...DEFAULTS, ...(cfg || {}) };
    const collapsed = new Set(((c[phase] || DEFAULTS[phase] || {}).collapsed) || []);
    return Object.fromEntries((ids || []).map((id) => [id, !collapsed.has(id)]));
  }

  const isSaved = (s) => !!s && typeof s === "object" && typeof s.phase === "string" && !!s.open && typeof s.open === "object";

  function resolve({ ids = [], cfg = {}, phase, saved = null }) {
    const valid = isSaved(saved) && saved.phase === phase;
    const keep = valid ? { phase, open: { ...saved.open } } : { phase, open: {} };
    const def = defaultsFor(cfg, phase, ids);
    const open = {};
    for (const id of ids) open[id] = typeof keep.open[id] === "boolean" ? keep.open[id] : def[id];
    return { open, saved: keep, reset: saved != null && !valid };
  }

  function remember(saved, phase, id, isOpen) {
    const base = isSaved(saved) && saved.phase === phase ? saved.open : {};
    return { phase, open: { ...base, [id]: !!isOpen } };
  }

  return { DEFAULTS, phaseOf, defaultsFor, resolve, remember };
});
