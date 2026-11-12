// Seite vindelis.com/entdecken (Plan "N", Stufe 4, 12.11.2026): der Feed für alle.
// Ohne Anmeldung und ohne Cockpit. Neuste zuerst, «Mehr laden» blättert weiter.
// Ersetzt die versteckte Beispiel-Seite: hier steht, was Menschen mit vindelis gebaut haben.
import { h, LOGOS } from './ui.js';
import { feedKarte } from './entdecken-karte.js';
import { feedAdresse, anhaengen } from './entdecken-werte.js';

// Hell oder dunkel wie im Cockpit (gleicher Schlüssel)
try {
    if (localStorage.getItem('neu-modus') === 'dunkel') document.body.dataset.modus = 'dunkel';
} catch {
    // ohne Speicher: hell
}

// Adresse des Backends wie im Cockpit aus /config.json
const backend = async () => {
    try {
        const res = await fetch('/config.json');
        const data = await res.json();
        if (data.apiUrl) return String(data.apiUrl).replace(/\/+$/, '');
    } catch {
        // Standard unten
    }
    return 'http://localhost:3000';
};

const holen = async (basis, nach) => {
    try {
        const res = await fetch(feedAdresse(basis, { nach }), { credentials: 'omit' });
        if (!res.ok) return null;
        return (await res.json()).data;
    } catch {
        return null;
    }
};

const starten = async () => {
    const app = document.getElementById('app');
    const basis = await backend();
    const stand = { items: [], next: null, laedt: false, fehler: false };
    const raster = h('div', { class: 'profilseite-raster feed-raster', id: 'feed-raster' });
    const unten = h('div', { class: 'feed-unten', id: 'feed-unten' });

    const zeichnen = () => {
        raster.replaceChildren(...stand.items.map(i => feedKarte(basis, i)));
        if (stand.fehler) {
            unten.replaceChildren(
                h('p', { class: 'leise' }, 'Der Feed ist gerade nicht erreichbar. Bitte später nochmals.')
            );
        } else if (!stand.items.length && !stand.laedt) {
            unten.replaceChildren(
                h(
                    'p',
                    { class: 'leise', id: 'feed-leer' },
                    'Noch hat niemand eine Website geteilt. Sei die erste Person!'
                ),
                h('a', { class: 'bp-btn bp-btn-p', href: '/' }, 'Mit vindelis bauen')
            );
        } else if (stand.next) {
            unten.replaceChildren(
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-o',
                        type: 'button',
                        id: 'feed-mehr',
                        disabled: stand.laedt,
                        onclick: () => laden(stand.next)
                    },
                    stand.laedt ? 'Lädt…' : 'Mehr laden'
                )
            );
        } else {
            unten.replaceChildren();
        }
    };

    const laden = async nach => {
        stand.laedt = true;
        zeichnen();
        const seite = await holen(basis, nach);
        stand.laedt = false;
        if (!seite) {
            stand.fehler = true;
        } else {
            stand.items = anhaengen(stand.items, seite.items);
            stand.next = seite.next;
        }
        zeichnen();
    };

    app.replaceChildren(
        h(
            'div',
            { class: 'beispiel profilseite', id: 'entdecken' },
            h(
                'header',
                { class: 'beispiel-kopf' },
                h('a', { href: '/', 'aria-label': 'Zu vindelis' }, h('img', { src: LOGOS.v, alt: 'vindelis' }))
            ),
            h(
                'main',
                { class: 'profilseite-innen' },
                h(
                    'section',
                    { class: 'feed-kopf' },
                    h('h1', {}, 'Entdecken'),
                    h(
                        'p',
                        { class: 'leise' },
                        'Websites, die Menschen mit vindelis gebaut und geteilt haben. Die neusten zuerst.'
                    )
                ),
                raster,
                unten,
                h(
                    'footer',
                    { class: 'profilseite-fuss leise' },
                    'Gebaut mit ',
                    h('a', { href: '/' }, 'vindelis'),
                    ' – Websites, die eine KI für dich baut.'
                )
            )
        )
    );
    await laden(null);
};

starten();
