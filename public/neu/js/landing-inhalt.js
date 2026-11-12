// Was auf der Startseite unter dem Baum steht: KI verbinden, Aufbau von vindelis und der Footer.
// Die Texte stehen in landing-werte.js (Deutsch und Englisch), t = die Texte der gewählten Sprache
import { h, kopierZeile } from './ui.js';
import { mcpAdresseLive } from './sitzung.js';
import { RECHTLICHES, fussVersatz } from './landing-werte.js';
import { BEISPIELE, BEISPIEL_TEXTE, BEISPIELE_ONLINE, beispielAdresse } from './beispiele-werte.js';
import { preisKarte, preisVergleich, stufenHolen } from './preise.js';
import { stufenKarte, TEXTE as PREIS_TEXTE } from './preise-werte.js';

// «Gebaut mit vindelis»: eine Karte pro Beispiel, mit Bild und Weg zur Geschichte dahinter
const karteBeispiel = (beispiel, sprache) => {
    const b = beispiel.texte[sprache];
    const s = BEISPIEL_TEXTE[sprache];
    const seite = beispielAdresse(beispiel.id);
    return h(
        'article',
        { class: 'bp-karte beispiel-karte', id: 'beispiel-' + beispiel.id },
        h(
            'a',
            { class: 'beispiel-bild', href: seite, tabindex: '-1', 'aria-hidden': 'true' },
            h('img', { src: beispiel.titelbild, alt: '', loading: 'lazy' })
        ),
        h(
            'div',
            { class: 'beispiel-text' },
            h('h3', {}, b.name),
            h('p', { class: 'leise' }, b.kurz),
            h(
                'ul',
                { class: 'beispiel-stichworte' },
                b.stichworte.map(w => h('li', {}, w))
            ),
            h(
                'div',
                { class: 'landing-knoepfe' },
                h('a', { class: 'bp-btn bp-btn-p', href: seite }, s.soEntstand),
                h(
                    'a',
                    { class: 'bp-btn bp-btn-o', href: beispiel.adresse, target: '_blank', rel: 'noopener' },
                    s.liveOeffnen + ' ↗'
                )
            )
        )
    );
};

const abschnittBeispiele = sprache =>
    h(
        'section',
        { class: 'landing-abschnitt', id: 'beispiele' },
        h(
            'div',
            { class: 'landing-innen' },
            h('h2', {}, BEISPIEL_TEXTE[sprache].abschnittTitel),
            h('p', { class: 'landing-lead' }, BEISPIEL_TEXTE[sprache].abschnittLead),
            h(
                'div',
                { class: 'beispiel-liste' },
                BEISPIELE.map(b => karteBeispiel(b, sprache))
            )
        )
    );

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

const abschnittVerbinden = t =>
    h(
        'section',
        { class: 'landing-abschnitt', id: 'verbinden' },
        h(
            'div',
            { class: 'landing-innen' },
            h('h2', {}, t.verbindenTitel),
            h('p', { class: 'landing-lead' }, t.verbindenLead),
            kopierZeile(mcpAdresseLive(), t.kopieren),
            h('div', { class: 'landing-zwei' }, t.verbinden.map(karteVerbinden)),
            h('p', { class: 'leise' }, t.verbindenHinweis)
        )
    );

const abschnittAufbau = t =>
    h(
        'section',
        { class: 'landing-abschnitt', id: 'aufbau' },
        h(
            'div',
            { class: 'landing-innen' },
            h('h2', {}, t.aufbauTitel),
            h(
                'div',
                { class: 'landing-vier' },
                t.aufbau.map(({ titel, text }) => h('div', {}, h('h3', {}, titel), h('p', { class: 'leise' }, text)))
            )
        )
    );

// Preise (12.11.2026): Karten aller Stufen + aufklappbarer Vergleich. Die Zahlen kommen vom Backend
// (GET /api/billing/stufen, ohne Anmeldung). Kommen keine, bleibt der Abschnitt versteckt.
// knopf = der «Gratis loslegen»-Knopf (kommt von anmelden.js, weil er dort die Anmeldung kennt)
const abschnittPreise = (t, sprache, knopf) => {
    const innen = h('div', { class: 'landing-innen' });
    const abschnitt = h('section', { class: 'landing-abschnitt', id: 'preise', hidden: true }, innen);
    stufenHolen().then(stufen => {
        if (!stufen || !abschnitt.isConnected) return;
        innen.replaceChildren(
            h('h2', {}, t.preiseTitel),
            h('p', { class: 'landing-lead' }, t.preiseLead),
            h(
                'div',
                { class: 'preis-karten' },
                stufen.map(s => preisKarte(stufenKarte(s, sprache), sprache))
            ),
            h('p', { class: 'leise' }, PREIS_TEXTE[sprache].immer),
            preisVergleich(stufen, sprache),
            knopf ? h('div', { class: 'landing-knoepfe' }, knopf) : null
        );
        abschnitt.hidden = false;
    });
    return abschnitt;
};

const rechtlichEintrag = (text, href, folgt) =>
    h('li', {}, href ? h('a', { href }, text) : h('span', {}, text, h('small', {}, folgt)));

// Der Footer liegt hinter der Seite und kommt hervor, wenn sie sich beim Scrollen weghebt.
// Sein Inhalt steigt dabei noch ein Stück auf. Wer keine Bewegung will, bekommt nur das Hervorkommen
const FUSS_WEG_PX = 120;

const fussBewegen = (fuss, inhalt) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const anpassen = () => {
        // Die Seite wurde ersetzt (Cockpit oder andere Sprache): nicht mehr mithören
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

const fussBauen = t => {
    const inhalt = h(
        'div',
        { class: 'landing-innen landing-fuss-innen' },
        h('img', { class: 'landing-fuss-logo', src: '/neu/bilder/wortmarke.svg', alt: 'vindelis' }),
        h(
            'div',
            { class: 'landing-fuss-zeile' },
            h('p', {}, '© ' + new Date().getFullYear() + ' vindelis'),
            h(
                'ul',
                {},
                RECHTLICHES.map(({ href }, i) => rechtlichEintrag(t.rechtliches[i], href, t.folgt))
            )
        )
    );
    const fuss = h('footer', { class: 'landing-fuss', id: 'fuss' }, inhalt);
    fussBewegen(fuss, inhalt);
    return fuss;
};

// Der letzte Abschnitt und der Footer gehören zusammen: So bleibt der Footer versteckt, bis man unten ankommt
// sprache = 'de' oder 'en' (für die Beispiele, deren Texte in beispiele-werte.js stehen)
// Die Beispiele erscheinen nur, wenn der Schalter BEISPIELE_ONLINE (beispiele-werte.js) an ist
export const landingInhalt = (t, sprache, preisKnopf = null) =>
    [
        abschnittVerbinden(t),
        BEISPIELE_ONLINE ? abschnittBeispiele(sprache) : null,
        abschnittPreise(t, sprache, preisKnopf),
        h('div', { class: 'landing-ende' }, abschnittAufbau(t), fussBauen(t))
    ].filter(Boolean);
