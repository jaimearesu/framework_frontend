// Was man sieht, bevor das Cockpit steht: Laden, Anmelden und «Backend nicht erreichbar».
// Dazu der Hinweis für alle, die ohne Anmeldung unterwegs sind.
import { h, LOGOS } from './ui.js';
import { GUEST_HINT } from '../../js/core/session.js';
import { DATEN } from './daten.js';
import { anmeldeAdresse } from './sitzung.js';
import { anmeldungMerken } from './landing-werte.js';

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

// Die Startseite für alle ohne Anmeldung. Der Baum dahinter kommt aus verwandlung.js.
// Wer als Gast weitermacht, wird erst beim ersten Anlegen wirklich zum Gast.
export const anmeldeSeite = alsGast =>
    h(
        'div',
        { class: 'landing', id: 'landing' },
        h(
            'header',
            { class: 'landing-kopf' },
            h('img', { src: LOGOS.v, alt: 'vindelis' }),
            h(
                'a',
                {
                    class: 'bp-btn bp-btn-o',
                    id: 'anmelden-kopf',
                    href: anmeldeAdresse(),
                    onclick: () => anmeldungMerken()
                },
                'Anmelden'
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
            h('p', { class: 'landing-lead' }, 'Deine KI baut die Website, du gibst sie frei.'),
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
                    'Jetzt bauen'
                ),
                h(
                    'button',
                    { class: 'bp-btn bp-btn-o bp-btn-gross', id: 'als-gast', type: 'button', onclick: alsGast },
                    'Ohne Konto ausprobieren'
                )
            )
        )
    );

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
