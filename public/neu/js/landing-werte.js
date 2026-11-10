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

// ---------------------------------------------------------------------
// SPRACHE DER STARTSEITE (10.11.2026)
// Deutsch, wenn der Browser Deutsch will, sonst Englisch. Wer oben auf DE / EN klickt,
// dessen Wahl merkt sich der Browser (localStorage, gilt auch beim nächsten Besuch).
// Nur die Startseite ist zweisprachig, das Cockpit bleibt Deutsch.
// ---------------------------------------------------------------------
export const SPRACHEN = ['de', 'en'];
const SPRACHE_SCHLUESSEL = 'vindelis-sprache';
const dauerSpeicher = () => localStorage;

// browser = navigator.languages (z.B. ['de-CH', 'en']), gemerkt = frühere Wahl oder null
export const spracheWaehlen = (browser = [], gemerkt = null) => {
    if (SPRACHEN.includes(gemerkt)) return gemerkt;
    // Die erste Sprache, die wir kennen, gewinnt. «fr, de» ergibt also Deutsch
    for (const eintrag of browser) {
        const kurz = String(eintrag).toLowerCase().slice(0, 2);
        if (SPRACHEN.includes(kurz)) return kurz;
    }
    return 'en';
};

export const spracheMerken = (sprache, speicher = dauerSpeicher) => {
    try {
        speicher().setItem(SPRACHE_SCHLUESSEL, sprache);
    } catch {
        // Ohne Speicher gilt die Wahl nur, bis man neu lädt
    }
};

export const gemerkteSprache = (speicher = dauerSpeicher) => {
    try {
        return speicher().getItem(SPRACHE_SCHLUESSEL);
    } catch {
        return null;
    }
};

// Die Logos sind in beiden Sprachen gleich
const CLAUDE = { name: 'Claude', logo: '/neu/bilder/claude.svg' };
const CHATGPT = { name: 'ChatGPT', logo: '/neu/bilder/openai.svg' };

// Alle Texte der Startseite. Die Menünamen stammen aus den Hilfeseiten von Claude und OpenAI.
// Die Seite «Erlauben» nach dem Anmelden ist nur Deutsch, darum steht im Englischen beides
export const TEXTE = {
    de: {
        lang: 'de-CH',
        anmelden: 'Anmelden',
        lead: 'Die Plattform für Websites, Apps und Agenten-Werkzeuge, in der alles ein Objekt ist. Dein Coding-Agent baut über MCP, ein Mensch gibt frei, vindelis hält es am Laufen.',
        jetztBauen: 'Jetzt bauen',
        alsGast: 'Ohne Konto ausprobieren',
        spracheWechseln: 'Sprache wählen',
        verbindenTitel: 'Verbinde deine KI mit vindelis.',
        verbindenLead: 'Du arbeitest weiter in Claude oder ChatGPT. Dafür brauchst du nur diese Adresse:',
        verbindenHinweis: 'Heisst ein Menü bei dir anders? Such nach «Connector» oder «MCP».',
        verbinden: [
            {
                ...CLAUDE,
                schritte: [
                    'Öffne Customize und dann Connectors.',
                    'Klicke auf + und wähle «Add custom connector».',
                    'Gib einen Namen ein und füge die Adresse ein.',
                    'Melde dich bei vindelis an und klicke auf «Erlauben».'
                ]
            },
            {
                ...CHATGPT,
                schritte: [
                    'Öffne Plugins.',
                    'Klicke auf + und wähle «Add custom MCP server».',
                    'Gib einen Namen ein, füge die Adresse ein und bestätige den Hinweis.',
                    'Melde dich bei vindelis an und klicke auf «Erlauben».'
                ]
            }
        ],
        aufbauTitel: 'So ist vindelis aufgebaut.',
        aufbau: [
            {
                titel: 'Alles ist ein Baustein',
                text: 'Seiten, Daten und Funktionen sind einzelne Objekte. Jedes hat seinen Platz im Baum und seine eigenen Rechte.'
            },
            {
                titel: 'Die KI baut, du gibst frei',
                text: 'Deine KI baut und ändert Websites. Online geht nur, was du selbst freigibst.'
            },
            {
                titel: 'Läuft auch unter Last',
                text: 'Daten stimmen auch bei vielen Besuchern, Aufträge wiederholen sich bei Fehlern von selbst, und klare Limits schützen vor Überraschungen.'
            },
            {
                titel: 'Jeder Schritt bleibt sichtbar',
                text: 'Alles, was eine KI ändert, steht im Protokoll. So siehst du jederzeit, wer was getan hat.'
            },
            {
                titel: 'Ein Fehler ist kein Drama',
                text: 'Frühere Stände bleiben erhalten. Geht etwas schief, holst du sie mit wenigen Klicks zurück.'
            }
        ],
        zahl: z => `Schon ${z} Objekte gebaut.`,
        rechtliches: ['AGB', 'Datenschutz', 'Impressum'],
        folgt: 'folgt',
        kopieren: {
            knopf: 'Kopieren',
            fertig: 'Kopiert',
            fehler: 'Kopieren ging nicht',
            fehlerText: 'Bitte von Hand markieren.'
        }
    },
    en: {
        lang: 'en',
        anmelden: 'Sign in',
        lead: 'The platform for websites, apps and agent tools, where everything is an object. Your coding agent builds via MCP, a human approves what goes live, vindelis keeps it running.',
        jetztBauen: 'Start building',
        alsGast: 'Try without an account',
        spracheWechseln: 'Choose language',
        verbindenTitel: 'Connect your AI to vindelis.',
        verbindenLead: 'Keep working in Claude or ChatGPT. All you need is this address:',
        verbindenHinweis: 'A menu is named differently for you? Look for "Connector" or "MCP".',
        verbinden: [
            {
                ...CLAUDE,
                schritte: [
                    'Open Customize, then Connectors.',
                    'Click + and choose "Add custom connector".',
                    'Enter a name and paste the address.',
                    'Sign in to vindelis and click "Erlauben" (Allow).'
                ]
            },
            {
                ...CHATGPT,
                schritte: [
                    'Open Plugins.',
                    'Click + and choose "Add custom MCP server".',
                    'Enter a name, paste the address and confirm the notice.',
                    'Sign in to vindelis and click "Erlauben" (Allow).'
                ]
            }
        ],
        aufbauTitel: 'How vindelis works.',
        aufbau: [
            {
                titel: 'Everything is a building block',
                text: 'Pages, data and functions are separate objects. Each has its place in the tree and its own rights.'
            },
            {
                titel: 'AI builds, you approve',
                text: 'Your AI builds and changes websites. Only what you approve goes live.'
            },
            {
                titel: 'Holds up under load',
                text: 'Data stays correct with many visitors, jobs retry on their own after errors, and clear limits prevent surprises.'
            },
            {
                titel: 'Every step stays visible',
                text: 'Everything an AI changes is in the log. You always see who did what.'
            },
            {
                titel: 'A mistake is no drama',
                text: 'Earlier versions are kept. If something goes wrong, you bring them back in a few clicks.'
            }
        ],
        zahl: z => `${z} objects built so far.`,
        rechtliches: ['Terms', 'Privacy', 'Legal notice'],
        folgt: 'coming soon',
        kopieren: { knopf: 'Copy', fertig: 'Copied', fehler: 'Copying failed', fehlerText: 'Please select it by hand.' }
    }
};

// ---------------------------------------------------------------------
// WIE VIELE OBJEKTE ES SCHON GIBT (10.11.2026)
// Die Zahl kommt von GET /api/stats. Das Backend schickt erst ab 1000 eine Zahl,
// sonst null – dann zeigt die Startseite gar nichts.
// ---------------------------------------------------------------------

// 2307 → «2'307» (Deutsch, Schweiz) bzw. «2,307» (Englisch). Das Trennzeichen setzen wir selbst,
// denn Browser schreiben für de-CH mal ' und mal ’
export const zahlSchreiben = (zahl, sprache) => {
    const englisch = new Intl.NumberFormat('en-US').format(Math.round(zahl));
    return sprache === 'de' ? englisch.replaceAll(',', "'") : englisch;
};

// Antwort des Backends → Zahl oder null (alles Unerwartete = null, nie ein Fehler)
export const zahlAusAntwort = antwort => {
    const zahl = antwort?.ok ? antwort.data?.data?.objects : null;
    return Number.isInteger(zahl) && zahl > 0 ? zahl : null;
};

// Hochzählen: Wert nach anteil (0…1) der Zeit, am Ende langsamer (wie ein Zähler, der ausrollt)
export const zwischenWert = (ziel, anteil) => {
    const a = Math.min(1, Math.max(0, anteil));
    return Math.round(ziel * (1 - Math.pow(1 - a, 3)));
};

// Sobald es eine Seite dazu gibt, hier die Adresse eintragen. Ohne Adresse steht «folgt» daneben.
// Die Reihenfolge passt zu TEXTE.*.rechtliches
export const RECHTLICHES = [{ href: null }, { href: null }, { href: null }];

// Wie weit der Inhalt des Footers noch unten liegt, solange er erst teilweise zu sehen ist.
// sichtbar = wie viele Pixel des Footers man schon sieht, hoehe = seine Höhe, weg = grösster Versatz
export const fussVersatz = (sichtbar, hoehe, weg) => {
    if (hoehe <= 0) return 0;
    const anteil = Math.min(1, Math.max(0, sichtbar / hoehe));
    return Math.round(weg * (1 - anteil));
};
