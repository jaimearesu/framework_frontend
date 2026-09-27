// tests/ssf.test.mjs
// ---------------------------------------------------------------------
// Tests für das SSF-Studio: Beispiele, Werkzeug-Referenz, Fehler-Tipps
// und die Daten der Spielwiese.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, fillExample, findExample } from '../public/js/ssf/examples.js';
import { TOOLS, TOOL_GROUPS, LIMITS } from '../public/js/ssf/reference.js';
import { explainError, explainStatus } from '../public/js/ssf/hints.js';
import { CHILDREN, SEED_PRODUCTS, SEED_STOCK } from '../public/js/ssf/playground.js';

// So verpackt das Backend den SSF-Code (siehe executionService.js): eine async-Funktion
const AsyncFunction = (async () => {}).constructor;

describe('ssf: Beispiel-Bibliothek', () => {
    test('es gibt 9 Beispiele mit eindeutiger id', () => {
        assert.equal(EXAMPLES.length, 9);
        assert.equal(new Set(EXAMPLES.map(e => e.id)).size, 9);
    });

    for (const ex of EXAMPLES) {
        test(`„${ex.title}“: vollständig und gültiger Code`, () => {
            assert.ok(ex.title && ex.summary && ex.level && Array.isArray(ex.learn) && ex.learn.length);
            assert.ok(['Einstieg', 'Fortgeschritten', 'Profi'].includes(ex.level));
            // Der Code muss sich kompilieren lassen – genau wie in der Sandbox (await und return erlaubt)
            const code = fillExample(ex.code, { shop: 'studio-test' });
            assert.doesNotThrow(() => new AsyncFunction('requestContext', 'api', code));
            // Nach dem Ersetzen darf kein Platzhalter übrig sein
            assert.ok(!code.includes('{{SHOP}}'));
            // In der Sandbox gibt es kein console, fetch oder require
            // (api.http.fetch ist erlaubt – darum "nicht nach einem Punkt")
            assert.doesNotMatch(code, /(?<![.\w])(console\.|fetch\(|require\()/);
            // Body und Presets müssen als JSON verschickt werden können
            assert.doesNotThrow(() => JSON.stringify(ex.body));
            for (const body of Object.values(ex.presets || {})) assert.equal(typeof body, 'object');
        });
    }

    test('fillExample ersetzt alle Platzhalter', () => {
        assert.equal(fillExample("a('{{SHOP}}/x'); b('{{SHOP}}')", { shop: 'st-1' }), "a('st-1/x'); b('st-1')");
        assert.equal(fillExample('{{SHOP}}', {}), 'meine-domain');
    });

    test('findExample', () => {
        assert.equal(findExample('joins').title, 'Bericht mit Joins');
        assert.equal(findExample('gibtsnicht'), null);
    });

    test('Beispiele benutzen nur Werkzeuge, die es gibt', () => {
        const known = new Set(TOOLS.map(t => t.name));
        for (const ex of EXAMPLES) {
            for (const m of ex.code.matchAll(/api\.(\w+)\.(\w+)\(/g)) {
                assert.ok(known.has(`${m[1]}.${m[2]}`), `${ex.id}: api.${m[1]}.${m[2]} gibt es nicht`);
            }
        }
    });

    test('„Grenzen erleben“ hat für jeden Test einen Preset', () => {
        const ex = findExample('grenzen');
        const tests = Object.values(ex.presets).map(b => b.test);
        for (const t of tests) assert.match(ex.code, new RegExp(`test === '${t}'`));
    });
});

describe('ssf: Werkzeug-Referenz', () => {
    test('alle 15 Werkzeuge des Backends sind beschrieben', () => {
        assert.deepEqual(TOOLS.map(t => t.name).sort(), [
            'data.delete',
            'data.find',
            'data.get',
            'data.insert',
            'data.update',
            'http.fetch',
            'objects.create',
            'objects.get',
            'relations.add',
            'relations.get',
            'roles.grant',
            'roles.list',
            'roles.revoke',
            'secrets.get',
            'secrets.has'
        ]);
    });
    test('jedes Werkzeug ist vollständig und gehört zu einer Gruppe', () => {
        const groups = new Set(TOOL_GROUPS.map(g => g.id));
        for (const t of TOOLS) {
            assert.ok(t.signature && t.role && t.returns && t.text && t.snippet, t.name);
            assert.ok(groups.has(t.group), t.name);
            assert.ok(t.snippet.includes(`api.${t.name}(`), `${t.name}: Beispiel benutzt das Werkzeug nicht`);
        }
    });
    test('schreibende Werkzeuge brauchen red, Rollen-Werkzeuge blue', () => {
        for (const n of ['data.insert', 'data.update', 'data.delete'])
            assert.equal(TOOLS.find(t => t.name === n).role, 'red');
        for (const n of ['roles.grant', 'roles.revoke', 'roles.list'])
            assert.equal(TOOLS.find(t => t.name === n).role, 'blue');
    });
    test('Grenzen sind aufgelistet', () => {
        assert.ok(LIMITS.length >= 8);
    });
});

describe('ssf: Fehler-Tipps', () => {
    const cases = [
        ['Script execution timed out.', /Endlosschleife/],
        ['Zeitlimit überschritten: mehr als 1000 ms Rechenzeit.', /Endlosschleife/],
        ['Zeitlimit überschritten: mehr als 5000 ms Gesamtzeit.', /5 Sekunden/],
        ['api.data.find: Kein Zugriff oder nicht gefunden: "x"', /Die SSF selbst/],
        ['api.data.get: Zu viele Werkzeug-Aufrufe (max. 50 pro Ausführung).', /50/],
        ['Schreib-Kontingent erschöpft (max. 500 Datensätze pro Ausführung).', /500/],
        ['Ziel nicht erlaubt: "127.0.0.1" zeigt auf eine interne oder reservierte Adresse.', /SSRF/],
        ['Das Feld "_sys_id" ist reserviert', /_sys_/],
        ['ReferenceError: console is not defined', /kein console/],
        ['Interner Fehler (Fehler-ID ab12cd34)', /Server-Log/],
        ['Kein Schlüssel "X" im Tresor dieser SSF.', /Tresor/]
    ];
    for (const [message, expected] of cases) {
        test(message.slice(0, 50), () => assert.match(explainError(message), expected));
    }
    test('unbekannte Meldung -> kein Tipp', () => {
        assert.equal(explainError('etwas ganz anderes'), null);
        assert.equal(explainError(null), null);
    });
    test('Status-Tipps', () => {
        assert.match(explainStatus(403), /black auf der SSF/);
        assert.equal(explainStatus(200), null);
    });
});

describe('ssf: Spielwiese', () => {
    test('Kinder und Beispiel-Daten passen zusammen', () => {
        assert.deepEqual(CHILDREN, ['funktion', 'produkte', 'lager', 'nachrichten', 'bestellungen']);
        const skus = SEED_PRODUCTS.map(p => p.sku).sort();
        assert.deepEqual(SEED_STOCK.map(s => s.sku).sort(), skus); // jedes Produkt hat einen Lager-Eintrag
        assert.equal(new Set(skus).size, skus.length);
        for (const p of SEED_PRODUCTS) assert.equal(typeof p.preis, 'number');
    });
    test('die Presets des Bestell-Beispiels passen zu den Daten', () => {
        const ex = findExample('bestellung');
        const sneaker = SEED_STOCK.find(s => s.sku === ex.presets['2 Sneaker'].sku);
        assert.ok(sneaker.bestand >= 2);
        const muetze = SEED_STOCK.find(s => s.sku === ex.presets['Zu viele'].sku);
        assert.ok(muetze.bestand < ex.presets['Zu viele'].menge);
        assert.ok(!SEED_STOCK.some(s => s.sku === ex.presets.Unbekannt.sku));
    });
});
