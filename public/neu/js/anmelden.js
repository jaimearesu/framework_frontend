// Was man sieht, bevor das Cockpit steht: Laden, Anmelden und «Backend nicht erreichbar».
// Dazu der Hinweis für alle, die ohne Anmeldung unterwegs sind.
import { h, LOGOS } from './ui.js';
import { GUEST_HINT } from '../../js/core/session.js';
import { DATEN } from './daten.js';
import { anmeldeAdresse } from './sitzung.js';
import { anmeldungMerken, TEXTE, SPRACHEN, spracheWaehlen, spracheMerken, gemerkteSprache } from './landing-werte.js';
import { landingInhalt } from './landing-inhalt.js';
import { objektZahl } from './landing-zahl.js';

// Gemeinsamer Rahmen: das Logo und darunter die Karte, mittig auf der Seite
const rahmen = (dunkel, ...inhalt) =>
    h(
        'div',
        { class: 'vor-start' },
        h(
            'div',
            { class: 'bp-karte vor-start-karte' },
            h('img', { class: 'vor-start-logo', src: dunkel ? LOGOS.dunkel : LOGOS.hell, alt: 'vindelis' }),
            inhalt
        )
    );

export const ladeSeite = dunkel => rahmen(dunkel, h('span', { class: 'leise', role: 'status', id: 'laedt' }, 'Lädt…'));

export const fehlerSeite = (dunkel, fehler, nochmals) =>
    rahmen(
        dunkel,
        h('h2', {}, 'Gerade nicht erreichbar'),
        h('span', { class: 'leise', id: 'start-fehler' }, fehler || 'Das Cockpit bekommt keine Antwort vom Server.'),
        h(
            'button',
            { class: 'bp-btn bp-btn-p', id: 'nochmals', type: 'button', onclick: nochmals },
            'Nochmals versuchen'
        )
    );

// Welche Sprache die Startseite gerade hat (Browser oder frühere Wahl, siehe landing-werte.js)
const startSprache = () => spracheWaehlen(navigator.languages || [navigator.language], gemerkteSprache());

// DE / EN oben rechts: merkt sich die Wahl und zeichnet die Startseite in der neuen Sprache neu
const sprachUmschalter = (sprache, alsGast) =>
    h(
        'div',
        { class: 'landing-sprache', role: 'group', 'aria-label': TEXTE[sprache].spracheWechseln },
        SPRACHEN.map(s =>
            h(
                'button',
                {
                    type: 'button',
                    class: s === sprache ? 'aktiv' : '',
                    'aria-pressed': String(s === sprache),
                    lang: TEXTE[s].lang,
                    onclick: () => {
                        if (s === sprache) return;
                        spracheMerken(s);
                        document.getElementById('landing')?.replaceWith(anmeldeSeite(alsGast, s));
                    }
                },
                s.toUpperCase()
            )
        )
    );

// Die Startseite für alle ohne Anmeldung. Der Baum dahinter kommt aus verwandlung.js.
// Wer als Gast weitermacht, wird erst beim ersten Anlegen wirklich zum Gast.
export const anmeldeSeite = (alsGast, sprache = startSprache()) => {
    const t = TEXTE[sprache];
    // Vorlesen und Silbentrennung richten sich danach. Das Cockpit setzt es wieder auf Deutsch
    document.documentElement.lang = t.lang;
    return h(
        'div',
        { class: 'landing', id: 'landing' },
        h(
            'div',
            { class: 'landing-held' },
            h(
                'header',
                { class: 'landing-kopf' },
                h('img', { src: LOGOS.v, alt: 'vindelis' }),
                h(
                    'div',
                    { class: 'landing-kopf-rechts' },
                    sprachUmschalter(sprache, alsGast),
                    h(
                        'a',
                        {
                            class: 'bp-btn bp-btn-o',
                            id: 'anmelden-kopf',
                            href: anmeldeAdresse(),
                            onclick: () => anmeldungMerken()
                        },
                        t.anmelden
                    )
                )
            ),
            h(
                'main',
                { class: 'landing-text' },
                h(
                    'h1',
                    {},
                    h('span', {}, 'Smart to build.'),
                    h('span', {}, 'Safe to ship.'),
                    h('span', {}, 'Reliable to run.')
                ),
                h('p', { class: 'landing-lead' }, t.lead),
                h(
                    'div',
                    { class: 'landing-knoepfe' },
                    h(
                        'a',
                        {
                            class: 'bp-btn bp-btn-p bp-btn-gross',
                            id: 'anmelden',
                            href: anmeldeAdresse(),
                            onclick: () => anmeldungMerken()
                        },
                        t.jetztBauen
                    ),
                    h(
                        'button',
                        { class: 'bp-btn bp-btn-o bp-btn-gross', id: 'als-gast', type: 'button', onclick: alsGast },
                        t.alsGast
                    )
                ),
                objektZahl(sprache, t)
            )
        ),
        landingInhalt(t)
    );
};

// Steht oben auf jeder Seite, solange man nicht angemeldet ist
export const gastHinweis = () => {
    if (DATEN.mensch.art === 'user') return null;
    return h(
        'div',
        { class: 'bp-hinweis bp-h-warn mit-knopf', id: 'gast-hinweis' },
        h('span', {}, h('b', {}, GUEST_HINT.title), GUEST_HINT.text),
        h('a', { class: 'bp-btn bp-btn-o bp-btn-klein', href: anmeldeAdresse() }, 'Anmelden')
    );
};
