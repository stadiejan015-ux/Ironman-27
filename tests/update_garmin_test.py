#!/usr/bin/env python3
"""Tests für scripts/update_garmin.py (nur reine Funktionen, ohne Garmin-Zugang).

Ausführen mit: python3 tests/update_garmin_test.py
"""
import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import update_garmin as ug  # noqa: E402

n = 0


def test(name, fn):
    global n
    fn()
    n += 1
    print("✓", name)


def act(local, gmt):
    return {"startTimeLocal": local, "startTimeGMT": gmt}


H = dt.timedelta(hours=1)


def t_offset():
    # Bali: Ortszeit 8 Stunden vor der Weltzeit
    assert ug.tz_offset([act("2026-11-13 15:26:36", "2026-11-13 07:26:36")]) == 8 * H
    # Deutschland im Winter: +1 Stunde
    assert ug.tz_offset([act("2026-10-11 09:00:00", "2026-10-11 08:00:00")]) == 1 * H
    # westlich von Greenwich: negative Verschiebung
    assert ug.tz_offset([act("2026-03-01 07:00:00", "2026-03-01 12:00:00")]) == -5 * H
    # Schreibweise mit „T“ und halbe Stunden (Indien +5:30)
    assert ug.tz_offset([act("2026-02-01T10:30:00", "2026-02-01T05:00:00")]) == dt.timedelta(hours=5, minutes=30)


def t_newest_wins():
    acts = [act("2026-10-11 09:00:00", "2026-10-11 08:00:00"),      # zu Hause
            act("2026-11-13 15:26:36", "2026-11-13 07:26:36"),      # neueste: Bali
            act("2026-10-27 20:00:00", "2026-10-27 16:00:00")]      # unterwegs
    assert ug.tz_offset(acts) == 8 * H


def t_fallback():
    assert ug.tz_offset([]) == dt.timedelta(0)
    assert ug.tz_offset(None) == dt.timedelta(0)
    assert ug.tz_offset([{"startTimeLocal": "2026-11-13 15:26:36"}]) == dt.timedelta(0)     # ohne Weltzeit
    assert ug.tz_offset([act("kaputt", "2026-11-13 07:26:36")]) == dt.timedelta(0)
    assert ug.tz_offset([act("2026-11-15 15:00:00", "2026-11-13 07:00:00")]) == dt.timedelta(0)  # 56 h: unplausibel
    # eine kaputte Einheit stört die anderen nicht
    assert ug.tz_offset([act("kaputt", "kaputt"), act("2026-11-13 15:26:36", "2026-11-13 07:26:36")]) == 8 * H


def t_local_today():
    utc = lambda s: dt.datetime.fromisoformat(s)
    # Der Fehler vom 13./14.11.: Lauf um 23:53 Uhr Weltzeit = 07:53 Uhr in Bali am 14.11.
    assert ug.local_today(utc("2026-11-13T23:53:00"), 8 * H) == dt.date(2026, 11, 14)
    assert ug.local_today(utc("2026-11-13T15:59:00"), 8 * H) == dt.date(2026, 11, 13)   # 23:59 Uhr in Bali
    assert ug.local_today(utc("2026-11-13T16:00:00"), 8 * H) == dt.date(2026, 11, 14)   # Mitternacht in Bali
    assert ug.local_today(utc("2026-11-14T07:02:00"), 8 * H) == dt.date(2026, 11, 14)
    # ohne Verschiebung bleibt es beim bisherigen Verhalten (Weltzeit)
    assert ug.local_today(utc("2026-11-13T23:53:00"), dt.timedelta(0)) == dt.date(2026, 11, 13)
    # westlich: um 02:00 Uhr Weltzeit ist es dort noch der Vortag
    assert ug.local_today(utc("2026-03-02T02:00:00"), -5 * H) == dt.date(2026, 3, 1)


def t_parsers_still_work():
    # bestehende Auswertung bleibt unverändert
    assert ug.parse_summary({"restingHeartRate": 47, "totalSteps": 2483, "averageStressLevel": -1})["stressAvg"] is None
    assert ug.parse_body({"dateWeightList": [{"weight": 73900, "bodyFat": 13.4}]}) == {"weight": 73.9, "bodyFat": 13.4}
    assert ug.merge({"a": None, "b": 1}, {"a": 2, "b": 3}) == {"a": 2, "b": 1}


test("Zeitverschiebung aus der Garmin-Aktivität (Ortszeit − Weltzeit)", t_offset)
test("Die neueste Aktivität bestimmt die Zeitzone", t_newest_wins)
test("Ohne brauchbare Aktivität: keine Verschiebung (Weltzeit wie bisher)", t_fallback)
test("Heutiges Datum am Ort des Nutzers, nicht in Weltzeit", t_local_today)
test("Auswertung der Tageswerte unverändert", t_parsers_still_work)
print(f"\n{n} Tests bestanden.")
