#!/usr/bin/env python3
"""Erkennt pro Garmin-Aktivität, ob die Herzfrequenz per Brustgurt oder per Uhr gemessen wurde.

Läuft in der GitHub Action nach scripts/update_garmin.py (gleiche Anmeldung).
Schreibt data/hr-sources.json – nur Typ und Sensorbezeichnung, keine Seriennummern.

  python3 scripts/update_hr_sources.py            # neue Aktivitäten seit dem letzten Lauf
  python3 scripts/update_hr_sources.py --force    # alles ab commitDate neu prüfen

Erkennung: Garmin listet pro Aktivität die verbundenen externen Sensoren
(metadataDTO.sensors). Ist ein Herzfrequenz-Sensor (ANT+/Bluetooth) dabei → "strap",
sonst → "wrist" (optischer Sensor der Uhr). Fehlt die Sensorliste ganz → "unknown".
"""
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import update_garmin as ug  # noqa: E402  (Login und Helfer wiederverwenden)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "hr-sources.json"
SECRET_KEYS = re.compile(r"serial|unitid|deviceid|^id$|uuid|mac|address", re.I)
INTERNAL = re.compile(r"local|internal|wrist|elevate|optical|ohr", re.I)
HR_HINT = re.compile(r"heart|hrm|\bhr\b", re.I)
VERSION = 2  # bei Änderungen der Erkennung hochzählen → alle Einheiten werden neu eingestuft


def commit_date():
    m = re.search(r'commitDate:\s*"(\d{4}-\d{2}-\d{2})"', (ROOT / "js" / "data.js").read_text(encoding="utf-8"))
    return m.group(1) if m else "2026-01-01"


def find_sensor_lists(obj, path=""):
    """Alle Listen unter Schlüsseln mit 'sensor' im Namen (rekursiv)."""
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}.{k}" if path else k
            if isinstance(v, list) and "sensor" in k.lower():
                found.append((p, v))
            elif isinstance(v, (dict, list)):
                found.extend(find_sensor_lists(v, p))
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:50]):
            found.extend(find_sensor_lists(v, f"{path}[{i}]"))
    return found


def public_view(sensor):
    """Sensor-Eintrag ohne Seriennummern/IDs (für Log und Datei)."""
    if not isinstance(sensor, dict):
        return str(sensor)[:60]
    return {k: v for k, v in sensor.items() if not SECRET_KEYS.search(k) and not isinstance(v, (dict, list))}


def classify(activity):
    lists = [(p, l) for p, l in find_sensor_lists(activity) if l]
    meta = activity.get("metadataDTO") or {}
    maker = str(meta.get("manufacturer") or "").upper()
    if not lists:
        # Garmin speichert "sensors" leer, wenn kein externer Sensor verbunden war → optischer Uhr-Sensor.
        # Von Zwift & Co. hochgeladene Aktivitäten haben keine Sensordaten → unbekannt.
        if "sensors" in meta and maker == "GARMIN":
            return "wrist", [], ["metadataDTO.sensors (leer)"]
        return "unknown", [], None
    sensors = [s for _, lst in lists for s in lst]
    hr = []
    for s in sensors:
        view = public_view(s)
        text = " ".join(str(v) for v in (view.values() if isinstance(view, dict) else [view]))
        if HR_HINT.search(text) and not INTERNAL.search(text):
            hr.append(" ".join(str(view.get(k)) for k in ("manufacturer", "productName", "product", "sourceType")
                               if isinstance(view, dict) and view.get(k)) or "Herzfrequenz-Sensor")
    return ("strap" if hr else "wrist"), hr, [p for p, _ in lists]


def load():
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8"))
    return {"updated": None, "activities": []}


def write(db):
    acts = sorted(db["activities"], key=lambda a: a["start"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('{\n  "updated": ' + json.dumps(db["updated"]) + ',\n  "version": ' + json.dumps(db.get("version")) + ',\n  "activities": [\n'
                   + ",\n".join("    " + json.dumps(a, ensure_ascii=False) for a in acts) + "\n  ]\n}\n", encoding="utf-8")


def main():
    db = load()
    force = "--force" in sys.argv or db.get("version") != VERSION
    known = {str(a["id"]) for a in db["activities"]} if not force else set()
    if force:
        db["activities"] = []
    last = max((a["start"][:10] for a in db["activities"]), default=None)
    start = commit_date() if not last else (dt.date.fromisoformat(last) - dt.timedelta(days=3)).isoformat()
    end = (dt.date.today() + dt.timedelta(days=1)).isoformat()   # bis morgen (UTC): am Ort des Nutzers kann schon der nächste Tag sein

    g = ug.login()
    acts = g.get_activities_by_date(start, end) or []
    shown = set()
    added = 0
    for a in acts:
        aid = str(a.get("activityId"))
        typ = ((a.get("activityType") or {}).get("typeKey") or "").lower()
        if aid in known or not re.search(r"run|cycl|bik|ride", typ):
            continue
        detail = ug.safe(g.get_activity, aid) or {}
        source, sensors, where = classify(detail)
        if source not in shown:  # je ein Beispiel pro Ergebnis ins Log (ohne Seriennummern/IDs)
            meta = detail.get("metadataDTO") or {}
            print(f"[Kontrolle] {a.get('startTimeLocal')} {typ}: Ergebnis {source}, Hersteller {meta.get('manufacturer')}, Sensorlisten {where}")
            for p, lst in find_sensor_lists(detail):
                for s in (lst or [])[:6]:
                    print(f"    {p}: {json.dumps(public_view(s), ensure_ascii=False)[:200]}")
            shown.add(source)
        db["activities"].append({
            "id": aid, "start": str(a.get("startTimeLocal", ""))[:16].replace(" ", "T"), "type": typ,
            "source": source, "sensors": sensors,
        })
        added += 1
    db["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
    db["version"] = VERSION
    write(db)
    counts = {}
    for x in db["activities"]:
        counts[x["source"]] = counts.get(x["source"], 0) + 1
    print(f"hr-sources.json: {added} neu, gesamt {len(db['activities'])} – {counts}")


if __name__ == "__main__":
    main()
