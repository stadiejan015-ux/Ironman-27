/*
 * Diagramm-Baukasten – einheitlicher Stil für alle Diagramme der Seite.
 * ---------------------------------------------------------------------
 * Reine Achsen-Funktionen (testbar, kein DOM):
 *   ticksIn(lo, hi, { min, max, steps }) → { step, ticks }   runde Schritte (1/2/5 × 10ⁿ oder feste Liste), 3–5 Ticks
 *   zeroAxis(max, { min, clamp })        → { lo, hi, step, ticks }   Mengen ab 0 (Stunden, km, Belastung), oben rund
 *   padAxis(values, { pad, clamp, include, steps, minSpan }) → Messwerte mit Luft statt Null-Start, optional begrenzt (0–100)
 *   paceAxis(secs, opts)                 → wie padAxis, Schritte 10/15/30/60 … s (Anzeige m:ss)
 *   durationAxis(secs, opts)             → wie padAxis, Schritte 1/5/10/15/30/60 … min (Anzeige h:mm)
 *   decimals(step)                       → Nachkommastellen für Tick-Beschriftungen
 *   labelIndices(count, max)             → welche Balken eine Datumsbeschriftung bekommen (der neueste immer)
 *   dateTicks(t0, t1, width)             → 2–6 Datumspositionen (auf Mitternacht gerundet)
 * Zeichnen (SVG als Text, in echter Pixelbreite des Containers – Schrift bleibt 11 px):
 *   lineChart(o), barChart(o), rings(o) (Aktivitätsringe), legend(items), legendItems(items), empty(text)
 * Farben ausschließlich über CSS-Variablen. Läuft im Browser (window.Charts) und in Node (Tests).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Charts = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SMALL = 160, LARGE = 220, DAY = 86400000, EPS = 1e-9;
  const round6 = (v) => Math.round(v * 1e6) / 1e6 + 0;   // + 0: kein „-0“

  /* ---------- Achsen (rein) ---------- */
  const nice = (raw) => { if (!(raw > 0)) return 1; const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const mag = (s) => 10 ** Math.floor(Math.log10(s) + EPS);
  const up = (s) => { const p = mag(s), f = Math.round(s / p); return (f === 1 ? 2 : f === 2 ? 5 : 10) * p; };
  const down = (s) => { const p = mag(s), f = Math.round(s / p); return (f === 1 ? 0.5 : f === 2 ? 1 : 2) * p; };
  const countIn = (lo, hi, s) => Math.floor(hi / s + EPS) - Math.ceil(lo / s - EPS) + 1;

  // Runde Tick-Werte zwischen lo und hi: 3–5 Stück, Schritt 1/2/5 × 10ⁿ (oder der kleinste passende aus steps)
  function ticksIn(lo, hi, { min = 3, max = 5, steps = null } = {}) {
    if (!(hi > lo)) hi = lo + 1;
    let step;
    if (steps) {
      step = steps.find((s) => countIn(lo, hi, s) <= max) || steps[steps.length - 1];
    } else {
      step = nice((hi - lo) / 4);
      for (let k = 0; k < 10 && countIn(lo, hi, step) > max; k++) step = up(step);
      for (let k = 0; k < 10 && countIn(lo, hi, step) < min; k++) { const s = down(step); if (countIn(lo, hi, s) > max) break; step = s; }
    }
    const ticks = [];
    for (let v = Math.ceil(lo / step - EPS) * step; v <= hi + EPS; v += step) ticks.push(round6(v));
    return { step, ticks };
  }

  // Mengen-Achse ab 0: oben der kleinste runde Wert ≥ Maximum, der 3–5 Ticks ergibt;
  // negative Werte (z. B. Entkopplung) bekommen etwas Platz unter 0
  const multiples = (lo, hi, s) => { const t = []; for (let v = Math.ceil(lo / s - EPS) * s; v <= hi + EPS; v += s) t.push(round6(v)); return t; };
  function zeroAxis(maxValue, { min = 0, clamp = null } = {}) {
    let hi = Math.max(maxValue || 0, 0), lo = Math.min(min || 0, 0);
    if (clamp) { hi = Math.min(hi, clamp[1]); lo = Math.max(lo, clamp[0]); }
    if (!(hi > lo)) hi = lo + 1;
    const cands = new Set();
    for (let k = 2; k <= 6; k++) { const s = nice((hi - lo) / k); cands.add(s); cands.add(down(s)); }
    let best = null;
    for (const s of cands) {
      let top = Math.ceil(hi / s - EPS) * s;
      if (clamp) top = Math.min(top, clamp[1]);
      const bot = lo < 0 ? lo - (top - lo) * 0.04 : 0;
      const ticks = multiples(bot, top, s), size = top - bot;
      if (ticks.length < 3 || ticks.length > 5) continue;
      if (!best || size < best.size - EPS || (Math.abs(size - best.size) < EPS && ticks.length > best.ticks.length)) best = { lo: bot, hi: top, step: s, ticks, size };
    }
    if (!best) { const t = ticksIn(lo, hi); return { lo: round6(lo), hi: round6(hi), step: t.step, ticks: t.ticks }; }
    return { lo: round6(best.lo), hi: round6(best.hi), step: best.step, ticks: best.ticks };
  }

  // Messwert-Achse: Daten (+ include, z. B. Ziel) mit etwas Luft, nicht ab 0; clamp z. B. [0, 100]
  function padAxis(values, { pad = 0.15, clamp = null, include = [], steps = null, minSpan = 0 } = {}) {
    const vs = values.concat(include).filter((v) => Number.isFinite(v));
    if (!vs.length) return { lo: 0, hi: 1, step: 1, ticks: [0, 1] };
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
    if (!(hi > lo)) { const d = Math.abs(hi) * 0.05 || 1; lo -= d; hi += d; }
    const span = hi - lo;
    lo -= span * pad; hi += span * pad;
    if (clamp) { lo = Math.max(lo, clamp[0]); hi = Math.min(hi, clamp[1]); }
    let t = ticksIn(lo, hi, { steps });
    if (t.ticks.length < 3) {   // zu wenige runde Werte im Bereich (z. B. 45, 50): bis zum nächsten runden Wert erweitern
      lo = Math.floor(lo / t.step + EPS) * t.step; hi = Math.ceil(hi / t.step - EPS) * t.step;
      if (clamp) { lo = Math.max(lo, clamp[0]); hi = Math.min(hi, clamp[1]); }
      t = ticksIn(lo, hi, { steps });
    }
    return { lo, hi, step: t.step, ticks: t.ticks };
  }
  const PACE_STEPS = [10, 15, 30, 60, 120, 300];
  const DURATION_STEPS = [60, 300, 600, 900, 1800, 3600, 7200];
  const paceAxis = (secs, opts = {}) => padAxis(secs, { minSpan: 30, ...opts, steps: PACE_STEPS });
  const durationAxis = (secs, opts = {}) => padAxis(secs, { minSpan: 600, ...opts, steps: DURATION_STEPS });
  const decimals = (step) => (step >= 1 - EPS ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - EPS)));

  // Beschriftete Balken: höchstens max, gleichmäßig, von rechts (neueste Woche immer)
  function labelIndices(count, max = 6) {
    const k = Math.max(1, Math.ceil(count / Math.max(1, max)));
    const out = [];
    for (let i = count - 1; i >= 0; i -= k) out.unshift(i);
    return out;
  }
  const maxLabelsFor = (width, per = 58) => Math.max(2, Math.min(6, Math.floor(width / per)));
  // 2–6 Datumslabels in gleichen ganzen Tagesschritten, vom neuesten Tag aus rückwärts
  function dateTicks(t0, t1, width) {
    const n = Math.max(2, Math.min(6, Math.floor(width / 70)));
    const end = new Date(t1); end.setHours(0, 0, 0, 0);
    if (end.getTime() < t0) return [t1];
    const stepDays = Math.max(1, Math.ceil((end.getTime() - t0) / DAY / (n - 1) - 1e-6));
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(end); d.setDate(d.getDate() - i * stepDays);
      if (d.getTime() >= t0 - 1) out.unshift(d.getTime());
    }
    return out;
  }

  /* ---------- Zeichnen ---------- */
  const pad2 = (n) => String(n).padStart(2, "0");
  const dm = (d) => { const x = new Date(d); return `${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.`; };
  const escA = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const textW = (s) => String(s).length * 6.6;   // 11 px, gleich breite Ziffern
  const axisWidth = (labels) => Math.ceil(Math.max(16, ...labels.map(textW))) + 10;   // Y-Beschriftung rechts (wie Health)
  const f1 = (v) => Math.round(v * 10) / 10;
  const crisp = (v) => Math.round(v) + 0.5;      // 1-px-Linien scharf
  // Balken mit voll abgerundeten Enden: rTop/rBottom (je höchstens halbe Breite und halbe Höhe)
  function capsule(x, w, yTop, yBottom, rTop, rBottom) {
    const h = Math.max(0, yBottom - yTop);
    const rt = Math.max(0, Math.min(rTop, w / 2, h / 2)), rb = Math.max(0, Math.min(rBottom, w / 2, h / 2));
    return `M${f1(x)},${f1(yTop + rt)}Q${f1(x)},${f1(yTop)} ${f1(x + rt)},${f1(yTop)}H${f1(x + w - rt)}Q${f1(x + w)},${f1(yTop)} ${f1(x + w)},${f1(yTop + rt)}`
      + `V${f1(yBottom - rb)}Q${f1(x + w)},${f1(yBottom)} ${f1(x + w - rb)},${f1(yBottom)}H${f1(x + rb)}Q${f1(x)},${f1(yBottom)} ${f1(x)},${f1(yBottom - rb)}Z`;
  }
  const open = (W, H, aria, m) => `<svg class="cv" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escA(aria || "Diagramm")}"${m ? ` data-pt="${m.t}" data-pb="${H - m.b}"` : ""}>`;
  // Fein gestrichelte waagerechte Gitterlinien, Beschriftung rechts außen
  const gridY = (m, W, ticks, y, fmt) => ticks.map((v) => { const yy = crisp(y(v)); return `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/><text class="tick" x="${W - m.r + 8}" y="${f1(yy + 3.5)}" text-anchor="start">${escA(fmt(v))}</text>`; }).join("");
  // Ziel-/Schwellenlinie: gestrichelt, Beschriftung rechts am Ende (über der Linie; unter der Linie, wenn dort der aktuelle Punkt sitzt)
  const refLines = (refs, m, W, y, avoid) => (refs || []).map((r) => {
    const yy = crisp(y(r.v)), hit = avoid && avoid.x > W - m.r - textW(r.label || "") - 20 && Math.abs(avoid.y - (yy - 8)) < 14;
    return `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>${r.label ? `<text class="ref-label" x="${W - m.r}" y="${f1(hit ? yy + 13 : yy - 4)}" text-anchor="end">${escA(r.label)}</text>` : ""}`;
  }).join("");
  const SHAPES = {
    dot: (cx, cy, r, c) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${c}"/>`,
    hollow: (cx, cy, r, c) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r - 0.75}" fill="var(--surface)" stroke="${c}" stroke-width="1.5"/>`,
    diamond: (cx, cy, r, c) => `<path d="M${f1(cx)},${f1(cy - r - 1)}L${f1(cx + r + 1)},${f1(cy)}L${f1(cx)},${f1(cy + r + 1)}L${f1(cx - r - 1)},${f1(cy)}Z" fill="${c}"/>`,
  };

  // Liniendiagramm über die Zeit
  // o = { width, height, aria, y: { lo, hi, ticks, fmt, invert }, series: [{ pts:[{d,v}], color, dash, dots }],
  //       scatter: [{ d, v, color, shape, opacity }], marks: [{ d, v, color }], band: { from, to, color },
  //       refs: [{ v, label }], latest: { d, v, label }, hits: [{ d, v }] }
  function lineChart(o) {
    const W = Math.round(o.width), H = o.height || SMALL, ax = o.y;
    const m = { t: 16, r: axisWidth(ax.ticks.map(ax.fmt)), b: 22, l: 8 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const all = [].concat(...(o.series || []).map((s) => s.pts), o.scatter || [], o.hits || []).map((p) => +p.d);
    let t0 = Math.min(...all), t1 = Math.max(...all);
    if (t1 - t0 < 14 * DAY) t0 = t1 - 14 * DAY;   // mind. 2 Wochen, der neueste Wert bleibt rechts
    const x = (d) => m.l + ((+d - t0) / (t1 - t0 || 1)) * iw;
    const y = (v) => (ax.invert ? m.t + ((v - ax.lo) / (ax.hi - ax.lo)) * ih : m.t + ih - ((v - ax.lo) / (ax.hi - ax.lo)) * ih);
    let s = open(W, H, o.aria, m) + gridY(m, W, ax.ticks, y, ax.fmt);
    if (o.band) { const ya = y(o.band.from), yb = y(o.band.to); s += `<rect x="${m.l}" y="${f1(Math.min(ya, yb))}" width="${iw}" height="${f1(Math.abs(yb - ya))}" fill="${o.band.color}" opacity=".14"/>`; }
    s += refLines(o.refs, m, W, y, o.latest ? { x: x(o.latest.d), y: y(o.latest.v) } : null);
    (o.series || []).forEach((sr) => {
      const ps = sr.pts.filter((p) => p.v != null);
      if (ps.length > 1) s += `<path class="ln" d="${ps.map((p, i) => `${i ? "L" : "M"}${f1(x(p.d))},${f1(y(p.v))}`).join("")}" stroke="${sr.color}"${sr.dash ? ' stroke-dasharray="5 4"' : ""}/>`;
      if (sr.dots !== false && ps.length < 15) ps.forEach((p) => { s += `<circle cx="${f1(x(p.d))}" cy="${f1(y(p.v))}" r="3.5" fill="${sr.color}" stroke="var(--surface)" stroke-width="1.5"/>`; });
    });
    (o.scatter || []).forEach((p) => { s += `<g opacity="${p.opacity == null ? 1 : p.opacity}">${(SHAPES[p.shape] || SHAPES.dot)(x(p.d), y(p.v), p.r || 4, p.color)}</g>`; });
    (o.marks || []).forEach((p) => { s += `<circle cx="${f1(x(p.d))}" cy="${f1(y(p.v))}" r="7.5" fill="none" stroke="${p.color}" stroke-width="2"/>`; });
    if (o.latest) {
      const cx = x(o.latest.d), cy = y(o.latest.v), left = cx > W - m.r - 44;
      s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
      if (o.latest.label) s += `<text class="val" x="${f1(left ? cx - 8 : cx + 8)}" y="${f1(cy < m.t + 12 ? cy + 15 : cy - 7)}" text-anchor="${left ? "end" : "start"}">${escA(o.latest.label)}</text>`;
    }
    dateTicks(t0, t1, iw).forEach((t) => {
      const xx = x(t), anchor = xx - m.l < 18 ? "start" : W - m.r - xx < 18 ? "end" : "middle";
      s += `<text class="tick" x="${f1(xx)}" y="${H - 5}" text-anchor="${anchor}">${dm(t)}</text>`;
    });
    (o.hits || []).forEach((p, i) => { s += `<circle class="hit" data-i="${i}" cx="${f1(x(p.d))}" cy="${f1(y(p.v))}" r="14" fill="transparent"/>`; });
    return s + "</svg>";
  }

  // Balkendiagramm (auch gestapelt, auch negative Einzelwerte)
  // o = { width, height, aria, y: { lo, hi, ticks, fmt }, refs, maxBar, minBands, currentBg,
  //       bands: [{ label, stacks:[{v,color}], current, selected, dim, dot, topLabel, below, belowClass }],
  //       groups: [{ from, to, label }] }
  function barChart(o) {
    const W = Math.round(o.width), H = o.height || SMALL, ax = o.y, n = o.bands.length;
    const hasBelow = o.bands.some((b) => b.below), hasGroup = (o.groups || []).length > 0;
    const m = { t: hasGroup ? 26 : 16, r: axisWidth(ax.ticks.map(ax.fmt)), b: hasBelow ? 38 : 22, l: 4 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const slots = Math.max(n, o.minBands || 1), band = iw / slots, bw = Math.max(3, Math.min(o.maxBar || 22, band * 0.56));
    const y = (v) => m.t + ih - ((v - ax.lo) / (ax.hi - ax.lo)) * ih;
    const bx = (i) => m.l + band * i;
    let s = open(W, H, o.aria, m);
    let groupLabels = "";
    (o.groups || []).forEach((g) => {
      const gx = bx(g.from), gw = band * (g.to - g.from + 1), atEnd = gx + textW(g.label) + 6 > W - m.r;   // am rechten Rand: rechtsbündig
      s += `<rect x="${f1(gx + 1)}" y="${m.t - 22}" width="${f1(gw - 2)}" height="${ih + 22}" rx="6" fill="var(--surface-2)"/>`;
      groupLabels += `<text class="tick" x="${f1(atEnd ? gx + gw - 4 : gx + 6)}" y="${m.t - 12}" text-anchor="${atEnd ? "end" : "start"}">${escA(g.label)}</text>`;
    });
    // aktuelle Woche: --accent-soft (oder o.currentBg); ausgewählte andere Woche: neutral mit feinem Rand
    o.bands.forEach((b, i) => {
      const bg = b.current ? o.currentBg || "var(--accent-soft)" : b.selected ? "var(--surface-2)" : null;
      const off = hasGroup ? 8 : 12, x = f1(bx(i) + (b.selected ? 1.5 : 1)), w = f1(band - (b.selected ? 3 : 2));
      if (bg) s += `<rect${b.selected ? ' class="band-sel"' : ""} x="${x}" y="${m.t - off + (b.selected ? 0.5 : 0)}" width="${w}" height="${ih + off - (b.selected ? 1 : 0)}" rx="6" fill="${bg}"/>`;
    });
    s += groupLabels;
    s += gridY(m, W, ax.ticks, y, ax.fmt) + refLines(o.refs, m, W, y);
    // Datumsbeschriftung: höchstens 6, aktuelle/gewählte Woche immer (Nachbarn weichen)
    const k = Math.max(1, Math.ceil(n / maxLabelsFor(iw)));
    const forced = o.bands.map((b, i) => (b.current || b.selected ? i : -1)).filter((i) => i >= 0);
    const lbl = new Set(labelIndices(n, maxLabelsFor(iw)));
    forced.forEach((f) => { [...lbl].forEach((i) => { if (i !== f && !forced.includes(i) && Math.abs(i - f) < k) lbl.delete(i); }); lbl.add(f); });
    o.bands.forEach((b, i) => {
      const x = bx(i) + (band - bw) / 2;
      const segs = (b.stacks || []).filter((st) => st.v);
      let g = "";
      if (segs.length === 1 && segs[0].v < 0) {
        g += `<path d="${capsule(x, bw, y(0), y(segs[0].v), bw / 2, bw / 2)}" fill="${segs[0].color}"/>`;
      } else {
        let acc = 0;
        segs.forEach((st, j) => {
          const y0 = y(acc), y1 = y(acc + st.v), gap = j > 0 ? 1 : 0, h = Math.max(0, y0 - y1 - gap);
          const last = j === segs.length - 1, first = j === 0;   // oben und unten voll abgerundet, dazwischen gerade (1 px Trennung)
          g += `<path d="${capsule(x, bw, y1, y1 + h, last ? bw / 2 : 0, first ? bw / 2 : 0)}" fill="${st.color}"/>`;
          acc += st.v;
        });
      }
      s += b.dim ? `<g opacity=".45">${g}</g>` : g;
      const total = segs.reduce((a, st) => a + st.v, 0), top = y(Math.max(total, 0));
      if (b.dot) s += `<circle cx="${f1(x + bw / 2)}" cy="${f1(Math.max(m.t - 6, top - 8))}" r="4" fill="${b.dot}"/>`;
      if (b.topLabel) s += `<text class="val" x="${f1(x + bw / 2)}" y="${f1(top - (b.dot ? 16 : 5))}" text-anchor="middle">${escA(b.topLabel)}</text>`;
      if (b.below) s += `<text class="${b.belowClass || "tick"}" x="${f1(x + bw / 2)}" y="${H - 22}" text-anchor="middle">${escA(b.below)}</text>`;
      if (lbl.has(i)) s += `<text class="tick${b.current ? " cur" : b.selected ? " sel" : ""}" x="${f1(bx(i) + band / 2)}" y="${H - 5}" text-anchor="middle">${escA(b.label)}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${f1(bx(i))}" y="${m.t - 12}" width="${f1(band)}" height="${ih + 12}" fill="transparent"/>`;
    });
    return s + "</svg>";
  }

  // Konzentrische Ringe wie die Aktivitätsringe in Apple Fitness. items von außen nach innen: [{ frac, color }].
  // Fortschritt = frac (0–1, darüber wird gekappt); bei 100 % schließt sich der Ring. animate: einmaliges Aufziehen (CSS).
  function ringArc(frac, r) {
    const C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
    return { C, frac: f, offset: C * (1 - f) };
  }
  // animDelay: bereits verstrichene Zeit der Animation (ms) – beim Neuzeichnen läuft sie an derselben Stelle weiter
  function rings({ size = 150, stroke = 16, gap = 3, items, aria, animate = false, animDelay = 0 }) {
    const c = size / 2;
    let s = `<svg class="rings" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escA(aria || "Ringe")}">`;
    items.forEach((it, i) => {
      const r = c - stroke / 2 - i * (stroke + gap), a = ringArc(it.frac, r);
      s += `<circle cx="${c}" cy="${c}" r="${f1(r)}" fill="none" stroke="${it.color}" stroke-opacity=".24" stroke-width="${stroke}"/>`;
      if (a.frac > 0) s += `<circle class="ring-arc${animate ? " anim" : ""}" cx="${c}" cy="${c}" r="${f1(r)}" fill="none" stroke="${it.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${f1(a.C)}" stroke-dashoffset="${f1(a.offset)}" style="--c:${f1(a.C)}${animate && animDelay ? `;animation-delay:-${Math.round(animDelay)}ms` : ""}" transform="rotate(-90 ${c} ${c})"/>`;
    });
    return s + "</svg>";
  }

  // Legende unter dem Diagramm – gleiche Symbole überall: square, dot, hollow, diamond, line, dash, ref, ring
  const legendItems = (items) => items.map((it) => `<span><i class="lg lg-${it.shape || "square"}" style="--c:${it.color}${it.opacity != null ? `;opacity:${it.opacity}` : ""}" aria-hidden="true"></i>${escA(it.label)}</span>`).join("");
  const legend = (items, extra = "") => `<div class="legend chart-legend">${legendItems(items)}${extra}</div>`;
  const empty = (text) => `<p class="chart-empty">${escA(text)}</p>`;

  return { SMALL, LARGE, PACE_STEPS, DURATION_STEPS, ticksIn, zeroAxis, padAxis, paceAxis, durationAxis, decimals, labelIndices, maxLabelsFor, dateTicks, dm, lineChart, barChart, ringArc, rings, legend, legendItems, empty };
});
