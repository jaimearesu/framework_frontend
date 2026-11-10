// Die Seite /beispiele/<name>: wie eine KI ein Beispiel gebaut hat – Prompt, Ergebnis, Architektur.
// Offen für alle (kein Login, kein Backend nötig). Inhalt aus beispiele-werte.js, Sprache wie die Startseite.
import { h, LOGOS } from './ui.js';
import { TEXTE, SPRACHEN, spracheWaehlen, spracheMerken, gemerkteSprache } from './landing-werte.js';
import { BEISPIEL_TEXTE, ARTEN, beispielAusPfad, beispielFinden } from './beispiele-werte.js';

// Hell oder dunkel wie im Cockpit (gleicher Schlüssel)
try {
    if (localStorage.getItem('neu-modus') === 'dunkel') document.body.dataset.modus = 'dunkel';
} catch {
    // ohne Speicher: hell
}

const kopf = (sprache, neuZeichnen) =>
    h(
        'header',
        { class: 'beispiel-kopf' },
        h(
            'a',
            { href: '/', 'aria-label': BEISPIEL_TEXTE[sprache].zurueck },
            h('img', { src: LOGOS.v, alt: 'vindelis' })
        ),
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
                            neuZeichnen(s);
                        }
                    },
                    s.toUpperCase()
                )
            )
        )
    );

const abschnitt = (id, titel, ...inhalt) =>
    h('section', { class: 'beispiel-abschnitt', id }, h('h2', {}, titel), inhalt);

// Die Teile als kleiner Baum: die Wurzel oben, die Kinder darunter
const teilKarte = (teil, b, sprache) =>
    h(
        'div',
        { class: 'beispiel-teil' + (teil.art === 'wurzel' ? ' ist-wurzel' : '') },
        h(
            'div',
            { class: 'beispiel-teil-kopf' },
            h('code', { class: 'mono' }, teil.name),
            h(
                'span',
                { class: 'bp-badge ' + (teil.oeffentlich ? 'bp-badge-s' : '') },
                teil.oeffentlich ? BEISPIEL_TEXTE[sprache].oeffentlich : BEISPIEL_TEXTE[sprache].privat
            )
        ),
        h('span', { class: 'beispiel-teil-art' }, ARTEN[sprache][teil.art]),
        h('p', { class: 'leise' }, b.teilTexte[teil.name])
    );

const seite = (beispiel, sprache, neuZeichnen) => {
    const b = beispiel.texte[sprache];
    const s = BEISPIEL_TEXTE[sprache];
    const [wurzel, ...kinder] = beispiel.teile;
    return h(
        'div',
        { class: 'beispiel', id: 'beispiel' },
        kopf(sprache, neuZeichnen),
        h(
            'main',
            { class: 'beispiel-innen' },
            h(
                'div',
                { class: 'beispiel-held' },
                h('p', { class: 'beispiel-ueber' }, s.abschnittTitel),
                h('h1', {}, b.name),
                h('p', { class: 'landing-lead' }, b.kurz),
                h(
                    'div',
                    { class: 'landing-knoepfe' },
                    h(
                        'a',
                        { class: 'bp-btn bp-btn-p', href: beispiel.adresse, target: '_blank', rel: 'noopener' },
                        s.liveOeffnen + ' ↗'
                    ),
                    h(
                        'a',
                        { class: 'bp-btn bp-btn-o', href: beispiel.demo, target: '_blank', rel: 'noopener' },
                        s.ausprobieren
                    )
                )
            ),

            abschnitt(
                'prompt',
                s.prompt,
                h('blockquote', { class: 'beispiel-prompt' }, h('p', {}, b.prompt)),
                h('p', { class: 'leise beispiel-hinweis' }, b.promptHinweis)
            ),

            abschnitt(
                'ergebnis',
                s.ergebnis,
                h(
                    'div',
                    { class: 'beispiel-bilder' },
                    beispiel.bilder.map(bild =>
                        h(
                            'figure',
                            { class: 'beispiel-bild-' + bild.art },
                            h('img', { src: bild.src, alt: b.bildtexte[bild.text], loading: 'lazy' }),
                            h('figcaption', { class: 'leise' }, b.bildtexte[bild.text])
                        )
                    )
                )
            ),

            abschnitt(
                'architektur',
                s.architektur,
                h('h3', {}, s.teile),
                h(
                    'div',
                    { class: 'beispiel-baum' },
                    teilKarte(wurzel, b, sprache),
                    h(
                        'div',
                        { class: 'beispiel-kinder' },
                        kinder.map(t => teilKarte(t, b, sprache))
                    )
                ),
                h('h3', {}, s.weg),
                h(
                    'ol',
                    { class: 'beispiel-weg' },
                    b.weg.map(schritt => h('li', {}, h('span', {}, schritt)))
                ),
                h('h3', {}, s.warum),
                h(
                    'div',
                    { class: 'landing-vier' },
                    b.warum.map(({ titel, text }) => h('div', {}, h('h3', {}, titel), h('p', { class: 'leise' }, text)))
                )
            ),

            abschnitt(
                'zahlen',
                s.zahlen,
                h(
                    'dl',
                    { class: 'beispiel-zahlen' },
                    b.zahlen.map(z => h('div', {}, h('dt', {}, z.wert), h('dd', { class: 'leise' }, z.text)))
                ),
                h('h3', {}, s.maschinen),
                h('p', {}, b.maschinenText),
                h(
                    'div',
                    { class: 'beispiel-dateien' },
                    beispiel.maschinen.map(m =>
                        h('a', { class: 'mono', href: m.href, target: '_blank', rel: 'noopener' }, m.name)
                    )
                )
            ),

            h(
                'section',
                { class: 'bp-karte beispiel-selbst' },
                h('h2', {}, s.selbstBauen),
                h('p', { class: 'leise' }, s.selbstBauenText),
                h(
                    'div',
                    { class: 'landing-knoepfe' },
                    h('a', { class: 'bp-btn bp-btn-p', href: '/#verbinden' }, TEXTE[sprache].jetztBauen)
                )
            )
        )
    );
};

const nichtGefunden = sprache =>
    h(
        'div',
        { class: 'beispiel', id: 'beispiel' },
        h(
            'main',
            { class: 'beispiel-innen' },
            h('h1', {}, BEISPIEL_TEXTE[sprache].nichtGefunden),
            h('a', { class: 'bp-btn bp-btn-p', href: '/' }, BEISPIEL_TEXTE[sprache].zurueck)
        )
    );

const zeichnen = sprache => {
    document.documentElement.lang = TEXTE[sprache].lang;
    const beispiel = beispielFinden(beispielAusPfad(location.pathname));
    document.title = beispiel
        ? beispiel.texte[sprache].name + ' · ' + BEISPIEL_TEXTE[sprache].abschnittTitel.replace(/\.$/, '')
        : 'vindelis';
    document
        .getElementById('app')
        .replaceChildren(beispiel ? seite(beispiel, sprache, zeichnen) : nichtGefunden(sprache));
};

zeichnen(spracheWaehlen(navigator.languages || [navigator.language], gemerkteSprache()));
