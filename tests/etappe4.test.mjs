// tests/etappe4.test.mjs
// ---------------------------------------------------------------------
// Tests für Etappe 4: Daten-Tabelle, Such-Beispiele, Rechte-Gruppierung,
// Tresor-Namen und das Schwärzen geheimer Werte im Protokoll.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tableColumns, cellText } from '../public/js/core/table.js';
import { DSL_EXAMPLES, DSL_GROUPS, makeTestProducts } from '../public/js/data/dslExamples.js';
import { groupRolesByTriplet } from '../public/js/pages/rights.js';
import { normalizeSecretName, isValidSecretName } from '../public/js/pages/vault.js';
import { maskSecrets } from '../public/js/core/api.js';
import { SEED_PRODUCTS } from '../public/js/ssf/playground.js';

describe('Tabelle', () => {
    test('Spalten: eigene Felder zuerst, System-Felder separat', () => {
        const r = tableColumns([
            { _sys_id: 'a', _sys_created_at: 't', name: 'A', preis: 1 },
            { _sys_id: 'b', name: 'B', farbe: 'rot', _sys_object_uuid: 'x' }
        ]);
        assert.deepEqual(r.columns, ['name', 'preis', 'farbe']);
        assert.deepEqual(r.sys, ['_sys_id', '_sys_created_at']);
        assert.equal(r.hidden, 0);
    });
    test('zu viele Felder: der Rest wird gezählt', () => {
        const record = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`f${i}`, i]));
        const r = tableColumns([record], 12);
        assert.equal(r.columns.length, 12);
        assert.equal(r.hidden, 3);
    });
    test('leere Liste', () => {
        assert.deepEqual(tableColumns([]).columns, []);
        assert.deepEqual(tableColumns(null).columns, []);
    });
    test('cellText: Werte kurz und lesbar', () => {
        assert.equal(cellText(undefined), '');
        assert.equal(cellText(null), 'null');
        assert.equal(cellText(42), '42');
        assert.equal(cellText(false), 'false');
        assert.equal(cellText({ a: 1 }), '{"a":1}');
        assert.ok(cellText({ lang: 'x'.repeat(100) }).endsWith('…'));
    });
    test('cellText: System-Felder in Joins werden ausgeblendet', () => {
        assert.equal(
            cellText({ _sys_id: 'x', _sys_object_uuid: 'y', sku: 'A', bestand: 3 }),
            '{"sku":"A","bestand":3}'
        );
        assert.equal(cellText([{ _sys_id: 'x', n: 1 }]), '[{"n":1}]');
    });
});

describe('Such-Beispiele (DSL)', () => {
    test('eindeutige ids, gültige Gruppen, erklärt', () => {
        assert.equal(new Set(DSL_EXAMPLES.map(e => e.id)).size, DSL_EXAMPLES.length);
        for (const e of DSL_EXAMPLES) {
            assert.ok(DSL_GROUPS.includes(e.group), e.id);
            assert.ok(e.title && e.text, e.id);
            assert.equal(typeof e.query, 'object');
        }
    });
    test('jedes Beispiel ist als JSON verschickbar und benutzt nur bekannte Teile', () => {
        for (const e of DSL_EXAMPLES) {
            const back = JSON.parse(JSON.stringify(e.query));
            for (const key of Object.keys(back))
                assert.ok(['filter', 'sort', 'select', 'joins'].includes(key), `${e.id}: ${key}`);
        }
    });
    test('Beispiele benutzen Felder, die es in der Spielwiese gibt (oder absichtlich nicht)', () => {
        const fields = new Set(Object.keys(SEED_PRODUCTS[0]));
        const used = new Set();
        const walk = f => {
            if (!f || typeof f !== 'object') return;
            for (const [k, v] of Object.entries(f)) {
                if (k === '$and' || k === '$or') v.forEach(walk);
                else used.add(k);
            }
        };
        DSL_EXAMPLES.forEach(e => walk(e.query.filter));
        for (const f of used) if (f !== 'rabatt') assert.ok(fields.has(f), `unbekanntes Feld ${f}`);
    });
    test('Test-Produkte: Anzahl, eindeutige sku, Zahlen-Preise', () => {
        let seed = 1;
        const fest = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // fester Zufall
        const p = makeTestProducts(120, fest);
        assert.equal(p.length, 120);
        assert.equal(new Set(p.map(x => x.sku)).size, 120);
        for (const x of p) {
            assert.equal(typeof x.preis, 'number');
            assert.ok(x.preis >= 0 && x.preis <= 200);
        }
    });
});

describe('Rechte: groupRolesByTriplet', () => {
    const input = {
        shop: [
            { role_uuid: 'r1', type: 'red', domain: 'shop', triplet_uuid: 'T1' },
            { role_uuid: 'r2', type: 'black', domain: 'shop', triplet_uuid: 'T1' },
            { role_uuid: 'r3', type: 'blue', domain: 'shop', triplet_uuid: 'T1' }
        ],
        anderer: [{ role_uuid: 'r4', type: 'black', domain: 'anderer', triplet_uuid: 'T2' }]
    };
    test('gruppiert je Triplet, Rollen in fester Reihenfolge', () => {
        const g = groupRolesByTriplet(input, 'shop');
        assert.deepEqual(g[0], { triplet: 'T1', domain: 'shop', roles: ['black', 'red', 'blue'], protecting: true });
        assert.deepEqual(g[1], { triplet: 'T2', domain: 'anderer', roles: ['black'], protecting: false });
    });
    test('das schützende Triplet steht zuerst', () => {
        const g = groupRolesByTriplet(input, 'anderer');
        assert.equal(g[0].triplet, 'T2');
        assert.equal(g[0].protecting, true);
    });
    test('leer', () => {
        assert.deepEqual(groupRolesByTriplet(null, 'x'), []);
    });
});

describe('Tresor', () => {
    test('Namen werden wie im Backend normalisiert', () => {
        assert.equal(normalizeSecretName('wetter key'), 'WETTER_KEY');
        assert.equal(normalizeSecretName('  api-key.v2 '), 'API_KEY_V2');
        assert.equal(normalizeSecretName('x'.repeat(80)).length, 64);
    });
    test('gültige Namen', () => {
        assert.ok(isValidSecretName('WETTER_KEY'));
        assert.ok(!isValidSecretName(''));
        assert.ok(!isValidSecretName('klein'));
        assert.ok(!isValidSecretName('A'.repeat(65)));
    });
    test('geheime Werte erscheinen im Protokoll nur als ***', () => {
        assert.deepEqual(maskSecrets({ value: 'geheim', name: 'X' }), { value: '***', name: 'X' });
        assert.deepEqual(maskSecrets({ password: 'p', token: 't' }), { password: '***', token: '***' });
        const original = { value: 'geheim' };
        maskSecrets(original);
        assert.equal(original.value, 'geheim'); // Original bleibt unverändert (wird ja gesendet)
        assert.deepEqual(maskSecrets([1, 2]), [1, 2]);
        assert.equal(maskSecrets(null), null);
    });
});
