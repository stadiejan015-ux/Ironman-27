#!/usr/bin/env python3
"""Holt Gesundheits- und Leistungsdaten aus Garmin Connect und schreibt js/garmin-data.js.

Läuft automatisch per GitHub Action (.github/workflows/garmin.yml).
Benötigt die Bibliothek `garminconnect` (inoffizieller Garmin-Connect-Zugang).

Anmeldung (Umgebungsvariablen / GitHub-Secrets):
  GARMIN_TOKENS    optional: gespeicherte Anmelde-Tokens (base64, von garth.dumps())
  GARMIN_EMAIL     Garmin-Login
  GARMIN_PASSWORD  Garmin-Passwort
Tokens werden zusätzlich in ~/.garminconnect zwischengespeichert, damit nicht
bei jedem Lauf neu eingeloggt werden muss.

Aufruf:
  python3 scripts/update_garmin.py              # letzte 3 Tage aktualisieren
  python3 scripts/update_garmin.py --days 90    # Verlauf nachladen

Gespeichert werden Tageswerte (Schlaf, HRV, Belastung akut/chronisch …), Krafteinheiten mit Titel
(Gym-Tracker) und für jede Einheit aller Sportarten Garmins Belastungswert (activityTrainingLoad).
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "js" / "garmin-data.js"
PREFIX = "window.GARMIN = "
TOKEN_DIR = pathlib.Path(os.environ.get("GARMIN_TOKEN_DIR", "~/.garminconnect")).expanduser()
KEEP_DAYS = 400


# ---------------------------------------------------------------- Helfer
def get(obj, *path, default=None):
    """Sicherer Zugriff auf verschachtelte Dicts/Listen."""
    for p in path:
        if obj is None:
            return default
        if isinstance(p, int):
            if not isinstance(obj, list) or len(obj) <= p:
                return default
            obj = obj[p]
        else:
            if not isinstance(obj, dict):
                return default
            obj = obj.get(p)
    return default if obj is None else obj


def num(v, d=1):
    try:
        return round(float(v), d)
    except (TypeError, ValueError):
        return None


def hours(sec):
    return num(sec / 3600, 2) if isinstance(sec, (int, float)) else None


def safe(fn, *args):
    try:
        return fn(*args)
    except Exception as e:  # einzelne fehlende Werte dürfen den Lauf nicht abbrechen
        print(f"  ! {getattr(fn, '__name__', fn)}{args}: {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
        return None


# ---------------------------------------------------------------- Parser (rein, testbar)
def parse_summary(s):
    return {
        "rhr": get(s, "restingHeartRate"),
        "stressAvg": get(s, "averageStressLevel") if (get(s, "averageStressLevel") or -1) >= 0 else None,
        "bbHigh": get(s, "bodyBatteryHighestValue"),
        "bbLow": get(s, "bodyBatteryLowestValue"),
        "bbNow": get(s, "bodyBatteryMostRecentValue"),
        "bbCharged": get(s, "bodyBatteryChargedValue"),
        "steps": get(s, "totalSteps"),
    }


def parse_sleep(s):
    d = get(s, "dailySleepDTO", default={})
    return {
        "sleepScore": get(d, "sleepScores", "overall", "value"),
        "sleepQuality": get(d, "sleepScores", "overall", "qualifierKey"),
        "sleepH": hours(get(d, "sleepTimeSeconds")),
        "deepH": hours(get(d, "deepSleepSeconds")),
        "remH": hours(get(d, "remSleepSeconds")),
        "lightH": hours(get(d, "lightSleepSeconds")),
        "awakeH": hours(get(d, "awakeSleepSeconds")),
        "sleepHrv": num(get(s, "avgOvernightHrv")),
        "bbChange": get(s, "bodyBatteryChange"),
    }


def parse_hrv(h):
    s = get(h, "hrvSummary", default={})
    return {
        "hrv": get(s, "lastNightAvg"),
        "hrvWeekly": get(s, "weeklyAvg"),
        "hrvStatus": get(s, "status"),
        "hrvLow": get(s, "baseline", "balancedLow"),
        "hrvHigh": get(s, "baseline", "balancedUpper"),
    }


def parse_readiness(r):
    if isinstance(r, list):
        r = r[0] if r else None
    return {
        "readiness": get(r, "score"),
        "readinessLevel": get(r, "level"),
        "recoveryH": num((get(r, "recoveryTime") or 0) / 60, 0) if get(r, "recoveryTime") is not None else None,
    }


def parse_training_status(t):
    vo2 = get(t, "mostRecentVO2Max", default={})
    status_map = get(t, "mostRecentTrainingStatus", "latestTrainingStatusData", default={})
    st = next(iter(status_map.values()), {}) if isinstance(status_map, dict) else {}
    acute = get(st, "acuteTrainingLoadDTO", default={})
    load_bal = get(t, "mostRecentTrainingLoadBalance", "metricsTrainingLoadBalanceDTOMap", default={})
    lb = next(iter(load_bal.values()), {}) if isinstance(load_bal, dict) else {}
    return {
        "vo2run": num(get(vo2, "generic", "vo2MaxPreciseValue") or get(vo2, "generic", "vo2MaxValue")),
        "vo2bike": num(get(vo2, "cycling", "vo2MaxPreciseValue") or get(vo2, "cycling", "vo2MaxValue")),
        "trainingStatus": get(st, "trainingStatusFeedbackPhrase") or get(st, "trainingStatus"),
        "acuteLoad": get(acute, "dailyTrainingLoadAcute"),
        "chronicLoad": get(acute, "dailyTrainingLoadChronic"),
        "loadRatio": num(get(acute, "dailyAcuteChronicWorkloadRatio"), 2),
        "loadStatus": get(acute, "acwrStatus"),  # Garmins Einordnung: LOW / OPTIMAL / HIGH / VERY_HIGH
        "loadAerobicLow": num(get(lb, "monthlyLoadAerobicLow"), 0),
        "loadAerobicHigh": num(get(lb, "monthlyLoadAerobicHigh"), 0),
        "loadAnaerobic": num(get(lb, "monthlyLoadAnaerobic"), 0),
    }


def parse_max_metrics(m):
    if isinstance(m, list):
        m = m[0] if m else None
    return {
        "vo2run": num(get(m, "generic", "vo2MaxPreciseValue") or get(m, "generic", "vo2MaxValue")),
        "vo2bike": num(get(m, "cycling", "vo2MaxPreciseValue") or get(m, "cycling", "vo2MaxValue")),
    }


def parse_body(b):
    items = get(b, "dateWeightList", default=[]) or []
    if not items:
        return {}
    last = items[-1]
    w = get(last, "weight")
    return {
        "weight": num(w / 1000, 1) if isinstance(w, (int, float)) and w > 500 else num(w, 1),
        "bodyFat": num(get(last, "bodyFat")),
    }


def _ts(value):
    """Garmin-Zeitstempel („2026-11-13 15:26:36“ oder mit „T“) → datetime, sonst None."""
    try:
        return dt.datetime.fromisoformat(str(value).strip().replace(" ", "T")[:19])
    except (TypeError, ValueError):
        return None


def tz_offset(acts):
    """Zeitverschiebung des Nutzers zur Weltzeit (UTC): Ortszeit − Weltzeit der neuesten Garmin-Aktivität.

    Garmin führt die Tageswerte nach dem Kalendertag am Ort des Nutzers. Der Runner von GitHub rechnet in UTC –
    auf Reisen (z. B. Bali, +8 h) fehlte dadurch morgens stundenlang der neue Tag. Ohne brauchbare Aktivität
    oder bei unplausiblen Werten: keine Verschiebung (UTC, wie bisher).
    """
    best = None
    for a in acts or []:
        loc, gmt = _ts(a.get("startTimeLocal")), _ts(a.get("startTimeGMT"))
        if loc is None or gmt is None:
            continue
        if best is None or gmt > best[0]:
            best = (gmt, loc - gmt)
    if not best:
        return dt.timedelta(0)
    minutes = round(best[1].total_seconds() / 900) * 15   # auf Viertelstunden
    if not -12 * 60 <= minutes <= 14 * 60:
        return dt.timedelta(0)
    return dt.timedelta(minutes=minutes)


def local_today(now_utc, offset):
    """Heutiges Datum am Ort des Nutzers (now_utc ohne Zeitzone, in UTC)."""
    return (now_utc + offset).date()


def merge(*parts):
    out = {}
    for p in parts:
        for k, v in (p or {}).items():
            if v is not None and (k not in out or out[k] is None):
                out[k] = v
    return out


# ---------------------------------------------------------------- Garmin-Zugang
def login():
    from garminconnect import Garmin  # erst hier importieren, damit Parser ohne Bibliothek testbar sind

    email, password = os.environ.get("GARMIN_EMAIL"), os.environ.get("GARMIN_PASSWORD")
    tokens = os.environ.get("GARMIN_TOKENS", "").strip()
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    g = Garmin(email=email, password=password)
    # login() lädt gespeicherte Tokens aus TOKEN_DIR, meldet sich sonst mit
    # E-Mail/Passwort an und speichert die neuen Tokens wieder in TOKEN_DIR.
    has_cache = any(TOKEN_DIR.iterdir())
    g.login(tokens if (tokens and not has_cache) else str(TOKEN_DIR))
    if tokens and not has_cache:
        try:
            g.client.dump(str(TOKEN_DIR))
        except Exception:
            pass
    print("Angemeldet" + (" (Token-Cache)" if has_cache else ""))
    return g


def fetch_day(g, day):
    ds = day.isoformat()
    rec = merge(
        parse_summary(safe(g.get_user_summary, ds)),
        parse_sleep(safe(g.get_sleep_data, ds)),
        parse_hrv(safe(g.get_hrv_data, ds)),
        parse_readiness(safe(g.get_training_readiness, ds)),
        parse_training_status(safe(g.get_training_status, ds)),
        parse_max_metrics(safe(g.get_max_metrics, ds)),
        parse_body(safe(g.get_body_composition, ds, ds)),
    )
    rec = {k: v for k, v in rec.items() if v is not None}
    return {"date": ds, **rec} if rec else None


# ---------------------------------------------------------------- Krafteinheiten (Gym-Tracker)
STRENGTH = ("strength_training", "strength", "indoor_cardio", "fitness_equipment")
TITLE_REFRESH_DAYS = 14  # Titel nachträglich geändert? So lange rückwirkend neu einlesen
LOAD_BACKFILL_DAYS = 70  # Belastung je Einheit: beim ersten Lauf 10 Wochen nachladen


def parse_activity(a, detail=None):
    """Garmin-Aktivität → kompakter Eintrag (nur was der Gym-Tracker braucht)."""
    desc = a.get("description")
    if desc is None and detail:
        desc = get(detail, "description") or get(detail, "summaryDTO", "description")
    return {
        "id": str(a.get("activityId")),
        "start": str(a.get("startTimeLocal") or "")[:16].replace(" ", "T"),
        "type": (get(a, "activityType", "typeKey") or "").lower(),
        "name": (a.get("activityName") or "").strip(),
        "desc": (desc or "").strip()[:300],
        "sec": int(round(a.get("movingDuration") or a.get("duration") or 0)),
    }


def parse_load(a):
    """Garmin-Aktivität (jede Sportart) → Belastungswert der Einheit (activityTrainingLoad, None wenn fehlt)."""
    return {
        "id": str(a.get("activityId")),
        "start": str(a.get("startTimeLocal") or "")[:16].replace(" ", "T"),
        "type": (get(a, "activityType", "typeKey") or "").lower(),
        "sec": int(round(a.get("movingDuration") or a.get("duration") or 0)),
        "load": num(a.get("activityTrainingLoad"), 1),
    }


def fetch_strength(g, existing, start, end, acts=None):
    """Krafteinheiten zwischen start und end (YYYY-MM-DD) mit Titel und Beschreibung."""
    if acts is None:
        acts = safe(g.get_activities_by_date, start, end) or []
    known = {a["id"]: a for a in existing}
    out = []
    for a in acts:
        if str(a.get("startTimeLocal") or "")[:10] < start:
            continue
        typ = (get(a, "activityType", "typeKey") or "").lower()
        if not any(k in typ for k in STRENGTH):
            continue
        aid = str(a.get("activityId"))
        detail = None
        if a.get("description") is None:  # Beschreibung steht nicht immer in der Liste
            detail = safe(g.get_activity, aid)
        rec = parse_activity(a, detail)
        if aid in known and not rec["desc"]:
            rec["desc"] = known[aid].get("desc", "")
        out.append(rec)
    return out


def update_loads(g, data, byd, acts_list, load_start, backfill, recent_days, today):
    """Belastung je Einheit (alle Sportarten) speichern; beim ersten Lauf Status akut/chronisch für 10 Wochen nachtragen."""
    if acts_list is None:
        return
    byl = {a["id"]: a for a in data.get("loads") or []}
    for a in acts_list:
        if str(a.get("startTimeLocal") or "")[:10] >= load_start:
            rec = parse_load(a)
            byl[rec["id"]] = rec
    data["loads"] = list(byl.values())
    with_load = sum(1 for a in byl.values() if a["load"] is not None)
    print(f"Belastung: {len(byl)} Einheiten gespeichert, {with_load} mit Garmin-Belastungswert (seit {load_start})")
    if backfill:
        # Garmins Status zum Verhältnis akut/chronisch für dieselben 10 Wochen nachtragen (1 Abfrage pro Tag)
        for i in range(LOAD_BACKFILL_DAYS, recent_days - 1, -1):
            ds = (today - dt.timedelta(days=i)).isoformat()
            ts = {k: v for k, v in parse_training_status(safe(g.get_training_status, ds)).items()
                  if k in ("acuteLoad", "chronicLoad", "loadRatio", "loadStatus") and v is not None}
            if ts and ds in byd:
                byd[ds].update(ts)
        data["days"] = list(byd.values())
        data["loadsSince"] = load_start


# ---------------------------------------------------------------- Datei
def load_existing():
    if not OUT.exists():
        return {"updated": None, "days": [], "activities": [], "loads": []}
    text = OUT.read_text(encoding="utf-8")
    body = text[text.index(PREFIX) + len(PREFIX):].rstrip().rstrip(";")
    return json.loads(body)


def write(data):
    days = sorted(data["days"], key=lambda d: d["date"])[-KEEP_DAYS:]
    acts = sorted(data.get("activities") or [], key=lambda a: a["start"])[-600:]
    loads = sorted(data.get("loads") or [], key=lambda a: a["start"])[-1500:]
    lines = ",\n".join("    " + json.dumps(d, ensure_ascii=False) for d in days)
    alines = ",\n".join("    " + json.dumps(a, ensure_ascii=False) for a in acts)
    llines = ",\n".join("    " + json.dumps(a, ensure_ascii=False) for a in loads)
    OUT.write_text(
        "/* Automatisch erzeugt von scripts/update_garmin.py – nicht von Hand bearbeiten. */\n"
        + PREFIX + "{\n"
        + f'  "updated": {json.dumps(data["updated"])},\n'
        + '  "days": [\n' + lines + ("\n" if lines else "") + "  ],\n"
        + '  "activities": [\n' + alines + ("\n" if alines else "") + "  ],\n"
        + f'  "loadsSince": {json.dumps(data.get("loadsSince"))},\n'
        + '  "loads": [\n' + llines + ("\n" if llines else "") + "  ]\n};\n",
        encoding="utf-8",
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3, help="wie viele Tage rückwirkend holen")
    args = ap.parse_args()

    data = load_existing()
    if not data["days"]:
        args.days = max(args.days, 90)  # erster Lauf: Verlauf nachladen

    g = login()
    byd = {d["date"]: d for d in data["days"]}
    now_utc = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    utc_today = now_utc.date()

    # Krafteinheiten mit Titel (Gym-Tracker): erster Lauf ab commitDate, danach die letzten 14 Tage neu
    existing = data.get("activities") or []
    if existing:
        start = (utc_today - dt.timedelta(days=TITLE_REFRESH_DAYS)).isoformat()
    else:
        m = re.search(r'commitDate:\s*"(\d{4}-\d{2}-\d{2})"', (ROOT / "js" / "data.js").read_text(encoding="utf-8"))
        start = m.group(1) if m else (utc_today - dt.timedelta(days=120)).isoformat()
    # Belastung je Einheit (alle Sportarten): einmalig 10 Wochen nachladen, danach die letzten 14 Tage
    backfill = not data.get("loadsSince")
    load_start = (utc_today - dt.timedelta(days=LOAD_BACKFILL_DAYS if backfill else TITLE_REFRESH_DAYS)).isoformat()
    # Bis morgen (UTC) abfragen: am Ort des Nutzers kann schon der nächste Kalendertag sein
    acts_list = safe(g.get_activities_by_date, min(start, load_start), (utc_today + dt.timedelta(days=1)).isoformat())

    # „Heute“ am Ort des Nutzers (Zeitzone aus der neuesten Aktivität), nicht in UTC
    today = local_today(now_utc, tz_offset(acts_list))
    if today != utc_today:
        print(f"Ortszeit des Nutzers: heute ist der {today.isoformat()} (UTC: {utc_today.isoformat()})")
    got = 0
    for i in range(args.days - 1, -1, -1):
        day = today - dt.timedelta(days=i)
        rec = fetch_day(g, day)
        if rec:
            byd[rec["date"]] = {**byd.get(rec["date"], {}), **rec}
            got += 1
    data["days"] = list(byd.values())
    try:
        update_loads(g, data, byd, acts_list, load_start, backfill, args.days, today)
    except Exception as e:  # Belastung darf die Tageswerte nicht blockieren
        print(f"! Belastung nicht gelesen: {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
    try:
        fresh = fetch_strength(g, existing, start, today.isoformat(), acts_list)
        bya = {a["id"]: a for a in existing}
        for a in fresh:
            bya[a["id"]] = a
        data["activities"] = list(bya.values())
        print(f"Krafteinheiten: {len(fresh)} seit {start} gelesen, {len(bya)} gespeichert. Neueste: "
              + "; ".join(f'{a["start"]} „{a["name"]}“' for a in sorted(fresh, key=lambda a: a["start"])[-3:]))
    except Exception as e:  # Gym-Daten dürfen die Tageswerte nicht blockieren
        print(f"! Krafteinheiten nicht gelesen: {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)

    data["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
    write(data)
    latest = max(byd.values(), key=lambda d: d["date"]) if byd else {}
    print(f"garmin-data.js: {len(byd)} Tage, {got} aktualisiert. Neuester Tag: {json.dumps(latest, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
