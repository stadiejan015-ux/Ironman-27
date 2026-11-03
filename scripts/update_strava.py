#!/usr/bin/env python3
"""Aktualisiert js/strava-data.js mit neuen Strava-Daten.

Eingabe sind JSON-Dateien im Format der Strava-MCP-Tools (Werte mit
use_preferred_units=true, also km, km/h, Pace-Strings):

  --activities FILE   Liste von Aktivitäten (oder ein Objekt mit "activities")
                      aus list_activities / search_activities
  --profile FILE      Objekt mit optionalen Schlüsseln:
                        "athlete" -> get_athlete_profile
                        "zones"   -> get_athlete_zones
                        "streak"  -> get_active_streak
                        "bests"   -> get_athlete_best_efforts
  --date YYYY-MM-DD   Stand der Daten (Standard: heute)

Bestehende Aktivitäten werden anhand von Startzeit (Minute) + Sporttyp
erkannt und ersetzt, neue werden ergänzt. Alles vor commitDate (js/data.js)
wird ignoriert.
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "js" / "strava-data.js"
CONFIG = ROOT / "js" / "data.js"
PREFIX = "window.STRAVA = "

RUN_LIKE = {"Run", "TrailRun", "VirtualRun", "Walk", "Hike"}
RIDE_LIKE = {"Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"}

BEST_LABELS = {
    "FastestMile": "1 Meile", "Fastest5k": "5 km", "Fastest10k": "10 km",
    "FastestHalfMarathon": "Halbmarathon", "FastestMarathon": "Marathon",
    "GreatestPower5s": "5 s", "GreatestPower1min": "1 min", "GreatestPower5min": "5 min",
    "GreatestPower20min": "20 min", "GreatestPower1hr": "1 h",
    "LongestActivity": "Längste Fahrt", "BiggestClimb": "Größter Anstieg",
}


def load_existing():
    if not OUT.exists():
        return {"snapshotDate": None, "athlete": {}, "zones": {}, "bests": {}, "activities": []}
    text = OUT.read_text(encoding="utf-8")
    start = text.index(PREFIX) + len(PREFIX)
    body = text[start:].rstrip().rstrip(";")
    return json.loads(body)


def commit_date():
    m = re.search(r'commitDate:\s*"(\d{4}-\d{2}-\d{2})"', CONFIG.read_text(encoding="utf-8"))
    return m.group(1) if m else "1970-01-01"


def de_num(x, d=1):
    return f"{x:.{d}f}".replace(".", ",")


def convert_activity(a):
    s = a.get("summary", a)
    sport = a.get("sport_type") or a.get("sport")
    start = (a.get("start_local") or a.get("date"))[:16]
    km = float(s.get("distance") or 0)
    sec = int(round(float(s.get("moving_time") or 0)))
    elev = int(round(float(s.get("elevation_gain") or 0)))
    info = ""
    if sport == "Swim":
        info = s.get("avg_swim_pace_display", "")
    elif sport in RUN_LIKE and sport not in {"Hike", "Walk"}:
        info = s.get("avg_pace_display", "")
    elif sport in RIDE_LIKE and s.get("avg_speed"):
        info = f"{de_num(float(s['avg_speed']))} km/h"
    row = [start, sport, a.get("name", "").strip(), round(km, 2), sec, elev]
    if info:
        row.append(info)
    return row


def fmt_watts(v):
    return f"{int(round(v))} W"


def fmt_dist(v, unit):
    if unit == "meters" and v >= 10000:
        return f"{round(v / 1000):,} km".replace(",", ".")
    return f"{round(v):,} m".replace(",", ".")


def convert_bests(raw, old):
    efforts = raw.get("efforts", raw if isinstance(raw, list) else [])
    run, bike = [], []
    for e in efforts:
        t, v, unit, date = e.get("best_effort_type"), e.get("value"), e.get("unit"), e.get("date")
        if t not in BEST_LABELS or v is None:
            continue
        label = BEST_LABELS[t]
        if e.get("sport") == "Run" and unit == "seconds":
            run.append([label, int(v), date])
        elif e.get("sport") == "Ride":
            val = fmt_watts(v) if unit == "watts" else fmt_dist(float(v), unit)
            bike.append([label, val, date])
    order = list(BEST_LABELS.values())
    run.sort(key=lambda r: order.index(r[0]))
    bike.sort(key=lambda r: order.index(r[0]))
    return {"run": run or old.get("run", []), "bike": bike or old.get("bike", [])}


def convert_zones(z):
    rng = lambda zs: [[x.get("min"), x.get("max")] for x in zs]
    out = {}
    if z.get("ftp"):
        out["ftp"] = z["ftp"]
    if z.get("heart_rate_zones"):
        out["hr"] = rng(z["heart_rate_zones"])
    if z.get("power_zones"):
        out["power"] = rng(z["power_zones"])
    if z.get("run_zones"):
        out["run"] = rng(z["run_zones"])
    return out


def write(data):
    acts = data.pop("activities")
    head = "".join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in data.items())
    lines = ",\n".join("    " + json.dumps(a, ensure_ascii=False) for a in acts)
    OUT.write_text(
        "/* Automatisch erzeugt von scripts/update_strava.py – nicht von Hand bearbeiten. */\n"
        + PREFIX + "{\n" + head + '  "activities": [\n' + lines + "\n  ]\n};\n",
        encoding="utf-8",
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--activities")
    ap.add_argument("--profile")
    ap.add_argument("--date", default=dt.date.today().isoformat())
    args = ap.parse_args()

    data = load_existing()
    cutoff = commit_date()
    before = len(data["activities"])

    if args.activities:
        raw = json.loads(pathlib.Path(args.activities).read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            raw = raw.get("activities", [])
        byk = {(r[0], r[1]): r for r in data["activities"]}
        for a in raw:
            row = a if isinstance(a, list) else convert_activity(a)
            byk[(row[0], row[1])] = row
        data["activities"] = [r for r in byk.values() if r[0][:10] >= cutoff]
    data["activities"].sort(key=lambda r: r[0], reverse=True)

    if args.profile:
        p = json.loads(pathlib.Path(args.profile).read_text(encoding="utf-8"))
        ath = data.setdefault("athlete", {})
        if p.get("athlete"):
            a = p["athlete"]
            if a.get("weight"):
                ath["weightKg"] = a["weight"]
            focus = a.get("current_focus") or {}
            if focus.get("open_text"):
                ath["focus"] = f"{focus.get('focus_type', '').strip()} – {focus['open_text']}".strip(" –")
        if p.get("streak") and p["streak"].get("length") is not None:
            ath["streakWeeks"] = p["streak"]["length"]
        if p.get("zones"):
            data["zones"] = {**data.get("zones", {}), **convert_zones(p["zones"])}
        if p.get("bests"):
            data["bests"] = convert_bests(p["bests"], data.get("bests", {}))

    data["snapshotDate"] = args.date
    n = len(data["activities"])
    write(data)
    print(f"strava-data.js: {n} Aktivitäten ({n - before:+d}), Stand {args.date}")


if __name__ == "__main__":
    sys.exit(main())
