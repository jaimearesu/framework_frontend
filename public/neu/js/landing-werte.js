// Merkt sich über den Umweg zu Auth0, dass gerade jemand auf «Anmelden» geklickt hat.
// sessionStorage gilt nur für diesen Tab. Wer später wiederkommt, landet ohne Übergang im Cockpit.
// Geprüft in tests/neuLanding.test.mjs
const SCHLUESSEL = 'neu-vom-login';
const tabSpeicher = () => sessionStorage;

export const anmeldungMerken = (speicher = tabSpeicher) => {
    try {
        speicher().setItem(SCHLUESSEL, '1');
    } catch {
        // Ohne Speicher gibt es einfach keinen Übergang
    }
};

// Gilt nur einmal: Beim nächsten Neuladen läuft der Übergang nicht nochmals
export const anmeldungHolen = (speicher = tabSpeicher) => {
    try {
        const da = speicher().getItem(SCHLUESSEL) === '1';
        speicher().removeItem(SCHLUESSEL);
        return da;
    } catch {
        return false;
    }
};

// Inhalt der Startseite unter dem Baum. Die Menünamen stammen aus den Hilfeseiten von Claude und OpenAI
export const VERBINDEN = [
    {
        name: 'Claude',
        logo: '/neu/bilder/claude.svg',
        schritte: [
            'Öffne Customize und dann Connectors.',
            'Klicke auf + und wähle «Add custom connector».',
            'Gib einen Namen ein und füge die Adresse ein.',
            'Melde dich bei vindelis an und klicke auf «Erlauben».'
        ]
    },
    {
        name: 'ChatGPT',
        logo: '/neu/bilder/openai.svg',
        schritte: [
            'Öffne Plugins.',
            'Klicke auf + und wähle «Add custom MCP server».',
            'Gib einen Namen ein, füge die Adresse ein und bestätige den Hinweis.',
            'Melde dich bei vindelis an und klicke auf «Erlauben».'
        ]
    }
];

export const AUFBAU = [
    {
        titel: 'Alles ist ein Baustein',
        text: 'Seiten, Daten und Funktionen sind einzelne Objekte. Jedes hat seinen Platz im Baum und seine eigenen Rechte.'
    },
    {
        titel: 'Die KI baut, du gibst frei',
        text: 'Deine KI baut und ändert Websites. Online geht nur, was du selbst freigibst.'
    },
    {
        titel: 'Jeder Schritt bleibt sichtbar',
        text: 'Alles, was eine KI ändert, steht im Protokoll. So siehst du jederzeit, wer was getan hat.'
    },
    {
        titel: 'Ein Fehler ist kein Drama',
        text: 'Frühere Stände bleiben erhalten. Geht etwas schief, holst du sie mit wenigen Klicks zurück.'
    }
];

// Sobald es eine Seite dazu gibt, hier die Adresse eintragen. Ohne Adresse steht «folgt» daneben
export const RECHTLICHES = [
    { text: 'AGB', href: null },
    { text: 'Datenschutz', href: null },
    { text: 'Impressum', href: null }
];

// Wie weit der Inhalt des Footers noch unten liegt, solange er erst teilweise zu sehen ist.
// sichtbar = wie viele Pixel des Footers man schon sieht, hoehe = seine Höhe, weg = grösster Versatz
export const fussVersatz = (sichtbar, hoehe, weg) => {
    if (hoehe <= 0) return 0;
    const anteil = Math.min(1, Math.max(0, sichtbar / hoehe));
    return Math.round(weg * (1 - anteil));
};
