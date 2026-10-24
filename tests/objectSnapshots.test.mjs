// tests/objectSnapshots.test.mjs
// ---------------------------------------------------------------------
// Reiter "Zeitmaschine" (Plan "R4", Etappe R4a): die Zeile zu einer Sicherung
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { describeSnapshot, suggestRestoreName } from '../public/js/pages/objectSnapshots.js';

describe('Zeitmaschine: was steht zu einer Sicherung?', () => {
    test('Teile, Datensätze, Dateien mit Grösse (Einzahl/Mehrzahl)', () => {
        assert.equal(
            describeSnapshot({ objects: 5, dataRows: 2, files: 1, fileBytes: 2048, withFiles: true }),
            '5 Teile · 2 Datensätze · 1 Datei (2.0 KB)'
        );
        assert.equal(
            describeSnapshot({ objects: 1, dataRows: 1, files: 0, fileBytes: 0, withFiles: true }),
            '1 Teil · 1 Datensatz · 0 Dateien'
        );
    });
    test('über der Grenze ohne Dateien gesichert', () => {
        assert.match(
            describeSnapshot({ objects: 3, dataRows: 0, files: 0, fileBytes: 0, withFiles: false }),
            /ohne Dateien$/
        );
    });
});

describe('Zeitmaschine: Name der wiederhergestellten Website', () => {
    test('Name + Datum der Sicherung, nie länger als 100 Zeichen', () => {
        assert.equal(suggestRestoreName({ domain: 'brot', createdAt: '2026-10-24T10:00:00Z' }), 'brot-20261024');
        const lang = suggestRestoreName({ domain: 'x'.repeat(120), createdAt: '2026-10-24T10:00:00Z' });
        assert.equal(lang.length, 100);
        assert.ok(lang.endsWith('-20261024'));
    });
});
