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
