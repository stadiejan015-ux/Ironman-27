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
    swim: "1:15:00", t1: "0:06:00", bike: "5:45:00", t2: "0:04:00", run: "4:00:00",
  },

};
