// tests/objects.test.mjs
// ---------------------------------------------------------------------
// Tests für die Objekt-Hilfen (core/objects.js) und die DNA-Prüfung
// (core/dna.js) – beides ohne Bildschirm und ohne Backend.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    objectFamily,
    isRoot,
    objectLabel,
    latestStep,
    buildObjectForest,
    countDescendants,
    findParent,
    childRefFor,
    collectNames,
    visibilityInfo,
    VISIBILITY_ORDER
} from '../public/js/core/objects.js';
import { analyzeDna, addChildToDna } from '../public/js/core/dna.js';

// Beispiel-Objekte so, wie GET /api/objects sie liefert
const shop = {
    uuid: 'u-shop',
    domain: 'shop',
    domain_ref: null,
    path: ['0'],
    path_directory: [{ step: 0 }, { step: 1 }]
};
const produkte = { uuid: 'u-prod', domain: null, domain_ref: 'shop', path: ['0', '1,1'] };
const kontakt = { uuid: 'u-kont', domain: null, domain_ref: 'shop', path: ['0', '0,2'] };
const schuhe = { uuid: 'u-schuh', domain: null, domain_ref: 'shop', path: ['0', '1,1', '0,1'] };
const blog = { uuid: 'u-blog', domain: 'blog', domain_ref: null, path: ['0'] };
// Ein Kind, dessen Eltern-Objekt man nicht sehen darf
const waise = { uuid: 'u-waise', domain: null, domain_ref: 'fremd', path: ['0', '0,1'] };

describe('objects: Grundlagen', () => {
    test('Familie und Wurzel', () => {
        assert.equal(objectFamily(shop), 'shop');
        assert.equal(objectFamily(produkte), 'shop');
        assert.equal(objectFamily(null), '');
        assert.ok(isRoot(shop));
        assert.ok(!isRoot(produkte));
    });
    test('Name ohne DNA-Wissen: Familie + letztes Pfad-Stück', () => {
        assert.equal(objectLabel(shop), 'shop');
        assert.equal(objectLabel(kontakt), 'shop › 0,2');
        assert.equal(objectLabel(null), '–');
    });
    test('neuster Schritt', () => {
        assert.equal(latestStep(shop), 1);
        assert.equal(latestStep(produkte), null);
    });
});

describe('objects: buildObjectForest', () => {
    const forest = buildObjectForest([schuhe, blog, kontakt, shop, waise, produkte]);

    test('Wurzeln und Waisen stehen oben, alphabetisch', () => {
        assert.deepEqual(
            forest.map(n => n.object.uuid),
            ['u-blog', 'u-waise', 'u-shop'] // alphabetisch: blog, fremd › 0,1, shop
        );
    });
    test('Kinder hängen am richtigen Eltern-Objekt, nach Pfad sortiert', () => {
        const shopNode = forest.find(n => n.object.uuid === 'u-shop');
        assert.deepEqual(
            shopNode.children.map(n => n.object.uuid),
            ['u-kont', 'u-prod'] // ["0","0,2"] vor ["0","1,1"]
        );
        const prodNode = shopNode.children.find(n => n.object.uuid === 'u-prod');
        assert.deepEqual(
            prodNode.children.map(n => n.object.uuid),
            ['u-schuh']
        );
    });
    test('Nachfahren zählen', () => {
        const shopNode = forest.find(n => n.object.uuid === 'u-shop');
        assert.equal(countDescendants(shopNode), 3);
    });
    test('leere oder kaputte Eingaben', () => {
        assert.deepEqual(buildObjectForest(null), []);
        assert.deepEqual(buildObjectForest([]), []);
    });
    test('findParent', () => {
        const all = [shop, produkte, schuhe];
        assert.equal(findParent(all, schuhe).uuid, 'u-prod');
        assert.equal(findParent(all, produkte).uuid, 'u-shop');
        assert.equal(findParent(all, shop), null);
        assert.equal(findParent(all, waise), null);
    });
});

describe('objects: DNA-Verweise und Namen', () => {
    test('childRefFor baut den Eintrag für die Eltern-DNA', () => {
        assert.deepEqual(childRefFor(produkte, 'produkte'), {
            type: 'instance',
            identifier: 'produkte',
            domain: 'shop',
            source: ['0', '1,1']
        });
    });
    test('collectNames liest die Namen aus einem aufgelösten Baum', () => {
        const tree = {
            identifier: 'shop',
            domain: 'shop',
            source: ['0'],
            children: [
                {
                    identifier: 'produkte',
                    domain: 'shop',
                    source: ['0', '1,1'],
                    children: [{ identifier: 'schuhe', domain: 'shop', source: ['0', '1,1', '0,1'] }]
                },
                { domain: 'shop', source: ['0', '0,2'] } // ohne Namen -> wird übersprungen
            ]
        };
        const names = collectNames(tree);
        assert.equal(names.get('shop|["0","1,1"]'), 'produkte');
        assert.equal(names.get('shop|["0","1,1","0,1"]'), 'schuhe');
        assert.equal(names.has('shop|["0","0,2"]'), false);
        assert.equal(collectNames(null).size, 0);
    });
});

describe('dna: analyzeDna', () => {
    test('eine gültige DNA', () => {
        const a = analyzeDna(JSON.stringify({ type: 'instance', identifier: 'shop', domain: 'shop', source: ['0'] }));
        assert.equal(a.ok, true);
        assert.deepEqual(a.errors, []);
        assert.deepEqual(a.stats, { nodes: 1, depth: 1 });
    });
    test('leer und kein JSON', () => {
        assert.equal(analyzeDna('').ok, false);
        const a = analyzeDna('{\n "a": 1\n "b": 2\n}');
        assert.equal(a.ok, false);
        assert.match(a.errors[0], /Kein gültiges JSON/);
    });
    test('findet die Zeile des JSON-Fehlers (wenn der Browser eine Position nennt)', () => {
        const text = '{\n  "type": "instance",\n  "domain": "x"\n  "y": 1\n}';
        const a = analyzeDna(text);
        if (a.line !== null) assert.equal(a.line, 4);
    });
    test('kein Objekt', () => {
        assert.equal(analyzeDna('[1,2]').ok, false);
        assert.equal(analyzeDna('"text"').ok, false);
    });
    test('Fehler: falscher type und fehlende domain (auch bei Kindern)', () => {
        const a = analyzeDna({ type: 'loop', identifier: 'x', domain: 'shop', children: [{ identifier: 'k' }] });
        assert.equal(a.ok, false);
        assert.equal(a.errors.length, 2);
        assert.match(a.errors.join(' '), /loop/);
        assert.match(a.errors.join(' '), /domain fehlt/);
        assert.deepEqual(a.stats, { nodes: 2, depth: 2 });
    });
    test('Hinweise: was das Backend automatisch ergänzt', () => {
        const a = analyzeDna({ domain: 'shop' });
        assert.equal(a.ok, true);
        assert.equal(a.notes.length, 3); // type, identifier, source
    });
    test('Warnungen: unbekannte Domain, doppelte Namen, children keine Liste', () => {
        const a = analyzeDna(
            {
                identifier: 'shop',
                domain: 'shop',
                source: ['0'],
                children: [
                    { identifier: 'a', domain: 'fremd', source: ['0'] },
                    { identifier: 'a', domain: 'shop', source: ['0'], children: 'kaputt' }
                ]
            },
            { knownDomains: ['shop'] }
        );
        assert.equal(a.ok, true); // Warnungen blockieren nicht
        assert.equal(a.warnings.length, 3);
    });
    test('addChildToDna fügt ein, ohne das Original zu ändern, und nie doppelt', () => {
        const dna = { identifier: 'shop', domain: 'shop', source: ['0'] };
        const ref = childRefFor(produkte, 'produkte');
        const once = addChildToDna(dna, ref);
        assert.equal(dna.children, undefined); // Original unverändert
        assert.equal(once.children.length, 1);
        const twice = addChildToDna(once, ref);
        assert.equal(twice.children.length, 1);
        const other = addChildToDna(once, childRefFor(kontakt, 'kontakt'));
        assert.equal(other.children.length, 2);
    });
});

describe('visibilityInfo (Sichtbarkeit)', () => {
    test('die drei Stufen in der richtigen Reihenfolge', () => {
        assert.deepEqual(VISIBILITY_ORDER, ['private', 'members', 'public']);
        assert.equal(visibilityInfo('public').label, 'Öffentlich');
        assert.equal(visibilityInfo('members').label, 'Nur Eingeloggte');
        assert.equal(visibilityInfo('private').emoji, '🔒');
    });

    test('unbekannt oder fehlend gilt als privat (wie im Backend)', () => {
        assert.equal(visibilityInfo(undefined).value, 'private');
        assert.equal(visibilityInfo('irgendwas').value, 'private');
        assert.equal(visibilityInfo('__proto__').value, 'private');
    });
});
