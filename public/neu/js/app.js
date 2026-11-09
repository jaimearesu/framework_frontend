// Hülle des neuen Cockpits: Menü links, Kopfzeile, Seitenwechsel über die Adresse (#/...)
import { h, ikon, huelle, LOGOS } from './ui.js';
import { sucheOeffnen } from './suche.js';
import { DATEN } from './daten.js';
import { neueWebsiteOeffnen } from './neue-website.js';
import { seiteStart, seiteWebsites, seiteVerlauf, seiteKonto, seiteWerkstatt } from './seiten.js';
import { seiteHelfer } from './helfer.js';
import { seiteWartet } from './wartet.js';
import { datenLaden, helferLaden } from './websites.js';
import { seiteWebsite, websiteTitel } from './website.js';
import { hintergrundStarten } from './hintergrund.js';
import { sitzungLaden } from './sitzung.js';
import { ladeSeite, fehlerSeite, anmeldeSeite, gastHinweis } from './anmelden.js';

const MENUE = [
    { pfad: '#/', text: 'Start', symbol: 'start', seite: seiteStart },
    { pfad: '#/websites', text: 'Websites', symbol: 'kugel', seite: seiteWebsites },
    { pfad: '#/wartet', text: 'Wartet auf mich', symbol: 'wartet', seite: seiteWartet },
    { pfad: '#/helfer', text: 'KI-Helfer', symbol: 'helfer', seite: seiteHelfer },
    { pfad: '#/verlauf', text: 'Verlauf', symbol: 'verlauf', seite: seiteVerlauf },
    { pfad: '#/konto', text: 'Konto', symbol: 'konto', seite: seiteKonto }
];
const WERKSTATT = { pfad: '#/werkstatt', text: 'Werkstatt', symbol: 'werkstatt', seite: seiteWerkstatt };

// Hell oder dunkel, pro Browser gemerkt
const modusLesen = () => {
    try {
        return localStorage.getItem('neu-modus') === 'dunkel' ? 'dunkel' : 'hell';
    } catch {
        return 'hell';
    }
};
let modus = modusLesen();

const modusAnwenden = () => {
    if (modus === 'dunkel') document.body.dataset.modus = 'dunkel';
    else delete document.body.dataset.modus;
};

const modusWechseln = () => {
    modus = modus === 'dunkel' ? 'hell' : 'dunkel';
    try {
        localStorage.setItem('neu-modus', modus);
    } catch {
        // Ohne Speicher gilt die Wahl nur bis zum Neuladen
    }
    zeichnen();
};

// Öffnet die Suche über alles (Strg K)
const sucheStarten = () => sucheOeffnen([...MENUE, WERKSTATT]);

// Findet heraus, welche Seite zur Adresse gehört
const aktuelleSeite = () => {
    const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (teile[0] === 'website') {
        const inhalt = seiteWebsite(teile[1], teile[2], teile[3]);
        return { menue: '#/websites', titel: null, inhalt, name: websiteTitel(teile[1]) };
    }
    const pfad = '#/' + (teile[0] || '');
    const eintrag = [...MENUE, WERKSTATT].find(m => m.pfad === pfad) || MENUE[0];
    return {
        menue: eintrag.pfad,
        name: eintrag.text,
        titel: eintrag.seite.titel ? eintrag.seite.titel() : eintrag.text,
        unter: eintrag.seite.unter ? eintrag.seite.unter() : null,
        inhalt: eintrag.seite(),
        knopf: eintrag.seite.knopf
    };
};

const menueLink = (eintrag, aktiv) =>
    h(
        'a',
        { href: eintrag.pfad, class: eintrag.pfad === aktiv ? 'aktiv' : null },
        ikon(eintrag.symbol),
        eintrag.text,
        eintrag.pfad === '#/wartet' && DATEN.wartet.length
            ? h('span', { class: 'menue-zahl' }, String(DATEN.wartet.length))
            : null
    );

function zeichnen() {
    modusAnwenden();
    const seite = aktuelleSeite();
    const logo = modus === 'dunkel' ? LOGOS.dunkel : LOGOS.hell;
    document.title = (seite.name || 'Website') + ' · vindelis';
    document.getElementById('app').replaceChildren(
        h(
            'div',
            { class: 'db' },
            h(
                'aside',
                { class: 'db-seite' },
                h(
                    'a',
                    { class: 'bp-logo', href: '#/', 'aria-label': 'Zum Start', style: 'padding:0 8px' },
                    h('img', { src: logo, alt: 'vindelis' })
                ),
                h(
                    'nav',
                    { 'aria-label': 'Hauptmenü' },
                    MENUE.map(m => menueLink(m, seite.menue))
                ),
                h(
                    'div',
                    { class: 'seite-unten' },
                    // Damit niemand Test und Echt verwechselt
                    DATEN.mensch.testModus
                        ? h('span', { class: 'bp-badge bp-badge-s', id: 'test-marke' }, 'Test-Modus')
                        : null,
                    h('nav', { 'aria-label': 'Technik' }, menueLink(WERKSTATT, seite.menue))
                )
            ),
            h(
                'main',
                { class: 'db-haupt' },
                h(
                    'div',
                    { class: 'seite' },
                    h(
                        'header',
                        { class: 'db-kopf' },
                        h('div', { class: 'kopf-titel' }, h('h2', {}, seite.titel || ''), seite.unter),
                        h(
                            'button',
                            { class: 'such-knopf', type: 'button', id: 'such-knopf', onclick: sucheStarten },
                            ikon('suche'),
                            'Suchen…',
                            h('kbd', {}, 'Strg K')
                        ),
                        h(
                            'button',
                            {
                                class: 'bp-ikonknopf',
                                id: 'modus-knopf',
                                type: 'button',
                                'aria-label': modus === 'dunkel' ? 'Heller Modus' : 'Dunkler Modus',
                                onclick: modusWechseln
                            },
                            ikon(modus === 'dunkel' ? 'sonne' : 'mond')
                        ),
                        seite.knopf
                            ? seite.knopf()
                            : h(
                                  'button',
                                  {
                                      class: 'bp-btn bp-btn-p',
                                      id: 'neue-website',
                                      type: 'button',
                                      onclick: neueWebsiteOeffnen
                                  },
                                  ikon('plus'),
                                  'Neue Website'
                              )
                    ),
                    gastHinweis(),
                    seite.inhalt
                )
            )
        )
    );
}

// Holt im Hintergrund den neusten Stand der Listen. Auf der Seite einer Website wird nicht
// neu gezeichnet, damit dort nichts unter den Fingern wegspringt
const auffrischen = async () => {
    const aufHelferSeite = location.hash.startsWith('#/helfer');
    const [geaendert, helferGeaendert] = await Promise.all([datenLaden(), aufHelferSeite ? helferLaden() : false]);
    if ((geaendert || helferGeaendert) && !location.hash.startsWith('#/website/')) zeichnen();
};

// Stellt das Cockpit auf. Läuft genau einmal, erst wenn feststeht, wer am Cockpit sitzt
const cockpitStarten = () => {
    hintergrundStarten();
    huelle.neu = zeichnen;
    window.addEventListener('hashchange', () => {
        zeichnen();
        window.scrollTo(0, 0);
        auffrischen();
    });
    // Zurück im Tab: Eine KI kann inzwischen etwas gebaut oder um etwas gebeten haben
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') auffrischen();
    });
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            sucheStarten();
        }
    });
    zeichnen();
};

// Zeigt eine der Seiten, die vor dem Cockpit kommen
const vorStartZeigen = seite => document.getElementById('app').replaceChildren(seite);

// Fragt das Backend, wer da ist, und entscheidet, was als Erstes zu sehen ist
const starten = async () => {
    const dunkel = modus === 'dunkel';
    modusAnwenden();
    vorStartZeigen(ladeSeite(dunkel));
    const sitzung = await sitzungLaden();
    if (!sitzung.erreichbar) {
        vorStartZeigen(fehlerSeite(dunkel, sitzung.fehler, starten));
        return;
    }
    if (sitzung.art === 'anon') {
        vorStartZeigen(anmeldeSeite(dunkel, cockpitStarten));
        return;
    }
    // Gleich beim Start laden, so stimmt schon das erste Bild (auch bei einem Link direkt auf eine Website)
    await Promise.all([datenLaden(), helferLaden()]);
    cockpitStarten();
};

starten();
