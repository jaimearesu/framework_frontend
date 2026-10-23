// js/pages/publishRequests.js
// ---------------------------------------------------------------------
// "WARTET AUF DICH" – Freigabe-Anfragen (Backend: Plan "MCP Etappe 5d")
//
// Eine KI veröffentlicht nie selbst. Sie BITTET darum, und hier entscheidest
// du mit einem Klick: Freigeben oder Ablehnen (mit optionaler Notiz).
//
// SICHERHEIT: Die Begründung schreibt die KI – sie ist DATEN. Darum steht
// gross und klar, WAS genau passiert ("freigabe-5d + 3 Unter-Objekte werden
// öffentlich"), und die Begründung nur klein darunter, als reiner Text.
// Alle Texte vom Backend gehen über h() / textContent, nie über innerHTML.
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import { h, mount, badge, busyButton, toast, callout } from '../core/ui.js';
import { timeAgo, pathText } from '../core/format.js';
import { loadObjects, loadObjectNames, objectLabel } from '../core/objects.js';

const VISIBILITY_TEXT = {
    public: 'öffentlich (alle, auch anonym)',
    members: 'nur für eingeloggte Mitglieder',
    private: 'privat'
};

// Für den Satz "… wird <Ziel>"
const TARGET_TEXT = {
    public: 'öffentlich (alle, auch anonym)',
    members: 'sichtbar für eingeloggte Mitglieder'
};

/**
 * Was genau passiert, wenn man freigibt? (reine Funktion, getestet)
 * -> z.B. "freigabe-5d und 3 Unter-Objekte werden öffentlich (alle, auch anonym)"
 * Mit Ausnahmen (Plan "Brotzeit-Test", B1):
 * -> "brot und 2 Unter-Objekte werden öffentlich (…) – AUSSER 2 Teilen, die bleiben, wie sie sind"
 */
export const describeRequest = item => {
    const name =
        item.objectPath && item.objectPath.length > 1
            ? `${item.objectName}/${pathText(item.objectPath.slice(1))}`
            : item.objectName;
    const excepted =
        item.includeChildren && Array.isArray(item.except) && item.except.length ? item.exceptCount || 0 : 0;
    const count = Math.max(0, (item.childCount || 0) - excepted);
    const children = item.includeChildren && count > 0 ? ` und ${count} Unter-Objekt${count === 1 ? '' : 'e'}` : '';
    const verb = children ? 'werden' : 'wird';
    const except =
        excepted > 0 ? ` – AUSSER ${excepted} Teil${excepted === 1 ? '' : 'en'}, die bleiben, wie sie sind` : '';
    return `${name}${children} ${verb} ${TARGET_TEXT[item.visibility] || item.visibility}${except}`;
};

// Eine Anfrage als Karte
const requestItem = (item, reload, names = {}) => {
    const note = h('input', {
        type: 'text',
        class: 'input',
        maxlength: 500,
        placeholder: 'Notiz an die KI (optional, z.B. warum nicht)'
    });

    const decide = async action => {
        const res = await api.post(`/api/publish-requests/${item.uuid}/${action}`, { note: note.value || undefined });
        if (!res.ok) {
            toast(res.error || 'Hat nicht geklappt.', 'error');
            return;
        }
        toast(action === 'approve' ? 'Freigegeben – jetzt online.' : 'Abgelehnt.', 'ok');
        reload();
    };

    return h(
        'li',
        { class: 'request-item' },
        h('div', { class: 'request-what' }, h('strong', {}, describeRequest(item))),
        // Ausnahmen mit Namen (Plan "Brotzeit-Test", B1) – du sollst sehen, WAS privat bleibt
        Array.isArray(item.except) && item.except.length
            ? h(
                  'div',
                  { class: 'small' },
                  '🔒 Bleibt, wie es ist (mit allem darunter): ',
                  item.except.map((u, i) => [i ? ', ' : '', h('code', {}, names[u] || u.slice(0, 8))])
              )
            : null,
        h(
            'div',
            { class: 'muted small' },
            `Jetzt: ${VISIBILITY_TEXT[item.currentVisibility] || item.currentVisibility} · Anfrage von `,
            item.requestedByName ? h('code', {}, item.requestedByName) : 'einem Menschen',
            ` · ${timeAgo(item.createdAt)}`
        ),
        item.reason
            ? h(
                  'blockquote',
                  { class: 'request-reason small' },
                  h('span', { class: 'muted' }, 'Begründung: '),
                  item.reason
              )
            : null,
        h(
            'div',
            { class: 'request-actions' },
            h('a', { class: 'btn ghost', href: href('objekte', item.objectUuid) }, 'Objekt & Vorschau ansehen'),
            note,
            busyButton(
                'Freigeben',
                () => {
                    if (!confirm(`Wirklich freigeben?\n\n${describeRequest(item)}.`)) return;
                    return decide('approve');
                },
                { className: 'btn primary', iconName: 'check' }
            ),
            busyButton('Ablehnen', () => decide('decline'), { className: 'btn' })
        )
    );
};

/**
 * Die Karte füllen. Gibt es nichts zu entscheiden, bleibt sie versteckt.
 * @param {HTMLElement} box      Inhalt der Karte
 * @param {HTMLElement} cardEl   die ganze Karte (wird ein-/ausgeblendet)
 */
export const renderPendingRequests = async (box, cardEl, s) => {
    // Nur Menschen entscheiden; ohne Verbindung oder anonym gibt es nichts
    if (!s.online || s.identity.kind === 'anon') {
        cardEl.hidden = true;
        return;
    }
    const res = await api.get('/api/publish-requests/pending');
    if (!res.ok) {
        // Älteres Backend ohne diese Route: Karte einfach nicht zeigen
        cardEl.hidden = res.status === 404 || res.status === 403;
        if (!cardEl.hidden) mount(box, callout('error', 'Konnte Anfragen nicht laden:', ' ', res.error));
        return;
    }
    const list = res.data?.data || [];
    cardEl.hidden = list.length === 0;
    if (!list.length) return mount(box); // nichts mehr offen: alten Inhalt wegräumen

    const reload = () => renderPendingRequests(box, cardEl, s);
    // Namen der ausgenommenen Teile (B1) – nur laden, wenn eine Anfrage Ausnahmen hat
    const names = {};
    if (list.some(item => Array.isArray(item.except) && item.except.length)) {
        const loaded = await loadObjects();
        const objects = loaded.ok ? loaded.data : [];
        await loadObjectNames(objects);
        for (const o of objects) names[o.uuid] = objectLabel(o);
    }
    mount(
        box,
        s.identity.kind === 'guest'
            ? callout('warn', 'Als Gast kannst du nur ablehnen.', ' Zum Freigeben (veröffentlichen) bitte einloggen.')
            : null,
        h(
            'ul',
            { class: 'request-list' },
            list.map(item => requestItem(item, reload, names))
        ),
        h(
            'p',
            { class: 'muted small' },
            badge(String(list.length), 'warn'),
            ' offene Anfrage(n). Offene Anfragen verfallen nach 30 Tagen.'
        )
    );
};
