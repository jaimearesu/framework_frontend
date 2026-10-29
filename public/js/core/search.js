// js/core/search.js
// ---------------------------------------------------------------------
// SUCHEN ODER KI FRAGEN – «Strg K» (Punkt 5, D5)
//
// Ein Fenster mitten im Cockpit:
//   - findet Websites (aus GET /api/websites), Seiten des Cockpits und
//     Aktionen (Neue Website, Ansicht wechseln, Hell/Dunkel)
//   - letzte Zeile «KI fragen»: kopiert die Frage als fertigen Satz für
//     deinen KI-Helfer (Claude/ChatGPT) – vindelis fragt selbst keine KI
// Bedienung: Pfeile hoch/runter, Enter, Esc. Die Suche selbst
// (searchItems) ist eine reine Funktion in view.js und getestet.
// ---------------------------------------------------------------------
import { h, mount, copyText, toast } from './ui.js';
import { icon } from './icons.js';
import { href, ROUTES, GROUPS } from './routes.js';
import { getSession } from './session.js';
import { loadOwnerSites } from './objects.js';
import { isTechView, setView, OWNER_NAV, searchItems, askAiPrompt, ART_TEXT } from './view.js';

let open = null; // das offene Fenster (oder null)

// Alle Einträge zusammenstellen (Websites werden jedes Mal frisch geholt – Zwischenspeicher 15 s)
const collect = async () => {
    const tech = isTechView();
    const items = [];
    const s = getSession();
    if (s.online && s.identity?.kind !== 'anon') {
        const { sites } = await loadOwnerSites();
        for (const site of sites) {
            items.push({
                kind: 'website',
                title: site.name,
                sub: ART_TEXT[site.art] || 'Website',
                href: href('website', site.uuid)
            });
        }
    }
    // Seiten: in der Besitzer-Ansicht die drei Punkte, in der Technik-Ansicht alle mit Gruppe
    const pages = tech
        ? ROUTES.filter(r => GROUPS.includes(r.group)).map(r => ({ title: r.title, id: r.id, sub: r.group }))
        : OWNER_NAV.map(r => ({ title: r.title, id: r.id, sub: 'Seite' }));
    for (const p of pages) items.push({ kind: 'seite', title: p.title, sub: p.sub, href: href(p.id) });

    items.push({ kind: 'aktion', title: 'Neue Website', sub: 'Aktion', href: href('objekte') });
    items.push({
        kind: 'aktion',
        title: tech ? 'Zur Besitzer-Ansicht' : 'Zur Technik-Ansicht',
        sub: 'Aktion',
        action: () => setView(tech ? 'besitzer' : 'technik')
    });
    items.push({
        kind: 'aktion',
        title: 'Hell / Dunkel umschalten',
        sub: 'Aktion',
        action: () => document.getElementById('themeBtn')?.click()
    });
    return items;
};

const ICONS = { website: 'layers', seite: 'home', aktion: 'bolt', ki: 'robot' };

export const closeSearch = () => {
    if (!open) return;
    open.remove();
    open = null;
};

export const openSearch = async () => {
    if (open) return;
    const input = h('input', {
        class: 'k-input',
        type: 'text',
        placeholder: 'Website, Seite oder Frage an die KI …',
        'aria-label': 'Suchen oder KI fragen',
        autocomplete: 'off'
    });
    const list = h('div', { class: 'k-list', role: 'listbox' });
    const box = h('div', { class: 'k-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Suchen' }, input, list);
    const overlay = h(
        'div',
        {
            class: 'k-overlay',
            onclick: e => {
                if (e.target === overlay) closeSearch();
            }
        },
        box
    );
    open = overlay;
    document.body.append(overlay);
    input.focus();

    let items = [];
    let shown = [];
    let active = 0;

    const run = item => {
        closeSearch();
        if (item.kind === 'ki') {
            copyText(askAiPrompt(item.question)).then(() =>
                toast('Frage kopiert – füg sie bei deinem KI-Helfer ein (Claude oder ChatGPT).', 'ok')
            );
        } else if (item.action) item.action();
        else if (item.href) location.hash = item.href;
    };

    const draw = () => {
        const q = input.value.trim();
        shown = searchItems(items, q, 8);
        // Letzte Zeile: die Frage an die KI (nur wenn etwas getippt ist)
        if (q) shown = [...shown, { kind: 'ki', title: `«${q}»`, sub: 'KI fragen – Satz kopieren', question: q }];
        if (active >= shown.length) active = Math.max(0, shown.length - 1);
        mount(
            list,
            shown.length
                ? shown.map((item, i) =>
                      h(
                          'div',
                          {
                              class: `k-opt${i === active ? ' on' : ''}`,
                              role: 'option',
                              'aria-selected': String(i === active),
                              onmousemove: () => {
                                  if (active !== i) {
                                      active = i;
                                      draw();
                                  }
                              },
                              onclick: () => run(item)
                          },
                          h('span', { class: 'k-icon' }, icon(ICONS[item.kind] || 'search', { size: 15 })),
                          h('span', { class: 'k-title' }, item.title),
                          h('small', {}, item.sub || '')
                      )
                  )
                : h('div', { class: 'k-empty' }, 'Lade …')
        );
    };

    input.addEventListener('input', () => {
        active = 0;
        draw();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            active = Math.min(shown.length - 1, active + 1);
            draw();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            active = Math.max(0, active - 1);
            draw();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (shown[active]) run(shown[active]);
        } else if (e.key === 'Escape') closeSearch();
    });

    draw();
    items = await collect();
    if (open === overlay) draw();
};

// Strg K / Cmd K überall; Esc schliesst
export const initSearch = () => {
    addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (open) closeSearch();
            else openSearch();
        } else if (e.key === 'Escape' && open) closeSearch();
    });
    document.getElementById('searchBtn')?.addEventListener('click', openSearch);
};
