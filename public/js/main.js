// js/main.js
// ---------------------------------------------------------------------
// STARTPUNKT DES COCKPITS
//
// Reihenfolge beim Öffnen:
//   1. Einstellungen laden (/config.json: Adressen von Live- und Test-Backend)
//   2. Gerüst füllen: Menü, Live/Test-Umschalter, Hell/Dunkel, Protokoll
//   3. Beim Backend nachfragen: läuft es, wer bin ich? (session.js)
//   4. Die Seite aus der Adresse anzeigen (/#/objekte -> Objekte)
//
// Die Seiten selbst liegen in js/pages/ – jede Seite ist eine Datei mit
// einer Funktion render(ziel, kontext).
// ---------------------------------------------------------------------
import { loadConfig, getMode, setMode, hasTestMode, liveBase, testBase } from './core/config.js';
import { on } from './core/events.js';
import { ROUTES, GROUPS, parseHash, findRoute, href } from './core/routes.js';
import { h, mount, spinner, callout } from './core/ui.js';
import { api } from './core/api.js';
import { icon, hydrateIcons } from './core/icons.js';
import { refreshSession, getSession } from './core/session.js';
import { initRequestLog } from './core/requestLog.js';
import { load, save } from './core/storage.js';

const $ = id => document.getElementById(id);

// ------------------------------------------------------------------
// MENÜ (links)
// ------------------------------------------------------------------
const renderNav = () => {
    const groups = GROUPS.map(group => {
        const items = ROUTES.filter(r => r.group === group);
        return h(
            'div',
            { class: 'nav-group' },
            h('div', { class: 'nav-group-title' }, group),
            items.map(r =>
                h(
                    'a',
                    { class: 'nav-link', href: href(r.id), dataset: { route: r.id } },
                    h('span', { class: 'nav-icon' }, icon(r.icon)),
                    h('span', {}, r.title)
                )
            )
        );
    });
    mount($('nav'), groups);
};

const markActiveNav = id => {
    for (const a of document.querySelectorAll('.nav-link[data-route]')) {
        a.classList.toggle('active', a.dataset.route === id);
        if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    }
};

// Handy: Menü ein-/ausklappen
const initMobileMenu = () => {
    const close = () => document.body.classList.remove('nav-open');
    $('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('sidebarBackdrop').addEventListener('click', close);
    $('nav').addEventListener('click', e => {
        if (e.target.closest('a')) close();
    });
};

// ------------------------------------------------------------------
// HELL / DUNKEL
// ------------------------------------------------------------------
const initTheme = () => {
    $('themeBtn').addEventListener('click', () => {
        const current =
            document.documentElement.dataset.theme ||
            (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        save('theme', next);
    });
};

// ------------------------------------------------------------------
// LIVE / TEST (oben rechts)
// ------------------------------------------------------------------
const renderModeSwitch = () => {
    const box = $('modeSwitch');
    box.hidden = !hasTestMode();
    for (const btn of box.querySelectorAll('button')) {
        const active = btn.dataset.mode === getMode();
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    }
    document.body.dataset.mode = getMode();
};

const initModeSwitch = () => {
    $('modeSwitch').addEventListener('click', e => {
        const btn = e.target.closest('button[data-mode]');
        if (btn) setMode(btn.dataset.mode);
    });
};

// ------------------------------------------------------------------
// WER BIN ICH? (oben rechts) + Hinweis-Leiste unter der Topbar
// ------------------------------------------------------------------
const IDENTITY_TONE = { user: 'ok', guest: 'warn', anon: 'neutral', offline: 'error' };

const renderIdentity = () => {
    const s = getSession();
    const box = $('identity');
    if (s.loading) return mount(box, h('span', { class: 'muted small' }, '…'));
    const id = s.identity;
    const loggedIn = id.kind === 'user';
    mount(
        box,
        h(
            'span',
            { class: `identity-chip ${id.kind}`, title: id.id ? `Deine ID: ${id.id}` : id.label },
            h('span', { class: `identity-dot ${IDENTITY_TONE[id.kind]}` }),
            h('span', { class: 'identity-label' }, id.label)
        ),
        s.online
            ? h(
                  'a',
                  {
                      class: 'btn ghost small',
                      // Login/Logout laufen immer über das Live-Backend (dort ist Auth0 eingerichtet)
                      href: liveBase() + (loggedIn ? '/logout' : '/login'),
                      title: loggedIn ? 'Abmelden' : 'Mit Auth0 anmelden'
                  },
                  icon(loggedIn ? 'logout' : 'login', { size: 16 }),
                  h('span', { class: 'hide-s' }, loggedIn ? 'Logout' : 'Login')
              )
            : null
    );
};

const renderBanner = () => {
    const s = getSession();
    const banner = $('modeBanner');
    const test = getMode() === 'test';
    let content = null;

    if (!s.loading && !s.online) {
        content = test
            ? callout(
                  'error',
                  'Der Test-Server läuft nicht.',
                  h(
                      'span',
                      {},
                      ' Starte ihn im Backend-Ordner mit ',
                      h('code', {}, 'npm run dev:test'),
                      ` (er läuft dann auf ${testBase()}). Oder schalte oben rechts auf „Live“.`
                  )
              )
            : callout(
                  'error',
                  'Das Backend ist nicht erreichbar.',
                  ` Läuft „npm run dev“ im Backend-Ordner (${liveBase()})?`
              );
    } else if (!s.loading && s.health && s.health.database !== 'ok') {
        content = callout('error', 'Die Datenbank antwortet nicht.', ' Ist der SSH-Tunnel offen?');
    } else if (test) {
        content = callout(
            'test',
            'Test-Modus',
            ' – du arbeitest mit der Test-Datenbank. Hier darfst du alles ausprobieren; deine echten Daten bleiben unberührt. Achtung: ',
            h('code', {}, 'npm test'),
            ' im Backend leert diese Datenbank wieder.'
        );
    }

    banner.hidden = !content;
    mount(banner, content);
};

// ------------------------------------------------------------------
// SEITEN ANZEIGEN (Router)
// ------------------------------------------------------------------
let cleanup = null; // Aufräum-Funktion der aktuellen Seite (z.B. Timer stoppen)
let renderToken = 0; // schützt vor "alte Seite lädt fertig, nachdem man weitergeklickt hat"

// Die aktuelle Seite aufräumen (Zuhörer abmelden, Timer stoppen …)
const runCleanup = () => {
    if (typeof cleanup === 'function') {
        try {
            cleanup();
        } catch {
            /* egal */
        }
    }
    cleanup = null;
};

const showPage = async () => {
    const { id, params, query } = parseHash(location.hash);
    const route = findRoute(id) || findRoute('');
    const token = ++renderToken;

    runCleanup();

    markActiveNav(route.id);
    $('pageTitle').textContent = route.title;
    document.title = `${route.title} · at0mic Cockpit`;

    const content = $('content');
    mount(content, spinner());

    try {
        const page = (await route.load()).default;
        if (token !== renderToken) return; // inzwischen woanders hingeklickt
        const root = h('div', { class: 'page' });
        mount(content, root);
        cleanup = await page.render(root, {
            route,
            params,
            query,
            session: getSession(),
            // Seite neu zeichnen (z.B. nach dem Anlegen eines Objekts)
            refresh: showPage
        });
        content.focus({ preventScroll: true });
    } catch (err) {
        console.error(err);
        if (token !== renderToken) return;
        mount(content, callout('error', 'Diese Seite konnte nicht geladen werden.', ' ', String(err?.message || err)));
    }
};

// ------------------------------------------------------------------
// START
// ------------------------------------------------------------------
const start = async () => {
    hydrateIcons();
    initTheme();
    initMobileMenu();
    initRequestLog();
    renderNav();

    await loadConfig();
    renderModeSwitch();
    initModeSwitch();
    renderIdentity();

    on('session', () => {
        renderIdentity();
        renderBanner();
    });

    // Umschalten Live <-> Test: alles neu laden, denn es ist ein anderes Backend
    on('mode', async () => {
        renderModeSwitch();
        // alte Seite zuerst abmelden, sonst lädt sie mit dem neuen Backend doppelt
        runCleanup();
        mount($('content'), spinner());
        await refreshSession();
        showPage();
    });

    window.addEventListener('hashchange', showPage);

    await refreshSession();
    showPage();

    // Einmal kurz erklären, was der Live/Test-Schalter ist
    if (hasTestMode() && !load('modeHintSeen')) {
        save('modeHintSeen', true);
        $('modeSwitch').classList.add('pulse');
        setTimeout(() => $('modeSwitch').classList.remove('pulse'), 4000);
    }

    // Wenn das Fenster wieder in den Vordergrund kommt: Status auffrischen
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshSession();
    });
};

start();

// Für die Browser-Konsole (F12): dort kannst du selbst Anfragen ausprobieren, z.B.
//   await at0mic.api.get('/api/objects')
window.at0mic = { api, getSession, refreshSession };
