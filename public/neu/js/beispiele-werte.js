// ---------------------------------------------------------------------
// BEISPIELE «GEBAUT MIT VINDELIS» (10.11.2026)
// Pro Beispiel: Karte auf der Startseite und eine eigene Seite /beispiele/<id>
// mit Prompt, Ergebnis und Architektur. Ein neues Beispiel = ein Eintrag hier
// plus Bilder in /neu/bilder/beispiele/. Texte auf Deutsch und Englisch wie die Startseite.
// Geprüft in tests/neuBeispiele.test.mjs
// ---------------------------------------------------------------------
const BILDER = '/neu/bilder/beispiele/';

// Seitentexte, die für alle Beispiele gleich sind
export const BEISPIEL_TEXTE = {
    de: {
        abschnittTitel: 'Gebaut mit vindelis.',
        abschnittLead: 'Echte Apps, gebaut von einer KI über MCP. Vom Prompt bis online.',
        soEntstand: 'So entstand es',
        liveOeffnen: 'Live öffnen',
        zurueck: 'Zur Startseite',
        prompt: 'Der Prompt',
        ergebnis: 'Das Ergebnis',
        ausprobieren: 'Selbst ausprobieren',
        architektur: 'Die Architektur',
        teile: 'Die Teile',
        weg: 'Der Weg einer Stimme',
        warum: 'Warum so gebaut',
        zahlen: 'In Zahlen',
        maschinen: 'Für Maschinen lesbar',
        oeffentlich: 'öffentlich',
        privat: 'privat',
        selbstBauen: 'Bau dein eigenes',
        selbstBauenText: 'Verbinde deine KI mit vindelis und beschreib, was du brauchst.',
        nichtGefunden: 'Dieses Beispiel gibt es nicht.'
    },
    en: {
        abschnittTitel: 'Built with vindelis.',
        abschnittLead: 'Real apps, built by an AI via MCP. From prompt to live.',
        soEntstand: 'How it was built',
        liveOeffnen: 'Open live',
        zurueck: 'Back to the start page',
        prompt: 'The prompt',
        ergebnis: 'The result',
        ausprobieren: 'Try it yourself',
        architektur: 'The architecture',
        teile: 'The parts',
        weg: 'How a vote travels',
        warum: 'Why it is built this way',
        zahlen: 'In numbers',
        maschinen: 'Readable for machines',
        oeffentlich: 'public',
        privat: 'private',
        selbstBauen: 'Build your own',
        selbstBauenText: 'Connect your AI to vindelis and describe what you need.',
        nichtGefunden: 'This example does not exist.'
    }
};

const HZ = 'https://handzeichen.vindelis.site';

export const BEISPIELE = [
    {
        id: 'handzeichen',
        adresse: HZ,
        demo: HZ + '/#/c/DEMO',
        titelbild: BILDER + 'handzeichen-leinwand.jpg',
        bilder: [
            { src: BILDER + 'handzeichen-leinwand.jpg', art: 'breit', text: 'leinwand' },
            { src: BILDER + 'handzeichen-leitung.jpg', art: 'breit', text: 'leitung' },
            { src: BILDER + 'handzeichen-handy.jpg', art: 'handy', text: 'handy' }
        ],
        // Die Teile in vindelis – Name, sichtbar für Besucher?
        teile: [
            { name: 'handzeichen', art: 'wurzel', oeffentlich: true },
            { name: 'api', art: 'ssf', oeffentlich: true },
            { name: 'daten', art: 'speicher', oeffentlich: false },
            { name: 'oberflaeche', art: 'bibliothek', oeffentlich: false },
            { name: 'qr', art: 'bibliothek', oeffentlich: false }
        ],
        maschinen: [
            { name: 'llms.txt', href: HZ + '/llms.txt' },
            { name: 'sitemap.xml', href: HZ + '/sitemap.xml' },
            { name: 'robots.txt', href: HZ + '/robots.txt' }
        ],
        texte: {
            de: {
                name: 'Handzeichen',
                kurz: 'Live-Abstimmungen für Säle und Sitzungen. Das Publikum stimmt per Handy ab, die Leinwand zeigt jede Stimme sofort.',
                stichworte: ['Echtzeit', 'Viele Mandanten', 'Ohne Konto'],
                prompt: 'Erstell doch zu Beginn das mit den Live-Abstimmungen. Nimm dir ruhig Zeit, lass es gut aussehen, vielleicht sogar mit einer Frontend-Seite (nicht KI-Style). Sag auch, dass XML dahinter steckt für die Struktur, llms.txt und so weiter. Design – und dann das Ganze mandantenfähig.',
                promptHinweis:
                    'Aus einer laufenden Arbeits-Session mit Claude. Sprachlich bereinigt, inhaltlich unverändert. Mehr Anweisungen gab es nicht.',
                bildtexte: {
                    leinwand: 'Die Leinwand für den Beamer: Balken in Echtzeit, QR-Code und Code zum Mitmachen.',
                    leitung: 'Die Leitung: Fragen zeigen, schliessen, weiterschalten.',
                    handy: 'Auf dem Handy: antippen, fertig. Ändern geht bis zum Schluss.'
                },
                teilTexte: {
                    handzeichen:
                        'Die Wurzel. Ihre Funktion liefert die ganze Website als Bauplan: Seite, sitemap.xml, robots.txt, llms.txt.',
                    api: 'Die ganze Logik: erstellen, laden, abstimmen, steuern, aufräumen. Schickt jeden neuen Stand in den Live-Kanal.',
                    daten: 'Der private Speicher für Abstimmungen und Stimmen. Kommt nie auf die Website.',
                    oberflaeche: 'Design und Browser-Code als Bibliothek, getrennt von der Logik.',
                    qr: 'QR-Code-Bibliothek (qrcode-generator), einmal von jsDelivr kopiert. Die Website lädt nichts von fremden Servern.'
                },
                weg: [
                    'Handy tippt «Mit dem Handy»',
                    'api prüft: offen, gültig, ein Gerät',
                    'Speicher sichert die Stimme',
                    'Datenbank zählt neu',
                    'Live-Kanal schickt den Stand',
                    'Leinwand bewegt die Balken'
                ],
                warum: [
                    {
                        titel: 'Eine Stimme pro Gerät',
                        text: 'Jede Stimme hat einen eindeutigen Schlüssel aus Abstimmung, Frage und Gerät. Die Datenbank garantiert ihn, auch wenn hundert Leute gleichzeitig tippen.'
                    },
                    {
                        titel: 'Geheimer Leitungs-Link',
                        text: 'Steuern darf nur, wer den Link hat. Gespeichert wird nur sein Fingerabdruck (SHA-256), nie der Schlüssel selbst.'
                    },
                    {
                        titel: 'Live statt Nachfragen',
                        text: 'Jede Abstimmung hat ihren eigenen Kanal. Anwesenheit und Reaktionen gehen direkt von Browser zu Browser, nach einer Regel in der DNA.'
                    },
                    {
                        titel: 'Räumt selbst auf',
                        text: 'Ein Zeitplan löscht jede Nacht, was älter als sieben Tage ist, und setzt die Demo zurück.'
                    }
                ],
                zahlen: [
                    { wert: '5', text: 'Objekte' },
                    { wert: "≈ 1'700", text: 'Zeilen Code von der KI' },
                    { wert: '1', text: 'Klick-Test im echten Browser, 24 Schritte' },
                    { wert: '0', text: 'Konten nötig' }
                ],
                maschinenText:
                    'Die Website liefert eine llms.txt für KIs, eine sitemap.xml für Suchmaschinen und schema.org-Daten im Kopf. Die llms.txt beschreibt auch die offene Schnittstelle: Eine KI kann selbst Abstimmungen erstellen.'
            },
            en: {
                name: 'Handzeichen',
                kurz: 'Live polls for halls and meetings. The audience votes by phone, the screen shows every vote instantly.',
                stichworte: ['Real time', 'Multi-tenant', 'No account'],
                prompt: 'To start, build the live polling thing. Take your time, make it look good, maybe even with a front-end page (not AI-style). Also mention that there is XML behind it for the structure, llms.txt and so on. Design – and then make the whole thing multi-tenant.',
                promptHinweis:
                    'From an ongoing working session with Claude. Translated from Swiss German and tidied up, content unchanged. There were no further instructions.',
                bildtexte: {
                    leinwand: 'The projector screen: bars in real time, QR code and code to join.',
                    leitung: 'The host view: show questions, close them, move on.',
                    handy: 'On the phone: tap, done. You can change your vote until the end.'
                },
                teilTexte: {
                    handzeichen:
                        'The root. Its function delivers the whole website as a build plan: page, sitemap.xml, robots.txt, llms.txt.',
                    api: 'All the logic: create, load, vote, control, clean up. Sends every new count into the live channel.',
                    daten: 'The private store for polls and votes. Never ends up on the website.',
                    oberflaeche: 'Design and browser code as a library, separate from the logic.',
                    qr: 'QR code library (qrcode-generator), copied once from jsDelivr. The website loads nothing from third-party servers.'
                },
                weg: [
                    'Phone taps "Mit dem Handy"',
                    'api checks: open, valid, one device',
                    'Store saves the vote',
                    'Database recounts',
                    'Live channel sends the count',
                    'Screen moves the bars'
                ],
                warum: [
                    {
                        titel: 'One vote per device',
                        text: 'Every vote has a unique key made of poll, question and device. The database guarantees it, even when a hundred people tap at once.'
                    },
                    {
                        titel: 'Secret host link',
                        text: 'Only whoever has the link can control the poll. Only its fingerprint (SHA-256) is stored, never the key itself.'
                    },
                    {
                        titel: 'Live instead of polling',
                        text: 'Every poll has its own channel. Presence and reactions go straight from browser to browser, allowed by a rule in the DNA.'
                    },
                    {
                        titel: 'Cleans up after itself',
                        text: 'A schedule deletes everything older than seven days each night and resets the demo.'
                    }
                ],
                zahlen: [
                    { wert: '5', text: 'objects' },
                    { wert: '≈ 1,700', text: 'lines of code by the AI' },
                    { wert: '1', text: 'click test in a real browser, 24 steps' },
                    { wert: '0', text: 'accounts needed' }
                ],
                maschinenText:
                    'The website serves an llms.txt for AIs, a sitemap.xml for search engines and schema.org data in the head. The llms.txt also documents the open interface: an AI can create polls on its own.'
            }
        }
    }
];

// Was ein Teil ist, in beiden Sprachen
export const ARTEN = {
    de: { wurzel: 'Wurzel · Bauplan', ssf: 'Funktion (SSF)', speicher: 'Speicher', bibliothek: 'Bibliothek' },
    en: { wurzel: 'Root · build plan', ssf: 'Function (SSF)', speicher: 'Store', bibliothek: 'Library' }
};

// /beispiele/handzeichen → 'handzeichen' (sonst null). Nur Kleinbuchstaben, Ziffern und «-».
export const beispielAusPfad = pfad => {
    const treffer = /^\/beispiele\/([a-z0-9-]{1,60})\/?$/.exec(String(pfad || ''));
    return treffer ? treffer[1] : null;
};

export const beispielFinden = id => BEISPIELE.find(b => b.id === id) || null;

export const beispielAdresse = id => '/beispiele/' + id;
