// tests/neuKonto.test.mjs
// ---------------------------------------------------------------------
// Neues Cockpit (Plan U, U4a): aus den Antworten des Backends wird das,
// was auf dem Bildschirm steht. Geprüft: Alter des Kontos für den Baum,
// Vorname für die Begrüssung und die Zeilen «Speicher und Grenzen».
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tageSeit, vornameAus, groesseText, kontoZeilen } from '../public/neu/js/konto-werte.js';

describe('tageSeit', () => {
    const jetzt = Date.parse('2026-11-09T12:00:00Z');

    test('der erste Tag ist Tag 1', () => {
        assert.equal(tageSeit('2026-11-09T11:00:00Z', jetzt), 1);
    });

    test('nach 30 ganzen Tagen ist Tag 31', () => {
        assert.equal(tageSeit('2026-10-10T12:00:00Z', jetzt), 31);
    });

    test('ohne Datum oder mit Unsinn gilt Tag 1', () => {
        assert.equal(tageSeit(null, jetzt), 1);
        assert.equal(tageSeit('kein Datum', jetzt), 1);
    });

    test('ein Datum in der Zukunft macht den Baum nicht kaputt', () => {
        assert.equal(tageSeit('2026-12-01T00:00:00Z', jetzt), 1);
    });
});

describe('vornameAus', () => {
    test('nimmt das erste Wort des Namens', () => {
        assert.equal(vornameAus({ kind: 'user', label: 'Jaime Aresu' }), 'Jaime');
    });

    test('eine E-Mail-Adresse ist kein Name', () => {
        assert.equal(vornameAus({ kind: 'user', label: 'jemand@example.com' }), null);
    });

    test('Gäste und Anonyme werden nicht mit Namen begrüsst', () => {
        assert.equal(vornameAus({ kind: 'guest', label: 'Gast' }), null);
        assert.equal(vornameAus({ kind: 'anon', label: 'Anonym' }), null);
        assert.equal(vornameAus(null), null);
    });
});

describe('groesseText', () => {
    test('wählt die passende Einheit', () => {
        assert.equal(groesseText(0), '0 KB');
        assert.equal(groesseText(42 * 1000 * 1000), '42 MB');
        assert.equal(groesseText(1000 * 1000 * 1000), '1 GB');
    });
});

describe('kontoZeilen', () => {
    test('ohne Konto gibt es keine Zeilen', () => {
        assert.deepEqual(kontoZeilen({ usage: null }), []);
        assert.deepEqual(kontoZeilen(undefined), []);
    });

    test('zeigt Speicher, Objekte und Datensätze', () => {
        const zeilen = kontoZeilen({
            usage: {
                storageBytes: { used: 500 * 1000 * 1000, limit: 1000 * 1000 * 1000 },
                objects: { used: 25, limit: 100 },
                dataRows: { used: 0, limit: 1000 }
            }
        });
        assert.deepEqual(
            zeilen.map(z => z.name),
            ['Speicher', 'Objekte', 'Datensätze']
        );
        assert.equal(zeilen[0].anteil, 50);
        assert.equal(zeilen[0].wert, '500 MB von 1 GB');
        assert.equal(zeilen[1].wert, '25 von 100');
    });

    test('eine Grenze von 0 (Gast beim Speicher) heisst «nur mit Konto», nicht «voll»', () => {
        const [speicher] = kontoZeilen({ usage: { storageBytes: { used: 0, limit: 0 } } });
        assert.equal(speicher.anteil, 0);
        assert.equal(speicher.wert, 'Nur mit Konto');
    });

    test('mehr als die Grenze bleibt bei 100 Prozent', () => {
        const [objekte] = kontoZeilen({ usage: { objects: { used: 300, limit: 100 } } });
        assert.equal(objekte.anteil, 100);
    });
});
