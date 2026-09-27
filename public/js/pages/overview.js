// js/pages/overview.js
// ---------------------------------------------------------------------
// ÜBERSICHT – die Startseite des Cockpits
//
//   1. Status: Backend, Datenbank, SSF-Sandbox, wer du bist
//   2. Deine Objekte (die neusten)
//   3. So funktioniert at0mic – die Grundbegriffe in einfachen Worten
//   4. Stand des Umbaus
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { getMode, apiBase } from '../core/config.js';
import { on } from '../core/events.js';
import { href } from '../core/routes.js';
import { refreshSession } from '../core/session.js';
import { h, mount, card, badge, spinner, emptyState, busyButton, copyButton, callout } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { formatMs, formatNumber, shortUuid, timeAgo, pathText } from '../core/format.js';

// ------------------------------------------------------------------
// 1. STATUS-KACHELN
// ------------------------------------------------------------------
const tile = ({ iconName, label, value, tone = 'neutral', detail }) =>
    h(
        'div',
        { class: `stat ${tone}` },
        h('div', { class: 'stat-head' }, h('span', { class: 'stat-icon' }, icon(iconName)), h('span', {}, label)),
        h('div', { class: 'stat-value' }, value),
        detail ? h('div', { class: 'stat-detail' }, detail) : null
    );

const IDENTITY_TEXT = {
    user: 'Eingeloggt mit Auth0. Deine Objekte gehören dauerhaft dir.',
    guest: 'Gast (Cookie, 1 Tag gültig). Beim Login werden deine Objekte übernommen.',
    anon: 'Noch niemand. Sobald du etwas erstellst, wirst du automatisch Gast.',
    offline: 'Keine Verbindung zum Backend.'
};

const renderStatus = (box, s) => {
    if (s.loading) return mount(box, spinner());
    const hl = s.health;
    const test = getMode() === 'test';
    const sb = hl?.sandbox;

    mount(
        box,
        tile({
            iconName: 'server',
            label: 'Backend',
            value: s.online ? 'Online' : 'Offline',
            tone: s.online ? 'ok' : 'error',
            detail: s.online ? `${test ? 'Test' : 'Live'} · Antwort in ${formatMs(s.healthMs)}` : apiBase()
        }),
        tile({
            iconName: 'database',
            label: 'Datenbank',
            value: !s.online ? '–' : s.healthMissing ? 'unbekannt' : hl?.database === 'ok' ? 'Verbunden' : 'Fehler',
            tone: !s.online
                ? 'neutral'
                : hl?.database === 'ok'
                  ? hl.testMode
                      ? 'test'
                      : 'ok'
                  : s.healthMissing
                    ? 'warn'
                    : 'error',
            detail: s.healthMissing
                ? 'Backend kennt /api/health noch nicht (älterer Stand)'
                : hl
                  ? hl.testMode
                      ? 'Test-Datenbank – Ausprobieren erlaubt'
                      : 'Echte Datenbank – Vorsicht beim Testen'
                  : null
        }),
        tile({
            iconName: 'cpu',
            label: 'SSF-Sandbox',
            value: sb ? `${sb.running} aktiv` : '–',
            tone: !sb ? 'neutral' : sb.waiting > 0 ? 'warn' : 'ok',
            detail: sb
                ? `${sb.waiting} wartend · je ${sb.memoryMb} MB, ${formatMs(sb.cpuMs)} Rechenzeit, ${formatMs(sb.totalTimeoutMs)} total`
                : null
        }),
        tile({
            iconName: 'user',
            label: 'Du bist',
            value: s.identity.label,
            tone: { user: 'ok', guest: 'warn', anon: 'neutral', offline: 'error' }[s.identity.kind],
            detail: h(
                'span',
                {},
                IDENTITY_TEXT[s.identity.kind],
                s.identity.id
                    ? h(
                          'span',
                          { class: 'id-line' },
                          h('code', { title: s.identity.id }, shortUuid(s.identity.id)),
                          copyButton(s.identity.id, 'ID kopieren')
                      )
                    : null
            )
        })
    );
};

// ------------------------------------------------------------------
// 2. DEINE OBJEKTE
// ------------------------------------------------------------------
const renderObjects = async (box, s) => {
    if (!s.online)
        return mount(
            box,
            emptyState({ icon: 'server', title: 'Keine Verbindung', text: 'Ohne Backend keine Objekte.' })
        );
    mount(box, spinner('Lade deine Objekte …'));

    const res = await api.get('/api/objects');
    if (!res.ok) return mount(box, callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));

    const list = Array.isArray(res.data) ? res.data : [];
    if (!list.length) {
        return mount(
            box,
            emptyState({
                icon: 'box',
                title: 'Noch keine Objekte',
                text:
                    s.identity.kind === 'anon'
                        ? 'Du bist anonym und siehst darum nichts. Erstelle dein erstes Objekt – dann wirst du automatisch Gast.'
                        : 'Leg dein erstes Objekt an.',
                action: h(
                    'a',
                    { class: 'btn primary', href: href('objekte') },
                    icon('box'),
                    h('span', {}, 'Zu den Objekten')
                )
            })
        );
    }

    // Wurzel-Objekte (eigene Domains) und angehängte Kinder zählen
    const roots = list.filter(o => !o.domain_ref || o.domain_ref === o.domain).length;

    mount(
        box,
        h(
            'div',
            { class: 'mini-stats' },
            h(
                'div',
                {},
                h('strong', {}, formatNumber(list.length)),
                h('span', { class: 'muted' }, ' Objekte sichtbar')
            ),
            h('div', {}, h('strong', {}, formatNumber(roots)), h('span', { class: 'muted' }, ' davon Wurzeln'))
        ),
        h(
            'ul',
            { class: 'object-list' },
            list
                .slice(0, 8)
                .map(o =>
                    h(
                        'li',
                        {},
                        h(
                            'a',
                            { href: href('objekte', o.uuid) },
                            h('span', { class: 'obj-icon' }, icon('box', { size: 16 })),
                            h(
                                'span',
                                { class: 'obj-main' },
                                h('span', { class: 'obj-domain' }, o.domain),
                                h('span', { class: 'obj-path mono muted' }, pathText(o.path) || '—')
                            ),
                            o.domain_ref && o.domain_ref !== o.domain ? badge(`→ ${o.domain_ref}`, 'neutral') : null,
                            h('span', { class: 'muted small nowrap' }, timeAgo(o.created_at))
                        )
                    )
                )
        ),
        list.length > 8
            ? h('a', { class: 'more-link', href: href('objekte') }, `Alle ${formatNumber(list.length)} ansehen →`)
            : null
    );
};

// ------------------------------------------------------------------
// 3. SO FUNKTIONIERT AT0MIC
// ------------------------------------------------------------------
const CONCEPTS = [
    {
        iconName: 'box',
        title: 'Objekt',
        text: 'Alles ist ein Objekt: eine Website, ein Kunde, eine Funktion – auch du. Jedes hat eine UUID und einen Pfad wie shop/base/kunden.',
        to: 'objekte'
    },
    {
        iconName: 'code',
        title: 'Code & DNA',
        text: 'Ein Objekt trägt Inhalt: HTML, CSS, JS, eine Server-Funktion (SSF) oder eine Syntax-DNA, die beschreibt, woraus es besteht.',
        to: 'code'
    },
    {
        iconName: 'shield',
        title: 'Triplets & Rollen',
        text: null, // wird unten mit farbigen Rollen gebaut
        to: 'rechte'
    },
    {
        iconName: 'bolt',
        title: 'SSF',
        text: 'Server-Funktionen laufen abgeschottet in einer Sandbox – mit ihren EIGENEN Rechten, wie ein Mitarbeiter mit Schlüsselbund. Werkzeuge über api.…',
        to: 'ssf'
    },
    {
        iconName: 'search',
        title: 'Daten & Suche',
        text: 'Jedes Objekt kann Datensätze speichern. Die Such-Sprache filtert, sortiert, verbindet (Joins) und blättert – auch bei Millionen Einträgen.',
        to: 'daten'
    },
    {
        iconName: 'lock',
        title: 'Tresor',
        text: 'Geheime Schlüssel verschlüsselt ablegen. Nur die eigene SSF kann sie lesen – und in Antworten werden sie zu *** geschwärzt.',
        to: 'tresor'
    }
];

const rolesText = () =>
    h(
        'p',
        {},
        'Rechte hängen an Triplets mit drei Rollen: ',
        h('span', { class: 'role black' }, 'black'),
        ' lesen/ausführen, ',
        h('span', { class: 'role red' }, 'red'),
        ' ändern, ',
        h('span', { class: 'role blue' }, 'blue'),
        ' Rechte vergeben. Ein Triplet schützt nur Objekte seiner eigenen Domain.'
    );

const renderConcepts = () =>
    h(
        'div',
        { class: 'concepts' },
        CONCEPTS.map(c =>
            h(
                'a',
                { class: 'concept', href: href(c.to) },
                h('span', { class: 'concept-icon' }, icon(c.iconName)),
                h('strong', {}, c.title),
                c.text ? h('p', {}, c.text) : rolesText()
            )
        )
    );

// ------------------------------------------------------------------
// 4. STAND DES UMBAUS
// ------------------------------------------------------------------
const STAGES = [
    { n: 1, title: 'Grundgerüst', text: 'Design, Menü, API-Client, Login-Status, Übersicht, Test-Modus', done: true },
    { n: 2, title: 'Objekte + Code & DNA', text: 'Anlegen, Baum, Code-Editor, DNA mit Vorschau', done: true },
    { n: 3, title: 'SSF-Studio', text: 'Ausführen, Beispiel-Bibliothek, Werkzeug-Referenz' },
    { n: 4, title: 'Daten, Relationen, Rechte, Tresor', text: 'Such-Spielplatz, Joins, Rollen, Schlüssel' },
    { n: 5, title: 'Systemcheck', text: '„Teste alles“ und Feinschliff' }
];

const renderStages = () =>
    h(
        'ol',
        { class: 'stages' },
        STAGES.map(st =>
            h(
                'li',
                { class: st.done ? 'done' : '' },
                h('span', { class: 'stage-n' }, st.done ? icon('check', { size: 16 }) : String(st.n)),
                h('div', {}, h('strong', {}, `Etappe ${st.n}: ${st.title}`), h('p', { class: 'muted small' }, st.text))
            )
        )
    );

// ------------------------------------------------------------------
// SEITE ZUSAMMENBAUEN
// ------------------------------------------------------------------
export default {
    render(root, { session }) {
        const statusBox = h('div', { class: 'stats' });
        const objectsBox = h('div');

        const fill = s => {
            renderStatus(statusBox, s);
            renderObjects(objectsBox, s);
        };

        root.append(
            pageHeader({
                intro: 'Willkommen im Cockpit von at0mic – dem Betriebssystem fürs Web. Hier siehst du alles, was wichtig ist, und kannst jede Funktion ausprobieren.',
                actions: busyButton('Aktualisieren', () => refreshSession(), {
                    className: 'btn ghost',
                    iconName: 'refresh'
                })
            }),
            statusBox,
            h(
                'div',
                { class: 'grid-2' },
                card(
                    {
                        title: 'Deine Objekte',
                        icon: 'box',
                        subtitle: 'Alles, worauf du mindestens black (lesen) hast – die neusten zuerst.'
                    },
                    objectsBox
                ),
                card(
                    { title: 'Stand des Umbaus', icon: 'layers', subtitle: 'Das neue Cockpit entsteht in 5 Etappen.' },
                    renderStages()
                )
            ),
            card(
                {
                    title: 'So funktioniert at0mic',
                    icon: 'info',
                    subtitle: 'Die sechs Grundbegriffe – klick für die passende Seite.'
                },
                renderConcepts()
            )
        );

        fill(session);
        // Wenn sich der Status ändert (Aktualisieren, Fenster wieder aktiv): neu füllen
        return on('session', fill);
    }
};
