// tests/view.test.mjs
// ---------------------------------------------------------------------
// Zwei Ansichten im Cockpit (Punkt 5, D2): Besitzer / Technik.
// Geprüft werden die reinen Funktionen aus public/js/core/view.js –
// welche Ansicht gilt, welche Websites im Baum stehen, Texte für Besitzer.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeView,
    titleFor,
    websiteTree,
    ownerProblemText,
    greetingFor,
    siteAddress,
    OWNER_NAV,
    mergeSites,
    splitByArt,
    placeholderHue,
    displayAddress,
    problemsText,
    roleText,
    memberText,
    partKind,
    problemKindText,
    repairPrompt,
    clientLabel,
    helperStatus,
    helperWork,
    normalizeSearch,
    searchItems,
    askAiPrompt
} from '../public/js/core/view.js';
import { ROUTES } from '../public/js/core/routes.js';

describe('Ansicht wählen', () => {
    test('Standard ist die Besitzer-Ansicht (N1)', () => {
        assert.equal(normalizeView(null), 'besitzer');
        assert.equal(normalizeView('quatsch'), 'besitzer');
        assert.equal(normalizeView('technik'), 'technik');
        assert.equal(normalizeView('besitzer'), 'besitzer');
    });

    test('Agenten heissen in der Besitzer-Ansicht "KI-Helfer"', () => {
        const agents = ROUTES.find(r => r.id === 'agenten');
        assert.equal(titleFor(agents, 'besitzer'), 'KI-Helfer');
        assert.equal(titleFor(agents, 'technik'), 'Agenten');
    });

    test('Jeder Menüpunkt der Besitzer-Ansicht führt auf eine echte Seite', () => {
        for (const item of OWNER_NAV)
            assert.ok(
                ROUTES.some(r => r.id === item.id),
                item.id
            );
    });

    test('"Wartet auf mich" steht nicht im Technik-Menü (keine Gruppe)', () => {
        assert.equal(ROUTES.find(r => r.id === 'wartet').group, null);
    });

    test('Übersicht hat in der Besitzer-Ansicht eine eigene Seite', () => {
        assert.equal(typeof ROUTES.find(r => r.id === '').ownerLoad, 'function');
    });
});

describe('Websites-Baum', () => {
    const objects = [
        { uuid: 'u-cafe', domain: 'cafe', visibility: 'public', path: ['0'] },
        { uuid: 'u-api', domain: null, domain_ref: 'cafe', path: ['0', '1,2'], identifier: 'api' },
        { uuid: 'u-menu', domain: null, domain_ref: 'cafe', path: ['0', '1,1'], identifier: 'menu' },
        // Enkel: steht nicht direkt unter der Website
        { uuid: 'u-bild', domain: null, domain_ref: 'cafe', path: ['0', '1,1', '1,1'], identifier: 'bild' },
        { uuid: 'u-alt', domain: null, domain_ref: 'cafe', path: ['0', '1,3'] },
        { uuid: 'u-agent', domain: 'agent-claude', path: ['0'] },
        { uuid: 'u-ich', domain: '3ad056dad7ef', path: ['0'] },
        { uuid: 'u-verein', domain: 'Verein', path: ['0'] }
    ];

    test('ohne eigenes Benutzer-Objekt und ohne Agenten (N2)', () => {
        const tree = websiteTree(objects, { excludeUuids: ['u-ich', 'u-agent'] });
        assert.deepEqual(
            tree.map(s => s.name),
            ['cafe', 'Verein']
        );
    });

    test('direkte Teile mit Namen, sortiert; Enkel nicht', () => {
        const [cafe] = websiteTree(objects, { excludeUuids: ['u-ich', 'u-agent'] });
        assert.equal(cafe.visibility, 'public');
        assert.deepEqual(
            cafe.children.map(c => c.name),
            ['api', 'menu', 'Teil 1,3']
        );
    });

    test('fehlende Sichtbarkeit gilt als privat; leere Liste bleibt leer', () => {
        assert.equal(websiteTree([{ uuid: 'x', domain: 'x' }])[0].visibility, 'private');
        assert.deepEqual(websiteTree(null), []);
        assert.deepEqual(websiteTree([null, undefined]), []);
    });
});

describe('Texte für Besitzer', () => {
    test('Fehler ohne Befehle und Fachwörter', () => {
        for (const kind of ['offline', 'database']) {
            const text = ownerProblemText(kind);
            assert.ok(!/npm|SSH|Tunnel|Backend/i.test(text), text);
        }
    });

    test('Begrüssung nach Tageszeit', () => {
        assert.equal(greetingFor(8), 'Guten Morgen');
        assert.equal(greetingFor(14), 'Guten Tag');
        assert.equal(greetingFor(20), 'Guten Abend');
        assert.equal(greetingFor(2), 'Gute Nacht');
    });

    test('Adresse einer Website ohne https://', () => {
        assert.equal(siteAddress('https://{name}.vindelis.site', 'cafe'), 'cafe.vindelis.site');
        assert.equal(siteAddress('http://{name}.site.localhost:3001/', 'x'), 'x.site.localhost:3001');
        assert.equal(siteAddress('', 'x'), '');
    });
});

describe('Meine Websites (D3)', () => {
    const websites = [
        { uuid: 'u-z', name: 'zoo', art: 'website', visibility: 'public', problems24h: 2 },
        { uuid: 'u-l', name: 'lager', art: 'speicher' },
        { uuid: 'u-a', name: 'atelier', art: 'website', customHost: 'www.atelier.ch' },
        { uuid: 'kaputt' }
    ];
    const objects = [
        { uuid: 'u-z', domain: 'zoo', path: ['0'] },
        { uuid: 'u-k', domain: null, domain_ref: 'zoo', path: ['0', '1,1'], identifier: 'kasse' }
    ];

    test('mergeSites: sortiert, Teile aus der Objekt-Liste, Unvollständiges fällt weg', () => {
        const sites = mergeSites(websites, objects);
        assert.deepEqual(
            sites.map(s => s.name),
            ['atelier', 'lager', 'zoo']
        );
        assert.deepEqual(
            sites.find(s => s.name === 'zoo').children.map(c => c.name),
            ['kasse']
        );
        assert.equal(sites.find(s => s.name === 'lager').visibility, 'private');
        assert.deepEqual(mergeSites(null, null), []);
    });

    test('splitByArt: Websites vorne, Speicher/Werkzeugkästen unter "Weitere"', () => {
        const { websites: w, others } = splitByArt(mergeSites(websites, objects));
        assert.deepEqual(
            w.map(s => s.name),
            ['atelier', 'zoo']
        );
        assert.deepEqual(
            others.map(s => s.name),
            ['lager']
        );
    });

    test('Platzhalter-Farbe: immer gleich für denselben Namen, 0–359', () => {
        assert.equal(placeholderHue('cafe'), placeholderHue('cafe'));
        assert.notEqual(placeholderHue('cafe'), placeholderHue('verein'));
        for (const n of ['', 'a', 'Ünïcödé 🎯']) {
            const hue = placeholderHue(n);
            assert.ok(hue >= 0 && hue < 360, String(hue));
        }
    });

    test('Adresse: eigene Domain zuerst, ohne https://', () => {
        assert.equal(
            displayAddress({ customHost: 'www.atelier.ch', address: 'https://a.vindelis.site' }),
            'www.atelier.ch'
        );
        assert.equal(displayAddress({ address: 'https://zoo.vindelis.site/' }), 'zoo.vindelis.site');
        assert.equal(displayAddress({}), '');
    });

    test('Probleme: null = nicht sichtbar (nichts zeigen)', () => {
        assert.equal(problemsText(null), null);
        assert.equal(problemsText(0), 'Keine Probleme');
        assert.equal(problemsText(1), '1 Problem heute');
        assert.equal(problemsText(5), '5 Probleme heute');
    });
});

describe('Website-Seite (D4)', () => {
    test('Rechte in Worten: das höchste zählt', () => {
        assert.equal(roleText(['black', 'red', 'blue']), 'verwaltet');
        assert.equal(roleText(['black', 'red']), 'darf bauen');
        assert.equal(roleText(['black']), 'darf ansehen');
        assert.equal(roleText(null), '–');
    });

    test('Mitglieder: ich = Du, andere Menschen ohne Namen (S3), KI mit Namen', () => {
        assert.equal(memberText({ uuid: 'ich', kind: 'mensch' }, 'ich'), 'Du');
        assert.equal(memberText({ uuid: 'x', kind: 'mensch', name: null }, 'ich'), 'Eine weitere Person');
        assert.equal(memberText({ uuid: 'k', kind: 'objekt', name: 'agent-claude' }, 'ich'), 'agent-claude');
        assert.equal(memberText({ uuid: 'f', kind: 'objekt', name: 'shop', identifier: 'api' }, 'ich'), 'shop/api');
    });

    test('Art eines Teils', () => {
        assert.equal(partKind({ types: ['ssf', 'werkzeug'] }), 'Werkzeug');
        assert.equal(partKind({ types: ['ssf'] }), 'Funktion');
        assert.equal(partKind({ types: [], hasFile: true }), 'Datei');
        assert.equal(partKind({ types: ['html', 'css'] }), 'Inhalt');
        assert.equal(partKind({ types: [], dataRows: 3 }), 'Daten');
        assert.equal(partKind({}), 'Leer');
    });

    test('Problem-Arten in Worten, Unbekanntes lesbar', () => {
        assert.equal(problemKindText('datei_fehlt'), 'Bild oder Datei fehlt');
        assert.equal(problemKindText('neu_art'), 'neu art');
    });

    test('Satz für die KI nennt Website, Zeitraum und site_problems', () => {
        const text = repairPrompt('cafe', 168);
        assert.match(text, /«cafe»/);
        assert.match(text, /7 Tage/);
        assert.match(text, /site_problems/);
        assert.match(repairPrompt('x'), /24 Stunden/);
    });
});

describe('KI-Helfer (D4b)', () => {
    test('Verbindung: Claude / ChatGPT statt Adressen', () => {
        assert.equal(clientLabel({ clientHost: 'claude.ai' }), 'Claude');
        assert.equal(clientLabel({ clientHost: 'chatgpt.com' }), 'ChatGPT');
        assert.equal(clientLabel({ clientHost: 'beispiel.dev', clientName: 'Mein Bot' }), 'Mein Bot');
        assert.equal(clientLabel({}), 'einer KI');
    });

    test('Zustand: aktive Verbindung, sonst Schlüssel, sonst nicht verbunden', () => {
        assert.deepEqual(
            helperStatus({
                connections: [
                    { status: 'active', clientHost: 'claude.ai' },
                    { status: 'revoked', clientHost: 'chatgpt.com' }
                ]
            }),
            { tone: 'ok', text: 'Verbunden mit Claude' }
        );
        assert.equal(helperStatus({ connections: [], tokens: { active: 1 } }).text, 'Verbunden mit einem Schlüssel');
        assert.deepEqual(helperStatus({ connections: [], tokens: { active: 0 } }), {
            tone: 'off',
            text: 'Nicht verbunden'
        });
    });

    test('Woran er arbeitet: Websites mit Recht in Worten, Kästen nur gezählt', () => {
        const work = helperWork({
            rights: [
                { domain: 'zoo', rootUuid: 'z', roles: ['black', 'red'], toolbox: false },
                { domain: 'kasten', rootUuid: 'k', roles: ['black'], toolbox: true },
                { domain: 'atelier', rootUuid: 'a', roles: ['black'], toolbox: false }
            ],
            hiddenRights: 2
        });
        assert.deepEqual(
            work.sites.map(s => `${s.name}:${s.role}`),
            ['atelier:darf ansehen', 'zoo:darf bauen']
        );
        assert.equal(work.toolboxes, 1);
        assert.equal(work.hidden, 2);
    });
});

describe('Suche Strg K (D5)', () => {
    const items = [
        { kind: 'website', title: 'brotzeit-bern', sub: 'Website' },
        { kind: 'website', title: 'praxis-seiler', sub: 'Website' },
        { kind: 'seite', title: 'Übersicht', sub: 'Seite' },
        { kind: 'seite', title: 'Wartet auf mich', sub: 'Seite' },
        { kind: 'aktion', title: 'Neue Website', sub: 'Aktion' }
    ];

    test('Umlaute und Gross/Klein spielen keine Rolle', () => {
        assert.equal(normalizeSearch('Übersicht'), 'uebersicht');
        assert.deepEqual(
            searchItems(items, 'uber').map(i => i.title),
            ['Übersicht']
        );
        assert.deepEqual(
            searchItems(items, 'ÜBER').map(i => i.title),
            ['Übersicht']
        );
    });

    test('Anfang vor Wortanfang vor irgendwo', () => {
        assert.deepEqual(
            searchItems(items, 'bern').map(i => i.title),
            ['brotzeit-bern']
        );
        const web = searchItems(items, 'web').map(i => i.title);
        assert.equal(web[0], 'Neue Website'); // Wortanfang "Website"
        assert.ok(web.includes('brotzeit-bern')); // nur im Untertitel "Website"
    });

    test('leere Suche: die ersten Einträge; Grenze max', () => {
        assert.equal(searchItems(items, '', 3).length, 3);
        assert.deepEqual(searchItems(items, 'gibtsnicht'), []);
        assert.deepEqual(searchItems(null, 'x'), []);
    });

    test('KI fragen: Frage mit Zusammenhang', () => {
        assert.match(askAiPrompt('  Wie mache ich ein Formular? '), /vindelis.*Wie mache ich ein Formular\?$/);
    });
});
