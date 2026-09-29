// tests/cloneMove.test.mjs
// ---------------------------------------------------------------------
// Tests für die Hilfen rund um Klonen und Zügeln (core/objects.js):
//   originText   – "Kopie von shop, Version 2" für die Übersicht
//   moveCheck    – darf dieses Objekt zügeln? (sonst: warum nicht)
//   moveTargets  – wohin darf es zügeln?
// Alles ohne Bildschirm und ohne Backend.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { originText, moveCheck, moveTargets } from '../public/js/core/objects.js';

// Beispiel-Objekte so, wie GET /api/objects sie liefert
const test_ = { uuid: 'u-test', domain: 'test', domain_ref: null, path: ['0'] };
const testKind = { uuid: 'u-tk', domain: null, domain_ref: 'test', path: ['0', '0,1'] };
const kauf = {
    uuid: 'u-kauf',
    domain: 'kauf',
    domain_ref: null,
    path: ['0'],
    origin: { uuid: 'u-shop-prod', domain: 'shop', path: ['0', '4,1'], step: 2 }
};
const shop = { uuid: 'u-shop', domain: 'shop', domain_ref: null, path: ['0'] };
const shopKind = { uuid: 'u-sk', domain: null, domain_ref: 'shop', path: ['0', '0,1'] };
const ALL = [test_, testKind, kauf, shop, shopKind];

describe('originText', () => {
    test('ohne Herkunft -> null', () => {
        assert.equal(originText(shop), null);
        assert.equal(originText({ ...shop, origin: null }), null);
        assert.equal(originText(null), null);
    });
    test('Kopie eines Kindes: Familie, Pfad und Version', () => {
        assert.equal(originText(kauf), 'Kopie von shop ["0","4,1"], Version 2');
    });
    test('Kopie einer Wurzel: ohne Pfad', () => {
        const k = { ...kauf, origin: { uuid: 'x', domain: 'shop', path: ['0'], step: 0 } };
        assert.equal(originText(k), 'Kopie von shop, Version 0');
    });
});

describe('moveCheck', () => {
    test('eigenständige Domain ohne Kinder -> ok', () => {
        assert.deepEqual(moveCheck(kauf, ALL), { ok: true });
    });
    test('ein Kind kann nicht zügeln', () => {
        const r = moveCheck(testKind, ALL);
        assert.equal(r.ok, false);
        assert.match(r.reason, /eigenständige Domains/);
    });
    test('eine Domain mit Kindern kann (noch) nicht zügeln', () => {
        const r = moveCheck(shop, ALL);
        assert.equal(r.ok, false);
        assert.match(r.reason, /Kinder/);
    });
});

describe('moveTargets', () => {
    test('alle anderen Objekte – nicht es selbst', () => {
        const targets = moveTargets(ALL, kauf).map(o => o.uuid);
        assert.deepEqual(targets, ['u-test', 'u-tk', 'u-shop', 'u-sk']);
    });
    test('nie in die eigene Familie', () => {
        const targets = moveTargets(ALL, shop).map(o => o.uuid);
        assert.ok(!targets.includes('u-shop') && !targets.includes('u-sk'));
    });
});
