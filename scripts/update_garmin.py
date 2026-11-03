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
"""
import argparse
import datetime as dt
import json
import os
import pathlib
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


# ---------------------------------------------------------------- Datei
def load_existing():
    if not OUT.exists():
        return {"updated": None, "days": []}
    text = OUT.read_text(encoding="utf-8")
    body = text[text.index(PREFIX) + len(PREFIX):].rstrip().rstrip(";")
    return json.loads(body)


def write(data):
    days = sorted(data["days"], key=lambda d: d["date"])[-KEEP_DAYS:]
    lines = ",\n".join("    " + json.dumps(d, ensure_ascii=False) for d in days)
    OUT.write_text(
        "/* Automatisch erzeugt von scripts/update_garmin.py – nicht von Hand bearbeiten. */\n"
        + PREFIX + "{\n"
        + f'  "updated": {json.dumps(data["updated"])},\n'
        + '  "days": [\n' + lines + ("\n" if lines else "") + "  ]\n};\n",
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
    today = dt.date.today()
    got = 0
    for i in range(args.days - 1, -1, -1):
        day = today - dt.timedelta(days=i)
        rec = fetch_day(g, day)
        if rec:
            byd[rec["date"]] = {**byd.get(rec["date"], {}), **rec}
            got += 1
    data["days"] = list(byd.values())
    data["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
    write(data)
    latest = max(byd.values(), key=lambda d: d["date"]) if byd else {}
    print(f"garmin-data.js: {len(byd)} Tage, {got} aktualisiert. Neuester Tag: {json.dumps(latest, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
