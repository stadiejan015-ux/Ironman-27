/*
 * Kennzahlen-Register und Berechnungen für die Detailansichten (wie in Apple Health).
 * --------------------------------------------------------------------------------
 * Pro Kennzahl: Schlüssel, Name, Kategorie (Farbe + Icon), Einheit, Datenquelle (Feld in den Garmin-Tagesdaten),
 * Zusammenfassung (avg = Durchschnitt, sum = Summe, last = letzter Wert), Formatierung, Achsengrenzen
 * (clamp, zero) und optional Ziel-/Schwellenwerte (refs) bzw. ein Normalbereich (band).
 *
 * Reine Funktionen (testbar, kein DOM):
 *   series(days, field)                → [{ date, v }] aufsteigend, nur Tage mit Wert
 *   windowOf(period, today, first)      → { from, to, days }   period: "7" | "30" | "60" | "all"
 *   previousWindow(win)                 → gleich langer Zeitraum direkt davor
 *   inWindow(points, win)               → Punkte im Zeitraum
 *   daily(points, win)                  → jeder Tag im Zeitraum, fehlende Tage mit v = null
 *   stats(points)                       → { n, avg, min, max, sum, minAt, maxAt, last, lastDate } | null
 *   summarize(points, mode)             → Zusammenfassung per avg | sum | last (null ohne Daten)
 *   change(points, win, mode)           → Veränderung zum Vorzeitraum { cur, prev, diff } | null
 *   availablePeriods(points, today)     → Zeiträume mit Daten („Alle“ nur, wenn es mehr als 60 T zeigt)
 *   axis(metric, values)                → Achse (über js/charts.js), mit clamp/zero aus dem Register
 * Läuft im Browser (window.Metrics, braucht window.Charts) und in Node.
 */
(function (root, factory) {
  const charts = typeof module === "object" && module.exports ? require("./charts.js") : root.Charts;
  const api = factory(charts);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Metrics = api;
})(typeof self !== "undefined" ? self : this, function (Charts) {
  "use strict";

  /* ---------- Register ---------- */
  // cat: heart | sleep | activity | body | run | bike | strength | other  (Farbe und Icon wie in den Kacheln)
  // tab: in welchem Tab die Kennzahl lebt (Hash #<tab>-<key>)
  const REGISTRY = [
    { key: "sleep", name: "Schlaf", cat: "sleep", tab: "erholung", field: "sleepH", unit: "h", fmt: "hm", summary: "avg", chart: "bar", zero: true,
      about: "Schlafdauer pro Nacht laut deiner Garmin-Uhr, ohne Wachphasen. Der Wert eines Tages gehört zur Nacht davor. Für Ausdauersport gelten 7–9 Stunden als Richtwert." },
    { key: "sleepScore", name: "Sleep Score", cat: "sleep", tab: "erholung", field: "sleepScore", unit: "", summary: "avg", clamp: [0, 100], refs: [{ v: 80, label: "gut ab 80" }],
      about: "Garmin bewertet jede Nacht von 0 bis 100 aus Dauer, Schlafphasen, Unruhe und Stress im Schlaf. Ab 80 gilt der Schlaf als gut, unter 60 als schwach." },
    { key: "hrv", name: "HRV", cat: "heart", tab: "erholung", field: "hrv", unit: "ms", summary: "avg", band: ["hrvLow", "hrvHigh"],
      about: "Herzfrequenzvariabilität im Schlaf (Durchschnitt der Nacht). Wichtig ist der Vergleich mit deinem eigenen Normalbereich (Band im Diagramm), nicht mit anderen. Liegt sie mehrere Tage darunter, ist Erholung wichtiger als Training." },
    { key: "rhr", name: "Ruhepuls", cat: "heart", tab: "erholung", field: "rhr", unit: "bpm", summary: "avg",
      about: "Niedrigster Puls des Tages laut Garmin. Steigt er mehrere Tage um 5 bpm oder mehr über deinen Schnitt, kann das auf Müdigkeit, Hitze oder eine beginnende Krankheit hindeuten." },
    { key: "bodyBattery", name: "Body Battery", cat: "activity", tab: "erholung", field: "bbHigh", unit: "", summary: "avg", clamp: [0, 100],
      about: "Höchster Body-Battery-Wert des Tages (0–100), meist morgens nach dem Schlaf. Garmin berechnet ihn aus HRV, Stress, Schlaf und Aktivität." },
    { key: "stress", name: "Stress", cat: "heart", tab: "erholung", field: "stressAvg", unit: "", summary: "avg", clamp: [0, 100], refs: [{ v: 50, label: "hoch ab 51" }],
      about: "Durchschnittlicher Stresswert des Tages (0–100), von Garmin aus der Herzfrequenzvariabilität geschätzt. Bis 25 gilt als Ruhe, 26–50 als niedrig, ab 51 als hoch." },
    { key: "readiness", name: "Trainingsbereitschaft", cat: "activity", tab: "erholung", field: "readiness", unit: "", summary: "avg", clamp: [0, 100],
      about: "Garmins Einschätzung von 0 bis 100 aus Schlaf, Erholungszeit, HRV-Status und Belastung. Daraus leitet die Seite auch den Tagesvorschlag ab." },
    { key: "load", name: "Belastung akut/chronisch", cat: "activity", tab: "erholung", field: "acuteLoad", field2: "chronicLoad", name1: "akut", name2: "chronisch", unit: "", summary: "last", zero: true,
      about: "Akute Belastung (letzte 7 Tage, gewichtet) und chronische Belastung (28 Tage) laut Garmin, aus dem Puls deiner Einheiten. Liegt akut deutlich über chronisch, steigt das Risiko für Überlastung; deutlich darunter bedeutet Formerhalt oder Pause. Krafttraining bildet Garmin nur schwach ab." },
    { key: "vo2run", name: "VO2max Laufen", cat: "run", tab: "erholung", field: "vo2run", unit: "", decimals: 1, summary: "last",
      about: "Geschätzte maximale Sauerstoffaufnahme in ml/kg/min aus Läufen mit Puls und GPS. Steigt meist langsam über Wochen; kurze Sprünge entstehen oft durch Hitze oder Gelände." },
    { key: "vo2bike", name: "VO2max Rad", cat: "bike", tab: "erholung", field: "vo2bike", unit: "", decimals: 1, summary: "last",
      about: "Geschätzte maximale Sauerstoffaufnahme in ml/kg/min aus Fahrten mit Leistungsmesser und Puls (z. B. Zwift)." },
    { key: "weight", name: "Gewicht", cat: "body", tab: "erholung", field: "weight", unit: "kg", decimals: 1, summary: "avg",
      about: "Gewicht aus Garmin Connect (Waage oder manuell eingetragen). Fließt auch in die Rad-Prognose (W/kg) ein." },
    { key: "steps", name: "Schritte", cat: "activity", tab: "erholung", field: "steps", unit: "", summary: "avg", chart: "bar", zero: true,
      about: "Schritte pro Tag laut Garmin-Uhr. Der Durchschnitt bezieht sich auf die Tage mit Daten." },
  ];
  const byKey = Object.fromEntries(REGISTRY.map((m) => [m.key, m]));
  const SUMMARY_LABEL = { avg: "Durchschnitt", sum: "Gesamt", last: "Aktuell" };
  const PERIODS = [{ key: "7", days: 7, label: "7 T" }, { key: "30", days: 30, label: "30 T" }, { key: "60", days: 60, label: "60 T" }, { key: "all", days: null, label: "Alle" }];

  /* ---------- Datum (lokal, ISO yyyy-mm-dd) ---------- */
  const pad2 = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dateOf = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);

  /* ---------- Reihen und Zeiträume ---------- */
  function series(days, field) {
    return (days || []).filter((d) => d && Number.isFinite(d[field])).map((d) => ({ date: d.date.slice(0, 10), v: d[field] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function windowOf(period, today, first) {
    if (period === "all") { const from = first && first < today ? first : today; return { from, to: today, days: daysBetween(from, today) + 1 }; }
    const n = Number(period);
    return { from: addDays(today, -(n - 1)), to: today, days: n };
  }
  const previousWindow = (w) => ({ from: addDays(w.from, -w.days), to: addDays(w.from, -1), days: w.days });
  const inWindow = (points, w) => points.filter((p) => p.date >= w.from && p.date <= w.to);
  function daily(points, w) {
    const map = new Map(points.map((p) => [p.date, p.v]));
    const out = [];
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) out.push({ date: d, v: map.has(d) ? map.get(d) : null });
    return out;
  }

  /* ---------- Kennzahlen eines Zeitraums ---------- */
  function stats(points) {
    const ps = points.filter((p) => Number.isFinite(p.v));
    if (!ps.length) return null;
    let min = ps[0], max = ps[0], sum = 0;
    for (const p of ps) { sum += p.v; if (p.v < min.v) min = p; if (p.v > max.v) max = p; }
    const last = ps[ps.length - 1];
    return { n: ps.length, avg: sum / ps.length, min: min.v, max: max.v, sum, minAt: min.date, maxAt: max.date, last: last.v, lastDate: last.date };
  }
  function summarize(points, mode = "avg") {
    const s = stats(points);
    if (!s) return null;
    return mode === "sum" ? s.sum : mode === "last" ? s.last : s.avg;
  }
  // Veränderung zum gleich langen Zeitraum davor (bei „Alle“ gibt es keinen)
  function change(points, w, mode = "avg", period = null) {
    if (period === "all") return null;
    const cur = summarize(inWindow(points, w), mode), prev = summarize(inWindow(points, previousWindow(w)), mode);
    if (cur == null || prev == null) return null;
    return { cur, prev, diff: cur - prev };
  }
  // Nur Zeiträume mit Daten; „Alle“ nur, wenn die Daten weiter zurückreichen als der längste feste Zeitraum mit Daten
  function availablePeriods(points, today) {
    if (!points.length) return [];
    const first = points[0].date;
    const fixed = PERIODS.filter((p) => p.days && inWindow(points, windowOf(p.key, today)).length > 0);
    const longest = fixed.length ? fixed[fixed.length - 1].days : 0;
    const out = fixed.map((p) => p.key);
    if (!longest || daysBetween(first, today) + 1 > longest) out.push("all");
    return out;
  }
  // Achse mit den Grenzen aus dem Register: zero → Mengen ab 0, sonst Luft um die Daten; clamp z. B. [0, 100]
  function axis(metric, values) {
    const vs = values.filter(Number.isFinite);
    if (metric.zero) return Charts.zeroAxis(vs.length ? Math.max(...vs) : 0, { clamp: metric.clamp || null });
    return Charts.padAxis(vs, { clamp: metric.clamp || null });
  }

  return { REGISTRY, byKey, SUMMARY_LABEL, PERIODS, series, windowOf, previousWindow, inWindow, daily, stats, summarize, change, availablePeriods, axis, isoOf, addDays, daysBetween };
});
