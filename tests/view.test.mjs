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
    OWNER_NAV
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
