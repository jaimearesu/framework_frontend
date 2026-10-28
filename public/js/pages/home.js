// js/pages/home.js
// ---------------------------------------------------------------------
// ÜBERSICHT IN DER BESITZER-ANSICHT (Punkt 5, D2 – vorläufig)
//
//   Begrüssung + eine Zeile, wie es steht
//   Wartet auf dich (nur wenn etwas wartet)
//   Deine Websites (Liste; D3 macht daraus Kacheln mit Vorschau)
//   Papierkorb (nur wenn es gelöschte Websites mit Sicherung gibt)
//
// Statuskarten, Schnellstart und Grundbegriffe stehen nur in der
// Technik-Übersicht (pages/overview.js).
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { siteUrlTemplate } from '../core/config.js';
import { on } from '../core/events.js';
import { href } from '../core/routes.js';
import { loadOwnerSites } from '../core/objects.js';
import { h, mount, card, emptyState, spinner } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { greetingFor, siteAddress } from '../core/view.js';
import { renderDeletedSites } from './objectSnapshots.js';

const VISIBILITY = {
    public: { text: 'Öffentlich', tone: 'public' },
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

export default {
    render(root, { session }) {
        const head = h('div', { class: 'home-head' });
        const waitingBox = h('div');
        const sitesBox = h('div', {}, spinner('Lade deine Websites …'));
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

            const [objects, requests, uploads] = await Promise.all([
                loadOwnerSites(s),
                api.get('/api/publish-requests/pending'),
                api.get('/api/uploads/pending')
            ]);
            const sites = objects.sites;
            const waiting = countOf(requests) + countOf(uploads);

            // Kopf: Begrüssung + eine Zeile
            const parts = [
                sites.length === 1 ? '1 Website' : `${sites.length} Websites`,
                waiting ? (waiting === 1 ? '1 Sache wartet auf dich' : `${waiting} Dinge warten auf dich`) : null
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

            // Websites
            if (!objects.ok) {
                mount(
                    sitesBox,
                    emptyState({
                        icon: 'alert',
                        title: 'Konnte deine Websites nicht laden',
                        text: 'Versuch es in einer Minute nochmals.'
                    })
                );
            } else if (!sites.length) {
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
                const template = siteUrlTemplate();
                mount(
                    sitesBox,
                    h(
                        'div',
                        { class: 'rows' },
                        sites.map(site => {
                            const v = VISIBILITY[site.visibility] || VISIBILITY.private;
                            return h(
                                'a',
                                { class: 'row-item', href: href('objekte', site.uuid) + '?tab=website' },
                                h('span', { class: `tree-dot ${v.tone}` }),
                                h(
                                    'span',
                                    { class: 'row-main' },
                                    h('span', { class: 'row-title' }, site.name),
                                    h('span', { class: 'row-sub mono' }, siteAddress(template, site.name))
                                ),
                                h('span', { class: 'row-meta' }, v.text)
                            );
                        })
                    )
                );
            }
            renderDeletedSites(deletedBox, deletedCard, s);
        };

        root.append(head, waitingBox, h('div', { class: 'sec' }, h('h2', {}, 'Deine Websites')), sitesBox, deletedCard);
        fill(session);
        return on('session', fill);
    }
};
