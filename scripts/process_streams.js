#!/usr/bin/env node
/*
 * Berechnet Zone-2-Kennzahlen aus Strava-Streams und speichert NUR die Kennzahlen
 * in data/z2-metrics.json (rohe Streams kommen nie ins Repo – das Repo ist öffentlich).
 *
 * Aufruf: node scripts/process_streams.js <jobs.json> [--force]
 *   jobs.json = [{ "id": "123", "file": "/pfad/zur/stream-antwort.txt",
 *                  "meta": { "date": "2026-11-03T18:55", "sport": "Run", "name": "…",
 *                            "km": 5.1, "sec": 1500, "elev": 0, "trainer": false } }, …]
 *   Statt "file" geht auch "skip": "Grund" (z. B. wenn kein Stream verfügbar ist).
 * Bereits verarbeitete IDs werden übersprungen (Cache), außer mit --force.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Z2 = require("../js/z2.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "z2-metrics.json");
const args = process.argv.slice(2);
const force = args.includes("--force");
const jobsFile = args.find((a) => !a.startsWith("--"));
if (!jobsFile) { console.error("Aufruf: node scripts/process_streams.js <jobs.json> [--force]"); process.exit(1); }

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8"), ctx);
const T = ctx.window.TRAINING;

let db = { updated: null, activities: [] };
if (fs.existsSync(OUT)) db = JSON.parse(fs.readFileSync(OUT, "utf8"));
const byId = new Map(db.activities.map((a) => [String(a.id), a]));

const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
let done = 0, skipped = 0, cached = 0;
for (const job of jobs) {
  const id = String(job.id);
  if (byId.has(id) && !force) { cached++; continue; }
  const meta = { id, ...job.meta };
  if (job.skip || !job.file) {
    byId.set(id, { id, date: String(meta.date).slice(0, 16), sport: meta.sport, name: meta.name, km: meta.km, sec: meta.sec, elev: meta.elev, status: { all: job.skip || "kein Stream" } });
    skipped++; continue;
  }
  let streams;
  try {
    const raw = JSON.parse(fs.readFileSync(job.file, "utf8"));
    streams = raw.streams || raw; // Strava-MCP liefert ein flaches Objekt { time: [...], heart_rate: [...], … }
    for (const k of Object.keys(streams)) if (streams[k] && streams[k].data) streams[k] = streams[k].data;
  } catch (e) {
    console.error(`! ${id}: Stream-Datei unlesbar (${e.message}) – übersprungen, wird beim nächsten Lauf erneut versucht`);
    continue;
  }
  byId.set(id, Z2.analyzeActivity(meta, streams, T.z2, T.zones.hr));
  done++;
}

db.activities = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
db.updated = new Date().toISOString().slice(0, 16) + "Z";
db.zones = T.zones.hr;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '{\n  "updated": ' + JSON.stringify(db.updated) + ',\n  "zones": ' + JSON.stringify(db.zones)
  + ',\n  "activities": [\n' + db.activities.map((a) => "    " + JSON.stringify(a)).join(",\n") + "\n  ]\n}\n");
console.log(`z2-metrics.json: ${done} neu berechnet, ${skipped} übersprungen, ${cached} schon im Cache – ${db.activities.length} Aktivitäten gesamt`);
