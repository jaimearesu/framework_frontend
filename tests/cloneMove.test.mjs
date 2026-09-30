// tests/cloneMove.test.mjs
// ---------------------------------------------------------------------
// Tests für die Hilfen rund um Klonen und Zügeln (core/objects.js):
//   originText   – "Kopie von shop, Version 2" für die Übersicht
//   moveCheck    – darf dieses Objekt zügeln? (sonst: warum nicht)
//   moveTargets  – wohin darf es zügeln?
//   descendantsOf / deleteCheck – darf es gelöscht werden? (nur ohne Kinder)
//   removeChildFromDna – Eintrag eines gelöschten Kindes aus der DNA entfernen
// Alles ohne Bildschirm und ohne Backend.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { originText, moveCheck, moveTargets, descendantsOf, deleteCheck } from '../public/js/core/objects.js';
import { removeChildFromDna } from '../public/js/core/dna.js';

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

describe('descendantsOf / deleteCheck (Löschen nur ohne Kinder)', () => {
    // Eine Familie mit Enkel: shop > sk (0,1) > enkel (0,1 > 0,1); dazu ein Geschwister sk2
    const enkel = { uuid: 'u-enkel', domain: null, domain_ref: 'shop', path: ['0', '0,1', '0,1'] };
    const sk2 = { uuid: 'u-sk2', domain: null, domain_ref: 'shop', path: ['0', '0,2'] };
    const FAM = [...ALL, enkel, sk2];

    test('Wurzel: alle Objekte der Familie sind Nachkommen', () => {
        assert.deepEqual(
            descendantsOf(shop, FAM).map(o => o.uuid),
            ['u-sk', 'u-enkel', 'u-sk2']
        );
    });
    test('Kind: nur, was unter seinem Pfad hängt – nicht die Geschwister', () => {
        assert.deepEqual(
            descendantsOf(shopKind, FAM).map(o => o.uuid),
            ['u-enkel']
        );
        assert.deepEqual(descendantsOf(sk2, FAM), []);
    });
    test('ohne Kinder -> ok (Wurzel und Kind)', () => {
        assert.deepEqual(deleteCheck(kauf, FAM), { ok: true });
        assert.deepEqual(deleteCheck(enkel, FAM), { ok: true });
    });
    test('mit Kindern -> nicht ok, mit Anzahl', () => {
        const r = deleteCheck(shop, FAM);
        assert.equal(r.ok, false);
        assert.match(r.reason, /3 Kinder/);
        assert.match(deleteCheck(shopKind, FAM).reason, /ein Kind/);
    });
    test('ähnlicher Pfad ist KEIN Kind (["0","0,1"] vs. ["0","0,10"])', () => {
        const zehn = { uuid: 'u-10', domain: null, domain_ref: 'shop', path: ['0', '0,10'] };
        assert.deepEqual(descendantsOf(shopKind, [zehn]), []);
    });
});

describe('removeChildFromDna', () => {
    const dna = {
        type: 'instance',
        domain: 'shop',
        source: ['0'],
        children: [
            { type: 'instance', identifier: 'a', domain: 'shop', source: ['0', '0,1'] },
            { type: 'instance', identifier: 'b', domain: 'shop', source: ['0', '0,2'] }
        ]
    };
    test('entfernt genau das passende Kind, die alte DNA bleibt unverändert', () => {
        const { dna: neu, removed } = removeChildFromDna(dna, { domain: 'shop', source: ['0', '0,1'] });
        assert.equal(removed, 1);
        assert.deepEqual(
            neu.children.map(c => c.identifier),
            ['b']
        );
        assert.equal(dna.children.length, 2);
    });
    test('nicht gefunden -> removed 0, sonst gleich', () => {
        const { dna: neu, removed } = removeChildFromDna(dna, { domain: 'andere', source: ['0', '0,1'] });
        assert.equal(removed, 0);
        assert.deepEqual(neu, dna);
    });
    test('DNA ohne children bleibt ohne children', () => {
        const { dna: neu, removed } = removeChildFromDna({ type: 'instance' }, { domain: 'x', source: ['0'] });
        assert.equal(removed, 0);
        assert.equal('children' in neu, false);
    });
});
