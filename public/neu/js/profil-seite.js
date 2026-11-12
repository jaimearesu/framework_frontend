// Öffentliche Profilseite vindelis.com/@name (Plan "N", Stufe 2, 12.11.2026).
// Offen für alle, ohne Anmeldung und ohne Cockpit. Zeigt nur, was die Person selbst
// eingeschaltet hat: Bild, Name, @name, einen Satz und ausgewählte öffentliche Websites.
// Alle Texte kommen von Menschen: nur über h()/textContent, nie als HTML.
import { h, LOGOS } from './ui.js';
import { initialen } from './profil-werte.js';
import { handleAusPfad, seitenTitel, adresseKurz } from './profil-seite-werte.js';

// Hell oder dunkel wie im Cockpit (gleicher Schlüssel)
try {
    if (localStorage.getItem('neu-modus') === 'dunkel') document.body.dataset.modus = 'dunkel';
} catch {
    // ohne Speicher: hell
}

// Adresse des Backends wie im Cockpit aus /config.json (ohne Test-Modus: die Seite ist öffentlich)
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

const kopf = () =>
    h(
        'header',
        { class: 'beispiel-kopf' },
        h('a', { href: '/', 'aria-label': 'Zu vindelis' }, h('img', { src: LOGOS.v, alt: 'vindelis' }))
    );

const fuss = () =>
    h(
        'footer',
        { class: 'profilseite-fuss leise' },
        'Gebaut mit ',
        h('a', { href: '/' }, 'vindelis'),
        ' – Websites, die eine KI für dich baut.'
    );

const websiteKarte = (basis, handle, w) =>
    h(
        'a',
        {
            class: 'bp-karte profilseite-website',
            href: w.address || '#',
            target: '_blank',
            rel: 'noopener'
        },
        h(
            'div',
            { class: 'profilseite-vorschau' },
            w.hasThumb
                ? h('img', {
                      src: basis + '/api/profil/oeffentlich/@' + handle + '/websites/' + w.uuid + '/vorschau',
                      alt: '',
                      loading: 'lazy',
                      decoding: 'async'
                  })
                : h('span', { class: 'profilseite-vorschau-leer' }, w.name.slice(0, 1).toUpperCase())
        ),
        h(
            'div',
            { class: 'profilseite-website-text' },
            h('b', {}, w.name),
            w.address ? h('span', { class: 'leise mono' }, adresseKurz(w.address)) : null
        )
    );

const seite = (basis, p) => {
    const bild = p.hasAvatar
        ? h(
              'span',
              { class: 'profilbild profilbild-riesig' },
              h('img', {
                  src:
                      basis +
                      '/api/profil/oeffentlich/@' +
                      p.handle +
                      '/bild?v=' +
                      encodeURIComponent(p.avatarAt || ''),
                  alt: ''
              })
          )
        : h(
              'span',
              { class: 'profilbild profilbild-riesig', 'aria-hidden': 'true' },
              h('span', { class: 'profilbild-init' }, initialen(p))
          );
    return h(
        'div',
        { class: 'beispiel profilseite', id: 'profilseite' },
        kopf(),
        h(
            'main',
            { class: 'profilseite-innen' },
            h(
                'section',
                { class: 'profilseite-kopf' },
                bild,
                h('h1', { id: 'profilseite-name' }, p.displayName || '@' + p.handle),
                p.displayName ? h('span', { class: 'leise mono' }, '@' + p.handle) : null,
                p.bio ? h('p', { class: 'profilseite-bio', id: 'profilseite-bio' }, p.bio) : null
            ),
            p.websites.length
                ? h(
                      'section',
                      { class: 'profilseite-websites', id: 'profilseite-websites' },
                      h('h2', {}, 'Websites'),
                      h(
                          'div',
                          { class: 'profilseite-raster' },
                          p.websites.map(w => websiteKarte(basis, p.handle, w))
                      )
                  )
                : null,
            fuss()
        )
    );
};

const nichtGefunden = handle =>
    h(
        'div',
        { class: 'beispiel profilseite', id: 'profilseite-fehlt' },
        kopf(),
        h(
            'main',
            { class: 'profilseite-innen profilseite-kopf' },
            h('h1', {}, 'Profil nicht gefunden'),
            h(
                'p',
                { class: 'leise' },
                handle
                    ? 'Unter @' + handle + ' gibt es keine öffentliche Profilseite.'
                    : 'Diese Adresse ist keine Profilseite.'
            ),
            h('a', { class: 'bp-btn bp-btn-p', href: '/' }, 'Zu vindelis'),
            fuss()
        )
    );

const starten = async () => {
    const app = document.getElementById('app');
    const handle = handleAusPfad(location.pathname);
    if (!handle) {
        document.title = seitenTitel(null);
        app.replaceChildren(nichtGefunden(null));
        return;
    }
    const basis = await backend();
    let profil = null;
    try {
        // Ohne Cookies: die Seite ist für alle gleich
        const res = await fetch(basis + '/api/profil/oeffentlich/@' + encodeURIComponent(handle), {
            credentials: 'omit'
        });
        if (res.ok) profil = (await res.json()).data;
    } catch {
        profil = null;
    }
    document.title = seitenTitel(profil);
    app.replaceChildren(profil ? seite(basis, profil) : nichtGefunden(handle));
};

starten();
