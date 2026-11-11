// tests/bauplanCacheBytes.test.mjs
// ---------------------------------------------------------------------
// Zwischenspeicher des Bauarbeiters nach Megabytes (Plan "T", 11.11.2026):
// Seit grössere Stufen bis 30 MB grosse Baupläne haben dürfen, begrenzt der Speicher
// nicht nur die Anzahl Websites, sondern auch die Summe der Bytes.
// Geprüft: Summe stimmt, Älteste fliegen zuerst raus, ein riesiger Bauplan wird nicht
// gemerkt, Überschreiben und Löschen zählen richtig.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BauplanCache, bauplanBytes } = require('../site/cache.js');

const plan = kb => ({ bauplan: 1, cache: 60, files: { 'index.html': 'x'.repeat(kb * 1000) } });

describe('Zwischenspeicher nach Bytes', () => {
    test('Grösse = Text aller Dateien (UTF-8)', () => {
        assert.equal(bauplanBytes({ files: { 'a.html': 'abc', 'b.css': 'ä' } }), 5);
        assert.equal(bauplanBytes(null), 0);
    });

    test('über der Grenze fliegt der älteste raus, auch wenn die Anzahl noch passt', () => {
        const c = new BauplanCache({ maxEntries: 100, maxBytes: 1000 * 1000 }); // 1 MB
        c.setSite('a', plan(200));
        c.setSite('b', plan(200));
        c.setSite('c', plan(200));
        c.get('a'); // a zuletzt benutzt
        c.setSite('d', plan(200));
        c.setSite('e', plan(200)); // 1000 KB = genau voll
        assert.equal(c.bytes, 1000 * 1000);
        c.setSite('f', plan(200)); // jetzt muss einer weg: b (am längsten nicht benutzt)
        assert.equal(c.get('b'), undefined);
        assert.ok(c.get('a'), 'a wurde benutzt und bleibt');
        assert.ok(c.bytes <= 1000 * 1000);
    });

    test('ein Bauplan grösser als ein Viertel wird nicht gemerkt (verdrängt sonst alle)', () => {
        const c = new BauplanCache({ maxBytes: 1000 * 1000 });
        c.setSite('klein', plan(10));
        c.setSite('riesig', plan(300));
        assert.equal(c.get('riesig'), undefined);
        assert.ok(c.get('klein'));
        assert.equal(c.bytes, 10 * 1000);
    });

    test('überschreiben, löschen und leeren zählen richtig', () => {
        const c = new BauplanCache({ maxBytes: 10 * 1000 * 1000 });
        c.setSite('a', plan(100));
        c.setSite('a', plan(50));
        assert.equal(c.bytes, 50 * 1000);
        c.setMissing('weg');
        c.delete('a');
        assert.equal(c.bytes, 0);
        c.setSite('b', plan(10));
        c.clear();
        assert.equal(c.bytes, 0);
        assert.equal(c.size, 0);
    });
});
