// Beispieldaten für die Anprobe. Alles hier ist erfunden.
// Beim Einbau (Etappe U4) ersetzen echte Abfragen an /api diese Datei.
import { zuAdresse } from './ui.js';

export const DATEN = {
    // tage: wie lange die Person schon auf vindelis ist, bestimmt die Grösse ihres Baums
    mensch: { name: 'Jaime', id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d', tage: 30 },
    mcpAdresse: 'https://vindelis.com/mcp',
    websites: [
        {
            id: 'baeckerei-sonne',
            titel: 'Bäckerei Sonne',
            beschreibung: 'Website mit Tagesangebot, Öffnungszeiten und Vorbestellung für Zöpfe am Wochenende.',
            zustand: 'online',
            geaendert: 'vor 12 Minuten',
            von: 'Claude',
            besuche: '1’284',
            speicher: '42 MB',
            probleme: 0
        },
        {
            id: 'turnverein-aarau',
            titel: 'Turnverein Aarau',
            beschreibung: 'Vereinsseite mit Trainingszeiten, Anmeldung für Mitglieder und Fotogalerie.',
            zustand: 'wartet',
            geaendert: 'vor 1 Stunde',
            von: 'ChatGPT',
            besuche: '0',
            speicher: '118 MB',
            probleme: 0
        },
        {
            id: 'ferienhaus-engadin',
            titel: 'Ferienhaus Engadin',
            beschreibung: 'Buchungsseite mit Kalender, Bildern und Anfrageformular.',
            zustand: 'problem',
            geaendert: 'gestern',
            von: 'Claude',
            besuche: '312',
            speicher: '206 MB',
            probleme: 2
        },
        {
            id: 'quartier-flohmarkt',
            titel: 'Quartier-Flohmarkt',
            beschreibung: 'Anmeldung für Standplätze und Übersichtsplan.',
            zustand: 'entwurf',
            geaendert: 'vor 3 Tagen',
            von: 'Mira',
            besuche: '0',
            speicher: '8 MB',
            probleme: 0
        }
    ],
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
    wartet: [
        {
            id: 'w1',
            art: 'Veröffentlichen',
            website: 'Turnverein Aarau',
            von: 'ChatGPT',
            wann: 'vor 1 Stunde',
            grund: 'Die Vereinsseite ist fertig, der Mitgliederbereich bleibt geschützt.'
        },
        {
            id: 'w2',
            art: 'Neue Uploads prüfen',
            website: 'Ferienhaus Engadin',
            von: 'Besucher',
            wann: 'gestern',
            grund: '3 Bilder wurden über das Anfrageformular hochgeladen.'
        }
    ],
    ereignisse: [
        { wer: 'Claude', was: 'hat die Tagesangebote geändert', wo: 'Bäckerei Sonne', wann: 'vor 12 Minuten' },
        { wer: 'ChatGPT', was: 'bittet ums Veröffentlichen', wo: 'Turnverein Aarau', wann: 'vor 1 Stunde' },
        { wer: 'Claude', was: 'hat den Kalender neu aufgebaut', wo: 'Ferienhaus Engadin', wann: 'gestern' },
        { wer: 'Du', was: 'hast die Website veröffentlicht', wo: 'Bäckerei Sonne', wann: 'vor 2 Tagen' },
        { wer: 'Mira', was: 'hat den Übersichtsplan angelegt', wo: 'Quartier-Flohmarkt', wann: 'vor 3 Tagen' }
    ],
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
    // Sortierung und Seite der Kacheln auf Start
    startAnsicht: { sortierung: 'geaendert', seite: 1 }
};

// Alter in Minuten als Text
const alterText = minuten => {
    if (minuten < 60) return 'vor ' + minuten + ' Minuten';
    if (minuten < 1440) return 'vor ' + Math.round(minuten / 60) + ' Stunden';
    if (minuten < 2880) return 'gestern';
    return 'vor ' + Math.round(minuten / 1440) + ' Tagen';
};

// Die vier ausführlichen Beispiele bekommen ihr Alter in Minuten
[
    [12, 200000],
    [60, 30000],
    [1500, 90000],
    [4320, 5000]
].forEach(([geaendertVor, erstelltVor], i) => Object.assign(DATEN.websites[i], { geaendertVor, erstelltVor }));

// Weitere Beispiele, damit die Anprobe so voll ist wie ein echtes Konto (60 Websites)
const BRANCHEN = ['Bäckerei', 'Coiffeur', 'Garage', 'Praxis', 'Verein', 'Café', 'Schreinerei', 'Blumenladen'];
const ORTE = ['Bern', 'Luzern', 'Thun', 'Chur', 'Basel', 'Zug', 'Olten'];
const AUTOREN = ['Claude', 'ChatGPT', 'Du', 'Mira'];
BRANCHEN.forEach((branche, b) =>
    ORTE.forEach((ort, o) => {
        const nr = b * ORTE.length + o;
        const geaendertVor = 90 + ((nr * 37) % 56) * 1000;
        const titel = branche + ' ' + ort;
        DATEN.websites.push({
            id: zuAdresse(titel),
            titel,
            beschreibung: 'Website für ' + titel + ' mit Angebot, Kontakt und Öffnungszeiten.',
            // «Wartet auf Freigabe» nur dort, wo auch wirklich eine Bitte in der Liste steht
            zustand: nr % 7 === 3 ? 'entwurf' : 'online',
            geaendert: alterText(geaendertVor),
            geaendertVor,
            erstelltVor: geaendertVor + 20000 + ((nr * 53) % 56) * 4000,
            von: AUTOREN[nr % AUTOREN.length],
            besuche: String(nr * 23),
            speicher: 10 + nr + ' MB',
            probleme: 0
        });
    })
);
