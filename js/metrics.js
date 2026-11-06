/*
 * Kennzahlen-Register und Berechnungen für die Detailansichten (wie in Apple Health).
 * --------------------------------------------------------------------------------
 * Pro Kennzahl: Schlüssel, Name, Kategorie (Farbe + Icon), Einheit, Datenquelle (Feld in den Garmin-Tagesdaten),
 * Zusammenfassung (avg = Durchschnitt, median, sum = Summe, last = letzter Wert, max = Bestwert), Formatierung,
 * Achsengrenzen (clamp, zero) und optional Ziel-/Schwellenwerte (refs) bzw. ein Normalbereich (band).
 * Statt eines Garmin-Felds (field) kann die Seite eine eigene Quelle liefern (source: Zone 2, 1RM, Wochenbelastung).
 * per: wofür ein Punkt steht (Tag, Woche, Lauf, Fahrt, Einheit, Eintrag); periods: erlaubte Zeiträume;
 * defaultPeriod: Zeitraum beim Öffnen (sonst 30 T).
 *
 * Reine Funktionen (testbar, kein DOM):
 *   series(days, field)                → [{ date, v }] aufsteigend, nur Tage mit Wert
 *   windowOf(period, today, first)      → { from, to, days }   period: "7" | "30" | "60" | "all"
 *   previousWindow(win)                 → gleich langer Zeitraum direkt davor
 *   inWindow(points, win)               → Punkte im Zeitraum
 *   daily(points, win)                  → jeder Tag im Zeitraum, fehlende Tage mit v = null
 *   stats(points)                       → { n, avg, median, min, max, sum, minAt, maxAt, last, lastDate } | null
 *   summarize(points, mode)             → Zusammenfassung per avg | median | sum | last | max (null ohne Daten)
 *   summarizeMetric(metric, points)     → wie summarize, oder die eigene Rechnung der Kennzahl (aggregate)
 *   change(points, win, mode)           → Veränderung zum Vorzeitraum { cur, prev, diff } | null (mode auch eine Kennzahl)
 *   availablePeriods(points, today, allowed) → Zeiträume mit Daten („Alle“ nur, wenn es mehr als 60 T zeigt)
 *   defaultPeriod(metric, periods)      → Zeitraum beim Öffnen
 *   liftMetric(exercise, goal), register(metric), slug(text) → 1RM je Übung im Register (Hash #training-1rm-…)
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
    // Zone 2 (Punkte je Einheit aus data/z2-metrics.json; Quelle stellt die Seite bereit)
    { key: "z2pace", name: "Pace bei Zone-2-Puls", cat: "run", tab: "erholung", source: "z2pace", unit: "/km", fmt: "pace", invert: true, summary: "median", per: "run", chart: "scatter",
      about: "Median-Pace aller Abschnitte im Zone-2-Pulsband bei flachem Gelände (−2 bis +2 % Steigung), mindestens 8 min im Band. Pro Einheit werden die ersten 10 min als Aufwärmen verworfen, Stillstand entfernt und Puls, Tempo und Watt mit 60-s-Mittel geglättet. Nicht gewertet: Trail, Laufband, mehr als 25 Hm/km, mehr als 10 % der Zeit ab Z4. Hügelige Läufe (10–25 Hm/km) zählen mit steigungsbereinigter Pace (GAP) und sind als Raute markiert, etwas unsicherer, weil der Puls verzögert reagiert. Pulsmesser: Brustgurt oder Uhr wird aus den Garmin-Sensordaten erkannt, #gurt bzw. #uhr im Strava-Titel oder in der Beschreibung hat Vorrang; Läufe mit Uhr-Puls sind hohl markiert. Linie: gleitender Median der letzten 4 Wochen. Schneller ist oben." },
    { key: "z2watts", name: "Watt bei Zone-2-Puls", cat: "bike", tab: "erholung", source: "z2watts", unit: "W", summary: "median", per: "ride", chart: "scatter",
      about: "Gleiche Logik wie die Pace, nur mit Watt, und nur aus Fahrten mit echtem Leistungsmesser (Zwift, Indoor). Die Orbea-Watt sind geschätzt und zählen nicht. Outdoor-Fahrten erscheinen hohl. Linie: gleitender Median der letzten 4 Wochen." },
    { key: "z2dec", name: "Entkopplung", cat: "heart", tab: "erholung", source: "z2dec", unit: "%", decimals: 1, summary: "avg", per: "session", chart: "dec",
      about: "Wie stark der Puls in der zweiten Hälfte einer ruhigen langen Einheit steigt, bei gleichem Tempo bzw. gleichen Watt. Gewertet werden Läufe ab 60 min und Fahrten ab 90 min mit mindestens 80 % in Z1–2 (Rad: VI höchstens 1,10). Effizienz = Tempo bzw. Watt ÷ Puls in beiden Hälften, Entkopplung = (EF1 − EF2) ÷ EF1. Unter 5 % gilt die Grundlagenausdauer für diese Dauer als gut, über 10 % als ausbaufähig." },
    { key: "z2zones", name: "Anteil Z1–2", cat: "heart", tab: "erholung", source: "z2zones", unit: "%", summary: "avg", summaryLabel: "Anteil Z1–2", per: "week", chart: "zones", clamp: [0, 100], periods: ["30", "60", "all"], defaultPeriod: "60",
      aggregate: (ps) => { const tot = ps.reduce((a, p) => a + (p.tot || 0), 0); return tot ? (ps.reduce((a, p) => a + (p.z12 || 0), 0) / tot) * 100 : null; },
      about: "Anteil der Trainingszeit in Z1 und Z2 an allen Läufen und Fahrten mit Herzfrequenz, nach Zeit gewichtet. Für Ironman-Training gelten rund 80 % als Richtwert. Eine Woche zählt zum Zeitraum, wenn ihr Montag darin liegt. Die Zonenverteilung zählt das Aufwärmen mit, weil es echte Trainingszeit ist." },
    // Woche: Garmin-Trainingsbelastung je Woche (Summe der Einheiten)
    { key: "belastung", name: "Trainingsbelastung", cat: "activity", tab: "heute", source: "weekload", unit: "", summary: "avg", summaryLabel: "Ø pro Woche", per: "week", chart: "weekload", zero: true, periods: ["30", "60", "all"], defaultPeriod: "60",
      about: "Summe der Garmin-Trainingsbelastung aller Einheiten einer Woche (Montag–Sonntag), aufgeteilt in Ausdauer, Kraft und Sonstiges. Garmin berechnet sie aus dem Puls; Krafttraining wird dabei nur schwach abgebildet. Durchschnitt, Minimum und Maximum zählen nur abgeschlossene Wochen; die laufende Woche ist hervorgehoben. Darunter akute (7 Tage) und chronische Belastung (28 Tage) aus Garmin." },
  ];
  const byKey = Object.fromEntries(REGISTRY.map((m) => [m.key, m]));
  const SUMMARY_LABEL = { avg: "Durchschnitt", median: "Median", sum: "Gesamt", last: "Aktuell", max: "Bestwert" };
  // „Beinpresse“ → „beinpresse“, „Bankdrücken“ → „bankdruecken“ (für Schlüssel und Hash)
  const slug = (t) => String(t).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // 1RM-Verlauf einer Gym-Übung (Hash z. B. #training-1rm-beinpresse); goal = Ziel-1RM als Linie
  const liftMetric = (exercise, goal) => ({
    key: `1rm-${slug(exercise)}`, name: `${exercise}: 1RM`, cat: "strength", tab: "training", source: "lift", exercise, unit: "kg", decimals: 1, summary: "max", summaryLabel: "Bestes 1RM", per: "entry", chart: "lift", defaultPeriod: "all",
    refs: goal ? [{ v: goal, label: `Ziel ${goal}` }] : [],
    about: `Geschätztes 1RM nach Epley (Gewicht × (1 + Wiederholungen ÷ 30)) aus den Titeln deiner Krafteinheiten in Garmin Connect, z. B. „Push 6x100 @Bali“. Ein PR ist ein neues bestes 1RM.${goal ? ` Ziel: ${goal} kg.` : ""}`,
  });
  // Weitere Kennzahl zur Laufzeit ins Register (z. B. eine 1RM-Übung); gleicher Schlüssel wird ersetzt
  function register(m) {
    const i = REGISTRY.findIndex((x) => x.key === m.key);
    if (i >= 0) REGISTRY[i] = m; else REGISTRY.push(m);
    byKey[m.key] = m;
    return m;
  }
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
    const last = ps[ps.length - 1], vs = ps.map((p) => p.v).sort((a, b) => a - b), h = vs.length >> 1;
    const median = vs.length % 2 ? vs[h] : (vs[h - 1] + vs[h]) / 2;
    return { n: ps.length, avg: sum / ps.length, median, min: min.v, max: max.v, sum, minAt: min.date, maxAt: max.date, last: last.v, lastDate: last.date };
  }
  function summarize(points, mode = "avg") {
    const s = stats(points);
    if (!s) return null;
    return mode === "sum" ? s.sum : mode === "last" ? s.last : mode === "max" ? s.max : mode === "median" ? s.median : s.avg;
  }
  // Zusammenfassung einer Kennzahl: eigene Rechnung (z. B. zeitgewichteter Anteil) oder per avg/sum/last/max
  const summarizeMetric = (m, points) => (m.aggregate ? (points.length ? m.aggregate(points) : null) : summarize(points, m.summary));
  // Veränderung zum gleich langen Zeitraum davor (bei „Alle“ gibt es keinen); mode: avg|median|sum|last|max oder eine Kennzahl
  function change(points, w, mode = "avg", period = null) {
    if (period === "all") return null;
    const sum = (ps) => (typeof mode === "object" ? summarizeMetric(mode, ps) : summarize(ps, mode));
    const cur = sum(inWindow(points, w)), prev = sum(inWindow(points, previousWindow(w)));
    if (cur == null || prev == null) return null;
    return { cur, prev, diff: cur - prev };
  }
  // Nur Zeiträume mit Daten; „Alle“ nur, wenn die Daten weiter zurückreichen als der längste feste Zeitraum mit Daten
  function availablePeriods(points, today, allowed = null) {
    if (!points.length) return [];
    const first = points[0].date, ok = (k) => !allowed || allowed.includes(k);
    const fixed = PERIODS.filter((p) => p.days && ok(p.key) && inWindow(points, windowOf(p.key, today)).length > 0);
    const longest = fixed.length ? fixed[fixed.length - 1].days : 0;
    const out = fixed.map((p) => p.key);
    if (ok("all") && (!longest || daysBetween(first, today) + 1 > longest)) out.push("all");
    return out;
  }
  // Zeitraum beim Öffnen: defaultPeriod der Kennzahl (bei „Alle“ ohne eigenen Knopf der längste vorhandene), sonst 30 T, sonst der erste
  function defaultPeriod(m, periods) {
    if (!periods.length) return null;
    const want = m.defaultPeriod || "30";
    if (periods.includes(want)) return want;
    if (want === "all") return periods[periods.length - 1];
    return periods.includes("30") ? "30" : periods[0];
  }
  // Achse mit den Grenzen aus dem Register: zero → Mengen ab 0, sonst Luft um die Daten; clamp z. B. [0, 100]
  function axis(metric, values) {
    const vs = values.filter(Number.isFinite);
    if (metric.zero) return Charts.zeroAxis(vs.length ? Math.max(...vs) : 0, { clamp: metric.clamp || null });
    return Charts.padAxis(vs, { clamp: metric.clamp || null });
  }

  return { REGISTRY, byKey, SUMMARY_LABEL, PERIODS, series, windowOf, previousWindow, inWindow, daily, stats, summarize, summarizeMetric, change, availablePeriods, defaultPeriod, axis, slug, liftMetric, register, isoOf, addDays, daysBetween };
});
