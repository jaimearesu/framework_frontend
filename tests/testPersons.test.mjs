// tests/testPersons.test.mjs
// ---------------------------------------------------------------------
// TESTPERSONEN – Hilfsfunktionen der Karte auf der Agenten-Seite
// (core/testPersons.js, Plan "K", K5b, Entscheid T8)
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { checkTestPersonName, rightsText, deletedAt, UNUSED_DAYS } from '../public/js/core/testPersons.js';

describe('Name der Testperson', () => {
    test('gültig: Leerzeichen und Steuerzeichen weg', () => {
        assert.deepEqual(checkTestPersonName('  Test Verkäufer\n'), { name: 'Test Verkäufer' });
    });
    test('leer oder zu lang: Meldung', () => {
        assert.match(checkTestPersonName('   ').error, /Namen/);
        assert.match(checkTestPersonName(undefined).error, /Namen/);
        assert.match(checkTestPersonName('x'.repeat(61)).error, /60 Zeichen/);
    });
});

describe('Was darf sie?', () => {
    test('ohne Rechte: Hinweis auf den Reiter „Rechte“', () => {
        assert.match(rightsText({ rights: [] }), /noch keine Rechte/);
        assert.match(rightsText({}), /noch keine Rechte/);
    });
    test('mit Rechten – fremde Familien ohne Namen', () => {
        assert.equal(
            rightsText({
                rights: [
                    { domain: 'mein-crm', roles: ['black', 'red'] },
                    { domain: null, roles: ['black'] }
                ]
            }),
            'black + red in mein-crm, black in einer Familie, die du nicht siehst'
        );
    });
});

describe('Automatisch gelöscht am', () => {
    test('30 Tage nach dem letzten Test', () => {
        const d = deletedAt({ lastUsedAt: '2026-11-03T10:00:00.000Z' });
        assert.equal(UNUSED_DAYS, 30);
        assert.equal(d.toISOString(), '2026-12-03T10:00:00.000Z');
    });
    test('ohne gültiges Datum: null', () => {
        assert.equal(deletedAt({ lastUsedAt: 'kaputt' }), null);
        assert.equal(deletedAt(null), null);
    });
});
