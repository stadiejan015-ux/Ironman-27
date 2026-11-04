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
    location: "Frankfurt am Main · Europameisterschaft",
    swimKm: 3.8, bikeKm: 180, runKm: 42.2,
  },

  // Flex-Modus: flexibles Training auf Reisen, Schwerpunkt Gym, Ausdauer zur Erhaltung.
  // Ist active false oder das Datum nach until, verhält sich die Seite wie bisher.
  flex: {
    active: true,
    from: "2026-10-27",
    until: "2027-01-10",
    label: "Gym-Block & Reisen",
    minimum: { gym: 4, endurance: 2, enduranceMinMinutes: 30, swim: 1 },   // pro Woche (Mo–So)
    rotation: ["Push", "Pull", "Legs"],
    legDayHours: 48,            // so lange nach Leg Day kein harter Lauf
    reentryDays: 14,            // Hinweis zum Wiedereinstieg vor dem Ende
    defaultEquipment: ["gym", "treadmill", "runOutside"],
    // Erkennung des Splits im Titel/der Beschreibung (Groß-/Kleinschreibung egal)
    splitKeywords: {
      Push: ["push", "brust", "chest", "bankdrücken", "bench"],
      Pull: ["pull", "rücken", "back", "latzug", "lat pulldown", "lat"],
      Legs: ["legs", "leg day", "leg", "beine", "beinpresse", "leg press"],
    },
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
