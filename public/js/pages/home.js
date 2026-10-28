// js/pages/home.js
// ---------------------------------------------------------------------
// ÜBERSICHT IN DER BESITZER-ANSICHT (Punkt 5, D2 + D3)
//
//   Begrüssung + eine Zeile, wie es steht
//   Wartet auf dich (nur wenn etwas wartet)
//   Deine Websites als Kacheln (GET /api/websites, D3): Zustand, Probleme
//     heute, zuletzt geändert. Bild-Fläche vorerst mit Anfangsbuchstabe (W3).
//   Weitere: Speicher und Werkzeugkästen (eingeklappt)
//   Papierkorb (nur wenn es gelöschte Websites mit Sicherung gibt)
//
// Statuskarten, Schnellstart und Grundbegriffe stehen nur in der
// Technik-Übersicht (pages/overview.js).
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { on } from '../core/events.js';
import { href } from '../core/routes.js';
import { loadOwnerSites, loadThumbnail } from '../core/objects.js';
import { h, mount, card, emptyState, spinner } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { timeAgo } from '../core/format.js';
import { greetingFor, splitByArt, placeholderHue, displayAddress, problemsText, ART_TEXT } from '../core/view.js';
import { renderDeletedSites } from './objectSnapshots.js';

const VISIBILITY = {
    public: { text: 'Online', tone: 'public' },
    members: { text: 'Nur Angemeldete', tone: 'members' },
    private: { text: 'Privat', tone: 'private' }
};

const countOf = res => (res.ok && Array.isArray(res.data?.data) ? res.data.data.length : 0);

// Vorname aus dem Anzeigenamen (nur zum Grüssen – nie eine E-Mail-Adresse)
const firstName = identity => {
    const label = String(identity?.label || '');
    if (identity?.kind !== 'user' || !label || label.includes('@') || label === 'Eingeloggt') return '';
    return label.split(/\s+/)[0];
};

// Klick auf eine Kachel: die Website-Seite (D4)
const siteHref = site => href('website', site.uuid);

// Eine Kachel: Bild-Fläche, Name, Adresse, Zustand
const tile = site => {
    const v = VISIBILITY[site.visibility] || VISIBILITY.private;
    const problems = problemsText(site.problems24h);
    const shot = h(
        'div',
        {
            class: 'site-shot',
            // Text statt Objekt: eigene CSS-Variablen gehen nur so (Object.assign kennt sie nicht)
            style: `--hue: ${placeholderHue(site.name)}`,
            'aria-hidden': 'true'
        },
        h('span', { class: 'site-letter' }, site.name.slice(0, 1).toUpperCase())
    );
    // Echtes Vorschaubild (D3b, nur öffentliche Websites): nachladen und den Buchstaben ersetzen
    loadThumbnail(site).then(url => {
        if (url) mount(shot, h('img', { src: url, alt: '', loading: 'lazy' }));
    });
    return h(
        'a',
        { class: 'site-tile', href: siteHref(site) },
        shot,
        h(
            'div',
            { class: 'site-meta' },
            h('div', { class: 'site-name' }, site.name),
            h('div', { class: 'site-addr mono' }, displayAddress(site)),
            h(
                'div',
                { class: 'site-status' },
                h('span', {}, h('span', { class: `tree-dot ${v.tone}` }), v.text),
                problems ? h('span', { class: site.problems24h > 0 ? 'is-warn' : '' }, problems) : null,
                site.lastChange ? h('span', {}, `geändert ${timeAgo(site.lastChange)}`) : null
            )
        )
    );
};

// Zeile für Speicher / Werkzeugkasten (unter "Weitere")
const otherRow = site =>
    h(
        'a',
        { class: 'row-item', href: siteHref(site) },
        h('span', { class: `tree-dot ${site.visibility}` }),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, site.name)),
        h('span', { class: 'row-meta' }, ART_TEXT[site.art] || site.art)
    );

export default {
    render(root, { session }) {
        const head = h('div', { class: 'home-head' });
        const waitingBox = h('div');
        const sitesBox = h('div', {}, spinner('Lade deine Websites …'));
        const othersBox = h('div');
        const deletedBox = h('div');
        const deletedCard = card(
            {
                title: 'Papierkorb',
                icon: 'history',
                subtitle: 'Gelöschte Websites mit Sicherung – du kannst sie 30 Tage lang als neue Website zurückholen.'
            },
            deletedBox
        );
        deletedCard.hidden = true;

        const fill = async s => {
            const name = firstName(s.identity);
            const hello = greetingFor(new Date().getHours()) + (name ? `, ${name}` : '');
            if (!s.online || s.identity.kind === 'anon') {
                mount(head, h('h1', { class: 'home-title' }, hello));
                mount(waitingBox);
                mount(othersBox);
                return mount(
                    sitesBox,
                    emptyState({
                        icon: 'user',
                        title: s.online ? 'Melde dich an' : 'Gerade keine Verbindung',
                        text: s.online
                            ? 'Oben rechts anmelden – dann siehst du hier deine Websites.'
                            : 'Versuch es in einer Minute nochmals.'
                    })
                );
            }

            const [loaded, requests, uploads] = await Promise.all([
                loadOwnerSites(),
                api.get('/api/publish-requests/pending'),
                api.get('/api/uploads/pending')
            ]);
            const { websites, others } = splitByArt(loaded.sites);
            const waiting = countOf(requests) + countOf(uploads);
            const problems = websites.reduce((sum, w) => sum + (w.problems24h || 0), 0);

            // Kopf: Begrüssung + eine Zeile
            const parts = [
                websites.length === 1 ? '1 Website' : `${websites.length} Websites`,
                waiting ? (waiting === 1 ? '1 Sache wartet auf dich' : `${waiting} Dinge warten auf dich`) : null,
                problems ? (problems === 1 ? '1 Problem heute' : `${problems} Probleme heute`) : null
            ].filter(Boolean);
            mount(head, h('h1', { class: 'home-title' }, hello), h('p', { class: 'home-lead' }, parts.join(' · ')));

            // Wartet auf dich: nur ein Hinweis mit Link (die Entscheidungen fallen auf der eigenen Seite)
            mount(
                waitingBox,
                waiting
                    ? h(
                          'a',
                          { class: 'home-waiting', href: href('wartet') },
                          h('span', { class: 'nav-icon' }, icon('bell')),
                          h(
                              'span',
                              {},
                              waiting === 1
                                  ? '1 Sache wartet auf deine Entscheidung'
                                  : `${waiting} Dinge warten auf deine Entscheidung`
                          ),
                          h('span', { class: 'home-waiting-go' }, 'Ansehen →')
                      )
                    : null
            );

            // Websites als Kacheln
            if (!loaded.ok) {
                mount(
                    sitesBox,
                    emptyState({
                        icon: 'alert',
                        title: 'Konnte deine Websites nicht laden',
                        text: 'Versuch es in einer Minute nochmals.'
                    })
                );
            } else if (!websites.length) {
                mount(
                    sitesBox,
                    emptyState({
                        icon: 'layers',
                        title: 'Noch keine Website',
                        text: 'Bitte deinen KI-Helfer, eine Website zu bauen – oder leg selbst eine an.',
                        action: h('a', { class: 'btn primary', href: href('objekte') }, '＋ Neue Website')
                    })
                );
            } else {
                mount(sitesBox, h('div', { class: 'site-tiles' }, websites.map(tile)));
            }

            // Weitere: Speicher und Werkzeugkästen – eingeklappt
            mount(
                othersBox,
                others.length
                    ? h(
                          'details',
                          { class: 'home-others' },
                          h('summary', {}, `Weitere: Speicher & Werkzeugkästen (${others.length})`),
                          h('div', { class: 'rows' }, others.map(otherRow))
                      )
                    : null
            );
            renderDeletedSites(deletedBox, deletedCard, s);
        };

        root.append(
            head,
            waitingBox,
            h('div', { class: 'sec' }, h('h2', {}, 'Deine Websites')),
            sitesBox,
            othersBox,
            deletedCard
        );
        fill(session);
        return on('session', fill);
    }
};
