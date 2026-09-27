// js/core/requestLog.js
// ---------------------------------------------------------------------
// ANFRAGEN-PROTOKOLL (Symbol oben rechts)
//
// Zeigt jede Anfrage, die das Cockpit ans Backend schickt: Methode,
// Adresse, Status, Dauer – und aufgeklappt den gesendeten Inhalt und die
// Antwort. So siehst du genau, was hinter jedem Knopf passiert, und
// kannst es später in eigenem Code nachbauen.
// ---------------------------------------------------------------------
import { on } from './events.js';
import { h, mount, jsonView, badge } from './ui.js';
import { formatMs } from './format.js';

const MAX_ENTRIES = 100;
const entries = [];

const drawer = () => document.getElementById('logDrawer');
const list = () => document.getElementById('logList');

const statusTone = status => (status === 0 ? 'error' : status < 300 ? 'ok' : status < 500 ? 'warn' : 'error');

const renderEntry = e =>
    h(
        'details',
        { class: 'log-entry' },
        h(
            'summary',
            {},
            h('span', { class: `method m-${e.method.toLowerCase()}` }, e.method),
            h('span', { class: 'log-path mono', title: e.url }, e.path),
            e.anonymous ? badge('als Fremder', 'neutral') : null,
            e.mode === 'test' ? badge('Test', 'test') : null,
            h('span', { class: `log-status ${statusTone(e.status)}` }, e.status || 'offline'),
            h('span', { class: 'muted small' }, formatMs(e.ms))
        ),
        h(
            'div',
            { class: 'log-detail' },
            h('div', { class: 'muted small mono' }, e.url),
            e.requestBody !== undefined
                ? [h('h4', {}, 'Gesendet'), jsonView(e.requestBody, { maxHeight: '220px' })]
                : null,
            h('h4', {}, 'Antwort'),
            e.data === null
                ? h('p', { class: 'muted small' }, e.error || '(leer)')
                : jsonView(e.data, { maxHeight: '320px' })
        )
    );

const render = () => {
    const el = list();
    if (!el || drawer().hidden) return;
    if (!entries.length) {
        mount(el, h('p', { class: 'muted small pad' }, 'Noch keine Anfragen.'));
        return;
    }
    mount(el, entries.map(renderEntry));
};

const updateCount = () => {
    const badgeEl = document.getElementById('logCount');
    if (!badgeEl) return;
    const errors = entries.filter(e => e.status === 0 || e.status >= 500).length;
    badgeEl.hidden = errors === 0;
    badgeEl.textContent = errors > 99 ? '99+' : String(errors);
};

export const initRequestLog = () => {
    on('request', entry => {
        entries.unshift(entry);
        entries.length = Math.min(entries.length, MAX_ENTRIES);
        updateCount();
        render();
    });

    const toggle = open => {
        drawer().hidden = !open;
        document.body.classList.toggle('drawer-open', open);
        if (open) render();
    };
    document.getElementById('logBtn').addEventListener('click', () => toggle(drawer().hidden));
    document.getElementById('logClose').addEventListener('click', () => toggle(false));
    document.getElementById('logClear').addEventListener('click', () => {
        entries.length = 0;
        updateCount();
        render();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !drawer().hidden) toggle(false);
    });
};
