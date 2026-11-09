// Was auf der Startseite unter dem Baum steht: KI verbinden, Aufbau von vindelis und der Footer.
// Die Texte stehen in landing-werte.js
import { h, LOGOS, kopierZeile } from './ui.js';
import { mcpAdresseLive } from './sitzung.js';
import { AUFBAU, RECHTLICHES, VERBINDEN } from './landing-werte.js';

const karteVerbinden = ({ name, schritte }) =>
    h(
        'div',
        { class: 'bp-karte landing-karte' },
        h('h3', {}, name),
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

const fuss = () =>
    h(
        'footer',
        { class: 'landing-fuss', id: 'fuss' },
        h(
            'div',
            { class: 'landing-innen landing-fuss-zeile' },
            h('p', {}, 'Smart to build. Safe to ship. Reliable to run.'),
            h('ul', {}, RECHTLICHES.map(rechtlichEintrag))
        ),
        h('img', { class: 'landing-fuss-logo', src: LOGOS.dunkel, alt: 'vindelis' }),
        h('p', { class: 'landing-fuss-recht' }, '© ' + new Date().getFullYear() + ' vindelis')
    );

export const landingInhalt = () => [abschnittVerbinden(), abschnittAufbau(), fuss()];
