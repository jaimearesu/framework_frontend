// Was die Seiten anzeigen. Mensch, Konto, Websites, Wartet und Papierkorb füllt das Backend beim Start,
// der Rest sind noch Beispiele und wird Etappe für Etappe (U4c bis U4e) ersetzt.

export const DATEN = {
    // tage: wie lange die Person schon auf vindelis ist, bestimmt die Grösse ihres Baums
    mensch: { name: 'Jaime', id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d', tage: 30 },
    mcpAdresse: 'https://vindelis.com/mcp',
    websites: [],
    helfer: [
        {
            id: 'claude',
            name: 'Claude',
            verbunden: 'Claude',
            aktiv: 'vor 12 Minuten',
            zustand: 'aktiv',
            websites: ['Bäckerei Sonne', 'Ferienhaus Engadin']
        },
        {
            id: 'chatgpt',
            name: 'ChatGPT',
            verbunden: 'ChatGPT',
            aktiv: 'vor 1 Stunde',
            zustand: 'aktiv',
            websites: ['Turnverein Aarau']
        },
        {
            id: 'mira',
            name: 'Mira',
            verbunden: null,
            aktiv: 'vor 3 Tagen',
            zustand: 'getrennt',
            websites: ['Quartier-Flohmarkt']
        }
    ],
    wartet: [],
    ereignisse: [],
    personen: [
        { name: 'Jaime', art: 'Mensch', darf: 'Besitzer', seit: 'März' },
        { name: 'Claude', art: 'KI-Helfer', darf: 'Bauen und ändern', seit: 'Juni' },
        { name: 'Lea Meier', art: 'Mensch', darf: 'Inhalte pflegen', seit: 'Oktober' },
        { name: 'Stammkunden', art: 'Besucher mit E-Mail-Login', darf: 'Bereich «Vorbestellen» sehen', seit: 'Oktober' }
    ],
    datensaetze: [
        { kunde: 'R. Keller', produkt: 'Butterzopf gross', abholung: 'Sa 08:00', stand: 'Offen' },
        { kunde: 'M. Frei', produkt: 'Nussgipfel, 6 Stück', abholung: 'Sa 09:30', stand: 'Offen' },
        { kunde: 'T. Graf', produkt: 'Butterzopf klein', abholung: 'So 08:30', stand: 'Abgeholt' }
    ],
    // Teile einer Website für den Reiter Code, mit zwei Versionen pro Teil
    codeTeile: [
        {
            name: 'Wurzel',
            art: 'html',
            versionen: [
                {
                    nr: 3,
                    wann: 'vor 12 Minuten',
                    von: 'Claude',
                    code: '<body>\n  <div data-slot="kopf"></div>\n  <div data-slot="angebot"></div>\n  <div data-slot="zeiten"></div>\n</body>'
                },
                {
                    nr: 2,
                    wann: 'vor 2 Tagen',
                    von: 'Claude',
                    code: '<body>\n  <div data-slot="kopf"></div>\n  <div data-slot="zeiten"></div>\n</body>'
                }
            ]
        },
        {
            name: 'kopf',
            art: 'html',
            versionen: [
                {
                    nr: 2,
                    wann: 'vor 2 Tagen',
                    von: 'Lea Meier',
                    code: '<header>\n  <h1>Bäckerei Sonne</h1>\n  <p>Frisch seit 1962</p>\n</header>'
                },
                { nr: 1, wann: 'vor 1 Woche', von: 'Claude', code: '<header>\n  <h1>Bäckerei Sonne</h1>\n</header>' }
            ]
        },
        {
            name: 'angebot',
            art: 'ssf',
            versionen: [
                {
                    nr: 4,
                    wann: 'vor 12 Minuten',
                    von: 'Claude',
                    code: "const heute = new Date().getDay();\nconst liste = await api.data.find('angebot', { tag: heute });\nreturn { liste, stand: 'aktuell' };"
                },
                {
                    nr: 3,
                    wann: 'vor 2 Tagen',
                    von: 'Claude',
                    code: "const heute = new Date().getDay();\nconst liste = await api.data.find('angebot', { tag: heute });\nreturn { liste };"
                }
            ]
        },
        {
            name: 'zeiten',
            art: 'html',
            versionen: [
                {
                    nr: 1,
                    wann: 'vor 1 Woche',
                    von: 'Claude',
                    code: '<section>\n  <h2>Öffnungszeiten</h2>\n  <p>Mo bis Sa, 06:30 bis 18:00</p>\n</section>'
                }
            ]
        }
    ],
    konto: [
        { name: 'Speicher', wert: '374 MB von 1 GB', anteil: 37 },
        { name: 'Objekte', wert: '1’028 von 2’000', anteil: 51 },
        { name: 'Websites', wert: '60 von 100', anteil: 60 }
    ],
    // Teile einer Website, auf die man Zugriff geben kann
    teile: ['Startseite', 'Tagesangebot', 'Öffnungszeiten', 'Vorbestellen'],
    // Offene Einladungs-Links
    einladungen: [{ id: 'e1', worauf: 'Vorbestellen', darf: 'Ansehen', gueltig: 'noch 5 Tage', benutzt: '0 von 1' }],
    // Gelöschte Websites mit Sicherung, und ob das Laden gescheitert ist
    papierkorb: [],
    websitesFehler: false,
    websitesGekappt: false,
    wartetFehler: false,
    // Sortierung und Seite der Kacheln auf Start
    startAnsicht: { sortierung: 'geaendert', seite: 1 }
};
