// js/core/ui.js
// ---------------------------------------------------------------------
// BAUSTEINE FÜR DIE OBERFLÄCHE
//
// WICHTIG (Sicherheit): Texte kommen oft vom Backend – also potenziell von
// Fremden (z.B. der Name einer Domain). Wir setzen sie darum IMMER als
// reinen Text (textContent) und nie als HTML (innerHTML). So kann niemand
// über einen Objektnamen Schad-Code in dein Cockpit schmuggeln (XSS).
// Die Hilfsfunktion h() macht genau das automatisch.
// ---------------------------------------------------------------------
import { icon } from './icons.js';

// h('button', { class: 'btn', onclick: fn }, 'Klick mich')
//   -> <button class="btn">Klick mich</button>
// Kinder dürfen Texte, Zahlen, Elemente, Listen oder null/false sein.
export const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key === 'value') el.value = value;
        else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected')
            el[key] = Boolean(value);
        else el.setAttribute(key, value === true ? '' : value);
    }
    append(el, children);
    return el;
};

const append = (el, children) => {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
};

// Inhalt eines Elements ersetzen
export const mount = (el, ...children) => {
    el.replaceChildren();
    append(el, children);
    return el;
};

// ---------- Kleine Bausteine ----------

export const badge = (text, tone = 'neutral') => h('span', { class: `badge ${tone}` }, text);

export const spinner = (label = 'Lädt …') =>
    h('div', { class: 'loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, label));

// Hinweis-Kasten: tone = info | ok | warn | error | test
export const callout = (tone, title, ...body) =>
    h(
        'div',
        { class: `callout ${tone}` },
        icon(tone === 'ok' ? 'check' : tone === 'info' ? 'info' : tone === 'test' ? 'flask' : 'alert'),
        h('div', {}, title ? h('strong', {}, title) : null, ...body)
    );

// Karte mit Titel, optionalen Knöpfen rechts und Inhalt
export const card = ({ title, subtitle, icon: iconName, actions, className = '' }, ...body) =>
    h(
        'section',
        { class: `card ${className}`.trim() },
        title || actions
            ? h(
                  'header',
                  { class: 'card-head' },
                  h(
                      'div',
                      { class: 'card-title' },
                      iconName ? h('span', { class: 'card-icon' }, icon(iconName)) : null,
                      h(
                          'div',
                          {},
                          title ? h('h2', {}, title) : null,
                          subtitle ? h('p', { class: 'muted small' }, subtitle) : null
                      )
                  ),
                  actions ? h('div', { class: 'card-actions' }, actions) : null
              )
            : null,
        h('div', { class: 'card-body' }, ...body)
    );

export const emptyState = ({ icon: iconName = 'box', title, text, action }) =>
    h(
        'div',
        { class: 'empty' },
        h('span', { class: 'empty-icon' }, icon(iconName, { size: 28 })),
        h('strong', {}, title),
        text ? h('p', { class: 'muted' }, text) : null,
        action || null
    );

// Knopf, der während einer Aktion "beschäftigt" anzeigt und nicht doppelt klickbar ist
export const busyButton = (label, action, { className = 'btn', iconName } = {}) => {
    const btn = h(
        'button',
        { class: className, type: 'button' },
        iconName ? icon(iconName) : null,
        h('span', {}, label)
    );
    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('is-busy');
        try {
            await action(btn);
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-busy');
        }
    });
    return btn;
};

// Text in die Zwischenablage
export const copyText = async text => {
    try {
        await navigator.clipboard.writeText(text);
        toast('Kopiert.', 'ok');
    } catch {
        toast('Kopieren hat nicht geklappt.', 'error');
    }
};

export const copyButton = (getText, label = 'Kopieren') =>
    h(
        'button',
        {
            class: 'icon-btn small',
            type: 'button',
            title: label,
            'aria-label': label,
            onclick: () => copyText(typeof getText === 'function' ? getText() : getText)
        },
        icon('copy', { size: 16 })
    );

// Code-Block mit Kopier-Knopf (reiner Text, keine Farben)
export const codeBlock = (text, { label } = {}) =>
    h(
        'div',
        { class: 'code-block' },
        h('div', { class: 'code-block-head' }, h('span', { class: 'muted small' }, label || ''), copyButton(text)),
        h('pre', {}, h('code', {}, text))
    );

// ---------- JSON schön anzeigen (mit Farben) ----------

// Zerlegt formatiertes JSON in farbige Stücke (reine Funktion, getestet).
// Ergebnis: [{ t: 'key' | 'string' | 'number' | 'bool' | 'null' | 'punct', v: '…' }]
export const jsonTokens = value => {
    let text;
    try {
        text = JSON.stringify(value, null, 2);
    } catch {
        text = String(value);
    }
    if (text === undefined) text = 'undefined';
    const tokens = [];
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
        if (m.index > last) tokens.push({ t: 'punct', v: text.slice(last, m.index) });
        if (m[1]) {
            tokens.push({ t: m[2] ? 'key' : 'string', v: m[1] });
            if (m[2]) tokens.push({ t: 'punct', v: m[2] });
        } else if (m[3]) tokens.push({ t: 'bool', v: m[3] });
        else if (m[4]) tokens.push({ t: 'null', v: m[4] });
        else tokens.push({ t: 'number', v: m[5] });
        last = re.lastIndex;
    }
    if (last < text.length) tokens.push({ t: 'punct', v: text.slice(last) });
    return tokens;
};

export const jsonView = (value, { maxHeight } = {}) => {
    const pre = h('pre', { class: 'json', style: maxHeight ? { maxHeight } : undefined });
    for (const tok of jsonTokens(value)) {
        pre.appendChild(tok.t === 'punct' ? document.createTextNode(tok.v) : h('span', { class: `j-${tok.t}` }, tok.v));
    }
    return pre;
};

// ---------- Kurze Meldungen unten rechts ("Toasts") ----------

export const toast = (message, type = 'info', timeout = 3500) => {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = h(
        'div',
        { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
        icon(type === 'ok' ? 'check' : type === 'error' ? 'alert' : 'info'),
        h('span', {}, message)
    );
    box.appendChild(el);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 250);
    }, timeout);
};

// Ergebnis einer API-Anfrage als Zeile: "✓ 201 · 42 ms" oder "✗ 403 Kein Zugriff"
export const resultLine = result =>
    h(
        'div',
        { class: `result-line ${result.ok ? 'ok' : 'error'}` },
        icon(result.ok ? 'check' : 'alert', { size: 16 }),
        h('span', { class: 'mono' }, result.status || '—'),
        h('span', {}, result.ok ? 'OK' : result.error),
        h('span', { class: 'muted small' }, `${result.ms} ms`)
    );
