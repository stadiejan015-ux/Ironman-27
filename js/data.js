/*
 * Persönliche Einstellungen – frei anpassbar.
 * ------------------------------------------
 * Die Strava-Daten (Aktivitäten, Zonen, Bestleistungen) stehen in
 * js/strava-data.js und werden täglich automatisch aktualisiert.
 */
window.TRAINING = {
  commitDate: "2026-06-27",      // Anmeldung / Start der Vorbereitung

  athlete: {
    name: "Jan Stadie",
    location: "Konstanz",
  },

  // >>> Hier dein Rennen eintragen <<<
  race: {
    name: "Ironman Frankfurt 2027",
    date: "2027-06-27",           // laut Presse (EM Frankfurt), offizielle Bestätigung prüfen
    location: "Frankfurt am Main, Europameisterschaft",
    swimKm: 3.8, bikeKm: 180, runKm: 42.2,
  },

  // Flex-Modus: flexibles Training auf Reisen, Schwerpunkt Gym, Ausdauer zur Erhaltung.
  // Ist active false oder das Datum nach until, verhält sich die Seite wie bisher.
  flex: {
    active: true,
    from: "2026-10-27",
    until: "2027-01-10",
    label: "Gym-Block & Reisen",
    focus: "Gym-Block, Ausdauer zur Erhaltung",   // ersetzt im Header den Strava-Fokus, solange Flex läuft
    ignoreVirtualRides: true,   // Zwift-Fahrten im Flex-Zeitraum nicht werten (fährt jemand anderes über den Account)
    minimum: { gym: 4, endurance: 2, enduranceMinMinutes: 20, swim: 0 },   // pro Woche (Mo–So); swim: 0 = Schwimmen keine Pflicht
    rotation: ["Push", "Pull", "Legs"],
    legDayHours: 48,            // so lange nach Leg Day kein harter Lauf
    reentryDays: 14,            // Hinweis zum Wiedereinstieg vor dem Ende
    defaultEquipment: ["gym", "treadmill", "runOutside"],
    // Erkennung des Splits im Titel/der Beschreibung (Groß-/Kleinschreibung egal)
    splitKeywords: {
      Push: ["push", "brust", "chest", "bankdrücken", "bench"],
      Pull: ["pull", "rücken", "back", "latzug", "lat pulldown", "lat"],
      Legs: ["legs", "leg day", "legday", "leg", "beine", "beinpresse", "leg press"],
    },
  },

  // „Zuletzt gemacht“ (Abschnitt Heute): Tage seit der letzten Einheit – grün bis / gelb bis, danach rot.
  // Rad inkl. Zwift, Laufen inkl. Laufband, Legs = Gym-Split. minMinutes = Mindestdauer für „lang“.
  sinceLast: {
    swim:     { green: 7,  yellow: 14 },
    bike:     { green: 10, yellow: 21 },
    run:      { green: 4,  yellow: 10 },
    longRun:  { green: 14, yellow: 28, minMinutes: 75 },
    longRide: { green: 21, yellow: 42, minMinutes: 150 },
    legs:     { green: 5,  yellow: 9 },
  },

  // Wochenzusammenfassung (Abschnitt Heute) – feste Regeln, keine KI. Schwellen für die Hinweise:
  weekly: {
    hrvDropPct: 10,   // HRV-Wochenschnitt so viel % unter dem 4-Wochen-Schnitt …
    sleepMinH: 7,     // … und Schlaf unter so vielen Stunden → „Erholung im Blick behalten“
    loadFactor: 1.5,  // Wochenbelastung über dem 1,5-Fachen des 4-Wochen-Schnitts (Teil 2)
    maxHints: 3,      // höchstens so viele Hinweise
    weeksBack: 8,     // so viele Wochen lassen sich mit ← → durchblättern
  },

  // Warnung bei veralteten Daten (Banner oben): Alter in Stunden, ab dem gelb bzw. rot gewarnt wird
  freshness: {
    stravaWarnH: 20, stravaBadH: 48,   // Strava-Update läuft mittags und abends
    garminWarnH: 8, garminBadH: 24,    // Garmin-Update alle 3 h
    fallbackWarnDays: 2,               // alte Strava-Daten ohne Uhrzeit: erst ab 2 Tagen warnen
    watchDays: 2,                      // letzter Garmin-Tageswert älter als gestern → „Uhr nicht synchronisiert“
    actionsUrl: "https://github.com/stadiejan015-ux/Ironman-27/actions",
  },

  // Saisonplan nach einem Flex-Zeitraum: Wochen je Phase zwischen Flex-Ende und Peak (Aufbau 2 = Rest bis zum Peak).
  // Bleiben für Aufbau 2 weniger als minBuild2Weeks, zeigt der Saisonplan eine Warnung.
  plan: {
    reentryWeeks: 2,    // Wiedereinstieg (6–9 h/Woche)
    base2Weeks: 6,      // Grundlage 2 (10–13 h)
    build1Weeks: 6,     // Aufbau 1 (12–15 h)
    minBuild2Weeks: 3,  // Aufbau 2 (14–18 h) mindestens
  },

  // Einklappbare Abschnitte: was standardmäßig zugeklappt ist (ids der Abschnitte).
  // Eigene Auf-/Zuklapp-Wahl hat Vorrang, bis die Phase wechselt.
  layout: {
    flex:   { collapsed: ["zone2", "disziplinen", "rennen"] },
    normal: { collapsed: [] },
  },

  // Gym-Tracker: Titel der Krafteinheit in Garmin Connect, z. B. „Push 6x100“, „Pull · Latzug 8x90“,
  // „Legs 3x10x180“, „Push 6x100 @Bali“. Nur „Push“ = Einheit ohne Eintrag.
  gym: {
    mainExercise: { Push: "Bankdrücken", Pull: "Latzug", Legs: "Beinpresse" },
    aliases: {
      "Bankdrücken": ["bankdrücken", "bankdruecken", "bench press", "bench"],
      "Latzug": ["latzug", "lat pulldown", "pulldown", "lat"],
      "Beinpresse": ["beinpresse", "leg press"],
    },
    splitKeywords: { Push: ["push"], Pull: ["pull"], Legs: ["leg day", "legday", "legs", "leg", "beine"] },
    perPlace: [],   // Übungen, die nur am selben Gym-Ort verglichen werden, z. B. ["Latzug", "Beinpresse"]; leer = alle ortsübergreifend
    // Nächstes Ziel nach doppelter Progression: Wiederholungsbereich [unten, oben] und Gewichtsschritt in kg
    progression: {
      "Bankdrücken": { reps: [6, 8], step: 2.5 },
      "Latzug":      { reps: [5, 8], step: 5 },
      "Beinpresse":  { reps: [5, 8], step: 10 },
      stagnation: 3,   // so viele Einträge ohne neues bestes 1RM → Hinweis „kein Fortschritt“
    },
    // Zielwert je Hauptübung als geschätztes 1RM in kg (Übung weglassen = kein Ziel anzeigen)
    goals: { "Bankdrücken": 100, "Latzug": 140, "Beinpresse": 300 },
  },

  // Eigene Herzfrequenz-Zonen (ersetzen die Strava-Standardzonen auf der ganzen Seite).
  // [min, max] in bpm, max null = offen. Z1 < 130 · Z2 130–152 · Z3 153–175 · Z4 176–200 · Z5 ≥ 201
  zones: {
    hr: [[0, 129], [130, 152], [153, 175], [176, 200], [201, null]],
    maxHr: 209,
  },

  // Zone-2-Entwicklung (js/z2.js, scripts/process_streams.js)
  z2: {
    warmupSec: 600,            // erste 10 min verwerfen
    smoothSec: 60,             // gleitendes Mittel für HF, Tempo, Watt
    maxGapSec: 10,             // längere Lücken zählen nur bis 10 s
    run: {
      hrBand: [140, 148],      // Pace @ HF
      gradeRange: [-2, 2],     // % Steigung
      minBandSec: 480,         // mind. 8 min im Band
      maxElevPerKm: 10,        // hügeliger → nicht gewertet
      maxHighShare: 0.10,      // > 10 % der Zeit ≥ Z4 → Intervall-Lauf
      minSpeed: 1.5,           // m/s, Gehen/Stehen ignorieren
      // Hügelige Läufe (10–25 Hm/km) mit steigungsbereinigter Pace (GAP, Minetti-Modell) werten
      gap: { enabled: true, maxElevPerKm: 25, gradeRange: [-6, 6] },
    },
    ride: {
      hrBand: [135, 145],      // Watt @ HF (nur echte Watt)
      gradeRange: [-2, 2],
      minBandSec: 480,
      maxHighShare: 0.10,
    },
    decoupling: {
      runMinSec: 3600, rideMinSec: 5400,  // ab 60 bzw. 90 min
      minZ12Share: 0.80,                  // ≥ 80 % in Z1–Z2 nach dem Aufwärmen
      maxVi: 1.10,                        // Rad: Variabilitätsindex
      thresholds: [5, 10],                // < 5 % grün, 5–10 % gelb, > 10 % rot
    },
    // Pulsmesser: Brustgurt-Erkennung über Garmin (data/hr-sources.json) oder #gurt / #uhr
    // im Strava-Titel bzw. in der Beschreibung. mode "mark" = Uhr-Werte markieren,
    // "strapOnly" = für Pace/Watt @ HF und Entkopplung nur Brustgurt-Einheiten werten.
    hrSource: { mode: "mark" },
    zonesIncludeWarmup: true,  // Zonenverteilung inkl. Aufwärmen (echte Trainingszeit)
    windowDays: 28,            // Kacheln: letzte 4 Wochen vs. 4 Wochen davor
    minPoints: 3,              // darunter „noch zu wenig Daten“
    longRunWindowDays: 56,     // Ø Entkopplung der langen Läufe: letzte 8 Wochen
  },

  // Zielzeiten (frei anpassbar, h:mm:ss)
  goals: {
    swim: "1:25:00", t1: "0:06:00", bike: "5:15:00", t2: "0:04:00", run: "4:50:00",
  },

  // Rennprognose „Wenn heute Renntag wäre“ (js/prediction.js).
  // Spannen: [optimistisch, konservativ].
  prediction: {
    swim: {
      distanceKm: 3.8,
      // CSS-Tests eintragen, sobald gemacht – dann wird statt der Trainings-Pace damit gerechnet:
      // { date: "2026-11-20", t400: "7:20", t200: "3:30" }
      cssTests: [],
      cssOffset: 8, cssOffsetRange: [5, 12],    // s/100 m auf die CSS
      wetsuitBonus: -4,                         // s/100 m mit Neo
      openWaterFactor: 1.03,                    // Freiwasser & Navigation: +3 % Strecke
      fallbackWeeks: 6, fallbackMinMeters: 1000, // ohne CSS-Test: Median der Einheiten ≥ 1.000 m
    },
    bike: {
      distanceKm: 180, elevationM: 1600, climbGrade: 0.025,
      intensity: 0.70, intensityRange: [0.73, 0.68],  // IF = Anteil der FTP
      cda: 0.30, cdaRange: [0.28, 0.33],
      crr: 0.0045, rho: 1.18, eta: 0.97, bikeMassKg: 11,
      climbPowerFactor: 1.08, descentPowerFactor: 0.85, maxDescentKmh: 60,
      overheadFactor: 1.02,                     // Kurven & Verpflegung: +2 % Zeit
      note: "FTP stammt aus einem Ramp-Test auf Zwift; die Watt auf dem Orbea (ohne Powermeter) sind geschätzt.",
    },
    run: {
      distanceKm: 42.195,
      reference: "10k", optimisticReference: "5k",  // "5k" oder "10k"
      riegelExponent: 1.06,
      ironmanFactor: 1.18, ironmanFactorRange: [1.12, 1.25],
      longRunWeeks: 8,
      longRunPenalties: [[25, 0.04], [30, 0.02]],   // längster Lauf < 25 km: +4 %, < 30 km: +2 %
      ignoreNote: "HM-Bestzeit ignoriert – passt nicht zu 5 und 10 km (vermutlich Trail).",
    },
    transitions: { t1Min: 6, t2Min: 4 },
    subTarget: "12:00:00",
    // Nur falls Daten fehlen:
    fallback: { ftp: 286, weightKg: 74, swimPace100: 140, run5k: 1288, run10k: 2945 },
  },

};
