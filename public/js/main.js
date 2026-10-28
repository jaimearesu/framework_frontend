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
import { refreshSession, getSession, guestHint } from './core/session.js';
import { initRequestLog } from './core/requestLog.js';
import { load, save } from './core/storage.js';
import { initLogo } from './core/intro.js';
import { setView, isTechView, OWNER_NAV, titleFor, ownerProblemText, splitByArt } from './core/view.js';
import { loadOwnerSites } from './core/objects.js';

const $ = id => document.getElementById(id);

// ------------------------------------------------------------------
// MENÜ (links) – je nach Ansicht (Punkt 5, D2: Besitzer / Technik)
// ------------------------------------------------------------------
const navLink = ({ id, title, icon: iconName, badge }) =>
    h(
        'a',
        { class: 'nav-link', href: href(id), dataset: { route: id } },
        h('span', { class: 'nav-icon' }, icon(iconName)),
        h('span', {}, title),
        badge ? h('span', { class: 'nav-badge', id: `navBadge-${badge}`, hidden: true }) : null
    );

const renderNav = () => {
    if (isTechView()) {
        // Technik-Ansicht: die bisherigen Gruppen (Seiten ohne Gruppe stehen nicht drin)
        const groups = GROUPS.map(group =>
            h(
                'div',
                { class: 'nav-group' },
                h('div', { class: 'nav-group-title' }, group),
                ROUTES.filter(r => r.group === group).map(r => navLink(r))
            )
        );
        mount($('nav'), groups);
    } else {
        // Besitzer-Ansicht: drei Punkte + die eigenen Websites als Baum
        mount(
            $('nav'),
            h('div', { class: 'nav-group' }, OWNER_NAV.map(navLink)),
            h(
                'div',
                { class: 'nav-group' },
                h('div', { class: 'nav-group-title' }, 'Websites'),
                h('div', { class: 'site-tree', id: 'siteTree' }, h('span', { class: 'nav-note' }, '…')),
                h(
                    'a',
                    { class: 'nav-link subtle', href: href('objekte') },
                    h('span', { class: 'nav-plus', 'aria-hidden': 'true' }, '＋'),
                    h('span', {}, 'Neue Website')
                )
            )
        );
        renderSiteTree();
        renderWaitingBadge();
    }
    renderSidebarFoot();
    markActiveNav();
};

// Unten in der Seitenleiste: der Schalter zwischen den Ansichten
const renderSidebarFoot = () => {
    const tech = isTechView();
    mount(
        $('sidebarFoot'),
        tech
            ? h(
                  'a',
                  { class: 'nav-link subtle', href: href('systemcheck'), dataset: { route: 'systemcheck' } },
                  h('span', { class: 'nav-icon' }, icon('check')),
                  h('span', {}, 'Teste alles')
              )
            : null,
        h(
            'button',
            {
                type: 'button',
                class: 'nav-link subtle view-switch',
                'aria-pressed': String(tech),
                title: tech ? 'Zurück zur einfachen Ansicht' : 'Alle technischen Seiten zeigen',
                onclick: () => setView(tech ? 'besitzer' : 'technik')
            },
            h('span', { class: 'nav-icon' }, icon('code')),
            h('span', {}, 'Technik-Ansicht'),
            h('span', { class: `switch${tech ? ' on' : ''}`, 'aria-hidden': 'true' })
        )
    );
};

// Die eigenen Websites als Baum (aufklappbar). Agenten stehen unter "KI-Helfer" (N2).
const VISIBILITY_TEXT = { public: 'Öffentlich', members: 'Nur Angemeldete', private: 'Privat' };
const openSites = new Set(load('openSites', []));

const renderSiteTree = async () => {
    const box = $('siteTree');
    if (!box) return;
    const s = getSession();
    if (s.loading) return;
    if (!s.online || s.identity.kind === 'anon') {
        return mount(
            box,
            h('span', { class: 'nav-note' }, s.online ? 'Melde dich an, um deine Websites zu sehen.' : '–')
        );
    }
    const { ok, sites } = await loadOwnerSites();
    if (box !== $('siteTree')) return; // inzwischen neu gezeichnet oder auf Technik umgeschaltet
    if (!ok) return mount(box, h('span', { class: 'nav-note' }, 'Konnte die Websites nicht laden.'));
    // Echte Websites im Baum, Speicher und Werkzeugkästen eingeklappt unter "Weitere" (D3, W2)
    const { websites, others } = splitByArt(sites);

    const toggle = uuid => {
        if (openSites.has(uuid)) openSites.delete(uuid);
        else openSites.add(uuid);
        save('openSites', [...openSites]);
        renderSiteTree();
    };
    // Bis D4 führt ein Klick auf die bestehende Objekt-Seite, Reiter "Website" (N3)
    const siteHref = uuid => href('objekte', uuid) + '?tab=website';
    const siteRow = site => {
        const open = openSites.has(site.uuid);
        return h(
            'div',
            { class: 'tree-site' },
            h(
                'div',
                { class: 'nav-link tree-row', dataset: { object: site.uuid } },
                h(
                    'button',
                    {
                        type: 'button',
                        class: 'tree-twist',
                        'aria-label': open ? 'Zuklappen' : 'Aufklappen',
                        'aria-expanded': String(open),
                        disabled: !site.children.length,
                        onclick: () => toggle(site.uuid)
                    },
                    site.children.length ? (open ? '▾' : '▸') : ''
                ),
                h(
                    'a',
                    { href: siteHref(site.uuid), class: 'tree-label' },
                    h('span', { class: `tree-dot ${site.visibility}`, title: VISIBILITY_TEXT[site.visibility] }),
                    h('span', { class: 'tree-name' }, site.name)
                )
            ),
            open
                ? site.children.map(c =>
                      h(
                          'a',
                          {
                              class: 'nav-link tree-child',
                              href: href('objekte', c.uuid),
                              dataset: { object: c.uuid }
                          },
                          h('span', { class: 'mono' }, c.name)
                      )
                  )
                : null
        );
    };

    // "Weitere" ist ein eigener Zweig mit Merk-Schlüssel (wie eine Website)
    const OTHERS_KEY = '__weitere__';
    const othersOpen = openSites.has(OTHERS_KEY);
    mount(
        box,
        websites.length ? websites.map(siteRow) : h('span', { class: 'nav-note' }, 'Noch keine Website.'),
        others.length
            ? h(
                  'div',
                  { class: 'tree-site' },
                  h(
                      'button',
                      {
                          type: 'button',
                          class: 'nav-link tree-row tree-others',
                          'aria-expanded': String(othersOpen),
                          onclick: () => toggle(OTHERS_KEY)
                      },
                      h('span', { class: 'tree-twist' }, othersOpen ? '▾' : '▸'),
                      h('span', { class: 'tree-name' }, `Weitere (${others.length})`)
                  ),
                  othersOpen ? others.map(siteRow) : null
              )
            : null
    );
    markActiveNav();
};

// Zahl bei "Wartet auf mich": offene Freigaben + neue Besucher-Uploads
const countOf = res => (res.ok && Array.isArray(res.data?.data) ? res.data.data.length : 0);
const renderWaitingBadge = async () => {
    const s = getSession();
    if (s.loading || !s.online || s.identity.kind === 'anon' || isTechView()) return;
    const [requests, uploads] = await Promise.all([
        api.get('/api/publish-requests/pending'),
        api.get('/api/uploads/pending')
    ]);
    const el = $('navBadge-waiting');
    if (!el) return;
    const count = countOf(requests) + countOf(uploads);
    el.hidden = count === 0;
    el.textContent = String(count);
};

const markActiveNav = () => {
    const { id, params } = parseHash(location.hash);
    const current = findRoute(id) ? id : '';
    for (const a of document.querySelectorAll('.nav-link[data-route]')) {
        const active = a.dataset.route === current;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    }
    // Website (oder Teil) im Baum markieren, wenn ihre Objekt-Seite offen ist
    const open = current === 'objekte' ? params[0] : null;
    for (const el of document.querySelectorAll('.nav-link[data-object]')) {
        el.classList.toggle('active', Boolean(open) && el.dataset.object === open);
    }
    // Auf einer Website-Seite ist nicht gleichzeitig "Objekte" o.ä. aktiv
    if (open && !isTechView()) {
        for (const a of document.querySelectorAll('.nav-link[data-route].active')) a.classList.remove('active');
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
    const tech = isTechView();
    let content = null;

    // Besitzer-Ansicht (D2): Probleme in Alltagssprache, ohne Befehle; kein Test-Hinweis
    // (dort zeigt nur das Schild "Test" oben, dass es die Test-Datenbank ist)
    if (!tech && !s.loading && !s.online) {
        content = callout('error', ownerProblemText('offline'));
    } else if (!tech && !s.loading && s.health && s.health.database !== 'ok') {
        content = callout('error', ownerProblemText('database'));
    } else if (!tech) {
        content = null;
    } else if (!s.loading && !s.online) {
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

    // Gäste: Hinweis, dass ihre Arbeit nur 24 Stunden bleibt (sonst weiss das niemand).
    // Einloggen geht nur im Live-Modus (Auth0 ist nur dort eingerichtet).
    const hint = !s.loading && s.online ? guestHint(s.identity) : null;
    const guestBox = hint
        ? callout(
              'warn',
              hint.title,
              hint.text,
              test ? null : ' ',
              test ? null : h('a', { href: liveBase() + '/login' }, 'Jetzt einloggen')
          )
        : null;

    banner.hidden = !content && !guestBox;
    mount(banner, content, guestBox);
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

    markActiveNav();
    const title = titleFor(route, isTechView() ? 'technik' : 'besitzer');
    $('pageTitle').textContent = title;
    document.title = `${title} · vindelis Cockpit`;

    const content = $('content');
    mount(content, spinner());

    try {
        // Besitzer-Ansicht: manche Seiten haben eine eigene, einfache Fassung (ownerLoad)
        const loader = !isTechView() && route.ownerLoad ? route.ownerLoad : route.load;
        const page = (await loader()).default;
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
    // Logo "vindelis" + Auftritt beim ersten Öffnen (läuft nebenher, das Cockpit lädt währenddessen)
    initLogo();
    // Ansicht (Besitzer / Technik) so früh wie möglich setzen – das CSS blendet danach aus
    document.body.dataset.view = isTechView() ? 'technik' : 'besitzer';
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
        // Websites-Baum und Zahl bei "Wartet auf mich" mit frischen Daten
        renderSiteTree();
        renderWaitingBadge();
    });

    // Umschalten Besitzer <-> Technik: Menü, Hinweise und Seite neu zeichnen
    on('view', () => {
        renderNav();
        renderBanner();
        showPage();
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

    window.addEventListener('hashchange', () => {
        showPage();
        // Neue Website angelegt? Der Baum holt die Liste aus dem Zwischenspeicher (billig)
        renderSiteTree();
    });

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
//   await at0mic.intro()   – den Auftritt des Logos nochmals ansehen
window.at0mic = { api, getSession, refreshSession, intro: () => initLogo({ force: true }) };
