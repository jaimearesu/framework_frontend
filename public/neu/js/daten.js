// Was die Seiten anzeigen. Alles füllt das Backend beim Start, hier stehen nur die Anfangswerte.

export const DATEN = {
    // tage: wie lange die Person schon auf vindelis ist, bestimmt die Grösse ihres Baums
    mensch: { name: 'Jaime', id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d', tage: 30 },
    // Adresse zum Verbinden. Leer, solange das Backend sie nicht gemeldet hat
    mcpAdresse: null,
    websites: [],
    kaesten: [],
    helfer: [],
    helferFehler: false,
    wartet: [],
    konto: [
        { name: 'Speicher', wert: '374 MB von 1 GB', anteil: 37 },
        { name: 'Objekte', wert: '1’028 von 2’000', anteil: 51 },
        { name: 'Websites', wert: '60 von 100', anteil: 60 }
    ],
    // Gelöschte Websites mit Sicherung, und ob das Laden gescheitert ist
    papierkorb: [],
    websitesFehler: false,
    websitesGekappt: false,
    wartetFehler: false,
    // Sortierung, Filter und Seite der Kacheln auf Start
    startAnsicht: { sortierung: 'geaendert', herkunft: 'alle', seite: 1 }
};
