// Was auf der Startseite unter dem Baum steht: KI verbinden, Aufbau von vindelis und der Footer.
// Die Texte stehen in landing-werte.js
import { h, kopierZeile } from './ui.js';
import { mcpAdresseLive } from './sitzung.js';
import { AUFBAU, RECHTLICHES, VERBINDEN, fussVersatz } from './landing-werte.js';

const karteVerbinden = ({ name, logo, schritte }) =>
    h(
        'div',
        { class: 'bp-karte landing-karte' },
        h('h3', { class: 'landing-marke' }, h('img', { src: logo, alt: '' }), name),
        h(
            'ol',
            { class: 'anleitung' },
            schritte.map(schritt => h('li', {}, h('span', {}, schritt)))
        )
    );

const abschnittVerbinden = () =>
    h(
        'section',
        { class: 'landing-abschnitt', id: 'verbinden' },
        h(
            'div',
            { class: 'landing-innen' },
            h('h2', {}, 'Verbinde deine KI mit vindelis.'),
            h(
                'p',
                { class: 'landing-lead' },
                'Du arbeitest weiter in Claude oder ChatGPT. Dafür brauchst du nur diese Adresse:'
            ),
            kopierZeile(mcpAdresseLive()),
            h('div', { class: 'landing-zwei' }, VERBINDEN.map(karteVerbinden)),
            h('p', { class: 'leise' }, 'Heisst ein Menü bei dir anders? Such nach «Connector» oder «MCP».')
        )
    );

const abschnittAufbau = () =>
    h(
        'section',
        { class: 'landing-abschnitt', id: 'aufbau' },
        h(
            'div',
            { class: 'landing-innen' },
            h('h2', {}, 'So ist vindelis aufgebaut.'),
            h(
                'div',
                { class: 'landing-vier' },
                AUFBAU.map(({ titel, text }) => h('div', {}, h('h3', {}, titel), h('p', { class: 'leise' }, text)))
            )
        )
    );

const rechtlichEintrag = ({ text, href }) =>
    h('li', {}, href ? h('a', { href }, text) : h('span', {}, text, h('small', {}, 'folgt')));

// Der Footer liegt hinter der Seite und kommt hervor, wenn sie sich beim Scrollen weghebt.
// Sein Inhalt steigt dabei noch ein Stück auf. Wer keine Bewegung will, bekommt nur das Hervorkommen
const FUSS_WEG_PX = 120;

const fussBewegen = (fuss, inhalt) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const anpassen = () => {
        // Die Seite wurde ersetzt (Cockpit): nicht mehr mithören
        if (!fuss.isConnected) {
            window.removeEventListener('scroll', anpassen);
            window.removeEventListener('resize', anpassen);
            return;
        }
        const ueber = fuss.previousElementSibling.getBoundingClientRect().bottom;
        const versatz = fussVersatz(window.innerHeight - ueber, fuss.offsetHeight, FUSS_WEG_PX);
        inhalt.style.transform = 'translateY(' + versatz + 'px)';
    };
    window.addEventListener('scroll', anpassen, { passive: true });
    window.addEventListener('resize', anpassen);
    requestAnimationFrame(anpassen);
};

const fussBauen = () => {
    const inhalt = h(
        'div',
        { class: 'landing-innen landing-fuss-innen' },
        h('img', { class: 'landing-fuss-logo', src: '/neu/bilder/wortmarke.svg', alt: 'vindelis' }),
        h(
            'div',
            { class: 'landing-fuss-zeile' },
            h('p', {}, '© ' + new Date().getFullYear() + ' vindelis'),
            h('ul', {}, RECHTLICHES.map(rechtlichEintrag))
        )
    );
    const fuss = h('footer', { class: 'landing-fuss', id: 'fuss' }, inhalt);
    fussBewegen(fuss, inhalt);
    return fuss;
};

// Der letzte Abschnitt und der Footer gehören zusammen: So bleibt der Footer versteckt, bis man unten ankommt
export const landingInhalt = () => [
    abschnittVerbinden(),
    h('div', { class: 'landing-ende' }, abschnittAufbau(), fussBauen())
];
