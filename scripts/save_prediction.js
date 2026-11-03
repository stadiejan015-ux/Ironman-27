#!/usr/bin/env node
/*
 * Berechnet die Rennprognose mit den aktuellen Daten und speichert sie mit Datum
 * in data/prediction-history.json (ein Eintrag pro Tag, gleicher Tag wird ersetzt).
 * Aufruf: node scripts/save_prediction.js [YYYY-MM-DD]   (Standard: heute, Europe/Berlin)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { predictRace } = require("../js/prediction.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "prediction-history.json");

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["js/data.js", "js/strava-data.js", "js/garmin-data.js"]) {
  const file = path.join(ROOT, f);
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: f });
}
const w = ctx.window;
const p = predictRace({ strava: w.STRAVA, garmin: w.GARMIN, asOf: w.STRAVA.snapshotDate }, w.TRAINING.prediction);

const date = process.argv[2] || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const r = (x) => Math.round(x);
const entry = {
  date,
  total: r(p.total.realistic), totalOpt: r(p.total.optimistic), totalCons: r(p.total.conservative),
  swim: r(p.swim.realistic), bike: r(p.bike.realistic), run: r(p.run.realistic), t1: r(p.t1.realistic), t2: r(p.t2.realistic),
  ftp: p.inputs.ftp, weightKg: p.inputs.weightKg, swimMethod: p.swim.method, longestRunKm: p.run.longestKm,
};

let hist = [];
if (fs.existsSync(OUT)) {
  try { hist = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { console.error("Verlauf unlesbar, wird neu angelegt:", e.message); }
}
hist = hist.filter((e) => e.date !== date).concat(entry).sort((a, b) => a.date.localeCompare(b.date));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, "[\n" + hist.map((e) => "  " + JSON.stringify(e)).join(",\n") + "\n]\n");

const hms = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
console.log(`Prognose ${date}: ${hms(entry.total)} (Schwimmen ${hms(entry.swim)}, Rad ${hms(entry.bike)}, Laufen ${hms(entry.run)}) – ${hist.length} Einträge`);
