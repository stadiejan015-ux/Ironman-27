/* Tests für js/freshness.js – ausführen mit: node tests/freshness.test.js */
"use strict";
const assert = require("node:assert/strict");
const F = require("../js/freshness.js");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };
const H = 3600000;
const at = (iso) => new Date(Date.parse(iso));
const NOW = at("2026-11-05T12:00:00Z");
const iso = (d) => d.toISOString().slice(0, 16) + "+00:00";
const ago = (h) => iso(new Date(NOW - h * H));
const withTZ = (tz, fn) => { const old = process.env.TZ; process.env.TZ = tz; try { fn(); } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; } };

test("Schwellen Strava: gelb ab 20 h, rot ab 48 h", () => {
  const lv = (h) => F.freshness({ now: NOW, strava: { snapshotAt: ago(h), snapshotDate: "2026-11-05" } }).strava.level;
  assert.deepEqual([lv(19), lv(20), lv(47.9), lv(48), lv(100)], ["ok", "warn", "warn", "bad", "bad"]);
  const f = F.freshness({ now: NOW, strava: { snapshotAt: ago(26), snapshotDate: "2026-11-04" } });
  assert.equal(f.messages[0].text, "Strava-Daten sind 26 h alt – der automatische Sync ist evtl. ausgefallen.");
  assert.equal(f.messages[0].tip.text, "In Claude Code „Update jetzt“ schreiben.");
  assert.equal(F.freshness({ now: NOW, strava: { snapshotAt: ago(73) } }).messages[0].text, "Strava-Daten sind 3 Tage alt – der automatische Sync ist evtl. ausgefallen.");
});

test("Schwellen Garmin: gelb ab 8 h, rot ab 24 h, Tipp mit Link auf GitHub Actions", () => {
  const lv = (h) => F.freshness({ now: NOW, garmin: { updated: ago(h) } }).garmin.level;
  assert.deepEqual([lv(7.9), lv(8), lv(23), lv(24)], ["ok", "warn", "warn", "bad"]);
  const m = F.freshness({ now: NOW, garmin: { updated: ago(9) } }).messages[0];
  assert.equal(m.text, "Garmin-Daten sind 9 h alt – der automatische Sync ist evtl. ausgefallen.");
  assert.equal(m.tip.href, "https://github.com/stadiejan015-ux/Ironman-27/actions");
  // Schwellen anpassbar
  assert.equal(F.freshness({ now: NOW, garmin: { updated: ago(9) }, cfg: { garminWarnH: 10 } }).garmin.level, "ok");
});

test("Alles frisch: keine Meldung; schlimmste Stufe bestimmt das Banner", () => {
  const ok = F.freshness({ now: NOW, strava: { snapshotAt: ago(3) }, garmin: { updated: ago(1), lastDay: "2026-11-05" } });
  assert.deepEqual(ok.messages, []); assert.equal(ok.worst, "ok");
  const mix = F.freshness({ now: NOW, strava: { snapshotAt: ago(21) }, garmin: { updated: ago(30) } });
  assert.deepEqual(mix.messages.map((m) => [m.source, m.level]), [["strava", "warn"], ["garmin", "bad"]]);
  assert.equal(mix.worst, "bad");
});

test("Zeitzonen: Daten in UTC, Gerät in UTC+8 bzw. Europa – Alter gleich, Anzeige in Gerätezeit", () => {
  const data = { strava: { snapshotAt: "2026-11-05T13:40+00:00", snapshotDate: "2026-11-05" }, garmin: { updated: "2026-11-05T04:17+00:00" } };
  const now = at("2026-11-06T09:40:00+08:00");   // = 01:40 UTC → 12 h später
  withTZ("Asia/Makassar", () => {
    const f = F.freshness({ now, ...data });
    assert.equal(Math.round(f.strava.ageH), 12); assert.equal(f.strava.level, "ok");
    assert.equal(Math.round(f.garmin.ageH), 21); assert.equal(f.garmin.level, "warn");
    assert.equal(f.footer, "Strava 05.11. 21:40, Garmin 05.11. 12:17");
  });
  withTZ("Europe/Berlin", () => {
    const f = F.freshness({ now, ...data });
    assert.equal(Math.round(f.strava.ageH), 12);
    assert.equal(f.footer, "Strava 05.11. 14:40, Garmin 05.11. 05:17");
  });
  // Zeitstempel mit anderem Offset (+01:00) wird korrekt umgerechnet
  const g = F.freshness({ now: at("2026-11-05T12:00:00Z"), garmin: { updated: "2026-11-05T05:00+01:00" } });
  assert.equal(Math.round(g.garmin.ageH), 8);
  // Uhr des Geräts leicht vor: kein negatives Alter
  assert.equal(F.freshness({ now: NOW, strava: { snapshotAt: iso(new Date(+NOW + 5 * 60000)) } }).strava.ageH, 0);
});

test("Fehlender snapshotAt: Rückfall auf snapshotDate, erst ab 2 Tagen eine Warnung", () => {
  withTZ("Asia/Makassar", () => {
    const lv = (now) => F.freshness({ now: at(now), strava: { snapshotDate: "2026-11-04" } }).strava;
    assert.equal(lv("2026-11-05T23:00:00+08:00").level, "ok");      // 1 Tag
    const two = lv("2026-11-06T08:00:00+08:00");
    assert.equal(two.level, "warn"); assert.equal(two.ageDays, 2); assert.equal(two.exact, false);
    assert.equal(lv("2026-11-07T08:00:00+08:00").level, "bad");     // 3 Tage → sicher > 48 h
    const f = F.freshness({ now: at("2026-11-06T08:00:00+08:00"), strava: { snapshotDate: "2026-11-04" } });
    assert.equal(f.messages[0].text, "Strava-Daten sind vom 04.11. (2 Tage alt) – der automatische Sync ist evtl. ausgefallen.");
    assert.equal(f.footer, "Strava 04.11.");
  });
  // ganz ohne Zeitstempel: keine Meldung, kein Absturz
  const none = F.freshness({ now: NOW, strava: {}, garmin: { updated: "kaputt" } });
  assert.equal(none.strava.level, "unknown"); assert.equal(none.garmin.level, "unknown"); assert.deepEqual(none.messages, []);
});

test("Uhr nicht synchronisiert: nur wenn der Sync frisch ist und der letzte Tageswert älter als gestern", () => {
  withTZ("Asia/Makassar", () => {
    const now = at("2026-11-05T20:00:00+08:00");
    const w = (lastDay, updatedH) => F.freshness({ now, garmin: { updated: iso(new Date(now - updatedH * H)), lastDay } });
    const two = w("2026-11-03", 1);
    assert.equal(two.watch.show, true); assert.equal(two.watch.daysSince, 2);
    assert.deepEqual(two.messages, [{ source: "watch", level: "info", text: "Deine Uhr hat seit 2 Tagen nicht mit Garmin Connect synchronisiert." }]);
    assert.equal(two.worst, "info");
    assert.equal(w("2026-11-04", 1).watch.show, false);   // gestern → ok (heutiger Schlaf evtl. noch nicht da)
    assert.equal(w("2026-11-05", 1).watch.show, false);
    // Sync selbst veraltet → stattdessen die Sync-Warnung, kein Uhr-Hinweis
    const stale = w("2026-11-01", 30);
    assert.equal(stale.watch.show, false); assert.deepEqual(stale.messages.map((m) => m.source), ["garmin"]);
  });
});

test("Ausblenden-Schlüssel ändert sich mit jedem Update", () => {
  const a = F.freshness({ now: NOW, strava: { snapshotAt: ago(30), snapshotDate: "2026-11-04" }, garmin: { updated: ago(2), lastDay: "2026-11-05" } });
  const b = F.freshness({ now: NOW, strava: { snapshotAt: ago(1), snapshotDate: "2026-11-05" }, garmin: { updated: ago(2), lastDay: "2026-11-05" } });
  const c = F.freshness({ now: NOW, strava: { snapshotAt: ago(30), snapshotDate: "2026-11-04" }, garmin: { updated: ago(0.5), lastDay: "2026-11-05" } });
  assert.notEqual(a.stamp, b.stamp); assert.notEqual(a.stamp, c.stamp);
  assert.equal(a.stamp, F.freshness({ now: new Date(+NOW + 5 * H), strava: { snapshotAt: ago(30), snapshotDate: "2026-11-04" }, garmin: { updated: ago(2), lastDay: "2026-11-05" } }).stamp);
});

console.log(`\n${n} Tests bestanden.`);
